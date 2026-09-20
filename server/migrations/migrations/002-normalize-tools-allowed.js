// server/migrations/migrations/002-normalize-tools-allowed.js
// One-off pass rewriting taskStructure.resourceConstraints.toolsAllowed
// from a comma-separated string to a string[]. See the header comment on
// toolsAllowedList() in src/utils/schema.js for the crash this caused and
// why the reader no longer tolerates the string shape after this runs.
//
// Task Models live in the ECD JSON store (loadDB/saveDB) under the interim
// architecture (ADR 0007). D109 rehearsal targets that file via ECD_DB_FILE,
// so this migration reads/writes readRawDB — not dbAdapter — matching 001/003.

import { readRawDB, saveDB } from "../../../src/utils/db-server.js";

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  return String(raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default {
  id: "002-normalize-tools-allowed",
  description:
    "Rewrite taskStructure.resourceConstraints.toolsAllowed from a comma-separated string to a string[].",
  forwardOnly: false,
  rollback:
    "Restore ECD JSON from backup taken before 002, or manually join toolsAllowed arrays back to comma-strings if a consumer still required the legacy shape (none do after toolsAllowedList).",

  async run({ dryRun }) {
    const db = readRawDB();
    const changed = [];

    for (const tm of db.taskModels || []) {
      const rc = tm?.taskStructure?.resourceConstraints;
      if (!rc || Array.isArray(rc.toolsAllowed)) continue;
      if (rc.toolsAllowed == null) continue;

      changed.push(tm.id);
      if (!dryRun) {
        rc.toolsAllowed = toArray(rc.toolsAllowed);
      }
    }

    if (!dryRun && changed.length) {
      saveDB(db, { skipAudit: true });
    }

    return {
      changed,
      summary: changed.length
        ? `Normalized toolsAllowed on ${changed.length} Task Model(s): ${changed.join(", ")}`
        : "No Task Models had a string-shaped toolsAllowed; nothing to do.",
    };
  },
};
