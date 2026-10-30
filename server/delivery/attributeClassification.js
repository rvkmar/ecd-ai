// server/delivery/attributeClassification.js
//
// Day 57 (Week 12): the decision rule that turns a diagnostic posterior
// into a discrete mastery classification, with a stated threshold and a
// stated expected accuracy. This is the gap Day 40 named explicitly and
// the reason assemblyProgress.js has carried `stoppingCriterionMet: null`
// for every requiredClassificationAccuracy target since Day 34.
//
// Full reasoning: docs/adr/0004-mastery-classification-decision-rule.md.
// The five things worth knowing before changing anything here:
//
// 1. THE ACCURACY REPORTED HERE IS A CONDITIONAL, INDIVIDUAL QUANTITY.
//    `expectedClassificationAccuracy` is P(the class just assigned is the
//    true class | THIS examinee's responses). It is NOT the test's
//    population classification accuracy rate -- the index Wang et al.
//    (2015) and GDINA::CA() define, which integrates over the population
//    distribution of profiles and the whole response-pattern space. That
//    quantity is not a function of one session's data and therefore
//    cannot drive a stopping rule; it is deliberately not computed,
//    approximated or claimed anywhere in this module.
//
//    Averaging these individual numbers across a cohort does NOT recover
//    the population index. It yields the mean confidence of the
//    classifications actually made, biased upward wherever adaptive
//    selection stopped sessions early on the confident cases. D79's brief
//    already warns that averaging probabilities and counting
//    classifications answer different questions; this is that warning
//    applied to the accuracy column.
//
// 2. THE ACCURACY IS `master ? p : 1 - p`, NOT `max(p, 1 - p)`. The two
//    agree at threshold 0.5 and disagree everywhere else. An asymmetric
//    threshold IS an asymmetric loss function, and under one the rule can
//    deliberately assign the LESS probable class: at threshold 0.8 a
//    posterior of 0.7 classifies as nonmaster, and that decision is
//    correct with probability 0.3, not 0.7. `max()` would be right today
//    and quietly wrong once a threshold other than 0.5 is applied.
//    TU1 applies authored cuts. The general form is the one that stays
//    correct.
//
// 3. AN EXACT TIE IS A REAL STATE. masteryPrior() in
//    attributeAccumulation.js returns {p: 0.5} whenever an SMV declares no
//    prior, so exactly 0.5 is a value this pipeline produces on purpose,
//    not a floating-point accident. `p > tau ? "master" : "nonmaster"`
//    would silently report "has not mastered" for an attribute whose
//    evidence is exactly balanced. Attributes no response touched are
//    already excluded upstream (supported: false), so "indeterminate"
//    means measured-and-balanced, never unmeasured.
//
// 4. ONLY A MASTERY POSTERIOR MAY BE CLASSIFIED. The caller must gate on
//    `method === "attribute-mastery-posterior"`; isClassifiablePosterior()
//    here is that gate. An "eap" estimate is theta on the real line. A
//    "weighted-proportion" estimate is an observed proportion of score in
//    [0, 1] -- bounded exactly like a probability, and not one. That
//    second case is authorable TODAY: RAW_SCORE_SMV_TYPES includes
//    "binary", and schema.js REQUIRES requiredClassificationAccuracy on a
//    binary SMV, so a binary SMV carrying a CTT/sum/threshold model
//    produces precisely this collision through entirely valid records.
//    Gating on smvType instead would reproduce the Day 39 adversarial
//    review's P1-6 finding on this side of the module.
//
// 5. NOTHING HERE IS PERSISTED. A classification is a pure function of a
//    stored posterior and a stated threshold. Storing it would create a
//    second source of truth that can drift from the posterior it came
//    from, and would cut against the reproducibility invariant D68
//    re-verifies. D79 recomputes from stored posteriors through this same
//    module, which is only sound because there is exactly one
//    implementation of the rule.

/**
 * The Bayes decision rule under symmetric 0-1 loss, and the standard
 * marginal-MAP reporting rule for DINA/G-DINA attribute profiles.
 *
 * TU1 (ADR 0004 amendment): an authored cut replaces this constant.
 * Precedence is SMV masteryThreshold, then Assembly Model
 * masteryThreshold, then an evidence-model mastery decisionRule that
 * defines a probability cut, then this 0.5. Absent all three, every
 * caller still classifies at 0.5.
 */
const DEFAULT_MASTERY_THRESHOLD = 0.5;

/**
 * An authored masteryThreshold is an open cut on the probability scale.
 * 0 and 1 are refused. Schema validation uses the same interval. A
 * mastery decisionRule may still state 0 or 1.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function authoredMasteryThreshold(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!(value > 0 && value < 1)) return null;
  return value;
}

/**
 * A decision rule defines a mastery cut only when it is a mastery rule
 * on the probability scale with direction "above" (omitted direction is
 * the authoring panel's default, which is above).
 *
 * classification is a minimum for the modal state. posterior_threshold
 * is theta. score_band is a raw score. direction "below" would invert
 * the MAP comparison, and "within" is not one cut. Those rules are not
 * applied here; the caller falls through to 0.5.
 *
 * Thresholds of 0 and 1 are legal on a confirmed mastery rule (the
 * extreme-justification band). They are cuts. Values outside [0, 1]
 * are not a probability cut.
 *
 * @param {object|null|undefined} rule
 * @returns {number|null}
 */
function masteryCutFromDecisionRule(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
  if (rule.type !== "mastery") return null;
  const direction = rule.direction == null || rule.direction === "" ? "above" : rule.direction;
  if (direction !== "above") return null;
  if (typeof rule.threshold !== "number" || !Number.isFinite(rule.threshold)) return null;
  if (rule.threshold < 0 || rule.threshold > 1) return null;
  return rule.threshold;
}

/**
 * Resolve the mastery cut for one posterior.
 *
 * Precedence: SMV masteryThreshold, Assembly Model masteryThreshold,
 * decisionRule where it defines a cut, then 0.5. An invalid authored
 * number is skipped, not applied. With no usable cut, the result is
 * exactly DEFAULT_MASTERY_THRESHOLD.
 *
 * @param {{smv?: object, assemblyModel?: object, decisionRule?: object}|null|undefined} [sources]
 * @returns {{threshold: number, source: "smv"|"assemblyModel"|"decisionRule"|"default"}}
 */
export function resolveDecision(sources) {
  const smvCut = authoredMasteryThreshold(sources?.smv?.masteryThreshold);
  if (smvCut != null) return { threshold: smvCut, source: "smv" };

  const assemblyCut = authoredMasteryThreshold(sources?.assemblyModel?.masteryThreshold);
  if (assemblyCut != null) return { threshold: assemblyCut, source: "assemblyModel" };

  const ruleCut = masteryCutFromDecisionRule(sources?.decisionRule);
  if (ruleCut != null) return { threshold: ruleCut, source: "decisionRule" };

  return { threshold: DEFAULT_MASTERY_THRESHOLD, source: "default" };
}

/**
 * classifyMastery at the cut resolveDecision picked. Same return shape
 * as classifyMastery, so a report row stays {classification,
 * expectedClassificationAccuracy, threshold}.
 *
 * @param {number} estimate
 * @param {{smv?: object, assemblyModel?: object, decisionRule?: object}|null|undefined} [sources]
 */
export function classifyByRule(estimate, sources) {
  const { threshold } = resolveDecision(sources);
  return classifyMastery(estimate, threshold);
}

function modelById(rows, id) {
  if (!id) return null;
  return (rows || []).find((row) => row && row.id === id) || null;
}

/**
 * Gather the three cut sources for one posterior. Does not guess when
 * more than one Assembly Model could apply and the session does not
 * name one. A hinted assemblyModel (the one assembly progress already
 * chose) wins.
 *
 * @param {object|null|undefined} posterior
 * @param {object|null|undefined} db
 * @param {{assemblyModel?: object, session?: object}} [hints]
 * @returns {{smv?: object, assemblyModel?: object, decisionRule?: object}}
 */
export function sourcesForPosterior(posterior, db, hints = {}) {
  const store = db && typeof db === "object" ? db : null;
  if (!posterior || typeof posterior !== "object" || !store) return {};

  const smvId = posterior.smvId;
  let competencyModel = posterior.competencyModelId
    ? modelById(store.competencyModels, posterior.competencyModelId)
    : null;
  if (!competencyModel && smvId) {
    const matches = (store.competencyModels || []).filter(
      (model) =>
        Array.isArray(model?.smVariables) &&
        model.smVariables.some((smv) => smv && smv.id === smvId)
    );
    if (matches.length === 1) competencyModel = matches[0];
  }
  const smv =
    competencyModel && smvId
      ? (competencyModel.smVariables || []).find((row) => row && row.id === smvId) || null
      : null;

  let assemblyModel =
    hints.assemblyModel && typeof hints.assemblyModel === "object" ? hints.assemblyModel : null;
  if (!assemblyModel) {
    const session = hints.session;
    const hintedId =
      session?.assemblyProgress?.assemblyModelId || session?.stopped?.assemblyModelId || null;
    assemblyModel = modelById(store.assemblyModels, hintedId);
    if (!assemblyModel && session?.deliveryModelId) {
      const delivery = modelById(store.deliveryModels, session.deliveryModelId);
      assemblyModel = modelById(store.assemblyModels, delivery?.assemblyModelId);
    }
  }
  if (!assemblyModel && competencyModel) {
    const candidates = (store.assemblyModels || []).filter(
      (model) => model && model.competencyModelId === competencyModel.id
    );
    if (candidates.length === 1) assemblyModel = candidates[0];
  }

  let decisionRule = null;
  if (posterior.evidenceModelId) {
    const evidenceModel = modelById(store.evidenceModels, posterior.evidenceModelId);
    if (
      evidenceModel &&
      evidenceModel.decisionRule &&
      typeof evidenceModel.decisionRule === "object" &&
      !Array.isArray(evidenceModel.decisionRule)
    ) {
      decisionRule = evidenceModel.decisionRule;
    }
  }

  const sources = {};
  if (smv) sources.smv = smv;
  if (assemblyModel) sources.assemblyModel = assemblyModel;
  if (decisionRule) sources.decisionRule = decisionRule;
  return sources;
}

/** The only accumulation method whose `estimate` is a mastery probability. */
const CLASSIFIABLE_METHOD = "attribute-mastery-posterior";

/**
 * Whether a posterior's `estimate` is a probability of attribute mastery
 * and may therefore be classified at all. See note 4 in this file's header
 * for why this is gated on `method` and not on `smvType`.
 *
 * @param {object} posterior - an entry from accumulateEvidence()'s `posteriors`
 * @returns {boolean}
 */
function isClassifiablePosterior(posterior) {
  return Boolean(posterior) && posterior.method === CLASSIFIABLE_METHOD;
}

/**
 * Turn a marginal mastery posterior into a discrete classification.
 *
 * The caller is responsible for having checked isClassifiablePosterior()
 * first -- this function takes a bare probability and cannot tell what
 * scale it came from. Passing it a theta or a raw-score proportion
 * produces a confident, plausible, wrong answer, which is the whole reason
 * the gate is a separately-named predicate rather than an inline assumption
 * buried in this function.
 *
 * @param {number} estimate - P(alpha_k = 1 | X), the marginal posterior
 * @param {number} [threshold=DEFAULT_MASTERY_THRESHOLD] - mastery cut
 * @returns {{classification: "master"|"nonmaster"|"indeterminate",
 *            expectedClassificationAccuracy: number|null,
 *            threshold: number} | null} null when the inputs are not usable
 */
function classifyMastery(estimate, threshold = DEFAULT_MASTERY_THRESHOLD) {
  if (!Number.isFinite(estimate) || estimate < 0 || estimate > 1) return null;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return null;

  if (estimate === threshold) {
    /* No class was assigned, so there is no decision whose correctness
       probability could be stated. Reporting 0.5 here would look like a
       weak-but-real classification; null is the honest shape, and it meets
       no target (see meetsClassificationTarget). */
    return {
      classification: "indeterminate",
      expectedClassificationAccuracy: null,
      threshold,
    };
  }

  const isMaster = estimate > threshold;

  return {
    classification: isMaster ? "master" : "nonmaster",
    // Note 2: the general form, not max(p, 1 - p).
    expectedClassificationAccuracy: isMaster ? estimate : 1 - estimate,
    threshold,
  };
}

/**
 * Whether a classification's expected accuracy satisfies a target.
 *
 * An indeterminate classification (null accuracy) meets nothing: "the
 * evidence is exactly balanced" is not "we are confident enough to stop".
 *
 * @param {number|null} expectedClassificationAccuracy
 * @param {number} requiredClassificationAccuracy
 * @returns {boolean}
 */
function meetsClassificationTarget(expectedClassificationAccuracy, requiredClassificationAccuracy) {
  if (!Number.isFinite(expectedClassificationAccuracy)) return false;
  if (!Number.isFinite(requiredClassificationAccuracy)) return false;
  // `>=`, matching the requiredSEM branch's `<=`: a target met exactly at
  // its boundary is met.
  return expectedClassificationAccuracy >= requiredClassificationAccuracy;
}

/**
 * The floor of the expected-accuracy measure at a given threshold: the
 * smallest value a DECIDED classification can take.
 *
 * At threshold 0.5 this is 0.5, so any target at or below 0.5 is satisfied
 * by every possible posterior. schema.js permits (0, 1], so such a target
 * is legal and is evaluated honestly -- but it cannot fail, and an author
 * who wrote it almost certainly did not mean "stop on the first scored
 * response". ADR 0004 decision 6.
 *
 * Stated generally because the floor moves with the threshold: at 0.8 a
 * nonmaster decision just below the cut carries accuracy just above 0.2.
 *
 * @param {number} [threshold=DEFAULT_MASTERY_THRESHOLD]
 * @returns {number}
 */
function accuracyFloor(threshold = DEFAULT_MASTERY_THRESHOLD) {
  return Math.min(threshold, 1 - threshold);
}

/**
 * The whole decision for one posterior against one target, in the shape
 * assemblyProgress.js folds into its progress entry.
 *
 * Returns `met: null` -- never false -- whenever the question could not be
 * asked, keeping assemblyProgress's tri-state honest: null means "nobody
 * evaluated this", false means "evaluated, not met". Day 56's stopping
 * rule treats both as "do not stop", but only one of them is a measurement
 * statement.
 *
 * @param {object} posterior - an accumulateEvidence() posterior entry
 * @param {number} requiredClassificationAccuracy
 * @param {number} [threshold=DEFAULT_MASTERY_THRESHOLD]
 * @returns {{met: boolean|null, classification?: string,
 *            expectedClassificationAccuracy?: number|null,
 *            threshold?: number, note?: string, advisory?: string}}
 */
export function evaluateClassificationTarget(
  posterior,
  requiredClassificationAccuracy,
  threshold = DEFAULT_MASTERY_THRESHOLD
) {
  if (!isClassifiablePosterior(posterior)) {
    return {
      met: null,
      note:
        `A requiredClassificationAccuracy target is defined against a mastery probability ` +
        `and cannot be evaluated from a '${posterior?.modelFamily ?? "unknown"}' model's ` +
        `estimate (method: '${posterior?.method ?? "unknown"}'), which is not on that scale.`,
    };
  }

  const classified = classifyMastery(posterior.estimate, threshold);

  if (!classified) {
    return {
      met: null,
      note:
        `The attribute-mastery posterior ('${posterior.estimate}') is not a usable ` +
        `probability, so no classification could be made.`,
    };
  }

  const result = {
    met: meetsClassificationTarget(classified.expectedClassificationAccuracy, requiredClassificationAccuracy),
    classification: classified.classification,
    expectedClassificationAccuracy: classified.expectedClassificationAccuracy,
    threshold: classified.threshold,
  };

  if (requiredClassificationAccuracy <= accuracyFloor(threshold)) {
    result.advisory =
      `requiredClassificationAccuracy (${requiredClassificationAccuracy}) is at or below the ` +
      `floor of the measure at threshold ${threshold} (${accuracyFloor(threshold)}); every ` +
      `decided classification satisfies it, so this target cannot fail.`;
  }

  return result;
}

/**
 * D59: the attribute profile a report may show.
 *
 * This is the same decision rule as evaluateClassificationTarget, without
 * asking whether an Assembly Model target was met. A report has to name
 * every classifiable SMV the session actually measured — including when
 * the session ended on maxItems, or was finished by hand, or never had a
 * governing Assembly Model. Stopping is a different question (D56–D58);
 * the profile is just the classifications.
 *
 * Accepts either accumulateEvidence()'s `posteriors` array or the persisted
 * `session.studentModel.smvPosteriors` map. A persisted posterior has no
 * `supported` flag (applyPosteriorsToSession only writes supported ones);
 * an accumulation row still has to pass that flag so an unsupported SMV
 * is not classified from a refused estimate.
 *
 * @param {object[]|object|null|undefined} posteriors
 * @param {number} [threshold=DEFAULT_MASTERY_THRESHOLD]
 * @returns {{smvId: string, estimate: number, classification: string,
 *            expectedClassificationAccuracy: number|null,
 *            masteryThreshold: number}[]}
 */
export function classifyAttributeProfile(posteriors, threshold = DEFAULT_MASTERY_THRESHOLD) {
  const rows = Array.isArray(posteriors)
    ? posteriors
    : posteriors && typeof posteriors === "object"
      ? Object.values(posteriors)
      : [];

  const profile = [];
  for (const posterior of rows) {
    if (!posterior || typeof posterior !== "object") continue;
    if (posterior.supported === false) continue;
    if (!isClassifiablePosterior(posterior)) continue;

    const classified = classifyMastery(posterior.estimate, threshold);
    if (!classified) continue;

    profile.push({
      smvId: posterior.smvId,
      estimate: posterior.estimate,
      classification: classified.classification,
      expectedClassificationAccuracy: classified.expectedClassificationAccuracy,
      masteryThreshold: classified.threshold,
    });
  }
  return profile;
}

/* evaluateClassificationTarget() is what assemblyProgress.js calls.
   classifyAttributeProfile() is the no-context report profile (D59).
   resolveDecision(), classifyByRule(), and sourcesForPosterior() are
   the TU1 helpers: assembly progress resolves a cut, and session
   reports classify through classifyByRule. The arithmetic under those
   three stays unexported -- exporting it would be the F4/G4 pattern
   this repo's dead-export guard exists to catch ("exercised by its
   own tests, invoked from nowhere").

   The internals are still worth testing directly: ADR 0004 reasons about
   the decision rule, the accuracy formula and the scale gate separately,
   and a test that could only reach them through the public functions
   would be testing three things at once. Same situation, same shape, as
   attributeAccumulation.js's own __testing__ export. */
export const __testing__ = {
  DEFAULT_MASTERY_THRESHOLD,
  CLASSIFIABLE_METHOD,
  isClassifiablePosterior,
  classifyMastery,
  meetsClassificationTarget,
  accuracyFloor,
};
