// server/compositeLibrary/builder.js
//
// Day 24 (Week 5): compiles a `compositeLibrary` record from a Task Model,
// its Items and their bound Evidence Models -- the versioned package ADR
// 0003 (docs/adr/0003-composite-library-denormalisation-boundary.md)
// describes as built "at Task Model activation".
//
// Pure computation over data already in `db`, following the same shape as
// src/components/evidences/calibration/engines/classicalCalibration.js:
// plain function exports, no reads/writes, no persistence. The caller (a
// future route, migration or test) owns assigning an `id`, deciding
// `active`, and actually writing the record through dbAdapter -- this
// module only computes what the record SHOULD contain.
//
// What gets baked into each items[] entry, per ADR 0003: presentation
// material (item.stimulus), interaction params (item.interaction), the
// evidence-activation mapping (the item's own scoring.evidenceActivationMap
// PLUS the bound Evidence Model observable's evidenceRule), the TR9
// evaluationProcedure for that observation (Work Product → Observable
// Variable), and the weight of evidence (from the Task Model's own
// expectedObservations[], not the Evidence Model side -- weight is
// authored per Task Model, per the referential-integrity chain CLAUDE.md
// documents).
//
// What is deliberately NEVER baked in, per ADR 0003: calibrated
// statisticalModels[].parameterSets[] (resolved live, by pointer, at
// delivery time so recalibration takes effect immediately), usage
// counters, or any session-specific state. There is no field anywhere
// below that copies a parameter value -- if a future change adds one,
// it is reintroducing exactly the bug ADR 0003 exists to prevent.

import { isInstantiableTaskModel, INSTANTIABLE_TASK_MODEL_STATUSES } from "../../src/utils/schema.js";

/**
 * Resolve the Evidence Model evaluation procedure for one observation.
 * When several procedures share an observableId (multi-extraction), bake
 * the first; Identification still receives the full baked object.
 */
function resolveEvaluationProcedure(evidenceModel, observationId) {
  if (!evidenceModel || !observationId) return null;
  const matches = (evidenceModel.evaluationProcedures || []).filter(
    (p) => p && p.observableId === observationId
  );
  if (matches.length === 0) return null;
  const proc = matches[0];
  // Bake a plain structural copy — including optional scoring artifact —
  // so Identification never re-walks live EM records (ADR 0003a).
  return {
    id: proc.id ?? null,
    observableId: proc.observableId,
    workProductType: proc.workProductType ?? null,
    workProductId: proc.workProductId ?? null,
    method: proc.method ?? null,
    description: proc.description ?? null,
    artifactRef: proc.artifactRef ?? null,
    artifact: proc.artifact ?? null,
  };
}

/**
 * Compile a compositeLibrary record for one Task Model.
 *
 * Degrades gracefully rather than throwing for data-quality problems (an
 * unresolvable evidenceModelId, an item with no expectedObservations entry,
 * a Task Model that isn't yet instantiable): each such case is collected as
 * a warning and the record is still produced, since `validateEntity`
 * ("compositeLibrary", ...) is the actual authority on whether the result
 * is fit to store -- this function's job is to compute the best record it
 * can from what `db` actually contains. It only throws for programmer
 * errors (missing arguments), not data problems.
 *
 * @param {object} taskModel - a full taskModels record
 * @param {object} db - the full db snapshot (needs .items, .evidenceModels)
 * @returns {{ record: object, warnings: string[] }}
 */
export function buildCompositeLibrary(taskModel, db) {
  if (!taskModel || !taskModel.id) {
    throw new Error("buildCompositeLibrary requires a Task Model with an id.");
  }
  if (!db) {
    throw new Error("buildCompositeLibrary requires a db snapshot to walk items and evidence models.");
  }

  const warnings = [];

  if (!isInstantiableTaskModel(taskModel)) {
    warnings.push(
      `Task model '${taskModel.id}' is not locked and ${INSTANTIABLE_TASK_MODEL_STATUSES.join("/")} (found status='${taskModel.status}', locked=${!!taskModel.locked}); compiling an empty package.`
    );
  }

  // A package only means anything for a Task Model that could itself be
  // activated -- "compiled at Task Model activation" presupposes the Task
  // Model has already cleared that gate. A draft/reviewed Task Model
  // compiles to an empty package regardless of what its items look like,
  // rather than surfacing items whose parent blueprint isn't live yet.
  const usableItems = isInstantiableTaskModel(taskModel)
    ? (db.items || []).filter(
        (item) =>
          item.taskModelId === taskModel.id &&
          item.taskModelVersion === taskModel.versionNumber &&
          INSTANTIABLE_TASK_MODEL_STATUSES.includes(item.status)
      )
    : [];

  if (isInstantiableTaskModel(taskModel) && usableItems.length === 0) {
    warnings.push(
      `No confirmed/operational/suspended items found for task model '${taskModel.id}' version ${taskModel.versionNumber}.`
    );
  }

  const expectedObservationsById = new Map(
    (taskModel.expectedObservations || []).map((eo) => [eo.observationId, eo])
  );

  const items = usableItems.map((item) => {
    const expected = expectedObservationsById.get(item.observationId);

    if (!expected) {
      warnings.push(
        `Item '${item.id}' targets observationId '${item.observationId}', which is not declared in task model '${taskModel.id}''s expectedObservations.`
      );
    }

    const evidenceModel = (db.evidenceModels || []).find((em) => em.id === item.evidenceModelId);

    if (!evidenceModel) {
      warnings.push(`Item '${item.id}' references unknown evidenceModelId '${item.evidenceModelId}'.`);
    }

    const observable = evidenceModel?.observables?.find((o) => o.id === item.observationId);

    if (evidenceModel && !observable) {
      warnings.push(
        `Item '${item.id}''s evidence model '${item.evidenceModelId}' has no observable '${item.observationId}'.`
      );
    }

    // The dual-location fallback schema.js's own validator uses: an
    // observable's evidenceRule may be embedded, or looked up from the
    // evidence model's top-level evidenceRules[] keyed by observableId.
    const evidenceRuleByObservableId = new Map(
      (evidenceModel?.evidenceRules || []).map((r) => [r.observableId, r])
    );
    const evidenceRule = observable
      ? observable.evidenceRule || evidenceRuleByObservableId.get(observable.id) || null
      : null;

    const evaluationProcedure = resolveEvaluationProcedure(
      evidenceModel,
      item.observationId
    );

    if (
      evidenceModel &&
      Array.isArray(evidenceModel.evaluationProcedures) &&
      evidenceModel.evaluationProcedures.length > 0 &&
      !evaluationProcedure
    ) {
      warnings.push(
        `Item '${item.id}''s evidence model '${item.evidenceModelId}' has no evaluationProcedure for observable '${item.observationId}'.`
      );
    }

    return {
      itemId: item.id,
      observationId: item.observationId,
      evidenceModelId: item.evidenceModelId,
      evidenceModelVersion: item.evidenceModelVersion,
      presentationMaterial: item.stimulus || null,
      interactionParams: item.interaction || null,
      scoring: {
        method: item.scoring?.method ?? null,
        maxScore: item.scoring?.maxScore ?? null,
        evidenceActivationMap: item.scoring?.evidenceActivationMap || [],
      },
      evidenceRule,
      evaluationProcedure,
      weight: expected?.weight ?? null,
      required: expected?.required ?? null,
    };
  });

  const record = {
    taskModelId: taskModel.id,
    taskModelVersion: taskModel.versionNumber,
    compiledAt: new Date().toISOString(),
    active: false,
    items,
  };

  return { record, warnings };
}

/**
 * Day 25: is a compiled compositeLibrary record stale, per ADR 0003's
 * invalidation rule? A revision to the Task Model itself, or to any
 * Evidence Model an item in this package was compiled against, invalidates
 * the package -- structural facts baked in at compile time (§ ADR 0003)
 * may no longer be current. Recalibration is deliberately NOT a staleness
 * signal: calibrated parameters are resolved live by pointer (never baked
 * in), so a new parameter set or a flipped `activeParameterSetId` on an
 * unrelated `versionNumber` never makes a compiled package stale -- that
 * is the entire point of the boundary the ADR draws.
 *
 * @param {object} libraryRecord - a compiled compositeLibrary record (the
 *   output of buildCompositeLibrary, plus whatever `id` the caller assigned)
 * @param {{ taskModel: object, evidenceModels?: object[] }} current - the
 *   CURRENT state of the Task Model and any Evidence Models to check
 *   against (only the ones referenced by libraryRecord.items are consulted)
 * @returns {{ stale: boolean, reasons: string[] }}
 */
export function isCompositeLibraryStale(libraryRecord, { taskModel, evidenceModels = [] } = {}) {
  if (!libraryRecord || !taskModel) {
    throw new Error("isCompositeLibraryStale requires both a libraryRecord and the current taskModel.");
  }

  const reasons = [];

  if (libraryRecord.taskModelVersion !== taskModel.versionNumber) {
    reasons.push(
      `Task model '${taskModel.id}' is now at version ${taskModel.versionNumber}; this package was compiled against version ${libraryRecord.taskModelVersion}.`
    );
  }

  const evidenceModelsById = new Map(evidenceModels.map((em) => [em.id, em]));
  const checkedEvidenceModelIds = new Set();

  for (const entry of libraryRecord.items || []) {
    const currentEm = evidenceModelsById.get(entry.evidenceModelId);

    if (!checkedEvidenceModelIds.has(entry.evidenceModelId)) {
      checkedEvidenceModelIds.add(entry.evidenceModelId);

      if (
        currentEm &&
        typeof currentEm.versionNumber === "number" &&
        typeof entry.evidenceModelVersion === "number" &&
        currentEm.versionNumber !== entry.evidenceModelVersion
      ) {
        reasons.push(
          `Evidence model '${entry.evidenceModelId}' is now at version ${currentEm.versionNumber}; this package's items were compiled against version ${entry.evidenceModelVersion}.`
        );
      }
    }

    // Evaluation procedures are baked structural facts (TR9 §2.3.2). A
    // same-version edit to the procedure for this observation still
    // invalidates the package so Identification cannot use a stale key/rubric.
    if (currentEm) {
      const currentProc = resolveEvaluationProcedure(currentEm, entry.observationId);
      const baked = entry.evaluationProcedure ?? null;
      if (JSON.stringify(currentProc) !== JSON.stringify(baked)) {
        reasons.push(
          `Evidence model '${entry.evidenceModelId}' evaluationProcedure for '${entry.observationId}' changed since this package was compiled.`
        );
      }
    }
  }

  return { stale: reasons.length > 0, reasons };
}
