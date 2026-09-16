// src/components/calibration/calibrationConsoleUtils.js
// Display helpers for the D65 calibration console. No psychometric
// numbers are invented here — values come from the job record.

export const ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);

export const CALIBRATION_POLL_MS = 2000;

export const LSAT7_JOB_KIND = "irt-parameters";

export const LSAT7_STATISTICAL_MODEL_TYPES = ["irt", "rasch"];

export const SIM10GDINA_JOB_KIND = "dina-parameters";

export const SIM10GDINA_STATISTICAL_MODEL_TYPES = ["dina", "gdina"];

export const LSAT7_CTT_JOB_KIND = "ctt-statistics";

export const LSAT7_CTT_STATISTICAL_MODEL_TYPES = ["ctt"];

export const LSAT7_ITEM_ANALYSIS_JOB_KIND = "item-analysis";

// Vocabulary formerly had an empty bind list; prefer ctt + irt/rasch so
// the console can bind to a real SM for provenance without implying
// parameter-set authority (ingest is analysisArtefacts only).
export const LSAT7_ITEM_ANALYSIS_STATISTICAL_MODEL_TYPES = ["ctt", "irt", "rasch"];

export const PLANTED_DIF_JOB_KIND = "dif-analysis";

export const PLANTED_DIF_STATISTICAL_MODEL_TYPES = ["irt", "rasch"];

export const KNOWN_EQUATING_JOB_KIND = "equating";

export const KNOWN_EQUATING_STATISTICAL_MODEL_TYPES = ["irt", "rasch"];

export const NAMED_CALIBRATION_FIXTURES = [
  {
    id: "lsat7",
    label: "LSAT7",
    kind: LSAT7_JOB_KIND,
    statisticalModelTypes: LSAT7_STATISTICAL_MODEL_TYPES,
    buttonLabel: "Enqueue LSAT7",
    choosePrompt: "Choose an evidence model and an IRT statistical model.",
    emptyBind:
      "No evidence model has an IRT or Rasch statistical model to bind. Author one before enqueueing LSAT7.",
    successToast: "LSAT7 calibration job queued.",
    description:
      "LSAT section 7 (Bock & Lieberman 1970 / mirt::LSAT7): 1000 examinees × 5 dichotomous items. The server fills the ADR 0002 request from the published fixture. This form does not invent item parameters.",
  },
  {
    id: "sim10gdina",
    label: "sim10GDINA",
    kind: SIM10GDINA_JOB_KIND,
    statisticalModelTypes: SIM10GDINA_STATISTICAL_MODEL_TYPES,
    buttonLabel: "Enqueue sim10GDINA",
    choosePrompt: "Choose an evidence model and a DINA or G-DINA statistical model.",
    emptyBind:
      "No evidence model has a DINA or G-DINA statistical model to bind. Author one before enqueueing sim10GDINA.",
    successToast: "sim10GDINA calibration job queued.",
    description:
      "GDINA::sim10GDINA (Ma & de la Torre 2020): 1000 examinees × 10 dichotomous items, 3 attributes. The server fills simdat and simQ. Binding a G-DINA model fits G-DINA; binding a DINA model fits DINA. This form does not invent item parameters.",
  },
  {
    id: "lsat7-ctt",
    label: "LSAT7 CTT",
    kind: LSAT7_CTT_JOB_KIND,
    statisticalModelTypes: LSAT7_CTT_STATISTICAL_MODEL_TYPES,
    buttonLabel: "Enqueue LSAT7 CTT",
    choosePrompt: "Choose an evidence model and a CTT statistical model.",
    emptyBind:
      "No evidence model has a CTT statistical model to bind. Author one before enqueueing LSAT7 CTT.",
    successToast: "LSAT7 CTT calibration job queued.",
    description:
      "LSAT section 7 (Bock & Lieberman 1970) analysed with classical test theory via TAM::tam.ctt: difficulty (p), item-total point-biserial, KR-20. Same published 1000×5 matrix as the IRT fixture. This form does not invent item statistics.",
  },
  {
    id: "lsat7-item-analysis",
    label: "LSAT7 item analysis",
    kind: LSAT7_ITEM_ANALYSIS_JOB_KIND,
    statisticalModelTypes: LSAT7_ITEM_ANALYSIS_STATISTICAL_MODEL_TYPES,
    buttonLabel: "Enqueue LSAT7 item analysis",
    choosePrompt: "Choose an evidence model and a CTT, IRT, or Rasch statistical model (provenance bind only).",
    emptyBind:
      "No evidence model has a CTT, IRT, or Rasch statistical model to bind. Author one before enqueueing LSAT7 item analysis.",
    successToast: "LSAT7 item-analysis job queued.",
    description:
      "LSAT section 7 via TAM::tam.ctt2 as a dashboard analysisArtefact: pValue, pointBiserial, n; distractors null on dichotomous data. Same classical engine as CTT parameter sets where p and rpb overlap — informs only; never sets activeParameterSetId. Bound SM is provenance, not operational readiness.",
  },
  {
    id: "planted-dif",
    label: "Planted DIF",
    kind: PLANTED_DIF_JOB_KIND,
    statisticalModelTypes: PLANTED_DIF_STATISTICAL_MODEL_TYPES,
    buttonLabel: "Enqueue planted DIF",
    choosePrompt: "Choose an evidence model and an IRT statistical model to bind the DIF artefact to.",
    emptyBind:
      "No evidence model has an IRT or Rasch statistical model to bind. Author one before enqueueing planted DIF.",
    successToast: "Planted DIF analysis job queued.",
    description:
      "Seeded 800×8 Rasch matrix (seed 20261201) with one planted uniform DIF item (Item.5, focal b shifted +2.5). Flag is ETS C (|deltaMH| ≥ 1.5), not unadjusted MH p < 0.05. Bound to an IRT model for provenance only — ingest writes an analysis artefact, not a parameter set. Live CI runs difR::difMH and must flag Item.5 only.",
  },
  {
    id: "known-equating",
    label: "Known equating",
    kind: KNOWN_EQUATING_JOB_KIND,
    statisticalModelTypes: KNOWN_EQUATING_STATISTICAL_MODEL_TYPES,
    buttonLabel: "Enqueue known equating",
    choosePrompt: "Choose an evidence model and an IRT statistical model to bind the equating artefact to.",
    emptyBind:
      "No evidence model has an IRT or Rasch statistical model to bind. Author one before enqueueing known equating.",
    successToast: "Known-equating analysis job queued.",
    description:
      "Seeded NEAT common-item design (seed 20261202): 400 Form X + 400 Form Y, 6 common items, Form Y generated 0.5 logits harder. Live path estimates Rasch b with mirt then links with plink::plink Mean/Sigma. Recovers slope 1 and intercept −0.5 within stated tolerances. Ingest writes an analysis artefact, not a parameter set.",
  },
];

export function namedCalibrationFixture(id) {
  return NAMED_CALIBRATION_FIXTURES.find((f) => f.id === id) || NAMED_CALIBRATION_FIXTURES[0];
}

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
    attributeIds: Array.isArray(request.qMatrix?.attributeIds)
      ? request.qMatrix.attributeIds
      : [],
  };
}

export function statisticalModelsForFixture(evidenceModel, types) {
  return (evidenceModel?.statisticalModels || []).filter((sm) => types.includes(sm.type));
}

export function statisticalModelsForLsat7(evidenceModel) {
  return statisticalModelsForFixture(evidenceModel, LSAT7_STATISTICAL_MODEL_TYPES);
}
