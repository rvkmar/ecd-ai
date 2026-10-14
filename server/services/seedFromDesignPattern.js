// D137. One confirmed design pattern seeds a draft Evidence Model and a
// draft Task Model. The designer picks menu rows. Declined rows stay on
// the shared back-link. Existing confirm rules are the substance gate.

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

/**
 * Writes two drafts and records the same seededFrom on both.
 * allowDraftParents is used only so the new Task Model may cite the new
 * draft Evidence Model. Characteristic-feature labels are not written into
 * blueprintConstraints. Rubric ids are not turned into evaluation procedures.
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

  const competencyId = body.competencyId;
  if (!competencyId || typeof competencyId !== "string") {
    return { ok: false, status: 400, error: "competencyId is required." };
  }

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
  };

  const evidence = createEvidenceModelRecord(
    {
      name: `${pattern.name} evidence`,
      competencyId,
      observables,
      evaluationProcedures: [],
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
      blueprintConstraints: {},
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
  };
}
