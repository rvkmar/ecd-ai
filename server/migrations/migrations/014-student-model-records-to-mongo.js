// Copy ECD-file studentModelRecords into the external store, verify
// count and canonical form, then remove the key from db.json.
// Idempotent. A JSON harness run does not move anything, so dev and the
// existing migration suite keep the array in the file.
//
// Rollback: stop the node process, copy the pre-migration db.json back
// over ECD_DB_FILE (backups/db.json.pre-student-model-mongo, also a
// db.json.<timestamp> crash copy), drop or restore the Mongo
// `studentModelRecords` collection from the dump taken before deploy,
// then start the previous build. Set STUDENT_MODEL_RECORDS_BACKEND=json
// if the restored file must be the source of truth again.
// See docs/ops/migration-policies.md.

import fs from "fs";
import path from "path";
import { backupDirPath, forgetDbCache } from "../../../src/utils/db-server.js";
import { documentsMatch } from "../../calibrationData/documentCanonical.js";
import { resolveStudentModelRecordsBackend } from "../../studentModelRecords/studentModelRecordBackend.js";
import {
  loadStoredStudentModelRecords,
  upsertStudentModelRecords,
} from "../../studentModelRecords/studentModelRecordRepository.js";

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
  const stable = path.join(dir, "db.json.pre-student-model-mongo");
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

function assertIds(rows) {
  const missing = rows.find((row) => !row || !row.id);
  if (missing) {
    throw new Error(
      "Student model migration refused: a studentModelRecords row in db.json has no id. The file was not changed."
    );
  }
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      "Student model migration refused: db.json has duplicate studentModelRecords ids. The file was not changed."
    );
  }
  return ids;
}

async function verifyRows(source, stored, copies) {
  if ((stored || []).length !== source.length) {
    throw new Error(
      `Student model migration verify failed (count ${stored?.length ?? 0} !== ${source.length}). db.json was not changed. Pre-migration copy: ${copies.stable}`
    );
  }
  const storedById = new Map((stored || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const mismatched = [];
  for (const row of source) {
    const got = storedById.get(row.id);
    if (!got || !documentsMatch(row, got)) mismatched.push(row.id);
  }
  if (mismatched.length) {
    throw new Error(
      `Student model migration verify failed (${mismatched.length} studentModelRecords row(s) do not match the store, first ${mismatched.slice(0, 5).join(", ")}). db.json was not changed. Pre-migration copy: ${copies.stable}`
    );
  }
}

export async function migrateFileStudentModelRecords({
  dryRun = false,
  backend = resolveStudentModelRecordsBackend(),
  file = dbFilePath(),
  now = new Date(),
  upsert = upsertStudentModelRecords,
  loadStored = loadStoredStudentModelRecords,
} = {}) {
  if (backend === "json") {
    return {
      changed: [],
      summary:
        "Student model store is the JSON harness. studentModelRecords stay in db.json.",
    };
  }

  const db = readFileDb(file);
  const records = Array.isArray(db?.studentModelRecords) ? db.studentModelRecords : [];
  if (!db || records.length === 0) {
    return {
      changed: [],
      summary: "No studentModelRecords in db.json. Nothing to copy.",
    };
  }

  const ids = assertIds(records);

  if (dryRun) {
    return {
      changed: ids,
      summary: `Would copy ${ids.length} studentModelRecords into the ${backend} store and remove the key from db.json.`,
    };
  }

  const copies = writePreMigrationCopy(file, now instanceof Date ? now : new Date(now));
  await upsert(records);
  const stored = await loadStored(ids);
  await verifyRows(records, stored, copies);

  const next = { ...db };
  delete next.studentModelRecords;
  writeFileDb(file, next);

  return {
    changed: ids,
    summary: `Copied ${ids.length} studentModelRecords into the ${backend} store and removed the key from db.json. Pre-migration copy: ${copies.stable}`,
    backup: copies.stable,
  };
}

export default {
  id: "014-student-model-records-to-mongo",
  description:
    "Copy studentModelRecords out of db.json into Mongo (or the memory store in tests) after count and canonical form verify, then delete the key from the file.",
  forwardOnly: false,
  rollback:
    "Stop node. Copy backups/db.json.pre-student-model-mongo over the ECD db file. Restore the studentModelRecords collection from the mongodump taken before this migration (or drop it if the file copy is the source of truth). Set STUDENT_MODEL_RECORDS_BACKEND=json if the restored file must be read again. Start the previous build. The JSON harness never runs this move.",

  async run({ dryRun }) {
    return migrateFileStudentModelRecords({ dryRun });
  },
};
