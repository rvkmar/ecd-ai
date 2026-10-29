import {
  resolveStudentModelRecordsBackend,
  studentModelRecordsUseExternalStore,
} from "./studentModelRecordBackend.js";
import { migrateFileStudentModelRecords } from "../migrations/migrations/014-student-model-records-to-mongo.js";
import { ensureStudentModelRecordIndexes } from "./mongoStudentModelRecordStore.js";

export async function bootStudentModelStore() {
  if (!studentModelRecordsUseExternalStore()) {
    return { skipped: true, reason: "json harness" };
  }
  const migration = await migrateFileStudentModelRecords({ dryRun: false });
  if (resolveStudentModelRecordsBackend() === "mongo") {
    await ensureStudentModelRecordIndexes();
  }
  return migration;
}
