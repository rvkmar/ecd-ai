// Copy ECD-file auditLog into the external audit store, verify count and
// canonical form, then remove the key from db.json. Idempotent. A JSON
// harness run does not move anything, so dev and the existing migration
// suite keep the array in the file.
//
// Rollback: stop the node process, copy the pre-migration db.json back
// over ECD_DB_FILE (backups/db.json.pre-auditlog-mongo, also a
// db.json.<timestamp> crash copy), drop or restore the Mongo `auditLog`
// collection from the dump taken before deploy, then start the previous
// build. Set AUDITLOG_BACKEND=json (or unset with a non-production
// harness) if the restored file must be the source of truth again.
// See docs/ops/migration-policies.md.

import fs from "fs";
import path from "path";
import { backupDirPath, forgetDbCache } from "../../../src/utils/db-server.js";
import { resolveAuditLogBackend } from "../../auditLog/auditBackend.js";
import { auditEntriesMatch } from "../../auditLog/auditCanonical.js";
import {
  loadStoredAuditEntries,
  upsertAuditEntries,
} from "../../auditLog/auditRepository.js";

function dbFilePath() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

function readFileDb(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writePreMigrationCopy(file, now) {
  const dir = backupDirPath();
  fs.mkdirSync(dir, { recursive: true });
  const stamped = path.join(dir, `db.json.${stamp(now)}`);
  const stable = path.join(dir, "db.json.pre-auditlog-mongo");
  fs.copyFileSync(file, stamped);
  fs.copyFileSync(file, stable);
  return { stamped, stable };
}

function writeFileDb(file, db) {
  const tmp = `${file}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, file);
  forgetDbCache();
}

export async function migrateFileAuditLog({
  dryRun = false,
  backend = resolveAuditLogBackend(),
  file = dbFilePath(),
  now = new Date(),
  upsert = upsertAuditEntries,
  loadStored = loadStoredAuditEntries,
} = {}) {
  if (backend === "json") {
    return {
      changed: [],
      summary:
        "Audit store is the JSON harness. auditLog stays in db.json.",
    };
  }

  const db = readFileDb(file);
  const entries = Array.isArray(db?.auditLog) ? db.auditLog : [];
  if (!db || entries.length === 0) {
    return {
      changed: [],
      summary: "No auditLog in db.json. Nothing to copy.",
    };
  }

  const missingId = entries.find((row) => !row || !row.id);
  if (missingId) {
    throw new Error(
      "Audit migration refused: an auditLog row in db.json has no id. The file was not changed."
    );
  }
  const ids = entries.map((row) => row.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error(
      "Audit migration refused: db.json has duplicate auditLog ids. The file was not changed."
    );
  }

  if (dryRun) {
    return {
      changed: ids,
      summary: `Would copy ${ids.length} auditLog row(s) into the ${backend} audit store and remove them from db.json.`,
    };
  }

  const copies = writePreMigrationCopy(file, now instanceof Date ? now : new Date(now));
  await upsert(entries);
  const stored = await loadStored(ids);
  if ((stored || []).length !== entries.length) {
    throw new Error(
      `Audit migration verify failed (count ${stored?.length ?? 0} !== ${entries.length}). db.json was not changed. Pre-migration copy: ${copies.stable}`
    );
  }
  const storedById = new Map((stored || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const mismatched = [];
  for (const source of entries) {
    const got = storedById.get(source.id);
    if (!got || !auditEntriesMatch(source, got)) mismatched.push(source.id);
  }
  if (mismatched.length) {
    throw new Error(
      `Audit migration verify failed (${mismatched.length} auditLog row(s) do not match the store, first ${mismatched.slice(0, 5).join(", ")}). db.json was not changed. Pre-migration copy: ${copies.stable}`
    );
  }

  const next = { ...db };
  delete next.auditLog;
  writeFileDb(file, next);

  return {
    changed: ids,
    summary: `Copied ${ids.length} auditLog row(s) into the ${backend} audit store and removed them from db.json. Pre-migration copy: ${copies.stable}`,
    backup: copies.stable,
  };
}

export default {
  id: "012-auditlog-to-mongo",
  description:
    "Copy auditLog out of db.json into the Mongo auditLog collection (or the memory store in tests) after count and canonical form verify, then delete the key from the file.",
  forwardOnly: false,
  rollback:
    "Stop node. Copy backups/db.json.pre-auditlog-mongo over the ECD db file. Restore the auditLog collection from the mongodump taken before this migration (or drop it if the file copy is the source of truth). Set AUDITLOG_BACKEND=json if the restored file must be read again. Start the previous build. The JSON harness never runs this move.",

  async run({ dryRun }) {
    return migrateFileAuditLog({ dryRun });
  },
};
