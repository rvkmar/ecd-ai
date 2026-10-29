/**
 * D107 — what a full backup must cover (ADR 0007 + calendar exit check).
 *
 * Every live collection is either included in the encrypted archive or
 * explicitly excluded with a reason. Do not add a store without updating this
 * list — restore (D108) and DR (D110) read it as the contract.
 */

export const BACKUP_FILE_PREFIX = "ecd-full-";
export const BACKUP_FILE_SUFFIX = ".ecd.bak.enc";

/** @typedef {{ id: string, store: string, pathInArchive: string | null, reason: string }} BackupInventoryRow */


/** @type {readonly BackupInventoryRow[]} */
export const BACKUP_INVENTORY = Object.freeze([
  // --- ECD JSON file (loadDB / saveDB) — interim until cutover ---
  {
    id: "items",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included — stimulus/materials are inline on items; no separate materials volume today.",
  },
  {
    id: "competencyModels",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "competencies",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "evidenceModels",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included — parameter sets and calibration provenance live here.",
  },
  {
    id: "taskModels",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "taskModelVariables",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included — D116 reusable Task Model Variables; shared design features.",
  },
  {
    id: "tasks",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot (local delivery instances).",
  },
  {
    id: "students",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "sessions",
    store: "mongo-or-ecd-json",
    pathInArchive: "mongo/sessions.json",
    reason:
      "Included. Mongo (or memory) sessions are exported as mongo/sessions.json. The JSON harness still keeps them inside ecd/db.json as well, so a harness backup remains complete. Examinee responses cannot be rebuilt.",
  },
  {
    id: "studentModelRecords",
    store: "mongo-or-ecd-json",
    pathInArchive: "mongo/studentModelRecords.json",
    reason:
      "Included. Mongo (or memory) studentModelRecords are exported as mongo/studentModelRecords.json. The JSON harness still keeps them inside ecd/db.json as well, so a harness backup remains complete. Per-student scoring record carried across finished sessions. Runtime data, not design data, so it is not in the zip.",
  },
  {
    id: "announcements",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "policies",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "curricularPolicies",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "assemblyModels",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "qMatrixModels",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included in ECD JSON snapshot.",
  },
  {
    id: "presentationModels",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included — D113 Presentation Model overlay; delivery chrome is authored here.",
  },
  {
    id: "compositeLibrary",
    store: "ecd-json",
    pathInArchive: "ecd/db.json",
    reason: "Included — rebuildable from operational TMs but retained for exact active packages.",
  },
  {
    id: "calibrationJobs",
    store: "mongo-or-ecd-json",
    pathInArchive: "mongo/calibrationJobs.json",
    reason:
      "Included. Mongo (or memory) calibrationJobs are exported as mongo/calibrationJobs.json. The JSON harness still keeps them inside ecd/db.json as well, so a harness backup remains complete. ADR 0002 provenance; request and response stay on the job.",
  },
  {
    id: "analysisArtefacts",
    store: "mongo-or-ecd-json",
    pathInArchive: "mongo/analysisArtefacts.json",
    reason:
      "Included. Mongo (or memory) analysisArtefacts are exported as mongo/analysisArtefacts.json. The JSON harness still keeps them inside ecd/db.json as well, so a harness backup remains complete. DIF, equating, and CTT payloads must not be dropped.",
  },
  {
    id: "auditLog",
    store: "mongo-or-ecd-json",
    pathInArchive: "mongo/auditLog.json",
    reason:
      "Included. Mongo (or memory) auditLog rows are exported as mongo/auditLog.json. The JSON harness still keeps them inside ecd/db.json as well, so a harness backup remains complete. Append-only governance trail.",
  },
  {
    id: "questions",
    store: "ecd-json-and-mongo",
    pathInArchive: "mongo/questions.json",
    reason: "Mongo export when the adapter runs against Mongo; also present in ECD JSON default shape — archive carries the Mongo export as authority for users/questions.",
  },
  // --- Mongo (dbAdapter) ---
  {
    id: "users",
    store: "mongo",
    pathInArchive: "mongo/users.json",
    reason: "Included — roster + bcrypt hashes; required to restore login.",
  },
  // --- Optional filesystem materials ---
  {
    id: "uploaded-materials",
    store: "materials-dir",
    pathInArchive: "materials/",
    reason: "Included when ECD_MATERIALS_DIR is set and non-empty; today stimulus is inline on items so this is usually empty.",
  },
  // --- Explicit exclusions ---
  {
    id: "r-backend-image",
    store: "excluded",
    pathInArchive: null,
    reason: "Excluded — rebuildable from published image pin; not student data.",
  },
  {
    id: "node-modules-and-build",
    store: "excluded",
    pathInArchive: null,
    reason: "Excluded — rebuildable from git + npm ci.",
  },
  {
    id: "opportunistic-db-json-copies",
    store: "excluded-as-primary",
    pathInArchive: null,
    reason: "Excluded as the scheduled backup. saveDB still writes unencrypted db.json.<timestamp> crash copies, throttled by ECD_SNAPSHOT_INTERVAL_MS and capped by ECD_SNAPSHOT_KEEP. Health prefers encrypted ecd-full-*.ecd.bak.enc.",
  },
  {
    id: "mongo-volume-raw",
    store: "deferred-ops",
    pathInArchive: null,
    reason: "App-level backup exports users/questions via dbAdapter. Raw mongo_data volume snapshots remain an ops option for D108/D110; not required for this unit's exit check.",
  },
]);

export function inventoryIncluded() {
  return BACKUP_INVENTORY.filter((r) => r.pathInArchive != null);
}

export function inventoryExcluded() {
  return BACKUP_INVENTORY.filter((r) => r.pathInArchive == null);
}
