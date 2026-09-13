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
// recalibration takes effect immediately -- so they are resolved live, by
// pointer, exactly as the scoring path does. See resolveContinuousParameters
// and resolveDinaParameters below, and the agreement test that pins them to
// sessionRoutes.js's own choices.
//
// WHAT "READS THE LIVE POSTERIOR" MEANS HERE. `session.studentModel
// .smvPosteriors` -- written by applyPosteriorsToSession() on every submit.
// NOT `session.studentModel.irtTheta`, which only the legacy R-backend
// branch ever writes, and not `bnPosteriors`, which nothing writes at all
// (see F24 below).
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
// carries no diagnostic data at all, the strategy DEGRADES to first-
// unanswered -- which is what it has always actually done -- and says so in
// `debug.reason` rather than presenting an accidental default as a
// computed choice.
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
// * It does not override the session's own `selectionStrategy` with the
//   Assembly Model's `selectionAlgorithm` pointer. A mismatch between the
//   two is reported as a warning. D49a's own open decision settled this
//   shape for this project: refuse or advise, never act quietly.
// * It does not persist anything. Pure computation over a db snapshot plus
//   the session, matching compositeLibrary/builder.js and every other
//   module in server/delivery/.
// * It does not change the CRITERION the IRT strategy optimises. Today's
//   criterion is "difficulty closest to the current ability estimate", and
//   that is preserved exactly -- only its INPUTS move (library + live
//   posterior + live-resolved parameters). Maximum Fisher information is
//   the better CAT criterion and is the obvious next step, but swapping it
//   in is a psychometric change whose failure mode is quiet, and it belongs
//   in a unit that verifies against a published benchmark (D64-D70), not
//   in a re-pointing unit.

import {
  accumulateEvidence,
  itemParametersAreUsable,
  CONTINUOUS_MODEL_FAMILIES,
} from "./evidenceAccumulation.js";
import {
  evaluateDeclaredTargets,
  resolveAssemblyProgress,
  GOVERNING_ASSEMBLY_MODEL_STATUSES,
} from "./assemblyProgress.js";
import { dinaParametersAreUsable } from "./attributeAccumulation.js";
import { activePackageFor } from "../compositeLibrary/activePackage.js";

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
 * scoring path resolves them: an active calibrated parameter set wins, and
 * the item's own pilot `psychometrics.irtParams` is the fallback.
 *
 * Deliberately a SECOND implementation rather than a shared helper extracted
 * out of sessionRoutes.js's submit path. The two answer different questions
 * -- submit asks "what do I PIN onto this response for reproducibility",
 * selection asks "what are this candidate's parameters right now" -- and
 * this project's own lesson 24 is that two independent implementations plus
 * an agreement test beats a shared helper. The agreement test lives in
 * __tests__/activitySelection.test.js and pins the SOURCE choice (calibrated
 * vs pilot vs refused), which is the part that must never drift.
 *
 * Calibrated continuous parameters are keyed by OBSERVABLE id (the
 * convention evidenceAccumulation.js reads them by); DINA parameters are
 * keyed by ITEM id (attributeAccumulation.js, "Decision 1"). That asymmetry
 * is real and is why these are two functions rather than one.
 */
function resolveContinuousParameters(observationId, evidenceModel, item) {
  const statisticalModel = evidenceModel?.statisticalModels?.find((sm) => sm.active);
  if (!statisticalModel) {
    return { reason: `Evidence model '${evidenceModel?.id}' has no active statistical model.` };
  }

  const family = statisticalModel.type;
  const calibratedId = statisticalModel.activeParameterSetId || null;

  /* THE SOURCE ORDER IS THE PART THAT MUST NOT DRIFT from sessionRoutes.js's
     submit path: an active calibrated parameter set wins outright, and pilot
     is reached ONLY when there is no calibrated set at all. Falling back to
     pilot when a calibrated set exists but happens to carry nothing for this
     observable would be worse than refusing: the item would be chosen on
     pilot numbers and then scored as `parameterSource: "calibrated"`, where
     evidenceAccumulation.js excludes it for exactly the missing parameters
     selection just papered over. The session would present an item that can
     contribute no evidence. Refuse the candidate instead. */
  if (calibratedId) {
    const parameterSet = (statisticalModel.parameterSets || []).find(
      (ps) => ps.parameterSetId === calibratedId
    );
    const params = parameterSet?.parameters?.[observationId];

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
 * (D53b). 'gdina' deliberately gets no pilot fallback here, exactly as it
 * gets none in sessionRoutes.js's submit path -- no item-level pilot
 * probability-table field exists, and inventing one to make a selection
 * decision would be worse than declining to rank that candidate.
 */
function resolveDinaParameters(itemId, item, statisticalModel, family) {
  const calibratedId = statisticalModel?.activeParameterSetId || null;

  if (calibratedId) {
    const parameterSet = (statisticalModel.parameterSets || []).find(
      (ps) => ps.parameterSetId === calibratedId
    );
    const params = parameterSet?.parameters?.[itemId];

    if (params && family === "dina" && dinaParametersAreUsable(params)) {
      return { params, parameterSource: "calibrated" };
    }
    return {
      reason: `Parameter set '${calibratedId}' has no usable '${family}' parameters for item '${itemId}'.`,
    };
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
 * The Assembly Model governing this session, or null with a reason.
 *
 * A session has no `assemblyModelId` field -- assemblyProgress.js's own
 * header notes its absence ("no session-level binding to resolve the
 * ambiguity by"). Adding one is a schema change with its own route and UI
 * work and is NOT this unit; so this resolves the same way assemblyProgress
 * already does -- by competency model, refusing outright when zero or more
 * than one candidate matches, rather than picking arbitrarily. A session
 * that stops early because the wrong Assembly Model was guessed at is
 * precisely the quiet failure this project's conventions exist to prevent.
 */
function resolveAssemblyModelForSession(session, db) {
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
function evaluateStoppingRules(session, assemblyModel, db) {
  const stoppingRules = assemblyModel.stoppingRules || {};
  const delivered = (session.responses || []).length;
  const warnings = [];

  if (Number.isFinite(stoppingRules.maxItems) && delivered >= stoppingRules.maxItems) {
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
 * IRT: the candidate whose difficulty sits closest to the live ability
 * estimate. Same criterion as before D56 (see the header's note on Fisher
 * information); new inputs.
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
  const candidates = itemCandidates.length > 0 ? itemCandidates : legacyCandidates;

  if (itemCandidates.length > 0 && legacyCandidates.length > 0) {
    warnings.push(
      `This session mixes ${itemCandidates.length} item-based and ${legacyCandidates.length} legacy question-based task(s). Only the item-based candidates were ranked: a live posterior and the legacy studentModel.irtTheta are not on a common scale and must not be compared in one selection.`
    );
  }

  let best = null;
  const skipped = [];

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
    const resolved = resolveContinuousParameters(entry.observationId, evidenceModel, item);

    if (!resolved.params) {
      skipped.push({ taskId, reason: resolved.reason });
      continue;
    }

    const { theta, smvId } = liveThetaFor(entry.evidenceModelId, session);
    const b = resolved.params.b;
    const diff = Math.abs(b - theta);
    const candidate = {
      taskId,
      score: -diff,
      debug: {
        theta,
        smvId,
        b,
        diff,
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
 * See F24 in the header for what this replaces and why "first unanswered"
 * is the honest fallback rather than a bug: it is what the pre-D56 branch
 * actually did in every case, so a session with no diagnostic data behaves
 * exactly as it did before, and one WITH diagnostic data now gets the
 * selection the strategy always claimed to make.
 */
function selectBayesianNetwork(session, db, warnings) {
  const candidates = candidatesFor(session, db);
  const posteriors = session.studentModel?.smvPosteriors || {};

  let best = null;
  const unrankable = [];

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

    const requiredAttributeIds = (qMatrix.entries || [])
      .filter((e) => e.itemId === task.itemId)
      .map((e) => e.attributeId);

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

    const item = (db.items || []).find((it) => it.id === task.itemId);
    const resolved = resolveDinaParameters(task.itemId, item, statisticalModel, family);

    if (!resolved.params) {
      unrankable.push({ taskId, reason: resolved.reason });
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

  /* Nothing could be ranked. Fall back to first-unanswered -- which is what
     this strategy has ALWAYS actually done (F24) -- and say why, rather
     than returning an accidental default dressed as a computed choice. */
  const first = candidates[0];
  if (!first) return {};

  if (unrankable.length > 0) {
    warnings.push(
      `BayesianNetwork selection could rank no candidate on information gain and fell back to the first unanswered task. Reasons: ${unrankable
        .map((u) => `${u.taskId} (${u.reason})`)
        .join("; ")}`
    );
  }

  return {
    taskId: first.taskId,
    strategy: "BayesianNetwork",
    debug: {
      totalGain: null,
      fallback: "first-unanswered",
      reason:
        "No candidate carried evaluable diagnostic information (see unrankable). This is the pre-D56 behaviour of this strategy in every case -- see F24.",
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

  /* D60 P1: a missing AM is the common case and must stay silent (the
     D56 fixed-path byte-identical contract). A draft-only or ambiguous
     match is the F24 shape -- stopping looks like it might apply, and
     does not -- so the reason is a warning, not a dropped string. */
  if (!assemblyResolution.assemblyModel && (assemblyResolution.code === "NONE_GOVERNING" || assemblyResolution.code === "AMBIGUOUS")) {
    warnings.push(assemblyResolution.reason);
  }

  if (assemblyResolution.assemblyModel) {
    const assemblyModel = assemblyResolution.assemblyModel;

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

    const stopping = evaluateStoppingRules(session, assemblyModel, db);
    warnings.push(...stopping.warnings);

    if (stopping.stop) {
      return { stopped: stopping.stop, strategy: session.selectionStrategy, ...(warnings.length ? { warnings } : {}) };
    }
  }

  let result;
  switch (session.selectionStrategy) {
    case "fixed":
      result = selectFixed(session);
      break;
    case "IRT":
      result = selectIrt(session, db, warnings);
      break;
    case "BayesianNetwork":
      result = selectBayesianNetwork(session, db, warnings);
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
  competencyModelIdsForSession,
  resolveAssemblyModelForSession,
  evaluateStoppingRules,
  candidatesFor,
  liveThetaFor,
  selectFixed,
  GOVERNING_ASSEMBLY_MODEL_STATUSES,
};
