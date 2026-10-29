// Copy ECD-file calibrationJobs and analysisArtefacts into their external
// stores, verify count and canonical form, then remove both keys from
// db.json. Idempotent. A JSON harness run does not move anything, so dev
// and the existing migration suite keep both arrays in the file.
//
// Rollback: stop the node process, copy the pre-migration db.json back
// over ECD_DB_FILE (backups/db.json.pre-calibration-mongo, also a
// db.json.<timestamp> crash copy), drop or restore the Mongo
// `calibrationJobs` and `analysisArtefacts` collections from the dump
// taken before deploy, then start the previous build. Set
// CALIBRATION_JOBS_BACKEND=json and ANALYSIS_ARTEFACTS_BACKEND=json if
// the restored file must be the source of truth again.
// See docs/ops/migration-policies.md.

import fs from "fs";
import path from "path";
import { backupDirPath, forgetDbCache } from "../../../src/utils/db-server.js";
import { documentsMatch } from "../../calibrationData/documentCanonical.js";
import { resolveCalibrationJobsBackend } from "../../calibrationJobs/calibrationJobBackend.js";
import { resolveAnalysisArtefactsBackend } from "../../analysisArtefacts/analysisArtefactBackend.js";
import {
  loadStoredCalibrationJobs,
  upsertCalibrationJobs,
} from "../../calibrationJobs/calibrationJobRepository.js";
import {
  loadStoredAnalysisArtefacts,
  upsertAnalysisArtefacts,
} from "../../analysisArtefacts/analysisArtefactRepository.js";

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
  const stable = path.join(dir, "db.json.pre-calibration-mongo");
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

function assertIds(rows, label) {
  const missing = rows.find((row) => !row || !row.id);
  if (missing) {
    throw new Error(
      `Calibration migration refused: a ${label} row in db.json has no id. The file was not changed.`
    );
  }
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `Calibration migration refused: db.json has duplicate ${label} ids. The file was not changed.`
    );
  }
  return ids;
}

async function verifyRows(source, stored, label, copies) {
  if ((stored || []).length !== source.length) {
    throw new Error(
      `Calibration migration verify failed (${label} count ${stored?.length ?? 0} !== ${source.length}). db.json was not changed. Pre-migration copy: ${copies.stable}`
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
      `Calibration migration verify failed (${mismatched.length} ${label} row(s) do not match the store, first ${mismatched.slice(0, 5).join(", ")}). db.json was not changed. Pre-migration copy: ${copies.stable}`
    );
  }
}

export async function migrateFileCalibrationData({
  dryRun = false,
  jobsBackend = resolveCalibrationJobsBackend(),
  artefactsBackend = resolveAnalysisArtefactsBackend(),
  file = dbFilePath(),
  now = new Date(),
  upsertJobs = upsertCalibrationJobs,
  upsertArtefacts = upsertAnalysisArtefacts,
  loadJobs = loadStoredCalibrationJobs,
  loadArtefacts = loadStoredAnalysisArtefacts,
} = {}) {
  if (jobsBackend === "json" && artefactsBackend === "json") {
    return {
      changed: { calibrationJobs: [], analysisArtefacts: [] },
      summary:
        "Calibration store is the JSON harness. calibrationJobs and analysisArtefacts stay in db.json.",
    };
  }
  if (jobsBackend === "json" || artefactsBackend === "json") {
    throw new Error(
      "Calibration migration refused: CALIBRATION_JOBS_BACKEND and ANALYSIS_ARTEFACTS_BACKEND must both be external or both be the JSON harness. The file was not changed."
    );
  }

  const db = readFileDb(file);
  const jobs = Array.isArray(db?.calibrationJobs) ? db.calibrationJobs : [];
  const artefacts = Array.isArray(db?.analysisArtefacts) ? db.analysisArtefacts : [];
  if (!db || (jobs.length === 0 && artefacts.length === 0)) {
    return {
      changed: { calibrationJobs: [], analysisArtefacts: [] },
      summary: "No calibrationJobs or analysisArtefacts in db.json. Nothing to copy.",
    };
  }

  const jobIds = assertIds(jobs, "calibrationJobs");
  const artefactIds = assertIds(artefacts, "analysisArtefacts");

  if (dryRun) {
    return {
      changed: { calibrationJobs: jobIds, analysisArtefacts: artefactIds },
      summary: `Would copy ${jobIds.length} calibrationJobs and ${artefactIds.length} analysisArtefacts into the ${jobsBackend} store and remove both keys from db.json.`,
    };
  }

  const copies = writePreMigrationCopy(file, now instanceof Date ? now : new Date(now));
  if (jobs.length) await upsertJobs(jobs);
  if (artefacts.length) await upsertArtefacts(artefacts);
  const storedJobs = jobs.length ? await loadJobs(jobIds) : [];
  const storedArtefacts = artefacts.length ? await loadArtefacts(artefactIds) : [];
  await verifyRows(jobs, storedJobs, "calibrationJobs", copies);
  await verifyRows(artefacts, storedArtefacts, "analysisArtefacts", copies);

  const next = { ...db };
  delete next.calibrationJobs;
  delete next.analysisArtefacts;
  writeFileDb(file, next);

  return {
    changed: { calibrationJobs: jobIds, analysisArtefacts: artefactIds },
    summary: `Copied ${jobIds.length} calibrationJobs and ${artefactIds.length} analysisArtefacts into the ${jobsBackend} store and removed both keys from db.json. Pre-migration copy: ${copies.stable}`,
    backup: copies.stable,
  };
}

export default {
  id: "013-calibration-data-to-mongo",
  description:
    "Copy calibrationJobs and analysisArtefacts out of db.json into Mongo (or the memory store in tests) after count and canonical form verify, then delete both keys from the file.",
  forwardOnly: false,
  rollback:
    "Stop node. Copy backups/db.json.pre-calibration-mongo over the ECD db file. Restore the calibrationJobs and analysisArtefacts collections from the mongodump taken before this migration (or drop them if the file copy is the source of truth). Set CALIBRATION_JOBS_BACKEND=json and ANALYSIS_ARTEFACTS_BACKEND=json if the restored file must be read again. Start the previous build. The JSON harness never runs this move.",

  async run({ dryRun }) {
    return migrateFileCalibrationData({ dryRun });
  },
};
