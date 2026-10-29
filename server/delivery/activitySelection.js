// server/delivery/activitySelection.js
//
// D56 (Week 12): Activity Selection -- Step 23 of the ECD delivery cycle,
// and the last box in Fig. 12's loop to be built. Evidence Identification
// (Day 28), Evidence Accumulation (Day 34) and the Assembly Model targets
// (Day 17 / D54) all existed; the arrow from Accumulation BACK to Activity
// Selection did not. This module is that arrow.
//
// WHY THIS FILE EXISTS AT ALL. Until D56 the three selection strategies
// lived inline in sessionRoutes.js's GET /:id/next-task handler, and read
// `db.questions` -- the LEGACY question bank -- directly. That predates
// items, the composite library, Evidence Models and posteriors entirely.
// sessionRoutes.js's own Day 28 comment says so in as many words:
// "/next-task's item-based selection is a separate, larger Activity
// Selection undertaking, not attempted here." D40's handoff carried the
// same gap forward: "the existing selection policies still read
// db.questions directly and are unaffected by Weeks 7-8 -- they have not
// been re-pointed at the composite library or at current SMV beliefs."
//
// WHAT "READS THE LIBRARY" MEANS HERE. A candidate's structural facts come
// from the ACTIVE compositeLibrary package for its Task Model (compiled at
// Task Model activation, per ADR 0003), not from re-walking
// taskModel -> items -> evidenceModels at request time. Item PARAMETERS are
// deliberately NOT in the package -- ADR 0003 excludes them precisely so
// recalibration takes effect on the next *new* session. D68 freezes an
// in-flight session to the source and parameterSetId it opened with, so a
// mid-session ingest cannot mix pilot with calibrated (or ps1 with ps2)
// and kill the posterior. See resolveContinuousParameters /
// resolveDinaParameters and the agreement test.
//
// WHAT "READS THE LIVE POSTERIOR" MEANS HERE. `session.studentModel
// .smvPosteriors`, written by applyPosteriorsToSession() on every submit.
// A Bayesian network posterior also writes `bnPosteriors[smvId]` as the
// probability of the last state. The full distribution is
// `smvPosteriors[smvId].distribution`. `irtTheta` is still only written
// by the legacy R-backend branch.
//
// ------------------------------------------------------------------
// THE LEGACY QUESTION PATH IS QUARANTINED, NOT DELETED.
// ------------------------------------------------------------------
// D56's unit text says "retire the direct db.questions reads." Taken
// literally that would strand every existing question-based session with no
// migration: IRT selection over `db.questions` is the ONLY selection those
// sessions have. D47 set the precedent for exactly this situation -- "the
// legacy path is unchanged and still passes its own tests" -- and
// sessionRoutes.js's ITEM_DELIVERY_ENABLED flag is the same idea. So: the
// item path never touches `db.questions`, the legacy branch below is the
// single remaining reader, it is clearly marked, and it is reached only by
// a task that names a `questionId` and no `itemId`. When the legacy path is
// finally retired, deleting `selectLegacyQuestionCandidate` is the whole job.
//
// G20 leaves that reader in place on the roster path. The player, /submit,
// and stored question tasks still depend on it. The package pool below
// never calls it, because a package entry is an item. Removing the reader
// would need those question tasks migrated onto items, and the player and
// the submit branch retargeted. Until then a question-only session with no
// delivery model still selects as it does today.
//
// ------------------------------------------------------------------
// G20. Adaptive candidates for a cited delivery model.
// ------------------------------------------------------------------
// An active composite library package belongs to the session's assembly
// model when the package's task model has an evidence model whose
// competency resolves to assemblyModel.competencyModelId. A candidate is
// an unanswered task that instantiates an item in such a package. A
// suspended or archived item is not a candidate. An item with no task
// record is not a candidate: delivery still presents a task.
//
// session.taskIds is the seed. It is not an allow-list, and it is not
// ignored. Fixed order still walks the seed and does not pull a task from
// outside it. IRT and BayesianNetwork, on a session that cites a delivery
// model, rank this package pool. Pool order is the seed first, then every
// other pool task by task id. A tie keeps the earlier task. A seed task
// that is not in the pool is not ranked, and a warning says so.
//
// If no active package belongs to the assembly model, adaptive selection
// stays on the seed and a warning says so. A session with no delivery
// model keeps the roster path exactly, including the legacy question reader.
//
// G19 constraints, exposure, and enemies filter this same pool. Exposure
// is still the count of that item id in this session's responses. Selection
// does not read or write item.exposureControl.usageCount. Submit still
// increments that counter when an operational item is delivered.
//
// Submit appends a delivered task id that was not in the seed. Reports
// also union response task ids, so a stored response whose task was never
// appended still appears. Resume does not recompute the roster; the next
// call to selection reads the pool again.
//
// ------------------------------------------------------------------
// F24 -- FOUND WHILE BUILDING THIS UNIT. The BayesianNetwork strategy has
// never once run its own algorithm.
// ------------------------------------------------------------------
// The pre-D56 branch gated every Evidence Model on
// `em.measurementModel?.type !== "BayesianNetwork"`. `measurementModel`
// appears NOWHERE in src/utils/schema.js, in samples/, or in any seed data,
// and nothing in the codebase writes it -- Evidence Models carry
// `statisticalModels[]`, and have since the schema was written. So the
// guard's `continue` fired for every model, every time; `gain` stayed 0 for
// every candidate; and because `bestGain` started at `-Infinity`, `0 >
// -Infinity` handed the win to the FIRST unanswered task. The strategy was
// "pick the first unanswered task" wearing an information-gain costume.
// `session.studentModel.bnPosteriors`, the prior it would have read, is
// likewise written by nothing in production -- its only assignment anywhere
// is a test fixture -- so even with the field renamed every prior would
// have been the `?? 0.5` default.
//
// A latent second defect in the same dead branch, recorded so it is not
// reintroduced: it weighted the two outcomes of a hypothetical response by a
// hardcoded 0.5 each (`0.5 * entropy(post1) + 0.5 * entropy(post0)`) rather
// than by their actual marginal probabilities. That is not expected entropy;
// it systematically misprices any item whose success probability is far from
// a half. computeExpectedInformationGain below weights by P(u=1) and P(u=0).
//
// WHAT THIS UNIT DID ABOUT IT. Re-pointed the strategy at the diagnostic
// machinery that actually exists and actually produces live beliefs:
// attributeAccumulation.js's per-attribute mastery posteriors (DINA/G-DINA,
// keyed by Q-matrix attribute, landing in `smvPosteriors`). Where a session
// carries no diagnostic data at all, the strategy DEGRADES to pool order
// (the session seed, then task id) and says so in `debug.fallback` and a
// warning, rather than presenting an accidental default as a computed
// choice. On a roster session that order is the old first unanswered task.
// G-DINA with a calibrated probability table is ranked by expected
// posterior entropy over the reduced attribute pattern (R7). Without
// a calibrated set, R8 derives a conjunctive table from the item's
// dinaParams slip/guess (the DINA identity [g, …, 1−s]) and ranks
// that the same way. Missing slip/guess, a missing Q-vector, or a
// missing posterior still uses this fallback.
//
// F24 (off calendar). Evidence Accumulation now writes bnPosteriors and
// the distribution on smvPosteriors for a bayesian_network statistical
// model. This strategy ranks that family by expected information gain.
// The belief is the live distribution when its states match, else a
// carried-forward prior, else the model prior, so the first item can be
// ranked. DINA still requires a live posterior and does not invent 0.5.
// jointPrior is not read. G-DINA ranks from a calibrated table and
// live attribute posteriors; it has no pilot path (R8). When nothing
// can be ranked, the fallback is still pool order plus a warning.
//
// ------------------------------------------------------------------
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
// ------------------------------------------------------------------
// * It does not decide a mastery CLASSIFICATION itself. Day 57 built that
//   rule in attributeClassification.js and assemblyProgress.js applies it,
//   so a requiredClassificationAccuracy target now arrives here as a real
//   boolean. The `targetsMet` filter then requires EVERY declared
//   targetsBySMV entry to have such a row and to be `true` -- an SMV that
//   never accumulated a posterior is not "vacuously met". What still
//   arrives as `null` is a target nobody could evaluate: a classification
//   target against a posterior that is not a mastery probability, or a SEM
//   target on an incomparable scale. null is still not true, and still
//   never stops a session.
// * A session with no deliveryModelId keeps its own selectionStrategy.
//   The Assembly Model pointer is a warning when the two disagree, and
//   it does not change the strategy. A session that cites a delivery
//   model uses the assembly model that delivery model names. When that
//   assembly model declares a usable selection policy, that policy
//   drives selection. The stored session strategy and the delivery
//   model's own policyId do not. Session create rejects an explicit
//   strategy or policy id that disagrees. If the assembly model does
//   not declare a usable policy, selection falls back to the delivery
//   model's policy, which is the G15 rule.
// * It does not persist anything. Pure computation over a db snapshot plus
//   the session, matching compositeLibrary/builder.js and every other
//   module in server/delivery/.
// * IRT item selection uses maximum Fisher information at the live theta
//   (3PL-aware, same formula as irtEngine.js / r-backend analytic I(theta)).
//   The legacy question path still ranks by closest difficulty because those
//   records often carry only b. R is not on this path (ADR 0001).

import {
  accumulateEvidence,
  itemParametersAreUsable,
  CONTINUOUS_MODEL_FAMILIES,
  calibratedIrtParams,
} from "./evidenceAccumulation.js";
import {
  evaluateDeclaredTargets,
  resolveAssemblyProgress,
  GOVERNING_ASSEMBLY_MODEL_STATUSES,
} from "./assemblyProgress.js";
import {
  conjunctiveGdinaTable,
  dinaParametersAreUsable,
  gdinaParametersAreUsable,
  computeGdinaExpectedInformationGain,
} from "./attributeAccumulation.js";
import { attributeIdsForDeliveryItem } from "../../src/utils/qMatrixEntries.js";
import { assemblyConstraintsActive } from "../../src/utils/assemblyConstraints.js";
import { activePackageFor } from "../compositeLibrary/activePackage.js";
import {
  planConstraintSelection,
  selectFixedConstrained,
  targetsMetHeldForConstraints,
  constraintHoldWarning,
  maxItemsMinimumWarning,
} from "./assemblyConstraints.js";
import {
  frozenScoringContext,
} from "./parameterSourceResolution.js";
import {
  BAYESIAN_NETWORK_FAMILY,
  beliefForBayesianSelection,
  expectedInformationGain,
  loadBayesianNetworkForSelection,
} from "./bayesianNetwork.js";

/* Moved here from sessionRoutes.js, where it existed solely to serve the
   selection branch this module replaces. Binary Shannon entropy in bits. */
function entropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/* An Assembly Model only governs a live session once it has actually been
   signed off. A draft/reviewed one is authoring in progress and must not
   start ending students' sessions; archived/suspended is out of service.
   The status list lives in assemblyProgress.js so the reporting lookup
   and this ending-time lookup cannot drift (D60: a draft sibling used
   to make resolveAssemblyProgress omit every SMV, which silently
   disabled targetsMet on the operational model). */

/**
 * Resolve a candidate item's CONTINUOUS (IRT/Rasch) parameters the way the
 * scoring path resolves them: an active calibrated parameter set wins for
 * a NEW session, and the item's own pilot `psychometrics.irtParams` is the
 * fallback. D68: an in-flight session frozen to pilot stays on pilot even
 * after ingest; one frozen to a parameterSetId keeps that set, not the
 * newly active one.
 *
 * Deliberately a SECOND implementation rather than extracting submit's
 * pin-onto-response helper. The agreement test in activitySelection.test.js
 * pins SOURCE choice (including freeze) against chooseSubmitParameterBinding.
 *
 * Calibrated continuous parameters are keyed by OBSERVABLE id (D50/D68:
 * distinct difficulties are distinct observables). DINA parameters are
 * keyed by ITEM id. That asymmetry is why these are two functions.
 */
function resolveContinuousParameters(observationId, evidenceModel, item, freeze = {}) {
  if (freeze.error) {
    return { reason: freeze.error };
  }

  const statisticalModel = evidenceModel?.statisticalModels?.find((sm) => sm.active);
  if (!statisticalModel) {
    return { reason: `Evidence model '${evidenceModel?.id}' has no active statistical model.` };
  }

  const family = statisticalModel.type;
  const liveCalibratedId = statisticalModel.activeParameterSetId || null;
  const frozen = freeze.frozenSource || null;
  const usePilot = frozen === "pilot" || (frozen == null && !liveCalibratedId);
  const useCalibrated =
    frozen === "calibrated" || (frozen == null && Boolean(liveCalibratedId));

  if (useCalibrated) {
    const calibratedId = freeze.frozenParameterSetId || liveCalibratedId;
    const parameterSet = (statisticalModel.parameterSets || []).find(
      (ps) => ps.parameterSetId === calibratedId
    );
    const { params } = calibratedIrtParams(parameterSet, {
      observableId: observationId,
      itemId: item?.id,
    });

    if (!params) {
      return {
        reason: `Parameter set '${calibratedId}' has no parameters for observable '${observationId}'; this candidate could be presented but not scored.`,
      };
    }
    if (!itemParametersAreUsable(params) || !Number.isFinite(params.b)) {
      return {
        reason: `Parameter set '${calibratedId}' has unusable IRT parameters for observable '${observationId}'.`,
      };
    }
    return { params, parameterSource: "calibrated", parameterSetId: calibratedId };
  }

  if (!CONTINUOUS_MODEL_FAMILIES.includes(family)) {
    return {
      reason: `Evidence model '${evidenceModel.id}' has no active calibrated parameter set, and pilot IRT parameters do not apply to the '${family}' family.`,
    };
  }

  /* Pilot values live on the ITEM record, not in the package: ADR 0003
     deliberately bakes no parameter of any kind into a compiled package, so
     this is the one lookup selection cannot answer from the library alone. */
  const pilot = item?.psychometrics?.irtParams;
  if (!itemParametersAreUsable(pilot) || !Number.isFinite(pilot?.b)) {
    return {
      reason: `Item '${item?.id}' carries no usable pilot IRT parameters (psychometrics.irtParams needs at least a > 0 and a finite b).`,
    };
  }
  return { params: pilot, parameterSource: "pilot", parameterSetId: null };
}

/**
 * DINA slip/guess for a candidate item: calibrated parameter set first
 * (keyed by ITEM id), then the item's pilot `psychometrics.dinaParams`
 * (D53b). G-DINA uses the calibrated saturated probability table when
 * one exists (R7). It deliberately gets no pilot fallback here, exactly
 * as it gets none in sessionRoutes.js's submit path -- no item-level
 * pilot probability-table field exists, and inventing one to make a
 * selection decision would be worse than declining to rank that
 * candidate (R8).
 */
function resolveDinaParameters(itemId, item, statisticalModel, family, freeze = {}, requiredCount = null) {
  if (freeze.error) {
    return { reason: freeze.error };
  }

  const liveCalibratedId = statisticalModel?.activeParameterSetId || null;
  const frozen = freeze.frozenSource || null;
  const usePilot = frozen === "pilot" || (frozen == null && !liveCalibratedId);
  const useCalibrated =
    frozen === "calibrated" || (frozen == null && Boolean(liveCalibratedId));

  if (useCalibrated) {
    const calibratedId = freeze.frozenParameterSetId || liveCalibratedId;
    const parameterSet = (statisticalModel.parameterSets || []).find(
      (ps) => ps.parameterSetId === calibratedId
    );
    const params = parameterSet?.parameters?.[itemId];

    if (params && family === "dina" && dinaParametersAreUsable(params)) {
      return { params, parameterSource: "calibrated" };
    }
    if (
      params
      && family === "gdina"
      && Number.isInteger(requiredCount)
      && gdinaParametersAreUsable(params, requiredCount)
    ) {
      return { params, parameterSource: "calibrated" };
    }
    return {
      reason: `Parameter set '${calibratedId}' has no usable '${family}' parameters for item '${itemId}'.`,
    };
  }

  if (family === "gdina") {
    const table = conjunctiveGdinaTable(item?.psychometrics?.dinaParams, requiredCount);
    if (!table) {
      return {
        reason: `Item '${itemId}' carries no usable G-DINA pilot (psychometrics.dinaParams needs slip and guess each in [0,1), with guess < 1 - slip, and the item must require at least one Q-matrix attribute).`,
      };
    }
    return { params: table, parameterSource: "pilot" };
  }

  if (family !== "dina") {
    return {
      reason: `Evidence model has no active calibrated parameter set, and pilot parameters are not supported for the '${family}' family.`,
    };
  }

  const pilot = item?.psychometrics?.dinaParams;
  if (!dinaParametersAreUsable(pilot)) {
    return {
      reason: `Item '${itemId}' carries no usable pilot DINA parameters (psychometrics.dinaParams needs slip and guess each in [0,1), with guess < 1 - slip).`,
    };
  }
  return { params: pilot, parameterSource: "pilot" };
}

/**
 * Expected reduction in Shannon entropy about ONE binary attribute from
 * administering an item that requires it, under DINA.
 *
 *   P(u = 1 | attribute mastered)     = 1 - slip
 *   P(u = 1 | attribute not mastered) = guess
 *
 * treating the other required attributes as held at their current beliefs --
 * the standard marginal approximation, and the same one the pre-D56 branch
 * was reaching for with its CPT lookup.
 *
 * Both outcomes are weighted by their ACTUAL marginal probability. The dead
 * branch this replaces used a hardcoded 0.5 for each (see F24 in the header).
 *
 * @returns {number} expected information gain in bits, >= 0
 */
function computeExpectedInformationGain(prior, slip, guess) {
  const pGivenMastered = 1 - slip;
  const pGivenNot = guess;

  const pCorrect = prior * pGivenMastered + (1 - prior) * pGivenNot;
  const pIncorrect = 1 - pCorrect;

  // A degenerate item (every outcome certain) carries no information and
  // must not produce a division by zero.
  if (pCorrect <= 0 || pCorrect >= 1) return 0;

  const posteriorIfCorrect = (prior * pGivenMastered) / pCorrect;
  const posteriorIfIncorrect = (prior * (1 - pGivenMastered)) / pIncorrect;

  const expectedPosteriorEntropy =
    pCorrect * entropy(posteriorIfCorrect) + pIncorrect * entropy(posteriorIfIncorrect);

  const gain = entropy(prior) - expectedPosteriorEntropy;

  // Expected entropy can only fall, never rise; a tiny negative here is
  // floating-point noise, not evidence of an information-destroying item.
  return gain > 0 ? gain : 0;
}

/**
 * Every competency model this session's content chain touches. Used to
 * resolve the session's Assembly Model without inventing a session-level
 * `assemblyModelId` field -- see resolveAssemblyModelForSession.
 */
function competencyModelIdsForSession(session, db) {
  const ids = new Set();

  for (const taskId of session.taskIds || []) {
    const task = (db.tasks || []).find((t) => t.id === taskId);
    if (!task) continue;

    const taskModel = (db.taskModels || []).find((tm) => tm.id === task.taskModelId);
    if (!taskModel) continue;

    for (const emId of taskModel.evidenceModelIds || []) {
      const evidenceModel = (db.evidenceModels || []).find((em) => em.id === emId);
      if (!evidenceModel) continue;

      const competency = (db.competencies || []).find((c) => c.id === evidenceModel.competencyId);
      if (competency?.modelId) ids.add(competency.modelId);
    }
  }

  return ids;
}

/**
 * Delivery model binding, or null when this session does not cite one.
 * A cited id is never resolved by inference. A missing record or a missing
 * assembly model is a reason, not a fallthrough to the competency-model scan.
 */
function resolveDeliveryBinding(session, db) {
  const id = session?.deliveryModelId;
  if (typeof id !== "string" || id === "") return null;

  const deliveryModel = (db.deliveryModels || []).find((row) => row && row.id === id);
  if (!deliveryModel) {
    return {
      code: "DELIVERY_MODEL_MISSING",
      reason: `Session cites delivery model '${id}', which is not in the store, so no Assembly Model is inferred.`,
    };
  }

  const assemblyModel = (db.assemblyModels || []).find(
    (am) => am && am.id === deliveryModel.assemblyModelId
  );
  if (!assemblyModel) {
    return {
      code: "ASSEMBLY_UNBOUND",
      deliveryModel,
      reason: `Delivery Model '${deliveryModel.id}' names assembly model '${deliveryModel.assemblyModelId || ""}', which is not in the store, so no other Assembly Model is inferred.`,
    };
  }

  return { assemblyModel, deliveryModel, authoritative: true };
}

/**
 * The Assembly Model governing this session, or null with a reason.
 *
 * When the session cites deliveryModelId, that delivery model's assembly
 * model is the one that governs. Status is not re-filtered: the delivery
 * model already named it.
 *
 * Otherwise the session has no assemblyModelId field. This resolves the
 * same way assemblyProgress already does: by competency model, refusing
 * outright when zero or more than one governing candidate matches, rather
 * than picking arbitrarily. A session that stops early because the wrong
 * Assembly Model was guessed at is the quiet failure this project's
 * conventions exist to prevent.
 */
export function resolveAssemblyModelForSession(session, db) {
  const bound = resolveDeliveryBinding(session, db);
  if (bound) return bound;

  const competencyModelIds = competencyModelIdsForSession(session, db);

  if (competencyModelIds.size === 0) {
    return {
      code: "NO_COMPETENCY_MODEL",
      reason: "This session's tasks resolve to no competency model, so no Assembly Model applies.",
    };
  }

  const matching = (db.assemblyModels || []).filter((am) =>
    competencyModelIds.has(am.competencyModelId)
  );

  if (matching.length === 0) {
    return {
      code: "NONE_DECLARED",
      reason: "No Assembly Model is declared for this session's competency model(s).",
    };
  }

  const governing = matching.filter((am) =>
    GOVERNING_ASSEMBLY_MODEL_STATUSES.includes(am.status)
  );

  if (governing.length === 0) {
    // Said out loud rather than silently treated as "none declared": an
    // author looking at their own Assembly Model and wondering why nothing
    // stops deserves the actual reason.
    return {
      code: "NONE_GOVERNING",
      reason: `${matching.length} Assembly Model(s) match this session's competency model, but none is ${GOVERNING_ASSEMBLY_MODEL_STATUSES.join(" or ")} (found: ${matching.map((m) => m.status || "unknown").join(", ")}); stopping rules are not applied.`,
    };
  }

  if (governing.length > 1) {
    return {
      code: "AMBIGUOUS",
      reason: `${governing.length} Assembly Models govern this session's competency model(s); which one applies to THIS session is not stated anywhere, so none is applied.`,
    };
  }

  return { assemblyModel: governing[0] };
}

/**
 * Has this session met a stopping rule?
 *
 * Semantics, which are not symmetrical and are worth stating:
 *   maxItems   -- a ceiling. Stop once this many responses are recorded.
 *   minItems   -- a floor. Never stops anything on its own; it only gates
 *                 targetsMet.
 *   targetsMet -- stop once EVERY DECLARED target (assemblyModel
 *                 .targetsBySMV) has an evaluable progress row and that
 *                 row is met, and only at or above minItems. A declared
 *                 SMV that never accumulated a posterior is unmet, not
 *                 "absent so ignore it".
 *
 * `stoppingCriterionMet` is tri-state in assemblyProgress.js: true, false,
 * or null for a target nobody can evaluate (a SEM target on a scale it
 * cannot be compared against, or -- since D57 -- a classification target
 * against a posterior that is not a mastery probability). Only `true`
 * counts. An empty progress list, or a declared target missing from
 * progress, also never stops a session -- "no targets could be evaluated"
 * is not "all targets met".
 */
function evaluateStoppingRules(session, assemblyModel, db, options = {}) {
  const stoppingRules = assemblyModel.stoppingRules || {};
  const delivered = (session.responses || []).length;
  const warnings = [];
  const candidateIds = Array.isArray(options.candidateIds) ? options.candidateIds : null;

  if (Number.isFinite(stoppingRules.maxItems) && delivered >= stoppingRules.maxItems) {
    const plan = planConstraintSelection(session, assemblyModel, db, "adaptive", candidateIds);
    if (plan.unmetMinimums) warnings.push(maxItemsMinimumWarning(assemblyModel.id));
    return {
      stop: {
        rule: "maxItems",
        assemblyModelId: assemblyModel.id,
        reason: `Stopping rule maxItems (${stoppingRules.maxItems}) reached: ${delivered} response(s) recorded.`,
      },
      warnings,
    };
  }

  if (stoppingRules.targetsMet !== true) return { warnings };

  const minItems = Number.isFinite(stoppingRules.minItems) ? stoppingRules.minItems : 0;
  if (delivered < minItems) return { warnings };

  /* Recomputed from session.responses rather than read from
     session.studentModel.smvPosteriors, because resolveAssemblyProgress()
     needs `competencyModelId` and `supported` -- fields
     applyPosteriorsToSession() does not persist. Re-running accumulation is
     the same thing /submit does on every response, and evidenceAccumulation
     .js's own header argues it is cheaper to be obviously correct here than
     to maintain a second, incrementally-updated copy of the same numbers.
     Only reached when a targetsMet rule is actually declared.

     Wrapped for the same reason sessionRoutes.js wraps its own accumulation
     call: a defect in a bookkeeping computation must never take a student's
     session down with it. An unevaluable target means "do not stop", which
     is the safe direction -- the student answers another item. */
  let progress = [];
  try {
    const accumulation = accumulateEvidence(session, db);
    /* Pass the already-resolved governing model so a draft/archived
       sibling for the same Competency Model cannot make progress empty
       (D60 P0). resolveAssemblyProgress also prefers a unique governing
       AM on its own, but this caller must not depend on that second
       lookup agreeing. */
    progress = resolveAssemblyProgress(accumulation.posteriors, db, { assemblyModel });
  } catch (err) {
    warnings.push(
      `Stopping rule 'targetsMet' could not be evaluated (evidence accumulation failed: ${err.message}); the session continues.`
    );
    return { warnings };
  }

  /* Declaration of record is the governing AM's targetsBySMV, not the
     progress rows that happened to be reportable. resolveAssemblyProgress
     omits an SMV with no supported posterior, which used to make
     "unmet.length === 0" true for a one-attribute slice of a two-attribute
     diagnostic. Prefer continuing (safe direction) until every declared
     target is scored and met. */
  const declared = evaluateDeclaredTargets(assemblyModel, progress);

  if (!declared.allScoredAndMet) return { warnings };

  const plan = planConstraintSelection(session, assemblyModel, db, "adaptive", candidateIds);
  if (targetsMetHeldForConstraints(plan)) {
    warnings.push(constraintHoldWarning(assemblyModel.id));
    return { warnings };
  }
  if (plan.unmetMinimums) {
    warnings.push(
      `Stopping rule targetsMet is met, but Assembly Model '${assemblyModel.id}' minimums were not, and no remaining task can fill them.`
    );
  }

  return {
    stop: {
      rule: "targetsMet",
      assemblyModelId: assemblyModel.id,
      reason: `Every declared Assembly Model target is scored and met (${declared.metCount} of ${declared.declaredCount}) at ${delivered} response(s).`,
      /* Day 57: a diagnostic target reports what it actually met. Before
         this, every stopped-session record named `requiredSEM` alone, so
         a session stopped on a classification target reported
         `requiredSEM: undefined` and said nothing about the mastery
         decision that ended it. Both shapes are emitted only when
         present, so a SEM stop is byte-identical to what it was.
         Ordered by the AM's declared targetsBySMV, not by whichever
         posteriors happened to arrive first. */
      targets: declared.rows.map((row) => {
        const p = row.progress;
        const target = {
          smvId: p.smvId,
          estimate: p.estimate,
          precision: p.precision,
        };
        if (p.requiredSEM !== undefined) target.requiredSEM = p.requiredSEM;
        if (p.requiredClassificationAccuracy !== undefined) {
          target.requiredClassificationAccuracy = p.requiredClassificationAccuracy;
          target.classification = p.classification;
          target.expectedClassificationAccuracy = p.expectedClassificationAccuracy;
          target.masteryThreshold = p.masteryThreshold;
        }
        return target;
      }),
    },
    warnings,
  };
}

/**
 * The tasks this session has not yet answered, in the order they were
 * assigned, each resolved as far as the data allows.
 */
function candidatesFor(session, db) {
  const answered = new Set((session.responses || []).map((r) => r.taskId));

  return (session.taskIds || [])
    .filter((taskId) => !answered.has(taskId))
    .map((taskId) => {
      const task = (db.tasks || []).find((t) => t.id === taskId);
      return { taskId, task };
    })
    .filter((c) => !!c.task);
}

function competencyModelIdForEvidenceModel(evidenceModel, db) {
  if (!evidenceModel) return null;
  const competency = (db.competencies || []).find((row) => row && row.id === evidenceModel.competencyId);
  return competency?.modelId || evidenceModel.competencyModelId || null;
}

function taskModelBelongsToCompetencyModel(taskModel, competencyModelId, db) {
  if (!taskModel || !competencyModelId) return false;
  for (const evidenceModelId of taskModel.evidenceModelIds || []) {
    const evidenceModel = (db.evidenceModels || []).find((row) => row && row.id === evidenceModelId);
    if (competencyModelIdForEvidenceModel(evidenceModel, db) === competencyModelId) return true;
  }
  return false;
}

/**
 * Adaptive candidate ids for a delivery-model session.
 *
 * source "packages": ids are unanswered tasks in active packages that
 * belong to the assembly model's competency model. Order is the session
 * seed first, then remaining task ids.
 * source "roster": no such package exists, so the caller keeps the seed.
 */
function buildAssemblyPackagePool(session, db, assemblyModel) {
  const warnings = [];
  const seed = Array.isArray(session?.taskIds) ? session.taskIds : [];
  const competencyModelId = assemblyModel?.competencyModelId;

  if (!competencyModelId) {
    warnings.push(
      `Assembly Model '${assemblyModel?.id || ""}' has no competencyModelId, so adaptive selection stays on the session seed.`
    );
    return { source: "roster", ids: [...seed], warnings };
  }

  const packages = [];
  for (const pkg of db.compositeLibrary || []) {
    if (!pkg || pkg.active !== true) continue;
    const taskModel = (db.taskModels || []).find((row) => row && row.id === pkg.taskModelId);
    if (!taskModelBelongsToCompetencyModel(taskModel, competencyModelId, db)) continue;
    packages.push(pkg);
  }

  if (packages.length === 0) {
    warnings.push(
      `No active composite library package belongs to Assembly Model '${assemblyModel.id}' (competency model '${competencyModelId}'). Adaptive selection stays on the session seed.`
    );
    return { source: "roster", ids: [...seed], warnings };
  }

  const answered = new Set((session?.responses || []).map((response) => response?.taskId).filter(Boolean));
  const byId = new Map();
  for (const pkg of packages) {
    const itemIds = new Set((pkg.items || []).map((entry) => entry?.itemId).filter(Boolean));
    for (const task of db.tasks || []) {
      if (!task?.id || !task.itemId || task.taskModelId !== pkg.taskModelId) continue;
      if (!itemIds.has(task.itemId) || answered.has(task.id) || byId.has(task.id)) continue;
      const item = (db.items || []).find((row) => row && row.id === task.itemId);
      if (!item || item.status === "suspended" || item.status === "archived") continue;
      byId.set(task.id, task);
    }
  }

  const ids = [];
  const seen = new Set();
  for (const taskId of seed) {
    if (byId.has(taskId) && !seen.has(taskId)) {
      ids.push(taskId);
      seen.add(taskId);
    }
  }
  const rest = [...byId.keys()].filter((taskId) => !seen.has(taskId)).sort((a, b) => a.localeCompare(b));
  ids.push(...rest);

  const outside = seed.filter((taskId) => !answered.has(taskId) && !byId.has(taskId));
  if (outside.length > 0) {
    warnings.push(
      `Session seed task(s) ${outside.join(", ")} are outside the active packages for Assembly Model '${assemblyModel.id}', so adaptive selection will not use them.`
    );
  }

  return { source: "packages", ids, warnings };
}

/**
 * A task may be submitted when it is in the seed, or when this session's
 * delivery model would rank it from the package pool.
 */
export function taskIsInSessionDelivery(session, db, taskId) {
  if (!taskId) return false;
  if ((session?.taskIds || []).includes(taskId)) return true;
  if (typeof session?.deliveryModelId !== "string" || session.deliveryModelId === "") return false;
  const resolution = resolveAssemblyModelForSession(session, db);
  if (!resolution?.assemblyModel || resolution.authoritative !== true) return false;
  const resolved = selectionPolicyForDelivery(resolution.deliveryModel, db);
  const strategy = resolved.policy?.type || session.selectionStrategy;
  if (strategy === "fixed") return false;
  const pool = buildAssemblyPackagePool(session, db, resolution.assemblyModel);
  return pool.source === "packages" && pool.ids.includes(taskId);
}

/** Keep the seed prefix and record a delivered task that was not in it. */
export function noteDeliveredTask(session, taskId) {
  if (!session || !taskId) return;
  if (!Array.isArray(session.taskIds)) session.taskIds = [];
  if (!session.taskIds.includes(taskId)) session.taskIds.push(taskId);
}

/**
 * Seed plus any response whose task id was not stored on the seed.
 * Report loops use this so a delivered off-seed task is still listed.
 */
export function taskIdsIncludingDelivered(session) {
  const ids = Array.isArray(session?.taskIds) ? [...session.taskIds] : [];
  const seen = new Set(ids);
  for (const response of session?.responses || []) {
    const taskId = response?.taskId;
    if (typeof taskId === "string" && taskId !== "" && !seen.has(taskId)) {
      ids.push(taskId);
      seen.add(taskId);
    }
  }
  return ids;
}

/**
 * Selection policy for prerequisite gating: Assembly Model's
 * selectionAlgorithm.policyId when a governing AM exists. Does not override
 * session.selectionStrategy (that remains advisory-only per D56).
 */
function policyById(db, policyId) {
  if (!policyId) return null;
  return (db.policies || []).find((policy) => policy && policy.id === policyId) || null;
}

/**
 * Selection policy for a delivery model.
 * The assembly model's selectionAlgorithm.policyId wins when it names a
 * policy that exists and has a type. Otherwise the delivery model's
 * policyId is used. Callers that have an explicit session strategy only
 * reject a conflict when source is "assemblyModel".
 */
export function selectionPolicyForDelivery(deliveryModel, db) {
  const assemblyModel =
    (db.assemblyModels || []).find((row) => row && row.id === deliveryModel?.assemblyModelId) || null;
  const assemblyPolicy = policyById(db, assemblyModel?.selectionAlgorithm?.policyId);
  if (assemblyPolicy?.type) {
    return { policy: assemblyPolicy, assemblyModel, source: "assemblyModel" };
  }
  const deliveryPolicy = policyById(db, deliveryModel?.policyId);
  if (deliveryPolicy?.type) {
    return { policy: deliveryPolicy, assemblyModel, source: "deliveryModel" };
  }
  const assemblyId = assemblyModel?.id || deliveryModel?.assemblyModelId || "";
  return {
    error: assemblyModel
      ? `Delivery model '${deliveryModel.id}' assembly model '${assemblyId}' does not declare a usable selection policy, and delivery model policy '${deliveryModel.policyId || ""}' is not in /api/policies.`
      : `Delivery model '${deliveryModel?.id}' names selection policy '${deliveryModel?.policyId || ""}', which is not in /api/policies.`,
  };
}

function resolveGatingPolicy(session, db) {
  if (typeof session?.deliveryModelId === "string" && session.deliveryModelId) {
    const bound = resolveDeliveryBinding(session, db);
    if (bound?.deliveryModel) {
      const resolved = selectionPolicyForDelivery(bound.deliveryModel, db);
      if (resolved.policy) return resolved.policy;
    }
    return null;
  }
  const { assemblyModel } = resolveAssemblyModelForSession(session, db);
  return policyById(db, assemblyModel?.selectionAlgorithm?.policyId);
}

function normalizeSmvKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Resolve SMV id + display names for a candidate task's Evidence Model.
 */
function smvIdentityForCandidate(task, db) {
  if (!task?.itemId) return null;
  const item = (db.items || []).find((it) => it.id === task.itemId);
  const emId = item?.evidenceModelId;
  if (!emId) {
    const pkg = activePackageFor(task.taskModelId, db);
    const entry = (pkg?.items || []).find((e) => e.itemId === task.itemId);
    if (!entry?.evidenceModelId) return null;
    return smvIdentityForEvidenceModel(entry.evidenceModelId, db);
  }
  return smvIdentityForEvidenceModel(emId, db);
}

function smvIdentityForEvidenceModel(evidenceModelId, db) {
  const em = (db.evidenceModels || []).find((m) => m.id === evidenceModelId);
  if (!em) return null;
  const competency = (db.competencies || []).find((c) => c.id === em.competencyId);
  const cm = (db.competencyModels || []).find(
    (m) => m.id === (competency?.modelId || em.competencyModelId)
  );
  const smv =
    (cm?.smVariables || []).find((v) => v.id === em.competencyId) ||
    (cm?.smVariables || []).find(
      (v) => normalizeSmvKey(v.label) === normalizeSmvKey(competency?.name || em.competencyName)
    ) ||
    null;
  const names = [
    smv?.id,
    smv?.label,
    competency?.name,
    competency?.label,
    em.competencyName,
    em.competencyId,
  ].filter(Boolean);
  return {
    smvId: smv?.id || em.competencyId || null,
    names,
    evidenceModelId: em.id,
  };
}

function masteryEstimateForRef(session, db, ref) {
  const key = normalizeSmvKey(ref);
  if (!key) return null;
  const posteriors = session.studentModel?.smvPosteriors || {};

  for (const [smvId, p] of Object.entries(posteriors)) {
    const labels = [smvId, p?.smvId, p?.label, p?.name].filter(Boolean);
    // Also match competency / SMV labels from the competency model.
    for (const cm of db.competencyModels || []) {
      const v = (cm.smVariables || []).find((sv) => sv.id === smvId || sv.id === p?.smvId);
      if (v?.label) labels.push(v.label);
    }
    for (const c of db.competencies || []) {
      if (c.id === smvId || c.id === p?.smvId) {
        if (c.name) labels.push(c.name);
        if (c.label) labels.push(c.label);
      }
    }
    if (!labels.some((l) => normalizeSmvKey(l) === key)) continue;
    if (typeof p?.estimate === "number" && Number.isFinite(p.estimate)) {
      return p.estimate;
    }
  }
  return null;
}

function identityMatchesRef(identity, ref) {
  if (!identity || !ref) return false;
  const key = normalizeSmvKey(ref);
  return (identity.names || []).some((n) => normalizeSmvKey(n) === key);
}

/**
 * EM-R4: drop (or leave unrankable) candidates whose SMV is gated behind an
 * unmet prerequisite mastery. Unmet = no posterior yet, or estimate below
 * threshold. Fixed forms do not consult this (byte-identical contract).
 *
 * @returns {{ candidates: object[], blocked: object[] }}
 */
function applyPrerequisiteGating(candidates, session, db, warnings) {
  const policy = resolveGatingPolicy(session, db);
  const gating = policy?.config?.prerequisiteGating;
  if (!Array.isArray(gating) || gating.length === 0) {
    return { candidates, blocked: [] };
  }

  const blocked = [];
  const kept = [];

  for (const candidate of candidates) {
    const identity = smvIdentityForCandidate(candidate.task, db);
    let blockReason = null;
    for (const rule of gating) {
      if (!rule?.before || !rule?.requireMasteryOf) continue;
      if (!identityMatchesRef(identity, rule.before)) continue;
      const threshold =
        typeof rule.threshold === "number" && Number.isFinite(rule.threshold)
          ? rule.threshold
          : 0.7;
      const mastery = masteryEstimateForRef(session, db, rule.requireMasteryOf);
      if (mastery == null || mastery < threshold) {
        blockReason = `Prerequisite gating: '${rule.before}' blocked until mastery of '${rule.requireMasteryOf}' ≥ ${threshold} (have ${mastery == null ? "no posterior" : mastery}).`;
        break;
      }
    }
    if (blockReason) {
      blocked.push({ taskId: candidate.taskId, reason: blockReason });
    } else {
      kept.push(candidate);
    }
  }

  if (blocked.length > 0) {
    warnings.push(
      `Prerequisite gating held back ${blocked.length} candidate(s): ${blocked
        .map((b) => b.taskId)
        .join(", ")}.`
    );
  }

  return { candidates: kept, blocked };
}

/**
 * LEGACY. The only remaining reader of db.questions in the selection path.
 * Unchanged in substance from the pre-D56 branch, deliberately: a session
 * whose tasks name `questionId` predates items entirely and has no other
 * selection available to it. Reached only when a task has no `itemId`.
 * Delete this function, and its call site, when the legacy path is retired.
 */
function selectLegacyQuestionCandidate(task, db, theta) {
  const question = (db.questions || []).find((q) => q.id === task.questionId);
  if (!question) return null;

  const b = question.metadata?.b;
  if (typeof b !== "number") return null;

  return { score: -Math.abs(b - theta), debug: { theta, b, diff: Math.abs(b - theta), source: "legacy-question" } };
}

/**
 * The live ability estimate informing a candidate on the ITEM path.
 *
 * Looked up by the candidate's own Evidence Model rather than taking one
 * global theta, since a session may span Evidence Models measuring
 * different SMVs. `method === "eap"` is what marks a posterior as being on
 * the theta scale -- the same discriminator assemblyProgress.js uses to
 * refuse comparing a raw-score proportion's SE to a SEM target, and for the
 * same reason: a raw-score or attribute-mastery estimate is not an ability
 * on the difficulty scale and must not be differenced against one.
 *
 * Falls back to 0 -- the prior mean, and the same default the pre-D56
 * branch used -- when this Evidence Model has produced no posterior yet,
 * which is every session's first item.
 */
function liveThetaFor(evidenceModelId, session) {
  const posteriors = session.studentModel?.smvPosteriors || {};

  const match = Object.values(posteriors).find(
    (p) => p.evidenceModelId === evidenceModelId && p.method === "eap" && Number.isFinite(p.estimate)
  );

  return match ? { theta: match.estimate, smvId: match.smvId } : { theta: 0, smvId: null };
}

/* ------------------------------------------------------------------
   Strategies
   ------------------------------------------------------------------ */

/**
 * Byte-identical to the pre-D56 `fixed` branch, and pinned by a regression
 * guard. Purely index-driven: it does not consult the library, a posterior,
 * or an Assembly Model target, because a fixed form by definition does not
 * adapt. D56's exit check depends on this staying exactly as it was, so
 * that any change in delivered outcome is attributable to the ADAPTIVE
 * policies alone.
 */
function selectFixed(session) {
  if (session.currentTaskIndex < session.taskIds.length) {
    return {
      taskId: session.taskIds[session.currentTaskIndex],
      strategy: "fixed",
      debug: { index: session.currentTaskIndex },
    };
  }
  return {};
}

/**
 * 3PL Fisher information matching irtEngine.js / r-backend
 * .item_information_fisher. Used for CAT item selection; not a scoring path.
 */
function itemInformationFisher(theta, params) {
  const aRaw = Number(params?.a);
  const b = Number(params?.b);
  const cRaw = Number(params?.c);
  const a = Number.isFinite(aRaw) && aRaw > 0 ? aRaw : 1;
  const c = Number.isFinite(cRaw) ? Math.min(1, Math.max(0, cRaw)) : 0;
  if (!Number.isFinite(theta) || !Number.isFinite(b)) return 0;
  const expo = a * (theta - b);
  const L = 1 / (1 + Math.exp(-expo));
  const p = c + (1 - c) * L;
  const pClamp = Math.min(1 - 1e-12, Math.max(1e-12, p));
  const q = 1 - pClamp;
  if (Math.abs(1 - c) < 1e-12) return 0;
  const Lstar = (pClamp - c) / (1 - c);
  return (a * a) * (q / pClamp) * (Lstar * Lstar);
}

/**
 * IRT: the unanswered item with the greatest Fisher information at the
 * live theta. Legacy question-only candidates still use closest b.
 */
function selectIrt(session, db, warnings) {
  const all = candidatesFor(session, db);

  /* A session may, in principle, mix item-based and legacy question-based
     tasks. Ranking the two together would difference a LIVE posterior
     (item path) against `studentModel.irtTheta` (legacy path) inside one
     comparison -- two estimates produced by different machinery from
     different evidence, and not on a common scale. The item path wins
     outright when both are present, and the drop is reported rather than
     resolved silently by whichever number happened to be smaller. */
  const itemCandidates = all.filter((c) => !!c.task.itemId);
  const legacyCandidates = all.filter((c) => !c.task.itemId);
  let candidates = itemCandidates.length > 0 ? itemCandidates : legacyCandidates;

  if (itemCandidates.length > 0 && legacyCandidates.length > 0) {
    warnings.push(
      `This session mixes ${itemCandidates.length} item-based and ${legacyCandidates.length} legacy question-based task(s). Only the item-based candidates were ranked: a live posterior and the legacy studentModel.irtTheta are not on a common scale and must not be compared in one selection.`
    );
  }

  const gated = applyPrerequisiteGating(candidates, session, db, warnings);
  candidates = gated.candidates;
  const skipped = gated.blocked.map((b) => ({ taskId: b.taskId, reason: b.reason }));

  let best = null;

  for (const { taskId, task } of candidates) {
    if (!task.itemId) {
      // LEGACY quarantine -- see selectLegacyQuestionCandidate.
      const legacy = selectLegacyQuestionCandidate(task, db, session.studentModel?.irtTheta ?? 0);
      if (!legacy) {
        skipped.push({ taskId, reason: "No itemId, and no legacy question with a numeric difficulty." });
        continue;
      }
      if (!best || legacy.score > best.score) best = { taskId, ...legacy };
      continue;
    }

    const pkg = activePackageFor(task.taskModelId, db);
    if (!pkg) {
      skipped.push({
        taskId,
        reason: `No active composite library package for task model '${task.taskModelId}'.`,
      });
      continue;
    }

    const entry = (pkg.items || []).find((e) => e.itemId === task.itemId);
    if (!entry) {
      skipped.push({
        taskId,
        reason: `Item '${task.itemId}' is not in the active package for task model '${task.taskModelId}'.`,
      });
      continue;
    }

    const evidenceModel = (db.evidenceModels || []).find((em) => em.id === entry.evidenceModelId);
    if (!evidenceModel) {
      skipped.push({ taskId, reason: `Unknown evidenceModelId '${entry.evidenceModelId}'.` });
      continue;
    }

    const item = (db.items || []).find((it) => it.id === task.itemId);
    const freeze = frozenScoringContext(session, evidenceModel.id);
    const resolved = resolveContinuousParameters(entry.observationId, evidenceModel, item, freeze);

    if (!resolved.params) {
      skipped.push({ taskId, reason: resolved.reason });
      continue;
    }

    const { theta, smvId } = liveThetaFor(entry.evidenceModelId, session);
    const b = resolved.params.b;
    const diff = Math.abs(b - theta);
    const information = itemInformationFisher(theta, resolved.params);
    const candidate = {
      taskId,
      score: information,
      debug: {
        theta,
        smvId,
        b,
        diff,
        information,
        criterion: "max-fisher",
        itemId: task.itemId,
        source: "composite-library",
        parameterSource: resolved.parameterSource,
        parameterSetId: resolved.parameterSetId ?? null,
      },
    };

    if (!best || candidate.score > best.score) best = candidate;
  }

  if (!best) {
    if (skipped.length > 0) {
      warnings.push(
        `IRT selection could rank none of the ${skipped.length} remaining candidate(s): ${skipped
          .map((s) => `${s.taskId} (${s.reason})`)
          .join("; ")}`
      );
    }
    return {};
  }

  return { taskId: best.taskId, strategy: "IRT", debug: { ...best.debug, skipped } };
}

/**
 * BayesianNetwork: the candidate with the greatest expected reduction in
 * uncertainty about the attributes it measures, given current beliefs.
 *
 * When no candidate has evaluable diagnostic information, the fallback is
 * pool order: the first remaining candidate in the list this function was
 * given. On a roster session that list is the seed, so the task is the
 * same one the old first-unanswered rule returned. The fallback name and
 * the warning say that this was not an information-gain ranking. G-DINA
 * without a calibrated table still uses this fallback (R8).
 */
function selectBayesianNetwork(session, db, warnings) {
  let candidates = candidatesFor(session, db);
  const gated = applyPrerequisiteGating(candidates, session, db, warnings);
  candidates = gated.candidates;
  const posteriors = session.studentModel?.smvPosteriors || {};

  let best = null;
  const unrankable = gated.blocked.map((b) => ({ taskId: b.taskId, reason: b.reason }));

  for (const { taskId, task } of candidates) {
    if (!task.itemId) {
      unrankable.push({ taskId, reason: "No itemId; diagnostic selection needs an item to look up in a Q-matrix." });
      continue;
    }

    const pkg = activePackageFor(task.taskModelId, db);
    const entry = pkg ? (pkg.items || []).find((e) => e.itemId === task.itemId) : null;
    if (!entry) {
      unrankable.push({
        taskId,
        reason: `Item '${task.itemId}' is not in an active composite library package for task model '${task.taskModelId}'.`,
      });
      continue;
    }

    const evidenceModel = (db.evidenceModels || []).find((em) => em.id === entry.evidenceModelId);
    const statisticalModel = evidenceModel?.statisticalModels?.find((sm) => sm.active);
    const family = statisticalModel?.type;

    if (family === BAYESIAN_NETWORK_FAMILY) {
      const item = (db.items || []).find((it) => it.id === task.itemId);
      const observableId = item?.observationId || entry.observationId;
      if (!observableId) {
        unrankable.push({
          taskId,
          reason: `Item '${task.itemId}' has no observable id, so Bayesian network information gain cannot be computed.`,
        });
        continue;
      }
      const freeze = frozenScoringContext(session, evidenceModel?.id);
      if (freeze.error) {
        unrankable.push({ taskId, reason: freeze.error });
        continue;
      }
      const calibratedParameterSetId = statisticalModel.activeParameterSetId || null;
      const parameterSource = freeze.frozenSource || (calibratedParameterSetId ? "calibrated" : "pilot");
      const parameterSetId = parameterSource === "calibrated"
        ? (freeze.frozenParameterSetId || calibratedParameterSetId)
        : null;
      const loaded = loadBayesianNetworkForSelection({
        evidenceModel,
        statisticalModel,
        db,
        parameterSource,
        parameterSetId,
      });
      if (!loaded.ok) {
        unrankable.push({ taskId, reason: loaded.error });
        continue;
      }
      const row = loaded.network.cpt[observableId];
      if (!row) {
        unrankable.push({
          taskId,
          reason: `Bayesian model '${statisticalModel.id}' has no conditional probability for observable '${observableId}'.`,
        });
        continue;
      }
      const parentId = loaded.network.parentOf?.[observableId] || loaded.network.smvId;
      const parentNetwork = loaded.network.statesById
        ? {
            smvId: parentId,
            states: loaded.network.statesById[parentId],
            prior: loaded.network.priorsById?.[parentId],
          }
        : loaded.network;
      if (!parentNetwork.states || !parentNetwork.prior) {
        unrankable.push({
          taskId,
          reason: `Bayesian model '${statisticalModel.id}' has no belief over parent '${parentId}' for observable '${observableId}'.`,
        });
        continue;
      }
      const belief = beliefForBayesianSelection(session, parentNetwork);
      if (belief.error) {
        unrankable.push({ taskId, reason: belief.error });
        continue;
      }
      const gain = expectedInformationGain(belief.belief, row);
      const candidate = {
        taskId,
        score: gain,
        debug: {
          totalGain: gain,
          itemId: task.itemId,
          smvId: parentNetwork.smvId,
          observableId,
          parameterSource,
          priorSource: belief.source,
          source: "composite-library",
        },
      };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }

    if (!statisticalModel || !["dina", "gdina"].includes(family)) {
      unrankable.push({
        taskId,
        reason: `Evidence model '${entry.evidenceModelId}' has no active diagnostic (dina/gdina) statistical model.`,
      });
      continue;
    }

    const qMatrixId = statisticalModel.structureConfig?.qMatrixId;
    const qMatrix = qMatrixId ? (db.qMatrixModels || []).find((q) => q.id === qMatrixId) : null;

    if (!qMatrix) {
      unrankable.push({ taskId, reason: `No Q-matrix resolves from statistical model '${statisticalModel.id}'.` });
      continue;
    }

    const item = (db.items || []).find((it) => it.id === task.itemId);
    const requiredAttributeIds = attributeIdsForDeliveryItem(qMatrix.entries, {
      itemId: task.itemId,
      observableId: item?.observationId,
      evidenceModelId: evidenceModel?.id,
    });

    if (requiredAttributeIds.length === 0) {
      // attributeAccumulation.js excludes these from scoring for the same
      // reason: an item requiring no attributes discriminates between no
      // profiles, so it carries no diagnostic information to expect.
      unrankable.push({
        taskId,
        reason: `Q-matrix '${qMatrix.id}' declares no required attributes for item '${task.itemId}'.`,
      });
      continue;
    }

    const freeze = frozenScoringContext(session, evidenceModel?.id);
    const resolved = resolveDinaParameters(
      task.itemId,
      item,
      statisticalModel,
      family,
      freeze,
      requiredAttributeIds.length
    );

    if (!resolved.params) {
      unrankable.push({ taskId, reason: resolved.reason });
      continue;
    }

    if (family === "gdina") {
      const priors = [];
      const missing = [];
      for (const attributeId of requiredAttributeIds) {
        const prior = posteriors[attributeId]?.estimate;
        if (!Number.isFinite(prior)) missing.push(attributeId);
        else priors.push(prior);
      }
      if (missing.length > 0) {
        unrankable.push({
          taskId,
          reason: missing.length === requiredAttributeIds.length
            ? `No live posterior exists yet for any attribute item '${task.itemId}' requires.`
            : `No live posterior exists yet for ${missing.length === 1 ? "attribute" : "attributes"} ${missing.join(", ")} that item '${task.itemId}' requires.`,
        });
        continue;
      }
      const gain = computeGdinaExpectedInformationGain(priors, resolved.params.probabilities);
      if (gain == null) {
        unrankable.push({
          taskId,
          reason: `Parameter set has no usable G-DINA table for item '${task.itemId}'.`,
        });
        continue;
      }
      const candidate = {
        taskId,
        score: gain,
        debug: {
          totalGain: gain,
          itemId: task.itemId,
          qMatrixId: qMatrix.id,
          parameterSource: resolved.parameterSource,
          family: "gdina",
          attributes: requiredAttributeIds.map((attributeId, index) => ({
            attributeId,
            prior: priors[index],
          })),
          source: "composite-library",
        },
      };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }

    const { slip, guess } = resolved.params;
    let gain = 0;
    const perAttribute = [];

    for (const attributeId of requiredAttributeIds) {
      const posterior = posteriors[attributeId];
      const prior = posterior?.estimate;

      if (!Number.isFinite(prior)) {
        // No live belief about this attribute yet. Contributing a default
        // 0.5 here would let an item score information gain purely from an
        // assumption nobody made -- exactly the `?? 0.5` shortcut that made
        // the pre-D56 branch look like it was computing something.
        perAttribute.push({ attributeId, skipped: "No live posterior for this attribute yet." });
        continue;
      }

      const attributeGain = computeExpectedInformationGain(prior, slip, guess);
      gain += attributeGain;
      perAttribute.push({ attributeId, prior, gain: attributeGain });
    }

    if (perAttribute.every((a) => a.skipped)) {
      unrankable.push({
        taskId,
        reason: `No live posterior exists yet for any attribute item '${task.itemId}' requires.`,
      });
      continue;
    }

    const candidate = {
      taskId,
      score: gain,
      debug: {
        totalGain: gain,
        itemId: task.itemId,
        qMatrixId: qMatrix.id,
        parameterSource: resolved.parameterSource,
        attributes: perAttribute,
        source: "composite-library",
      },
    };

    if (!best || candidate.score > best.score) best = candidate;
  }

  if (best) {
    return { taskId: best.taskId, strategy: "BayesianNetwork", debug: { ...best.debug, unrankable } };
  }

  /* Nothing could be ranked. Deliver the first remaining candidate in
     pool order and say so. Pool order is the list candidatesFor walked:
     the seed on a roster session, or the G20 package pool (seed, then
     task id) when a delivery model widened it. */
  const first = candidates[0];
  if (!first) return {};

  const reason =
    "No candidate had evaluable diagnostic information. The first remaining candidate in pool order was delivered. Pool order is the session seed, then task id. This is not an information-gain ranking.";
  const detail = unrankable.length > 0
    ? ` Reasons: ${unrankable.map((u) => `${u.taskId} (${u.reason})`).join("; ")}`
    : "";
  warnings.push(
    `BayesianNetwork selection could rank no candidate on information gain. It delivered the first remaining candidate in pool order (session seed, then task id). This is not an information-gain ranking.${detail}`
  );

  return {
    taskId: first.taskId,
    strategy: "BayesianNetwork",
    debug: {
      totalGain: null,
      fallback: "pool-order",
      reason,
      unrankable,
    },
  };
}

/* ------------------------------------------------------------------
   Entry point
   ------------------------------------------------------------------ */

/**
 * Choose the next activity for a session, or report that it should stop.
 *
 * Pure: reads `session` and the `db` snapshot, mutates neither, persists
 * nothing.
 *
 * @param {object} session - a live sessions record
 * @param {object} db - the full db snapshot
 * @returns {object} `{}` when there is nothing more to present (the shape
 *   the pre-D56 route returned, and what SessionPlayer already handles), or
 *   `{ taskId, strategy, debug }`. A session stopped by an Assembly Model
 *   rule additionally carries `stopped: { rule, assemblyModelId, reason }`
 *   and no taskId. `warnings[]` is present only when non-empty, so a
 *   session with no Assembly Model and no data problems returns exactly
 *   what it returned before this unit.
 */
export function selectNextActivity(session, db) {
  if (!session) throw new Error("selectNextActivity requires a session.");
  if (!db) throw new Error("selectNextActivity requires a db snapshot.");

  const warnings = [];

  /* Stopping is evaluated BEFORE selection: an Assembly Model that says
     "enough" outranks any strategy's opinion about what to present next. */
  const assemblyResolution = resolveAssemblyModelForSession(session, db);
  const authoritative = assemblyResolution.authoritative === true;

  /* D60 P1: a missing AM is the common case and must stay silent (the
     D56 fixed-path byte-identical contract). A draft-only or ambiguous
     match is the F24 shape -- stopping looks like it might apply, and
     does not -- so the reason is a warning, not a dropped string.
     A cited delivery model that cannot be resolved is the same kind of
     warning: the reason is said, and nothing is inferred in its place. */
  if (!assemblyResolution.assemblyModel && (assemblyResolution.code === "NONE_GOVERNING" || assemblyResolution.code === "AMBIGUOUS" || assemblyResolution.code === "DELIVERY_MODEL_MISSING" || assemblyResolution.code === "ASSEMBLY_UNBOUND")) {
    warnings.push(assemblyResolution.reason);
  }

  let strategy = session.selectionStrategy;
  let packagePool = null;

  if (assemblyResolution.assemblyModel) {
    const assemblyModel = assemblyResolution.assemblyModel;

    if (!authoritative) {
      /* The session's own selectionStrategy was validated against db.policies
         when the session was created, and stays authoritative. The Assembly
         Model's selectionAlgorithm pointer is a SECOND statement of intent,
         and the two can disagree. Reported, never silently reconciled. */
      const policyId = assemblyModel.selectionAlgorithm?.policyId;
      if (policyId) {
        const policy = (db.policies || []).find((p) => p.id === policyId);
        if (policy && policy.type && policy.type !== session.selectionStrategy) {
          warnings.push(
            `Assembly Model '${assemblyModel.id}' names selection policy '${policyId}' (type '${policy.type}'), but this session was created with selectionStrategy '${session.selectionStrategy}'. The session's own strategy is used; the Assembly Model's pointer is not applied retroactively.`
          );
        }
      }
    } else {
      const resolved = selectionPolicyForDelivery(assemblyResolution.deliveryModel, db);
      if (resolved.policy?.type) {
        strategy = resolved.policy.type;
        if (
          resolved.source === "assemblyModel" &&
          resolved.policy.type !== session.selectionStrategy
        ) {
          warnings.push(
            `Assembly Model '${assemblyModel.id}' selection policy '${resolved.policy.id}' (type '${resolved.policy.type}') drives this session. The stored selectionStrategy '${session.selectionStrategy}' is not used.`
          );
        }
      } else {
        warnings.push(
          `Delivery Model '${assemblyResolution.deliveryModel?.id}' has no usable selection policy. Selection uses the session strategy '${session.selectionStrategy}'.`
        );
      }
    }

    if (authoritative && strategy !== "fixed") {
      packagePool = buildAssemblyPackagePool(session, db, assemblyModel);
      warnings.push(...packagePool.warnings);
    }

    const stopping = evaluateStoppingRules(session, assemblyModel, db, {
      candidateIds: packagePool?.source === "packages" ? packagePool.ids : null,
    });
    warnings.push(...stopping.warnings);

    if (stopping.stop) {
      return { stopped: stopping.stop, strategy, ...(warnings.length ? { warnings } : {}) };
    }
  }

  let selectionSession = session;
  const packageIds = packagePool?.source === "packages" ? packagePool.ids : null;
  if (
    assemblyResolution.assemblyModel &&
    assemblyConstraintsActive(assemblyResolution.assemblyModel.constraints)
  ) {
    const plan = planConstraintSelection(
      session,
      assemblyResolution.assemblyModel,
      db,
      strategy,
      packageIds
    );
    warnings.push(...plan.warnings);
    if (plan.stop) {
      return { stopped: plan.stop, strategy, ...(warnings.length ? { warnings } : {}) };
    }
    if (strategy === "fixed") {
      const fixed = selectFixedConstrained(session, plan.eligibleIds);
      return warnings.length ? { ...fixed, warnings } : fixed;
    }
    selectionSession = {
      ...session,
      taskIds: plan.eligibleIds,
      currentTaskIndex: 0,
    };
  } else if (packageIds) {
    selectionSession = {
      ...session,
      taskIds: packageIds,
      currentTaskIndex: 0,
    };
  }

  let result;
  switch (strategy) {
    case "fixed":
      result = selectFixed(selectionSession);
      break;
    case "IRT":
      result = selectIrt(selectionSession, db, warnings);
      break;
    case "BayesianNetwork":
      result = selectBayesianNetwork(selectionSession, db, warnings);
      break;
    default:
      // Unknown strategy: `{}`, exactly as the pre-D56 route's final
      // fallthrough returned.
      result = {};
  }

  return warnings.length ? { ...result, warnings } : result;
}

export const __testing__ = {
  entropy,
  activePackageFor,
  resolveContinuousParameters,
  resolveDinaParameters,
  computeExpectedInformationGain,
  computeGdinaExpectedInformationGain,
  competencyModelIdsForSession,
  resolveDeliveryBinding,
  resolveAssemblyModelForSession,
  evaluateStoppingRules,
  candidatesFor,
  buildAssemblyPackagePool,
  taskIsInSessionDelivery,
  noteDeliveredTask,
  taskIdsIncludingDelivered,
  applyPrerequisiteGating,
  resolveGatingPolicy,
  selectionPolicyForDelivery,
  liveThetaFor,
  selectFixed,
  itemInformationFisher,
  GOVERNING_ASSEMBLY_MODEL_STATUSES,
};
