// Provenance checks for one parameterSets[] row.
//
// Shared by evidence-model validation and by calibration ingest. Ingest
// checks the new row only. Confirm-time evidence-model audits (decision
// rule, assembly floors, fairness) stay on the evidence-model transition
// that owns them and are not re-run just because a candidate was stored.

import { isParameterSetStatus } from "./parameterSetStatus.js";
import { bulkyFitStatisticsErrors } from "./modelCriticism.js";
import { fitGateStorageErrors } from "./fitActivationGate.js";
import {
  CALIBRATION_FILE_KIND_VALUES,
  statisticalModelTypesForCalibrationKind,
} from "./ecdVocabulary.js";

export function parameterSetStorageErrors(parameterSet, statisticalModel) {
  const errors = [];
  const ps = parameterSet || {};
  const sm = statisticalModel || {};
  const psTag = ps.parameterSetId || "(missing id)";
  const smId = sm.id || "(missing id)";

  if (!ps.packageVersion) {
    errors.push(`Parameter set ${psTag} on model ${smId} requires packageVersion.`);
  }
  if (typeof ps.sampleSize !== "number" || ps.sampleSize <= 0) {
    errors.push(`Parameter set ${psTag} on model ${smId} requires a positive sampleSize.`);
  }
  if (!ps.calibratedAt) {
    errors.push(`Parameter set ${psTag} on model ${smId} requires calibratedAt.`);
  }
  if (typeof ps.converged !== "boolean") {
    errors.push(`Parameter set ${psTag} on model ${smId} must declare converged.`);
  } else if (!ps.converged) {
    errors.push(
      `Parameter set ${psTag} on model ${smId} did not converge and cannot be stored as a parameter set.`
    );
  }

  if (ps.calibrationKind !== undefined && ps.calibrationKind !== null) {
    if (!CALIBRATION_FILE_KIND_VALUES.includes(ps.calibrationKind)) {
      errors.push(
        `Parameter set ${psTag} on model ${smId} has invalid calibrationKind '${ps.calibrationKind}'. Must be one of: ${CALIBRATION_FILE_KIND_VALUES.join(", ")}.`
      );
    } else if (!statisticalModelTypesForCalibrationKind(ps.calibrationKind).includes(sm.type)) {
      errors.push(
        `Parameter set ${psTag} on model ${smId} declares calibrationKind '${ps.calibrationKind}', which does not apply to statistical model type '${sm.type}'.`
      );
    }
  }

  if (ps.standardErrors !== undefined && ps.standardErrors !== null) {
    if (typeof ps.standardErrors !== "object" || Array.isArray(ps.standardErrors)) {
      errors.push(`Parameter set ${psTag} on model ${smId} has invalid standardErrors: should be object.`);
    }
  }
  if (ps.fitStatistics !== undefined && ps.fitStatistics !== null) {
    if (typeof ps.fitStatistics !== "object" || Array.isArray(ps.fitStatistics)) {
      errors.push(`Parameter set ${psTag} on model ${smId} has invalid fitStatistics: should be object.`);
    } else {
      for (const message of bulkyFitStatisticsErrors(ps.fitStatistics)) {
        errors.push(`Parameter set ${psTag} on model ${smId}: ${message}`);
      }
    }
  }
  if (ps.qMatrixId != null && typeof ps.qMatrixId !== "string") {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid qMatrixId: should be string.`);
  }
  if (ps.responseSource != null && typeof ps.responseSource !== "string") {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid responseSource: should be string.`);
  }
  if (ps.sourceSessionIds != null && !Array.isArray(ps.sourceSessionIds)) {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid sourceSessionIds: should be array.`);
  }
  if (ps.sourceSessionCount != null && typeof ps.sourceSessionCount !== "number") {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid sourceSessionCount: should be number.`);
  }
  if (ps.sourceSessionIdsHash != null && typeof ps.sourceSessionIdsHash !== "string") {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid sourceSessionIdsHash: should be string.`);
  }
  if (ps.analysisArtefactId != null && ps.analysisArtefactId !== "" && typeof ps.analysisArtefactId !== "string") {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid analysisArtefactId: should be string.`);
  }
  if (ps.status != null && ps.status !== "" && !isParameterSetStatus(ps.status)) {
    errors.push(
      `Parameter set ${psTag} on model ${smId} has invalid status '${ps.status}'. Use 'candidate' or 'active'.`
    );
  } else if (ps.status === "active" && sm.activeParameterSetId !== ps.parameterSetId) {
    errors.push(
      `Parameter set ${psTag} on model ${smId} is marked active but is not activeParameterSetId.`
    );
  }
  if (ps.activatedBy != null && typeof ps.activatedBy !== "string") {
    errors.push(`Parameter set ${psTag} on model ${smId} has invalid activatedBy: should be string.`);
  }
  errors.push(...fitGateStorageErrors(ps.fitGate, `Parameter set ${psTag} on model ${smId}`));

  return errors;
}
