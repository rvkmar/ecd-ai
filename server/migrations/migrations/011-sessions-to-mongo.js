// Copy ECD-file sessions into the external session store, verify ids,
// then remove them from db.json. Idempotent. A JSON harness run does
// not move anything, so dev and the existing migration suite keep the
// array in the file.
//
// Rollback: stop the node process, copy the pre-migration db.json back
// over ECD_DB_FILE (backups/db.json.pre-sessions-mongo, also a
// db.json.<timestamp> crash copy), drop or restore the Mongo `sessions`
// collection from the dump taken before deploy, then start the previous
// build. See docs/ops/migration-policies.md.

import fs from "fs";
import path from "path";
import { backupDirPath, forgetDbCache } from "../../../src/utils/db-server.js";
import { resolveSessionsBackend } from "../../sessions/sessionBackend.js";
import {
  findStoredSessionIds,
  upsertSessions,
} from "../../sessions/sessionRepository.js";

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
  const stable = path.join(dir, "db.json.pre-sessions-mongo");
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

export async function migrateFileSessions({
  dryRun = false,
  backend = resolveSessionsBackend(),
  file = dbFilePath(),
  now = new Date(),
  upsert = upsertSessions,
  findIds = findStoredSessionIds,
} = {}) {
  if (backend === "json") {
    return {
      changed: [],
      summary:
        "Session store is the JSON harness. Sessions stay in db.json.",
    };
  }

  const db = readFileDb(file);
  const sessions = Array.isArray(db?.sessions) ? db.sessions : [];
  if (!db || sessions.length === 0) {
    return {
      changed: [],
      summary: "No sessions in db.json. Nothing to copy.",
    };
  }

  const missingId = sessions.find((row) => !row || !row.id);
  if (missingId) {
    throw new Error(
      "Session migration refused: a session in db.json has no id. The file was not changed."
    );
  }
  const ids = sessions.map((row) => row.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error(
      "Session migration refused: db.json has duplicate session ids. The file was not changed."
    );
  }

  if (dryRun) {
    return {
      changed: ids,
      summary: `Would copy ${ids.length} session(s) into the ${backend} session store and remove them from db.json.`,
    };
  }

  const copies = writePreMigrationCopy(file, now instanceof Date ? now : new Date(now));
  await upsert(sessions);
  const found = new Set(await findIds(ids));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(
      `Session migration verify failed (${missing.length} id(s) missing in the store, first ${missing.slice(0, 5).join(", ")}). db.json was not changed. Pre-migration copy: ${copies.stable}`
    );
  }

  const next = { ...db };
  delete next.sessions;
  writeFileDb(file, next);

  return {
    changed: ids,
    summary: `Copied ${ids.length} session(s) into the ${backend} session store and removed them from db.json. Pre-migration copy: ${copies.stable}`,
    backup: copies.stable,
  };
}

export default {
  id: "011-sessions-to-mongo",
  description:
    "Copy sessions out of db.json into the Mongo sessions collection (or the memory store in tests) after the ids verify, then delete the array from the file.",
  forwardOnly: false,
  rollback:
    "Stop node. Copy backups/db.json.pre-sessions-mongo over the ECD db file. Restore the sessions collection from the mongodump taken before this migration (or drop it if the file copy is the source of truth). Start the previous build. The JSON harness never runs this move.",

  async run({ dryRun }) {
    return migrateFileSessions({ dryRun });
  },
};
