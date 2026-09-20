// server/utils/lifecycleValidation.js

// Updated lifecycle validation aligned with latest ECD Task Model architecture
import { canTransition, canTransitionCalibrationJob, CALIBRATION_JOB_STATUS } from "../utils/lifecycleMatrix.js";
import { isLinkableCompetencyModel } from "../../src/utils/schema.js";
import {
  CALIBRATION_JOB_KIND_VALUES,
  statisticalModelTypesForJobKind,
} from "../../src/utils/ecdVocabulary.js";
import {
  liveSessionsForTaskModel,
  liveSessionsBlockMessage,
} from "./sessionDependencies.js";

export const STATUS_ORDER = [
  "draft",
  "reviewed",
  "confirmed",
  "operational",
  "suspended",
  "archived",
];

// -------------------------------------
// Helper: compare lifecycle progression
// -------------------------------------
export function isPromotion(prevStatus, nextStatus) {
  const prev = prevStatus || "draft";
  const next = nextStatus || prev;

  if (!canTransition(prev, next)) {
    return false;
  }

  return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(prev);
}

// -------------------------------------
// TASK MODEL lifecycle validation
// -------------------------------------
// `db` is required for the activation rule below, which has to look at the
// item bank. It is optional so the structural rules stay callable without
// one (the client-side readiness checks do exactly that); when it is
// omitted the item rule is skipped, so every SERVER call site must pass it.
export function validateTaskModelLifecycle(taskModel, db = null, options = {}) {
  const errors = [];
  const status = taskModel.status || "draft";

  /* --------------------------------------------------
     REVIEWED
     Structural completeness required
  -------------------------------------------------- */
  if (["reviewed", "confirmed", "operational", "suspended"].includes(status)) {

    if (!taskModel.name || !taskModel.description) {
      errors.push("Reviewed tasks must define name and description.");
    }

    /* The primary-competency gate was removed here.

       A Task Model has never had a competency field in the schema; the
       wizard wrote one into `taskPurpose.primaryCompetencyId` and this
       check was the only thing that enforced it. That made the competency
       a second, unvalidated declaration of the construct, free to
       contradict the one that actually governs the inference:
       evidenceModel.competencyId on the bound Evidence Model.

       A Task Model now binds Evidence Models and derives its construct
       from them. `primaryEvidenceModelId` takes the place of the primary
       claim -- and because it is a pointer INTO evidenceModelIds, it
       cannot disagree with the binding. */

    if (!Array.isArray(taskModel.evidenceModelIds) || taskModel.evidenceModelIds.length === 0) {
      errors.push("Reviewed tasks must link at least one Evidence Model.");
    } else if (!taskModel.primaryEvidenceModelId) {
      errors.push("Reviewed tasks must nominate a primary Evidence Model.");
    } else if (!taskModel.evidenceModelIds.includes(taskModel.primaryEvidenceModelId)) {
      errors.push("primaryEvidenceModelId must be one of the linked Evidence Models.");
    }

    if (!Array.isArray(taskModel.expectedObservations) || taskModel.expectedObservations.length === 0) {
      errors.push("Reviewed tasks must define at least one expected observation.");
    }
  }

  /* --------------------------------------------------
     CONFIRMED
     Structural integrity of what is about to be locked.

     taskCompositionType now HAS an authoring path (Step4TaskStructure),
     as does subTaskIds (SubTaskSelector, previously an orphan file the
     wizard never mounted), so both can be enforced here.

     itemMappings deliberately stays unenforced. Items are normally
     authored AFTER the Task Model they instantiate, so requiring
     coverage at confirmation would make the ordinary authoring order
     impossible. Step6ItemMapping surfaces coverage gaps as guidance and
     the client-side readiness checklist agrees -- keep the two in step.
  -------------------------------------------------- */
  if (["confirmed", "operational", "suspended"].includes(status)) {

    if (!taskModel.taskCompositionType) {
      errors.push("Confirmed tasks must declare a composition type.");
    }

    if (
      taskModel.taskCompositionType === "composite" &&
      (!Array.isArray(taskModel.subTaskIds) || taskModel.subTaskIds.length === 0)
    ) {
      errors.push("Composite tasks must declare at least one sub-task.");
    }

    if (!Array.isArray(taskModel.actions) || taskModel.actions.length === 0) {
      errors.push("Confirmed tasks must declare at least one student action.");
    }
  }

  /* --------------------------------------------------
     DEACTIVATION — no live sessions may depend on it

     Taking a Task Model out of delivery while a student is mid-session
     against it breaks that session: the next task it asks for is gone.

     This is the one gate on `suspended` and `archived`, and it is only
     safe to have because Force Deactivate exists
     (POST /api/taskModels/:id/force-deactivate). Without an escape hatch
     this would trap a Task Model in service exactly when someone most
     needs it out — which is why every OTHER activation rule deliberately
     leaves suspension ungated. Do not add a second gate here without a
     forced path through it.

     A PAUSED session counts as live: pausing is a break, not an ending,
     and /resume puts it straight back into delivery.
  -------------------------------------------------- */
  if (["suspended", "archived"].includes(status) && db && !options.force) {

    const live = liveSessionsForTaskModel(taskModel.id, db);

    if (live.length) {
      errors.push(
        liveSessionsBlockMessage(
          status === "archived" ? "Archiving this Task Model" : "Deactivating this Task Model",
          live
        )
      );
    }
  }

  /* --------------------------------------------------
     ACTIVATION — the evidence must be live first

     Activating a TaskModel puts it into service, and everything it
     produces is scored against its bound Evidence Models. Those models
     are only live once they are OPERATIONAL: a merely `confirmed`
     evidence model is structurally frozen but has not been activated, and
     a `suspended` one has been deliberately taken out of service, usually
     because its calibration is in question. Delivering a task whose
     scoring model is not live means collecting responses no one can score.

     So the chain has to be activated bottom-up:
       Evidence Model → operational
       TaskModel      → confirmed, then items authored and confirmed
       TaskModel      → operational

     ALL bound models must be operational, not just the primary. A task
     that also targets observables on a secondary model is not deliverable
     while that model is paused -- the observables it declares would go
     nowhere.

     Nothing here blocks a TaskModel from being CONFIRMED against a merely
     confirmed evidence model; that is the normal authoring order, and it
     is what isLinkableEvidenceModel already permits.
  -------------------------------------------------- */
  if (status === "operational" && db) {

    const notLive = [];

    for (const emId of taskModel.evidenceModelIds || []) {
      const em = db.evidenceModels?.find(e => e.id === emId);

      if (!em) {
        notLive.push(`${emId} (not found)`);
      } else if (em.status !== "operational") {
        notLive.push(`${em.name || emId} (${em.status})`);
      }
    }

    if (notLive.length) {
      errors.push(
        `TaskModel cannot be activated: every bound Evidence Model must be operational first. Not live: ${notLive.join(", ")}.`
      );
    }
  }

  /* --------------------------------------------------
     ACTIVATION — items must exist

     A TaskModel is a blueprint. Activating one means "this blueprint is
     live for delivery", and delivery happens through Items. A TaskModel
     with no Item instantiating it is live in name only: a session that
     selected it would have nothing to present.

     Version-matched deliberately. A cloned v2 starts with zero items --
     every existing item still declares taskModelVersion 1, and the item
     validator rejects a mismatch. Activating v2 on the strength of v1's
     items would put a blueprint into service that nothing can deliver, so
     the migrated items have to exist first.

     Confirmed-or-beyond deliberately. A draft or reviewed item is not
     locked and may never become real, so it cannot be what justifies
     activation. Requiring the items to be OPERATIONAL was considered and
     rejected: it would dictate an ordering the product has not asked for.
     Items can be activated before or after their TaskModel — item
     activation does not depend on the TaskModel's status.

     This applies ONLY to `operational`, never to `suspended`. Suspension
     and archival are the safety valves; if the item bank were later
     emptied, extending this rule to `suspended` would block the very
     transition used to take a broken TaskModel out of service.
  -------------------------------------------------- */
  if (status === "operational" && db) {

    const instantiating = (db.items || []).filter(
      (item) =>
        item.taskModelId === taskModel.id &&
        item.taskModelVersion === taskModel.versionNumber
    );

    const usable = instantiating.filter((item) =>
      ["confirmed", "operational", "suspended"].includes(item.status)
    );

    if (instantiating.length === 0) {
      errors.push(
        `TaskModel cannot be activated: no Item instantiates version ${taskModel.versionNumber} of it. Author and confirm at least one Item against this TaskModel first.`
      );
    } else if (usable.length === 0) {
      const states = [...new Set(instantiating.map((i) => i.status || "draft"))].join(", ");
      errors.push(
        `TaskModel cannot be activated: ${instantiating.length} Item(s) reference version ${taskModel.versionNumber}, but none is confirmed (found: ${states}). Confirm at least one.`
      );
    }
  }

  /* --------------------------------------------------
     OPERATIONAL
     Deployment readiness checks
  -------------------------------------------------- */
  if (["operational", "suspended"].includes(status)) {

    /* `accessibilityAssumptions` is an object the wizard always sends,
       so a bare truthiness test passed on `{}` -- an empty object is
       truthy. Require at least one populated field, which is what the
       client-side operationalReadiness() check reports. */
    const accessibility = taskModel.accessibilityAssumptions || {};
    const hasAccessibility = Object.values(accessibility).some(
      (v) => String(v ?? "").trim().length > 0
    );

    if (!hasAccessibility) {
      errors.push("Operational tasks must define accessibility assumptions.");
    }

    if (!taskModel.equivalenceGroupId) {
      errors.push("Operational tasks must define equivalenceGroupId.");
    }
  }

  return errors;
}

// -------------------------------------
// ITEM lifecycle validation
// -------------------------------------
// The item-side counterpart of validateTaskModelLifecycle above, and it
// did not exist before: item promotion was gated by a bespoke
// `simulateItemEvidence()` inside itemsRoutes.js that checked a different,
// smaller and partly contradictory set of rules from the ones
// src/utils/schema.js enforced a few lines later in the same request. An
// item could pass the simulation gate and then fail the schema write with
// a completely different message.
//
// One validator, called from the lifecycle route, the confirm path and
// the tests. Structural completeness still lives in schema.js's strict
// mode (that is what `strict` is for); what lives HERE is everything that
// depends on the item's PLACE IN THE SYSTEM rather than its own shape --
// the state of the models it binds, and the sessions that depend on it.
//
// `db` is required for every rule below, so it is not optional in
// practice; it keeps the optional signature only so the client-side
// readiness checks (itemConstants.operationalReadiness) can share the
// shape. MIRROR: itemConstants.operationalReadiness() reports the
// `operational` block to the author before they attempt the transition.

import { isInstantiableTaskModel } from "../../src/utils/schema.js";
import { liveSessionsForItem } from "./sessionDependencies.js";

export function validateItemLifecycle(item, db = null, options = {}) {
  const errors = [];
  const status = item.status || "draft";

  if (!db) return errors;

  const taskModel = (db.taskModels || []).find((t) => t.id === item.taskModelId);
  const evidenceModel = (db.evidenceModels || []).find(
    (e) => e.id === item.evidenceModelId
  );

  /* --------------------------------------------------
     REVIEWED and beyond — the chain must still resolve

     Checked at every non-draft status rather than only on entry to
     `reviewed`, because the models underneath an item can change after
     it was reviewed: a Task Model can be cloned to a new version, an
     Evidence Model can be archived. An item whose chain has since broken
     must not be promotable further on the strength of a review that was
     valid weeks ago.
  -------------------------------------------------- */
  if (status !== "draft") {

    if (!taskModel) {
      errors.push("The Task Model this item instantiates no longer exists.");
    } else {

      if (!isInstantiableTaskModel(taskModel)) {
        errors.push(
          `The bound Task Model is '${taskModel.status}'${
            taskModel.locked ? "" : " and unlocked"
          }; items may only instantiate confirmed, operational or suspended Task Models.`
        );
      }

      if (item.taskModelVersion !== taskModel.versionNumber) {
        errors.push(
          `This item is locked to version ${item.taskModelVersion} of its Task Model, which is now at version ${taskModel.versionNumber}. Clone the item onto the new version.`
        );
      }

      const declared = (taskModel.expectedObservations || []).find(
        (eo) => eo.observationId === item.observationId
      );

      if (!declared) {
        errors.push(
          `The Task Model no longer declares observation '${item.observationId}'.`
        );
      }
    }

    if (!evidenceModel) {
      errors.push("The Evidence Model behind this item's observation no longer exists.");
    }
  }

  /* --------------------------------------------------
     ACTIVATION — the evidence must be live first

     Same rule, and the same reasoning, as the Task Model's activation
     gate: everything this item produces is scored against its Evidence
     Model, and a model that is merely `confirmed` has been frozen but
     never activated, while a `suspended` one has been deliberately taken
     out of service (usually because its calibration is in doubt).
     Delivering an item whose scoring model is not live means collecting
     responses no one can score.

     Deliberately NOT gated on the Task Model's status. The two are
     activated independently and in either order — requiring an
     operational Task Model here while the Task Model's own activation
     rule requires a confirmed item there would be a deadlock neither
     side could break.
  -------------------------------------------------- */
  if (status === "operational") {

    if (evidenceModel && evidenceModel.status !== "operational") {
      errors.push(
        `Item cannot be activated: its Evidence Model '${
          evidenceModel.name || evidenceModel.id
        }' is ${evidenceModel.status}, not operational. Activate it first, or this item collects responses nothing can score.`
      );
    }

    if (!String(item.equivalenceGroupId || "").trim()) {
      errors.push(
        "Operational items must declare an equivalenceGroupId, so an equivalent replacement can be swapped in when this one is retired or over-exposed."
      );
    }

    if (!item.exposureControl?.maxUsageBeforeRetire) {
      errors.push(
        "Operational items must declare exposureControl.maxUsageBeforeRetire. Without a ceiling the item is delivered indefinitely and never retires."
      );
    }

    /* Reactivation ceiling. `reactivationCount` and `maxReactivations`
       have been in the schema since the beginning with nothing reading
       them, because the old lifecycle guard made suspended -> operational
       unreachable in the first place. Now that the transition exists,
       the ceiling it was written for is enforced. */
    const reactivations = item.exposureControl?.reactivationCount || 0;
    const maxReactivations = item.exposureControl?.maxReactivations || 0;

    if (maxReactivations > 0 && reactivations >= maxReactivations) {
      errors.push(
        `This item has been reactivated ${reactivations} time(s), reaching its ceiling of ${maxReactivations}. Clone it rather than returning it to service again.`
      );
    }
  }

  /* --------------------------------------------------
     DEACTIVATION — no live session may depend on it

     Mirrors the Task Model gate, and is safe for the same reason: an
     escape hatch exists ({ force: true }, admin only). A PAUSED session
     counts as live.
  -------------------------------------------------- */
  if (["suspended", "archived"].includes(status) && !options.force) {

    const live = liveSessionsForItem(item.id, db);

    if (live.length) {
      const names = live.slice(0, 3).map((s) => s.id).join(", ");
      errors.push(
        `${
          status === "archived" ? "Archiving this Item" : "Suspending this Item"
        } would break ${live.length} live session(s) (${names}${
          live.length > 3 ? ", …" : ""
        }). Wait for them to finish, or force the transition.`
      );
    }
  }

  return errors;
}

// -------------------------------------
// ASSEMBLY MODEL lifecycle validation — Day 21, Week 5
// -------------------------------------
// Unlike taskModels/items, this collection has no dedicated route yet
// (assemblyModels is still "declared and validated, not mounted, no UI" --
// see src/utils/schema.js). With no route layer to compute prevStatus vs
// nextStatus and gate on canTransition() itself, this function does that
// self-lookup directly (the same `db.<collection>?.find(m => m.id === obj.id)`
// idiom schema.js's own immutability checks already use), so the promotion
// validator is a complete, callable artifact on its own -- not half of one
// waiting on a route that doesn't exist yet.
export function validateAssemblyModelLifecycle(assemblyModel, db = null, options = {}) {
  const errors = [];
  const status = assemblyModel.status || "draft";

  if (db && assemblyModel.id) {
    const existing = db.assemblyModels?.find((m) => m.id === assemblyModel.id);
    if (existing && existing.status !== status && !canTransition(existing.status, status)) {
      errors.push(`Illegal assembly model status transition: '${existing.status}' -> '${status}'.`);
    }
  }

  /* REVIEWED — the parts of the shape a reviewer needs to see filled in. */
  if (["reviewed", "confirmed", "operational", "suspended"].includes(status)) {
    if (!assemblyModel.name) {
      errors.push("Assembly model must have a name before review.");
    }
    if (!assemblyModel.competencyModelId) {
      errors.push("Assembly model must reference a competencyModelId before review.");
    }
    if (!Array.isArray(assemblyModel.targetsBySMV) || assemblyModel.targetsBySMV.length === 0) {
      errors.push("Assembly model must declare at least one SMV accuracy target before review.");
    }
    if (!assemblyModel.selectionAlgorithm?.policyId) {
      errors.push("Assembly model must bind a selectionAlgorithm.policyId before review.");
    }
  }

  /* CONFIRMED — stopping rules are what make this usable by a session.
     Require at least one of maxItems / minItems / targetsMet — same rule
     schema.js enforces when the key is present. An empty `{}` must not
     clear confirmation. */
  if (["confirmed", "operational", "suspended"].includes(status)) {
    const sr = assemblyModel.stoppingRules;
    if (
      !sr ||
      typeof sr !== "object" ||
      (sr.maxItems === undefined &&
        sr.minItems === undefined &&
        sr.targetsMet === undefined)
    ) {
      errors.push(
        "Assembly model must declare stoppingRules (at least one of maxItems, minItems, or targetsMet) before confirmation."
      );
    }
  }

  /* ACTIVATION — the Student Model (competency model) must be a frozen
     parent at the authored version. That is isLinkableCompetencyModel
     (locked confirmed / operational / suspended), not "operational".
     Requiring operational copied the Task Model ← Evidence Model rule
     across the wrong ECD layer: the Student Model is the claim schema
     evidence accumulation writes into, not an object in the
     task/evidence composite library (Mislevy & Riconscente 2005, PADI
     TR9 §§2.3.1, 2.5). See claude/student-model-lifecycle.md. */
  if (status === "operational" && db) {
    const cm = db.competencyModels?.find((m) => m.id === assemblyModel.competencyModelId);

    if (!cm) {
      errors.push(`Assembly model cannot be activated: competency model '${assemblyModel.competencyModelId}' not found.`);
    } else {
      if (!isLinkableCompetencyModel(cm)) {
        errors.push(
          `Assembly model cannot be activated: bound competency model must be a locked, non-archived parent (confirmed, operational, or suspended); found '${cm.status}'${cm.locked ? "" : ", unlocked"}.`
        );
      }
      if (assemblyModel.competencyModelVersion !== cm.versionNumber) {
        errors.push(`Assembly model cannot be activated: competencyModelVersion (${assemblyModel.competencyModelVersion}) does not match the competency model's current version (${cm.versionNumber}).`);
      }
    }
  }

  return errors;
}

// -------------------------------------
// Q-MATRIX MODEL lifecycle validation — Day 21, Week 5
// -------------------------------------
// Same shape and same reasoning as validateAssemblyModelLifecycle above --
// qMatrixModels has no route yet either, so this is a self-contained
// promotion validator rather than half of a route-plus-validator pair.
export function validateQMatrixModelLifecycle(qMatrixModel, db = null, options = {}) {
  const errors = [];
  const status = qMatrixModel.status || "draft";

  if (db && qMatrixModel.id) {
    const existing = db.qMatrixModels?.find((m) => m.id === qMatrixModel.id);
    if (existing && existing.status !== status && !canTransition(existing.status, status)) {
      errors.push(`Illegal Q-matrix status transition: '${existing.status}' -> '${status}'.`);
    }
  }

  /* REVIEWED */
  if (["reviewed", "confirmed", "operational", "suspended"].includes(status)) {
    if (!qMatrixModel.name) {
      errors.push("Q-matrix must have a name before review.");
    }
    if (!qMatrixModel.competencyModelId) {
      errors.push("Q-matrix must reference a competencyModelId before review.");
    }
    if (!Array.isArray(qMatrixModel.attributeIds) || qMatrixModel.attributeIds.length === 0) {
      errors.push("Q-matrix must declare at least one attribute before review.");
    }
  }

  /* CONFIRMED — an empty Q-matrix (attributes declared, no items mapped to
     them yet) is not yet usable by a diagnostic model. */
  if (["confirmed", "operational", "suspended"].includes(status)) {
    if (!Array.isArray(qMatrixModel.entries) || qMatrixModel.entries.length === 0) {
      errors.push("Q-matrix must declare at least one item-attribute entry before confirmation.");
    }

    /* D52's ONE BLOCKING RULE, server side: "no all-zero row."
       -----------------------------------------------------------------
       The client (QMatrixValidity.js rule 1) blocks on an item sitting in
       the grid with nothing checked. That check runs over the editor's own
       `includedItems` -- ephemeral UI state with no counterpart at rest,
       because `entries[]` is SPARSE: an item requiring no attribute
       produces no rows, so from the stored record's point of view it is
       not absent-and-wrong, it is simply absent. A literal transcription
       of the client rule is therefore impossible here, and pretending
       otherwise would give the mirror something to agree with that the
       server cannot actually see.

       What the server CAN see is the same defect from the other side: an
       item that will really be scored against this Q-matrix and that the
       matrix does not place. That is the identical failure the delivery
       runtime already refuses to reason from -- attributeAccumulation.js
       excludes such a response with "declares no required attributes for
       item X; that response carries no diagnostic information."

       Why BLOCKING rather than advisory, in the framework's own terms: an
       item loading on no attribute is a datum with no warrant. Mislevy &
       Riconscente (2005) §1 defines the warrant as the reasoning that
       explains why data count as evidence for a claim; §2.3.2 makes the
       Measurement Model the thing that "characterizes the weight and
       direction of evidence that Observable Variables convey about
       Student Model Variables." An all-zero row conveys neither weight
       nor direction about any Student Model Variable. It is not a weak
       measurement, it is a broken link in the assessment argument -- so
       it belongs at the gate, not in an advisory panel.

       Scope. "Will really be scored against this Q-matrix" is derivable
       without guessing: items whose Evidence Model runs a dina/gdina
       Measurement Model bound to THIS matrix. Deliberately narrow in two
       ways:
         - Only deliverable items (confirmed/operational) count. A draft
           item may still be abandoned or re-pointed, and blocking a
           Q-matrix on one would gate a frozen structure behind work that
           may never land. validateTaskModelLifecycle's activation gate
           reasons about confirmed items for the same reason.
         - When no Evidence Model binds this matrix yet, the set is empty
           and the rule is vacuously satisfied. That is correct, not a
           hole: nothing scores against it, so no item can be missing
           from it. It also keeps the rule from making the editor
           unusable before D53 builds the panel that creates the binding
           in the first place. */
    if (db) {
      const boundEvidenceModelIds = (db.evidenceModels || [])
        .filter((em) =>
          (em.statisticalModels || []).some(
            (sm) =>
              (sm?.type === "dina" || sm?.type === "gdina") &&
              sm?.structureConfig?.qMatrixId === qMatrixModel.id
          )
        )
        .map((em) => em.id);

      if (boundEvidenceModelIds.length > 0) {
        const placedItemIds = new Set(
          (qMatrixModel.entries || []).map((e) => e?.itemId).filter(Boolean)
        );

        const unplaced = (db.items || [])
          .filter(
            (it) =>
              boundEvidenceModelIds.includes(it.evidenceModelId) &&
              ["confirmed", "operational"].includes(it.status) &&
              !placedItemIds.has(it.id)
          )
          .map((it) => it.id);

        if (unplaced.length > 0) {
          errors.push(
            `Q-matrix does not place ${unplaced.length} item(s) that a bound diagnostic model will score: ${unplaced.join(", ")}. Every item must require at least one attribute, or it contributes no diagnostic information. Add a row for each, or unbind the item from this model's Evidence Model.`
          );
        }
      }
    }
  }

  /* ACTIVATION */
  if (status === "operational" && db) {
    const cm = db.competencyModels?.find((m) => m.id === qMatrixModel.competencyModelId);

    if (!cm) {
      errors.push(`Q-matrix cannot be activated: competency model '${qMatrixModel.competencyModelId}' not found.`);
    } else {
      if (!isLinkableCompetencyModel(cm)) {
        errors.push(
          `Q-matrix cannot be activated: bound competency model must be a locked, non-archived parent (confirmed, operational, or suspended); found '${cm.status}'${cm.locked ? "" : ", unlocked"}.`
        );
      }
      if (qMatrixModel.competencyModelVersion !== cm.versionNumber) {
        errors.push(`Q-matrix cannot be activated: competencyModelVersion (${qMatrixModel.competencyModelVersion}) does not match the competency model's current version (${cm.versionNumber}).`);
      }
    }
  }

  return errors;
}

// -------------------------------------
// Calibration job lifecycle — D62, W13
// -------------------------------------
// Jobs use CALIBRATION_JOB_STATUS, not the authored-entity STATUS list.
// A job that silently stays `running` forever is the failure mode this
// validator exists to make illegal at the record level; restart recovery
// (server/r/calibrationWorker.js) is the other half.
export function validateCalibrationJobLifecycle(job, db = null) {
  const errors = [];
  const status = job?.status;

  if (!status) {
    errors.push("Calibration job status is required.");
  } else if (!CALIBRATION_JOB_STATUS.includes(status)) {
    errors.push(`Invalid calibration job status '${status}'.`);
  }

  if (db && job?.id) {
    const existing = db.calibrationJobs?.find((j) => j.id === job.id);
    if (existing && existing.status !== status && !canTransitionCalibrationJob(existing.status, status)) {
      errors.push(`Illegal calibration job status transition: '${existing.status}' -> '${status}'.`);
    }
  }

  if (!job?.kind || !CALIBRATION_JOB_KIND_VALUES.includes(job.kind)) {
    errors.push("Calibration job kind is required and must be a declared CALIBRATION_JOB_KIND.");
  }

  if (!job?.evidenceModelId) {
    errors.push("Calibration job must reference an evidenceModelId.");
  }
  if (!job?.statisticalModelId) {
    errors.push("Calibration job must reference a statisticalModelId.");
  }

  if (db && job?.evidenceModelId) {
    const em = db.evidenceModels?.find((m) => m.id === job.evidenceModelId);
    if (!em) {
      errors.push(`Calibration job references unknown evidenceModelId '${job.evidenceModelId}'.`);
    } else if (job.statisticalModelId) {
      const sm = (em.statisticalModels || []).find((m) => m.id === job.statisticalModelId);
      if (!sm) {
        errors.push(`Calibration job references unknown statisticalModelId '${job.statisticalModelId}' on evidence model '${job.evidenceModelId}'.`);
      } else {
        const allowed = statisticalModelTypesForJobKind(job.kind);
        if (allowed.length > 0 && sm.type && !allowed.includes(sm.type)) {
          errors.push(`Job kind '${job.kind}' does not apply to statistical model type '${sm.type}'.`);
        }
      }
    }
  }

  if (!job?.request || typeof job.request !== "object" || Array.isArray(job.request)) {
    errors.push("Calibration job must store the request envelope sent to R.");
  }

  if (status === "running" && !job?.startedAt) {
    errors.push("A running calibration job must record startedAt.");
  }

  if (status === "succeeded") {
    if (!job?.response || typeof job.response !== "object" || Array.isArray(job.response)) {
      errors.push("A succeeded calibration job must store the R response envelope.");
    }
    if (!job?.finishedAt) {
      errors.push("A succeeded calibration job must record finishedAt.");
    }
  }

  if (status === "failed") {
    if (!job?.error || typeof job.error !== "object" || Array.isArray(job.error)) {
      errors.push("A failed calibration job must store an inspectable error (message, stderr, rClass).");
    } else if (!job.error.message) {
      errors.push("A failed calibration job error must include a message.");
    }
    if (!job?.finishedAt) {
      errors.push("A failed calibration job must record finishedAt.");
    }
  }

  if (typeof job?.attempts !== "number" || job.attempts < 1) {
    errors.push("Calibration job attempts must be a positive number.");
  }
  if (typeof job?.maxAttempts !== "number" || job.maxAttempts < 1) {
    errors.push("Calibration job maxAttempts must be a positive number.");
  }

  return errors;
}
