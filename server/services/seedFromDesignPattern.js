// D137. One confirmed design pattern seeds a draft Evidence Model and a
// draft Task Model. The designer picks menu rows. Declined rows stay on
// the shared back-link. Existing confirm rules are the substance gate.
// A focal KSA that cites a competency or a student model variable
// pre-fills that link. The request body still wins when it sends one.

import { resolveSeedStudentModel } from "../../src/utils/ksaStudentModelLink.js";

const SEED_MENU_KEYS = [
  "potentialObservations",
  "potentialWorkProducts",
  "potentialRubrics",
  "characteristicFeatures",
  "variableFeatures",
];

function copyRow(row) {
  return row && typeof row === "object" ? { ...row } : row;
}

function partitionMenus(pattern = {}, selections = {}) {
  const accepted = {};
  const declined = {};

  for (const key of SEED_MENU_KEYS) {
    const rows = Array.isArray(pattern[key]) ? pattern[key] : [];
    const picked = selections[key];
    if (picked != null && !Array.isArray(picked)) {
      return { ok: false, error: `${key} selections must be an array of row indexes.` };
    }
    const chosen = new Set();
    for (const index of picked || []) {
      if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
        return { ok: false, error: `${key} selection ${index} is not a menu row.` };
      }
      if (chosen.has(index)) {
        return { ok: false, error: `${key} selection ${index} is repeated.` };
      }
      chosen.add(index);
    }
    accepted[key] = [];
    declined[key] = [];
    rows.forEach((row, index) => {
      const copy = copyRow(row);
      if (chosen.has(index)) accepted[key].push(copy);
      else declined[key].push(copy);
    });
  }

  return { ok: true, accepted, declined };
}

function freshObservableId(index) {
  return `ob${Date.now()}${String(index).padStart(3, "0")}`;
}

function featureLabel(row) {
  return String(row?.label || "").trim();
}

/**
 * Accepted characteristic features are labels. blueprintConstraints has no
 * other field for that text, so the label is the constraint. A row with no
 * label cannot be copied.
 */
function characteristicFeatureConstraints(rows, warnings) {
  const features = [];
  rows.forEach((row, index) => {
    const label = featureLabel(row);
    if (!label) {
      warnings.push(
        `Characteristic feature ${index + 1} has no label, so it was not copied into blueprint constraints.`
      );
      return;
    }
    features.push({ label });
  });
  return features.length ? { characteristicFeatures: features } : {};
}

function freshProcedureId(index) {
  return `ep${Date.now()}${String(index).padStart(3, "0")}`;
}

/**
 * A potential rubric becomes an evaluation procedure only when its rubricId
 * still names a rubric and an accepted observation can cite it. Each
 * resolved rubric is attached to every accepted observation. The pattern
 * does not say which observation a rubric scores.
 */
function evaluationProceduresFromRubrics(rows, observables, db, warnings) {
  const procedures = [];
  const rubrics = db?.rubrics || [];
  let sequence = 0;

  rows.forEach((row, index) => {
    const label = featureLabel(row);
    const name = label || `Potential rubric ${index + 1}`;
    const rubricId = row && typeof row === "object" ? String(row.rubricId || "").trim() : "";
    if (!rubricId) {
      warnings.push(
        `Potential rubric "${name}" has a label but no rubric id, so it was not turned into an evaluation procedure.`
      );
      return;
    }
    const rubric = rubrics.find((item) => item && item.id === rubricId);
    if (!rubric) {
      warnings.push(
        `Potential rubric "${name}" cites rubric "${rubricId}", which no longer exists, so it was not turned into an evaluation procedure.`
      );
      return;
    }
    if (!observables.length) {
      warnings.push(
        `Potential rubric "${name}" cites rubric "${rubricId}", but no observation was selected, so it was not turned into an evaluation procedure.`
      );
      return;
    }
    const description = label || `Scored with rubric ${rubric.name || rubricId}.`;
    for (const observable of observables) {
      procedures.push({
        id: freshProcedureId(sequence),
        observableId: observable.id,
        method: "rubric",
        rubricId,
        description,
      });
      sequence += 1;
    }
  });

  return procedures;
}

/**
 * Writes two drafts and records the same seededFrom on both.
 * allowDraftParents is used only so the new Task Model may cite the new
 * draft Evidence Model. Accepted characteristic features are copied onto
 * blueprintConstraints.characteristicFeatures. Accepted rubric ids that
 * still exist become evaluation procedures. A row that cannot be copied
 * is skipped and named in warnings. Both records stay drafts.
 */
export function seedFromDesignPattern({
  pattern,
  body = {},
  db,
  createEvidenceModelRecord,
  createTaskModelRecord,
}) {
  if (!pattern || pattern.status !== "confirmed") {
    return {
      ok: false,
      status: 400,
      error: "Only a confirmed design pattern can seed models. A draft authorises nothing.",
    };
  }

  const studentModel = resolveSeedStudentModel(pattern, body, db);
  if (!studentModel.ok) return studentModel;
  const { competencyId, competencyModelId, smvId } = studentModel;

  const split = partitionMenus(pattern, body.selections || {});
  if (!split.ok) return { ok: false, status: 400, error: split.error };

  const observables = split.accepted.potentialObservations.map((row, index) => {
    const id = freshObservableId(index);
    row.seededObservableId = id;
    return { id, statement: String(row.label || "").trim() };
  });

  const taskModelVariableIds = [];
  for (const row of split.accepted.variableFeatures) {
    const id = row.taskModelVariableId && String(row.taskModelVariableId).trim();
    if (!id) {
      return {
        ok: false,
        status: 400,
        error: `Chosen variable feature "${row.label || ""}" has no taskModelVariableId.`,
      };
    }
    taskModelVariableIds.push(id);
  }

  const seededFrom = {
    designPatternId: pattern.id,
    accepted: split.accepted,
    declined: split.declined,
    studentModel: {
      competencyId,
      ...(competencyModelId ? { competencyModelId } : {}),
      ...(smvId ? { smvId } : {}),
    },
  };

  const warnings = [];
  const evaluationProcedures = evaluationProceduresFromRubrics(
    split.accepted.potentialRubrics,
    observables,
    db,
    warnings
  );
  const blueprintConstraints = characteristicFeatureConstraints(
    split.accepted.characteristicFeatures,
    warnings
  );

  const evidence = createEvidenceModelRecord(
    {
      name: `${pattern.name} evidence`,
      competencyId,
      ...(competencyModelId ? { competencyModelId } : {}),
      observables,
      evaluationProcedures,
      seededFrom,
    },
    db
  );
  if (!evidence.ok) return evidence;

  const evidenceModelId = evidence.record.id;
  const task = createTaskModelRecord(
    {
      name: `${pattern.name} task`,
      evidenceModelIds: [evidenceModelId],
      primaryEvidenceModelId: evidenceModelId,
      expectedObservations: observables.map((observable) => ({
        observationId: observable.id,
        evidenceModelId,
        required: false,
        weight: 0,
      })),
      taskModelVariableIds,
      blueprintConstraints,
      seededFrom: JSON.parse(JSON.stringify(seededFrom)),
    },
    db,
    "",
    { allowDraftParents: true }
  );

  if (!task.ok) {
    db.evidenceModels = (db.evidenceModels || []).filter((row) => row.id !== evidenceModelId);
    return task;
  }

  return {
    ok: true,
    status: 201,
    evidenceModel: evidence.record,
    taskModel: task.record,
    warnings,
  };
}

function rowLabel(row) {
  return String(row?.label || "").trim();
}

/**
 * D138. Compare a model to the snapshot stored at seed time.
 * Focal KSAs and the pattern's current menus are not inputs.
 * Designer-added observables are not divergence. Declined rows are not missing.
 */
function evidenceModelDivergence(model = {}) {
  const accepted = model.seededFrom?.accepted?.potentialObservations || [];
  const observables = Array.isArray(model.observables) ? model.observables : [];
  const flags = [];

  for (const row of accepted) {
    const label = rowLabel(row);
    const found = observables.find((observable) => observable && observable.id === row.seededObservableId);
    if (!found) {
      flags.push({
        menu: "potentialObservations",
        label,
        reason: "removed",
        detail: `Accepted observation "${label}" is no longer on the model.`,
      });
      continue;
    }
    const statement = String(found.statement || "").trim();
    if (statement !== label) {
      flags.push({
        menu: "potentialObservations",
        label,
        reason: "edited",
        detail: `Accepted observation "${label}" now reads "${statement}".`,
      });
    }
  }

  return flags;
}

function taskModelDivergence(model = {}) {
  const accepted = model.seededFrom?.accepted?.variableFeatures || [];
  const cited = new Set(model.taskModelVariableIds || []);
  const flags = [];

  for (const row of accepted) {
    const id = row.taskModelVariableId && String(row.taskModelVariableId).trim();
    if (!id || cited.has(id)) continue;
    const label = rowLabel(row);
    flags.push({
      menu: "variableFeatures",
      label,
      reason: "removed",
      detail: `Accepted variable feature "${label}" is no longer cited.`,
    });
  }

  return flags;
}

export function patternDescendants(patternId, db = {}) {
  const matches = (rows, kind, diverge) =>
    (rows || [])
      .filter((row) => row?.seededFrom?.designPatternId === patternId)
      .map((row) => ({
        kind,
        id: row.id,
        name: row.name || row.id,
        status: row.status || null,
        divergences: diverge(row),
      }));

  return {
    designPatternId: patternId,
    advisory: true,
    descendants: [
      ...matches(db.evidenceModels, "evidenceModel", evidenceModelDivergence),
      ...matches(db.taskModels, "taskModel", taskModelDivergence),
    ],
  };
}
