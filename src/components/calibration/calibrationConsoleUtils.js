// src/components/calibration/calibrationConsoleUtils.js
// Display helpers for the D65 calibration console. No psychometric
// numbers are invented here — values come from the job record.

export const ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);

export const CALIBRATION_POLL_MS = 2000;

export const LSAT7_JOB_KIND = "irt-parameters";

export const LSAT7_STATISTICAL_MODEL_TYPES = ["irt", "rasch"];

export function isActiveCalibrationJob(job) {
  return Boolean(job && ACTIVE_JOB_STATUSES.has(job.status));
}

export function pollWhileActive(query) {
  const data = query?.state?.data;
  if (Array.isArray(data)) {
    return data.some(isActiveCalibrationJob) ? CALIBRATION_POLL_MS : false;
  }
  return isActiveCalibrationJob(data) ? CALIBRATION_POLL_MS : false;
}

export function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

export function convergedLabel(job) {
  const value = job?.response?.converged;
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

export function requestSummary(job) {
  const request = job?.request;
  if (!request || typeof request !== "object") return null;
  return {
    family: request.model?.family || "—",
    subtype: request.model?.subtype || "—",
    itemIds: Array.isArray(request.model?.itemIds) ? request.model.itemIds : [],
    personCount: Array.isArray(request.responseMatrix?.personIds)
      ? request.responseMatrix.personIds.length
      : 0,
    seed: request.options?.seed,
    contractVersion: request.contractVersion || "—",
  };
}

export function statisticalModelsForLsat7(evidenceModel) {
  return (evidenceModel?.statisticalModels || []).filter((sm) =>
    LSAT7_STATISTICAL_MODEL_TYPES.includes(sm.type)
  );
}
