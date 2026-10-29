import { resolveCalibrationJobsBackend, calibrationJobsUseExternalStore } from "../calibrationJobs/calibrationJobBackend.js";
import { resolveAnalysisArtefactsBackend, analysisArtefactsUseExternalStore } from "../analysisArtefacts/analysisArtefactBackend.js";
import { migrateFileCalibrationData } from "../migrations/migrations/013-calibration-data-to-mongo.js";
import { ensureCalibrationJobIndexes } from "../calibrationJobs/mongoCalibrationJobStore.js";
import { ensureAnalysisArtefactIndexes } from "../analysisArtefacts/mongoAnalysisArtefactStore.js";

export async function bootCalibrationStore() {
  if (!calibrationJobsUseExternalStore() && !analysisArtefactsUseExternalStore()) {
    return { skipped: true, reason: "json harness" };
  }
  const migration = await migrateFileCalibrationData({ dryRun: false });
  if (resolveCalibrationJobsBackend() === "mongo") {
    await ensureCalibrationJobIndexes();
  }
  if (resolveAnalysisArtefactsBackend() === "mongo") {
    await ensureAnalysisArtefactIndexes();
  }
  return migration;
}
