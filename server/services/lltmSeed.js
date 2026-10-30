// TU19. Fit an LLTM on items that cite a template's task specs, then
// write a predicted Rasch difficulty onto every spec the design can
// score. The heavy design, covariance, and response matrix go on an
// analysis artefact. Nothing here creates or activates a parameter set.

import { validateEntity } from "../../src/utils/schema.js";
import { validateCalibrationJobLifecycle } from "../utils/lifecycleValidation.js";
import { buildLltmDesign, predictedDifficulty, scoreLltmRows } from "../../src/utils/lltmDesign.js";
import { postLltm } from "../r/lltmClient.js";
import { insertCalibrationJob } from "../calibrationJobs/calibrationJobRepository.js";
import {
  persistAnalysisArtefact,
  placeAnalysisArtefact,
} from "../analysisArtefacts/analysisArtefactRepository.js";

const LLTM_SEED = 20261030;
const CLOSED_STATUSES = new Set(["completed", "submitted", "reviewed"]);

let idCounter = 0;
const genId = (prefix) => `${prefix}${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

function fail(status, error, extra = {}) {
  return { ok: false, status, error, ...extra };
}

function isClosedSession(session) {
  return session?.isCompleted === true || CLOSED_STATUSES.has(session?.status);
}

function studentIdOf(session) {
  if (typeof session?.studentId === "string" && session.studentId.trim()) {
    return session.studentId.trim();
  }
  const listed = Array.isArray(session?.studentIds) ? session.studentIds : [];
  const first = listed.find((id) => typeof id === "string" && id.trim());
  return first ? first.trim() : null;
}

function cellValue(value) {
  if (value === 1 || value === 0) return value;
  if (value === true) return 1;
  if (value === false) return 0;
  if (value == null) return null;
  return null;
}

function statisticalModelFor(evidenceModel) {
  const models = evidenceModel?.statisticalModels || [];
  return (
    models.find((model) => model && (model.type === "rasch" || model.type === "irt")) || null
  );
}

/**
 * Scored 0/1 matrix for items that cite this template's specs.
 * A missing item for a person is null, not a wrong answer.
 */
function responseMatrixForTemplate(db, specIds) {
  const specSet = new Set(specIds);
  const items = (db?.items || []).filter(
    (item) => item && specSet.has(item.taskSpecId)
  );
  const itemIds = items.map((item) => item.id).filter(Boolean);
  const byStudent = new Map();
  for (const session of db?.sessions || []) {
    if (!isClosedSession(session)) continue;
    const studentId = studentIdOf(session);
    if (!studentId) continue;
    for (const response of session.responses || []) {
      if (!response || !itemIds.includes(response.itemId)) continue;
      if (response.activated !== true && response.activated !== false) continue;
      if (!byStudent.has(studentId)) byStudent.set(studentId, new Map());
      byStudent.get(studentId).set(response.itemId, response.activated === true ? 1 : 0);
    }
  }
  const usedItems = itemIds.filter((itemId) =>
    [...byStudent.values()].some((cells) => cells.has(itemId))
  );
  const personIds = [...byStudent.keys()]
    .filter((studentId) => usedItems.some((itemId) => byStudent.get(studentId).has(itemId)))
    .sort((a, b) => a.localeCompare(b));
  const data = personIds.map((studentId) => {
    const cells = byStudent.get(studentId);
    return usedItems.map((itemId) => (cells.has(itemId) ? cells.get(itemId) : null));
  });
  return {
    items: items.filter((item) => usedItems.includes(item.id)),
    responseMatrix: { personIds, itemIds: usedItems, data },
  };
}

function normalizeSuppliedMatrix(body, items) {
  const rm = body?.responseMatrix;
  if (!rm || typeof rm !== "object" || Array.isArray(rm)) return null;
  const known = new Map(items.map((item) => [item.id, item]));
  const itemIds = Array.isArray(rm.itemIds) ? rm.itemIds.map((id) => String(id)) : [];
  if (itemIds.some((id) => !known.has(id))) {
    return { error: "responseMatrix.itemIds must be items that cite this template's task specs." };
  }
  const personIds = Array.isArray(rm.personIds) ? rm.personIds.map((id) => String(id)) : [];
  const data = Array.isArray(rm.data) ? rm.data : [];
  if (data.length !== personIds.length) {
    return { error: "responseMatrix.data must have one row per personId." };
  }
  const normalized = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (!Array.isArray(row) || row.length !== itemIds.length) {
      return { error: `responseMatrix.data[${i}] must have one cell per itemId.` };
    }
    normalized.push(row.map(cellValue));
  }
  return {
    items: itemIds.map((id) => known.get(id)),
    responseMatrix: { personIds, itemIds, data: normalized },
  };
}

function effectByName(effects) {
  const map = new Map();
  for (const effect of effects || []) {
    if (effect && effect.name) map.set(effect.name, effect);
  }
  return map;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeEffects(columns, rawEffects) {
  const byName = effectByName(rawEffects);
  const merged = [];
  for (const column of columns) {
    const raw = byName.get(column.name);
    const estimate = finiteNumber(raw?.estimate);
    if (estimate == null) return null;
    merged.push({
      name: column.name,
      role: column.role,
      taskModelVariableId: column.taskModelVariableId,
      level: column.level,
      reference: column.reference,
      label: column.label,
      estimate,
      se: finiteNumber(raw?.se),
    });
  }
  return merged;
}

function evidenceSnapshot(db) {
  return JSON.stringify(db?.evidenceModels || []);
}

/**
 * @param {object} db
 * @param {string} templateId
 * @param {{ responseMatrix?: object, requestedBy?: string, now?: string, fit?: Function }} [options]
 */
export async function seedLltmForTemplate(db, templateId, options = {}) {
  const beforeEvidence = evidenceSnapshot(db);
  const template = (db?.templates || []).find((row) => row && row.id === templateId);
  if (!template) return fail(404, "Template not found.");

  const specs = (db?.taskSpecs || []).filter((spec) => spec && spec.templateId === templateId);
  if (specs.length < 2) {
    return fail(400, "LLTM needs a generated family of at least two task specs.");
  }

  const evidenceModel = (db?.evidenceModels || []).find((row) => row && row.id === template.evidenceModelId);
  if (!evidenceModel) {
    return fail(400, "The template's evidence model is not in the database.");
  }
  const statisticalModel = statisticalModelFor(evidenceModel);
  if (!statisticalModel) {
    return fail(
      400,
      "LLTM seeds a Rasch difficulty. The template's evidence model needs an IRT or Rasch statistical model."
    );
  }

  const citingItems = (db?.items || []).filter(
    (item) => item && specs.some((spec) => spec.id === item.taskSpecId)
  );
  let matrixResult;
  if (options.responseMatrix) {
    matrixResult = normalizeSuppliedMatrix(
      { responseMatrix: options.responseMatrix },
      citingItems
    );
  } else {
    matrixResult = responseMatrixForTemplate(db, specs.map((spec) => spec.id));
  }
  if (matrixResult?.error) return fail(400, matrixResult.error);

  const responseMatrix = matrixResult.responseMatrix;
  const fittedItems = matrixResult.items || [];
  if (!responseMatrix || responseMatrix.personIds.length < 2 || responseMatrix.itemIds.length < 2) {
    return fail(
      400,
      "LLTM needs scored responses from at least two persons on at least two items that cite this family's task specs."
    );
  }

  const variables = db?.taskModelVariables || [];
  const estimationRows = fittedItems.map((item) => {
    const spec = specs.find((row) => row.id === item.taskSpecId);
    return { id: item.id, assignment: spec?.tmvAssignment || [] };
  });
  const design = buildLltmDesign(estimationRows, variables);
  if (!design.columns.length) {
    return fail(
      400,
      "The scored items do not vary on a Task Model Variable, so there is no covariate to estimate."
    );
  }
  if (design.rows.length !== estimationRows.length) {
    return fail(400, design.unscored[0]?.reason || "A scored item could not be coded as covariates.");
  }

  const now = options.now || new Date().toISOString();
  const jobId = options.jobId || genId("lltm");
  const fitBody = {
    jobId,
    responseMatrix,
    design: {
      columnNames: design.columns.map((column) => column.name),
      rows: design.rows.map((row) => row.x),
    },
  };
  const fit = options.fit || postLltm;
  const fitted = await fit(fitBody);
  if (!fitted?.ok) {
    return fail(fitted?.status || 502, fitted?.error || "LLTM fit failed.");
  }
  const result = fitted.result;
  if (result?.converged !== true) {
    return fail(400, result?.error?.message || "LLTM did not converge, so no difficulties were written.");
  }
  if (result.parameterStatus && result.parameterStatus !== "predicted") {
    return fail(400, "The LLTM service did not flag its estimates as predicted.");
  }

  const effects = mergeEffects(design.columns, result.effects);
  if (!effects) {
    return fail(400, "The LLTM result is missing an effect for a design column.");
  }
  const fitForPrediction = {
    effects,
    intercept: result.intercept || null,
    vcov: result.vcov || null,
  };

  const sourceModel = typeof result.sourceModel === "string" ? result.sourceModel : "";
  if (!sourceModel.trim()) return fail(400, "The LLTM result has no source model.");
  const packageVersion = typeof result.packageVersion === "string" ? result.packageVersion.trim() : "";
  if (!packageVersion) return fail(400, "The LLTM result has no packageVersion.");
  const normalization = typeof result.normalization === "string" ? result.normalization : "";
  const sampleSize = finiteNumber(result.sampleSize) || responseMatrix.personIds.length;

  const predictions = [];
  const unpredicted = [];
  const specScores = scoreLltmRows(
    specs.map((spec) => ({ id: spec.id, assignment: spec.tmvAssignment })),
    design
  );
  for (const spec of specs) {
    const scored = specScores.find((row) => row.id === spec.id);
    if (!scored?.ok) {
      unpredicted.push({ specId: spec.id, reason: scored?.reason || "This spec is outside the fitted design." });
      continue;
    }
    const predicted = predictedDifficulty(scored.x, fitForPrediction);
    if (!predicted) {
      unpredicted.push({ specId: spec.id, reason: "The fitted effects do not match the design." });
      continue;
    }
    predictions.push({ spec, b: predicted.b, bSe: predicted.bSe });
  }
  if (!predictions.length) {
    return fail(400, "None of the task specs could be scored from the fitted covariates.");
  }

  const artefactId = options.analysisArtefactId || genId("aalltm");
  const slimEffects = effects.map((effect) => ({
    name: effect.name,
    role: effect.role,
    taskModelVariableId: effect.taskModelVariableId,
    level: effect.level,
    reference: effect.reference,
    label: effect.label,
    estimate: effect.estimate,
    se: effect.se,
  }));

  const artefact = {
    id: artefactId,
    kind: "lltm",
    jobId,
    scope: {
      evidenceModelId: evidenceModel.id,
      taskModelId: template.taskModelId || null,
      templateId,
    },
    packageVersion,
    sampleSize,
    computedAt: now,
    createdAt: now,
    payload: {
      parameterStatus: "predicted",
      sourceModel,
      normalization,
      seMethod: result.seMethod || null,
      logLik: finiteNumber(result.logLik),
      effects: slimEffects,
      intercept: result.intercept || null,
      vcov: result.vcov || null,
      design: {
        columnNames: design.columns.map((column) => column.name),
        columns: design.columns,
        rows: design.rows,
        held: design.held,
        omitted: design.omitted,
      },
      responseMatrix,
      predictions: predictions.map((row) => ({
        specId: row.spec.id,
        b: row.b,
        bSe: row.bSe,
      })),
      unpredicted,
      converged: true,
    },
  };

  const job = {
    id: jobId,
    kind: "lltm",
    status: "succeeded",
    evidenceModelId: evidenceModel.id,
    statisticalModelId: statisticalModel.id,
    templateId,
    requestedBy: options.requestedBy || "lltm",
    requestedAt: now,
    startedAt: now,
    finishedAt: now,
    request: {
      contractVersion: "1.0",
      jobId,
      model: {
        family: "lltm",
        itemIds: responseMatrix.itemIds,
        covariateNames: design.columns.map((column) => column.name),
      },
      options: { seed: LLTM_SEED },
      sampleSize,
    },
    response: {
      contractVersion: "1.0",
      jobId,
      converged: true,
      packageVersion,
      sampleSize,
      calibratedAt: now,
      sourceModel,
      parameterStatus: "predicted",
      effects: slimEffects,
      note: "Predicted difficulties are not a parameter set and were not activated.",
    },
    error: null,
    attempts: 1,
    maxAttempts: 1,
    ingestedParameterSetId: null,
    ingestedAnalysisArtefactId: artefactId,
    createdAt: now,
    updatedAt: now,
  };

  const jobErrors = [
    ...validateEntity("calibrationJobs", job, db).errors,
    ...validateCalibrationJobLifecycle(job, db),
  ];
  if (jobErrors.length) return fail(400, jobErrors[0], { details: jobErrors });
  const artefactCheck = validateEntity("analysisArtefacts", artefact, {
    ...db,
    calibrationJobs: [...(db.calibrationJobs || []), job],
  });
  if (!artefactCheck.valid) {
    return fail(400, artefactCheck.errors[0] || "Analysis artefact validation failed.", {
      details: artefactCheck.errors,
    });
  }

  const nextSpecs = new Map();
  for (const row of predictions) {
    const predictedParameters = {
      parameterStatus: "predicted",
      origin: "predicted",
      sourceModel,
      packageVersion,
      normalization,
      model: "Rasch",
      a: 1,
      b: row.b,
      bSe: row.bSe,
      analysisArtefactId: artefactId,
      jobId,
      fittedAt: now,
      effects: slimEffects,
    };
    const next = {
      ...row.spec,
      predictedParameters,
      updatedAt: now,
    };
    const specCheck = validateEntity("taskSpecs", next, db);
    if (!specCheck.valid) {
      return fail(400, specCheck.errors[0] || "Task spec validation failed.", {
        details: specCheck.errors,
      });
    }
    nextSpecs.set(row.spec.id, next);
  }

  if (evidenceSnapshot(db) !== beforeEvidence) {
    return fail(500, "LLTM seed must not change evidence models.");
  }

  db.taskSpecs = (db.taskSpecs || []).map((spec) => nextSpecs.get(spec.id) || spec);
  await insertCalibrationJob(db, job);
  placeAnalysisArtefact(db, artefact);
  await persistAnalysisArtefact(db, artefact);

  if (evidenceSnapshot(db) !== beforeEvidence) {
    return fail(500, "LLTM seed must not change evidence models.");
  }

  return {
    ok: true,
    jobId,
    analysisArtefactId: artefactId,
    sourceModel,
    normalization,
    effects: slimEffects,
    predicted: predictions.map((row) => ({
      specId: row.spec.id,
      b: row.b,
      bSe: row.bSe,
    })),
    unpredicted,
  };
}
