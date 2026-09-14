// server/delivery/evidenceAccumulation.js
//
// Day 31 (Week 7): Evidence Accumulation (build reference Part 2, Step 26).
// Takes the Observable Variable values Evidence Identification produced
// (Day 27, stored on session.responses since Day 28) and applies the
// measurement model to update the Student Model Variable's DISTRIBUTION --
// an estimate AND its precision, never a bare point estimate.
//
// The build reference singles this file out as the highest-risk code in
// the system, at its highest effort tier, for one reason: "wrong posteriors
// look entirely plausible." A theta of 0.83 with an SE of 0.41 looks
// exactly as credible whether the math is right or wrong. Everything below
// is written on that assumption -- the arithmetic is conservative, every
// modelling assumption is named rather than implied, and every case this
// module cannot handle correctly returns an explicit `supported: false`
// rather than a number that would be believed.
//
// THREE DECISIONS WORTH READING BEFORE CHANGING ANYTHING HERE
//
// 1. Parameters come from the parameter set the response was ACTUALLY
//    SCORED AGAINST (`response.parameterSetId`, recorded at submit time in
//    Day 28), not from whichever set happens to be active now. ADR 0003's
//    rule is that a calibrated value is resolved live by pointer and never
//    cached -- this honours that (the pointer is still resolved live) while
//    keeping the posterior REPRODUCIBLE from the stored responses alone. If
//    this read the currently-active set instead, recalibrating an Evidence
//    Model would silently change the historical estimate of every session
//    that ever used it, with no record that it had moved.
//
// 2. An observable's evidence-rule DIRECTION is honoured, not assumed.
//    A `supports` observable that activates is evidence of higher ability
//    (u=1); a `weakens` observable that activates is evidence of LOWER
//    ability (u=0), and vice versa. Treating every activation as u=1 -- the
//    obvious shortcut -- would silently invert the contribution of every
//    weakens-direction observable in the model. `neutral` carries no
//    directional information and is excluded rather than guessed at.
//
// 3. An unmatched response (`activated: null`, Day 27's "the work product
//    matched no declared pattern") is EXCLUDED, not scored as incorrect.
//    "We could not tell what this response means" and "the student got it
//    wrong" are different facts, and conflating them biases every estimate
//    downward in exactly the situations where the item bank is weakest.

import { SM_VARIABLE_TYPE_VALUES } from "../../src/utils/ecdVocabulary.js";
import { accumulateAttributeMastery } from "./attributeAccumulation.js";
import { activePackageFor, packageEntryFor } from "../compositeLibrary/activePackage.js";

/* Families that update a CONTINUOUS latent variable via a posterior over
   theta. Everything else dispatches to an explicit not-yet-supported
   result -- see the dispatch table at the bottom of this file.
   Exported (Day 38) so sessionRoutes.js can dispatch pilot-vs-calibrated
   parameter resolution at submit time using the SAME family lists this
   file dispatches on -- one definition, imported by both sides, matching
   ecdVocabulary.js's own convention (build reference Part 1.1). */
export const CONTINUOUS_MODEL_FAMILIES = ["irt", "rasch"];

/**
 * D50 / D68: IRT calibrated parameters are keyed by observableId. Distinct
 * item difficulties require distinct observables — items that share an
 * observation correctly share one (a, b). R jobs often key columns by
 * model.itemIds; if the observable key is absent, fall back to itemId so
 * an ingested set is not silently unused. When both exist, observable wins.
 */
export function calibratedIrtParams(parameterSet, { observableId, itemId } = {}) {
  const map = parameterSet?.parameters || {};
  if (observableId && map[observableId]) {
    return { params: map[observableId], keyedBy: "observableId" };
  }
  if (itemId && map[itemId]) {
    return { params: map[itemId], keyedBy: "itemId" };
  }
  return { params: undefined, keyedBy: null };
}

/* CTT / sum / threshold: a (possibly weighted) raw/observed score rather
   than a posterior over a latent trait. schema.js treats these three as
   one family for decision-rule purposes ("Raw score models cannot use
   posterior_threshold") and permits them on any ORDERED Student Model
   Variable -- continuous, binary or ordinal, but never categorical, since
   a total presupposes that more evidence means further along the
   construct, which is meaningless for an unordered set of states. */
export const RAW_SCORE_MODEL_FAMILIES = ["ctt", "sum", "threshold"];
const RAW_SCORE_SMV_TYPES = ["continuous", "binary", "ordinal"];

/* DINA / G-DINA: a joint posterior over 2^K binary attribute-mastery
   profiles, marginalised to a mastery probability per attribute. Unlike
   every other family here, one response set updates MANY Student Model
   Variables at once, so this branch returns an array rather than a single
   posterior. The math lives in ./attributeAccumulation.js -- a separate
   module because it shares this file's conventions (direction handling,
   refuse-don't-guess, log-space joint) but none of its quadrature
   machinery. */
export const DIAGNOSTIC_MODEL_FAMILIES = ["dina", "gdina"];

/* QUADRATURE GRID SIZING -- Day 31, hardened after an adversarial pass.

   The obvious implementation (a fixed 41 points over a fixed [-4, 4]) is
   wrong in two directions, and both failures are silent:

   RESOLUTION. If the point COUNT is fixed while the range varies, the step
   size is uncontrolled. A competency model that declares a wide scale --
   say theta in [-100, 100], a perfectly reasonable authoring choice -- got
   a step of 5.0 against a prior SD of 1.0. Only a couple of nodes carried
   any mass at all, the recovered prior SD was 0.014 instead of 1.0, and a
   correct answer moved the estimate by 0.000 instead of 0.41. The grid is
   therefore sized by STEP, not by count: fine enough to resolve the prior
   (a quarter of its SD), with the count falling out of the range.

   COVERAGE. A grid that stops at +4 cannot represent a posterior centred
   past +4, and truncating one does not fail loudly -- it reports the edge
   as though it were the answer. Measured: 400 consecutive correct Rasch
   responses returned 3.90 +/- 0.15 where the true posterior is 4.55 +/-
   0.44. Both numbers are wrong, and the SD is wrong in the dangerous
   direction: a truncated posterior looks THREE TIMES more precise than the
   real one, because the tail that carries the uncertainty was cut off.
   So the grid is widened adaptively while meaningful mass sits on its
   boundary, and if it still does at the widest allowed span the result
   carries `boundaryLimited: true` rather than pretending to be a point
   measurement. */
const PRIOR_SPREAD_FACTOR = 5;        // initial half-width, in prior SDs
/* The widening cap is ABSOLUTE, not a multiple of the prior SD.

   Capping at "40 prior SDs" sounds scale-free but is not: with a tight
   prior (sd = 0.1) it stops the grid at +/-4 in absolute terms, so data
   centred on an item of difficulty b = 5 can never be reached however many
   times the loop widens. Measured: a N(0, 0.1) prior with 1000 correct
   responses at b = 5 settled at 3.9998 +/- 0.0016 against a true posterior
   of 5.000 +/- 0.054 -- honestly flagged boundaryLimited, but still the
   wrong number when the right one was reachable. Theta is a logit scale;
   +/-100 logits is far past anything psychometrically meaningful. */
const MAX_ABSOLUTE_HALF_WIDTH = 100;
/* Resolution: step ~= prior SD / 8. The grid is sized from the PRIOR's
   width, but evidence narrows the POSTERIOR below it, so the effective
   resolution degrades over a long session -- measured discretisation error
   rose from ~1e-6 (one response) to ~1.6e-5 (ten) at sd/4. Nodes are
   cheap; halving the step quarters that error (it falls with step^2) for
   twice the arithmetic on an array of tens of elements. */
const STEPS_PER_PRIOR_SD = 8;
const MIN_GRID_POINTS = 41;
const MAX_GRID_POINTS = 801;          // bounds the cost in a request path
const EDGE_MASS_TOLERANCE = 1e-4;     // posterior mass allowed on the boundary
const MAX_WIDENING_ATTEMPTS = 10;
/* Below this, the log-likelihood is identical at every node to within
   floating-point noise, i.e. the data has not discriminated between any
   two candidate abilities. See criterion 3 in estimateWithAdaptiveGrid. */
const FLAT_LIKELIHOOD_EPSILON = 1e-9;
/* If the posterior spans fewer than this many grid steps, the grid cannot
   resolve its own answer and is re-measured around the located posterior.
   See the REFINEMENT note in estimateWithAdaptiveGrid. */
const MIN_STEPS_PER_POSTERIOR_SD = 8;
const POSTERIOR_REFINEMENT_SPREAD = 10;  // half-width, in posterior SDs

/* Probabilities are clamped away from exactly 0 and 1 before taking a
   log. A 3PL with c=0 at extreme theta genuinely returns 0 or 1 in
   floating point, and log(0) = -Infinity would poison the whole grid
   rather than just that node. */
const P_EPSILON = 1e-12;

function normalDensity(x, mean, sd) {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/* The LOG prior density, carried alongside the linear one.

   Re-centring only the likelihood in log space is a half-done fix. The
   prior weight is itself an exp() that underflows: at 40 prior SDs it is
   exp(-800), i.e. exactly 0 in a double. A posterior whose joint
   log-density peaks at a perfectly representable -1943 was therefore
   computed as 0 x 0 at every node and refused as "could not be
   normalised" -- measured on a N(0, 0.1) prior with 1000 correct
   responses to a b=5 item, whose true posterior is an unremarkable
   5.000 +/- 0.054. Prior and likelihood are now combined in log space and
   re-centred together, so only the JOINT has to be representable. */
function normalLogDensity(x, mean, sd) {
  const z = (x - mean) / sd;
  return -0.5 * z * z - Math.log(sd) - 0.5 * Math.log(2 * Math.PI);
}

/**
 * Is this a usable set of IRT parameters?
 *
 * schema.js validates `parameters` as an untyped object and nothing more,
 * so a calibration file can deliver arithmetically valid but
 * psychometrically meaningless values, and every one of them produces a
 * confident-looking estimate. Measured, all reported `supported: true`
 * with no warning: a = 0 returns the prior verbatim (the item carries no
 * information at all); a = -1 INVERTS the item, so twenty correct answers
 * reported theta = -2.214; c >= 1 makes the response certain regardless of
 * ability, again returning the prior. Excluded and warned about instead.
 */
export function itemParametersAreUsable(params) {
  if (!params || typeof params !== "object") return false;
  if (params.a !== undefined && !(Number.isFinite(params.a) && params.a > 0)) return false;
  if (params.b !== undefined && !Number.isFinite(params.b)) return false;
  if (params.c !== undefined && !(Number.isFinite(params.c) && params.c >= 0 && params.c < 1)) return false;
  return true;
}

/**
 * P(u = 1 | theta) under the 3PL family, which subsumes 2PL (c = 0) and
 * 1PL/Rasch (c = 0, a = 1). Missing parameters take those defaults, so a
 * Rasch parameter set carrying only `b` behaves exactly as Rasch.
 */
function itemProbability(theta, params) {
  const a = Number.isFinite(params?.a) ? params.a : 1;
  const b = Number.isFinite(params?.b) ? params.b : 0;
  const c = Number.isFinite(params?.c) ? params.c : 0;

  // 1 / (1 + exp(-x)) is written this way rather than via Math.exp(-x)
  // alone so that a large positive exponent saturates to 0 instead of
  // producing Infinity/Infinity = NaN.
  const x = a * (theta - b);
  const p = x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));

  return c + (1 - c) * p;
}

/**
 * The quadrature grid and its prior weights, derived from the SMV's own
 * declared priorDistribution (Day 16) rather than a hardcoded N(0,1).
 * Returns null when the prior family is one this module cannot build a
 * continuous grid for -- the caller turns that into an explicit
 * unsupported result rather than silently falling back to a default prior,
 * which would report a posterior the author never asked for.
 */
function buildQuadrature(smVariable, options = {}) {
  const prior = smVariable?.priorDistribution;
  const family = prior?.family;
  const params = prior?.params || {};
  const spreadFactor = Number.isFinite(options.spreadFactor)
    ? options.spreadFactor
    : PRIOR_SPREAD_FACTOR;

  let min;
  let max;
  let referenceSd;
  let densityAt;
  let logDensityAt;
  let canWiden;

  if (family === "normal") {
    const mean = Number.isFinite(params.mean) ? params.mean : 0;
    /* A declared-but-degenerate sd (0, negative, NaN) is refused rather
       than quietly replaced with 1. Substituting a default here would
       report a posterior against a prior the author never specified,
       under their variable's name. */
    if (params.sd !== undefined && !(Number.isFinite(params.sd) && params.sd > 0)) return null;
    const sd = Number.isFinite(params.sd) ? params.sd : 1;

    /* The grid is spanned by the PRIOR, deliberately not by the SMV's
       declared `scale`. `scale` states the range over which the variable
       is meaningful to the author -- it is not a quadrature parameter, and
       treating it as one is what let a wide declared scale destroy the
       resolution (see the header note). */
    min = mean - spreadFactor * sd;
    max = mean + spreadFactor * sd;
    referenceSd = sd;
    densityAt = (x) => normalDensity(x, mean, sd);
    logDensityAt = (x) => normalLogDensity(x, mean, sd);
    canWiden = true;
  } else if (family === "uniform") {
    const lo = Number.isFinite(params.min) ? params.min : null;
    const hi = Number.isFinite(params.max) ? params.max : null;
    if (lo === null || hi === null || !(hi > lo)) return null;
    min = lo;
    max = hi;
    /* Resolution for a uniform prior is driven by the LIKELIHOOD's scale,
       not the prior's own SD.

       The obvious choice -- (hi - lo) / sqrt(12), a uniform's actual SD --
       is subtly catastrophic: it is PROPORTIONAL TO THE SPAN, so the
       target step scales with the span too and the node count comes out
       at a constant 29 for every possible uniform prior. That is below
       MIN_GRID_POINTS, so the clamp always binds and every uniform prior
       silently gets a fixed 41 points -- exactly the "fixed count,
       variable step" design this whole block exists to avoid, reintroduced
       through the one branch the original fix did not touch. Measured on
       uniform [-20, 20] with 200 responses: a reported standard error of
       2e-19 for a true posterior SD of 0.0709.
       (Found by an adversarial review; see the regression tests.)

       Theta is on a logit scale, where an item response function varies
       over a range of roughly 1/a. A step near an eighth of a logit
       resolves any plausibly-discriminating item regardless of how wide
       the author drew the prior's support. */
    referenceSd = 1;
    densityAt = () => 1;
    logDensityAt = () => 0;
    // A uniform prior is exactly zero outside its support, so no amount of
    // likelihood can move the posterior past it -- widening is meaningless
    // here, and a boundary-limited result is a property of the prior the
    // author chose rather than a defect in the grid.
    canWiden = false;
  } else {
    return null;
  }

  /* An explicit re-centring, used by the refinement pass. Clamped to the
     prior's own support -- a uniform prior is exactly zero outside it, so
     a refined grid straying past it would carry no mass at all. */
  if (Number.isFinite(options.center) && Number.isFinite(options.halfWidth) && options.halfWidth > 0) {
    const lo = options.center - options.halfWidth;
    const hi = options.center + options.halfWidth;
    min = canWiden ? lo : Math.max(min, lo);
    max = canWiden ? hi : Math.min(max, hi);
  }

  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return null;

  /* Size by STEP, not by count. */
  let points;
  let resolutionLimited = false;
  if (Number.isInteger(options.gridPoints) && options.gridPoints >= 3) {
    // An explicit override is still capped: MAX_GRID_POINTS is a cost
    // bound on a request path, and an uncapped count overflowed the
    // argument limit of Math.max(...array) at ~1e5 nodes.
    points = Math.min(options.gridPoints, MAX_GRID_POINTS);
  } else {
    const targetStep = Number.isFinite(options.targetStep) && options.targetStep > 0
      ? options.targetStep
      : referenceSd / STEPS_PER_PRIOR_SD;
    const needed = Math.ceil(span / targetStep) + 1;
    points = Math.min(Math.max(needed, MIN_GRID_POINTS), MAX_GRID_POINTS);
    // When the cost cap binds, the step is coarser than the accuracy
    // target -- the caller is told rather than left to assume otherwise.
    resolutionLimited = needed > MAX_GRID_POINTS;
  }
  // An even count would straddle a symmetric prior's mean rather than
  // landing on it; an odd count keeps the centre as an actual node.
  if (points % 2 === 0) points += 1;

  const step = span / (points - 1);

  const nodes = [];
  const rawWeights = [];
  const logWeights = [];
  for (let i = 0; i < points; i += 1) {
    // Anchor the last node exactly on `max` rather than accumulating
    // `min + i * step`, so a uniform prior's declared endpoints survive
    // floating-point drift exactly.
    const theta = i === points - 1 ? max : min + i * step;
    nodes.push(theta);
    rawWeights.push(densityAt(theta));
    logWeights.push(logDensityAt(theta));
  }

  const totalWeight = rawWeights.reduce((acc, w) => acc + w, 0);
  if (!(totalWeight > 0) || !Number.isFinite(totalWeight)) return null;

  return {
    nodes,
    weights: rawWeights.map((w) => w / totalWeight),
    logWeights,
    meta: { min, max, step, points, referenceSd, spreadFactor, canWiden, resolutionLimited },
  };
}

/**
 * Estimate the posterior, widening the grid while meaningful probability
 * mass is still sitting on its boundary.
 *
 * This exists because a truncated posterior fails SILENTLY and in the
 * dangerous direction -- see the coverage note in the header constants.
 * When the grid cannot be widened further (a uniform prior's support, or
 * the maximum span), the result is still returned but carries
 * `boundaryLimited: true` so a caller can tell "the ability is at least
 * this high" apart from "the ability is this high".
 */
function estimateWithAdaptiveGrid(scoredObservations, smVariable, options = {}) {
  let spreadFactor = PRIOR_SPREAD_FACTOR;
  let last = null;

  for (let attempt = 0; attempt < MAX_WIDENING_ATTEMPTS; attempt += 1) {
    const quadrature = buildQuadrature(smVariable, { ...options, spreadFactor });
    if (!quadrature) return null;

    const result = estimateContinuousPosterior(scoredObservations, quadrature);
    if (!result) return null;

    const posterior = result.posterior;
    const n = posterior.length;

    /* THREE independent ways a grid can fail to contain the answer. The
       first was the only one originally checked, and on its own it is
       close to useless for a normal prior.

       1. EDGE MASS. Mass piled up on the outermost nodes.
       2. MODE AT THE BOUNDARY. For a normal prior the edge weights
          UNDERFLOW TO EXACTLY ZERO once the grid reaches ~40 SDs
          (exp(-800) is 0 in a double), so criterion 1 becomes identically
          0 <= tolerance and `boundaryLimited` could never fire at all --
          measured across ~2,700 normal-prior configurations, it never once
          did. A posterior whose MODE sits on the first or last node is
          truncated whatever its edge mass says.
       3. A FLAT LIKELIHOOD. If every node returns the same log-likelihood
          the data has not discriminated between any of them, so the
          posterior is just the prior wearing a measurement's clothes. This
          happens when the item parameters place all of the likelihood's
          mass outside the current grid entirely: every probability clamps
          to the same P_EPSILON floor, the likelihood goes flat, and -- the
          sharp edge -- edge mass then looks REASSURINGLY SMALL, so the
          condition that should have triggered widening was the one
          silencing it. Measured: a=3, b=14.5 returned 0.000 +/- 1.000
          (the prior verbatim, flagged `supported: true`) where the truth
          was 15.501 +/- 0.156. */
    const edgeMass = posterior[0] + posterior[n - 1];
    const modeAtBoundary = result.modeIndex === 0 || result.modeIndex === n - 1;
    const likelihoodIsFlat =
      scoredObservations.length > 0 && result.logLikelihoodRange < FLAT_LIKELIHOOD_EPSILON;

    const inadequate = edgeMass > EDGE_MASS_TOLERANCE || modeAtBoundary || likelihoodIsFlat;

    last = {
      ...result,
      edgeMass,
      gridMeta: quadrature.meta,
      modeAtBoundary,
      likelihoodIsFlat,
    };

    if (!inadequate) {
      /* REFINEMENT. The grid is sized from the PRIOR's width, but evidence
         narrows the POSTERIOR below it -- and a step chosen for the prior
         can be coarser than the whole posterior it is now trying to
         measure. Measured on a uniform [-20, 20] prior with 200 responses:
         a step of 0.125 against a true posterior SD of 0.0709, i.e. the
         grid could not resolve its own answer, reporting 0.0693 (2.3% low).
         Having located the posterior on the coarse pass, re-measure it on
         a grid centred and sized on the posterior itself. */
      const stepsAcrossPosterior = result.sd / quadrature.meta.step;

      if (stepsAcrossPosterior >= MIN_STEPS_PER_POSTERIOR_SD || !(result.sd > 0)) {
        return { ...last, boundaryLimited: false };
      }

      const refined = buildQuadrature(smVariable, {
        ...options,
        center: result.estimate,
        halfWidth: Math.max(result.sd * POSTERIOR_REFINEMENT_SPREAD, quadrature.meta.step),
        targetStep: result.sd / STEPS_PER_PRIOR_SD,
      });

      if (!refined) return { ...last, boundaryLimited: false };

      const remeasured = estimateContinuousPosterior(scoredObservations, refined);

      if (!remeasured) return { ...last, boundaryLimited: false };

      return {
        ...remeasured,
        edgeMass,
        gridMeta: refined.meta,
        modeAtBoundary: false,
        likelihoodIsFlat: false,
        boundaryLimited: false,
        refined: true,
      };
    }

    const halfWidth = spreadFactor * quadrature.meta.referenceSd;
    if (!quadrature.meta.canWiden || halfWidth >= MAX_ABSOLUTE_HALF_WIDTH) break;

    const maxSpreadFactor = MAX_ABSOLUTE_HALF_WIDTH / quadrature.meta.referenceSd;
    spreadFactor = Math.min(spreadFactor * 2, maxSpreadFactor);
  }

  /* Widened as far as allowed and the grid still does not contain the
     answer. A flat likelihood at this point means the estimate is the
     prior with no data in it -- that is not a measurement and must not be
     returned as one; the caller turns a null into an explicit refusal. */
  if (last?.likelihoodIsFlat) return null;

  return last ? { ...last, boundaryLimited: true } : null;
}

/**
 * Turn one stored session response into a scored 0/1 observation, or null
 * if it carries no usable information. See decisions 2 and 3 in the header
 * -- this is where direction is honoured and unmatched responses are
 * excluded rather than counted as wrong.
 */
function scoreResponse(response) {
  if (response?.activated !== true && response?.activated !== false) {
    return { u: null, reason: "indeterminate" };
  }

  const direction = response.direction;

  if (direction === "supports") return { u: response.activated ? 1 : 0 };
  if (direction === "weakens") return { u: response.activated ? 0 : 1 };
  if (direction === "neutral") return { u: null, reason: "neutral" };

  return { u: null, reason: "unknown-direction" };
}

/**
 * The weight a response's observable contributes to a CTT/sum/threshold
 * total. D49c: when an active compositeLibrary package contains the item,
 * the weight is the PACKAGE-BAKED value (ADR 0003 / 0003a). A live Task
 * Model edit must not quietly reweight a compiled observable.
 *
 * When there is no active package, Identification has already refused a
 * new score on the submit path. This function can still be reached from
 * accumulation unit tests that never compiled a package; those keep the
 * pre-D49c Task Model lookup so the CTT arithmetic stays independently
 * testable. That fallback is not a scoring-path substitute for the
 * package — a package that exists but does not contain the item is NOT
 * walked back to the live Task Model.
 *
 * A response whose package entry (or, with no package, whose Task Model
 * entry) omits `weight` defaults to 1, an ordinary EQUAL contribution.
 * A weight that IS declared but is zero, negative or non-finite is a
 * real authoring defect and is refused rather than defaulted.
 */
function resolveObservationWeight(response, db) {
  const item = (db.items || []).find((i) => i.id === response.itemId);

  if (item?.taskModelId) {
    const pkg = activePackageFor(item.taskModelId, db);
    if (pkg) {
      const packaged = packageEntryFor(pkg, item.id);
      if (!packaged) return { weight: 1 };
      if (packaged.weight === undefined || packaged.weight === null) return { weight: 1 };
      if (!(Number.isFinite(packaged.weight) && packaged.weight > 0)) return { invalid: true };
      return { weight: packaged.weight };
    }
  }

  if (!item) return { weight: 1 };

  const taskModel = (db.taskModels || []).find((tm) => tm.id === item.taskModelId);
  if (!taskModel) return { weight: 1 };

  const entry = (taskModel.expectedObservations || []).find(
    (eo) => eo.observationId === response.observationId
  );
  if (!entry || entry.weight === undefined) return { weight: 1 };

  if (!(Number.isFinite(entry.weight) && entry.weight > 0)) return { invalid: true };

  return { weight: entry.weight };
}

/**
 * CTT / sum / threshold: a weighted proportion-correct score (0 to 1),
 * with an Agresti-Coull-adjusted standard error rather than the textbook
 * Wald SE = sqrt(p(1-p)/n).
 *
 * The Wald SE is EXACTLY ZERO whenever every response so far agrees --
 * all correct or all incorrect -- regardless of how few responses that is,
 * because p(1-p) is 0 at p=0 or p=1. Reporting a standard error of 0 after
 * a single correct response would be a confidently wrong number of
 * exactly the kind this whole file exists to prevent: a student who has
 * answered one easy item correctly is not measured to infinite precision.
 * Agresti & Coull's fix (1998) -- add two pseudo-successes and two
 * pseudo-failures before computing the variance, while still reporting the
 * unadjusted observed proportion as the point estimate -- is the standard
 * textbook remedy for exactly this failure mode, not an invented
 * correction; it degrades gracefully to the familiar sqrt(p(1-p)/n) shape
 * as the effective sample size grows.
 *
 * Day 39 (adversarial review, P0-2): the pseudo-count denominator is
 * KISH'S EFFECTIVE SAMPLE SIZE, (Sw)^2 / S(w^2), not the raw weight sum
 * `Sw` a first pass used. `weight` here is `resolveObservationWeight()`'s
 * per-observable ALLOCATION SHARE -- schema.js requires a Task Model's
 * `expectedObservations[].weight` to sum to exactly 1 across the whole
 * model ("Observable weights must sum to 1") -- so `Sw` is architecturally
 * fixed near 1 regardless of how many responses were actually scored.
 * Using it as `nEff` froze the reported SE at the SAME number for 5, 20,
 * and 50 correct responses to a five-observable Task Model (measured:
 * 0.2191 in every case) -- fifty items reported no more precise than one --
 * and, in the opposite direction, an author using points-style weights
 * above 1 (a Task Model where that is legal) shrank the SE by the weight
 * itself, reporting confidence a handful of high-weight responses never
 * earned (measured: a weight of 10 on 3 responses reported an SE 4.2x too
 * narrow). Kish's nEff is the standard fix for a weighted-proportion's
 * effective sample size: it reduces to exactly `n` for any UNIFORM
 * weighting (1 each, or 1/n each, or any other constant), which is why
 * neither symptom above showed up in this file's original test fixtures
 * (all of which used `weight: 1` throughout), and degrades correctly for
 * genuinely mixed weights in between.
 */
function estimateRawScore(scoredObservations) {
  const totalWeight = scoredObservations.reduce((acc, o) => acc + o.weight, 0);
  if (!(totalWeight > 0)) return null;

  const weightedCorrect = scoredObservations.reduce((acc, o) => acc + o.weight * o.u, 0);
  const estimate = weightedCorrect / totalWeight;

  const sumSquaredWeight = scoredObservations.reduce((acc, o) => acc + o.weight * o.weight, 0);
  const nEff = (totalWeight * totalWeight) / sumSquaredWeight;

  const pTilde = (nEff * estimate + 2) / (nEff + 4);
  const variance = (pTilde * (1 - pTilde)) / (nEff + 4);
  const sd = Math.sqrt(Math.max(variance, 0));

  if (!Number.isFinite(estimate) || !Number.isFinite(sd)) return null;

  return { estimate, sd };
}

/**
 * EAP (expected a posteriori) estimate of a continuous SMV, with its
 * posterior standard deviation as the precision.
 *
 * The likelihood is accumulated in LOG space and the maximum subtracted
 * before exponentiating. With even a few dozen items the raw product of
 * probabilities underflows to exactly 0 at every node, at which point the
 * normalisation is 0/0 and the estimate is NaN -- or, worse in a language
 * that tolerates it, silently the prior mean. Working in log space and
 * re-centring keeps the whole grid representable however long the session
 * gets.
 */
function estimateContinuousPosterior(scoredObservations, quadrature) {
  const { nodes, weights } = quadrature;

  const logLikelihood = nodes.map((theta) =>
    scoredObservations.reduce((acc, obs) => {
      const p = itemProbability(theta, obs.params);
      const clamped = Math.min(Math.max(p, P_EPSILON), 1 - P_EPSILON);
      return acc + (obs.u === 1 ? Math.log(clamped) : Math.log(1 - clamped));
    }, 0)
  );

  let maxLogLikelihood = -Infinity;
  let minLogLikelihood = Infinity;
  for (const ll of logLikelihood) {
    if (ll > maxLogLikelihood) maxLogLikelihood = ll;
    if (ll < minLogLikelihood) minLogLikelihood = ll;
  }

  /* Combine prior and likelihood in LOG space and re-centre the JOINT, so
     that only the joint density has to be representable. Re-centring the
     likelihood alone (and multiplying by a linear prior weight that has
     itself underflowed to 0) is the half-done version -- see
     normalLogDensity's note. `logWeights` is absent only for a
     hand-constructed quadrature in a unit test, where the linear weights
     are well-scaled by construction. */
  const logPrior = quadrature.logWeights;

  const logJoint = logPrior
    ? logLikelihood.map((ll, i) => ll + logPrior[i])
    : logLikelihood.map((ll, i) => ll + Math.log(weights[i]));

  let maxLogJoint = -Infinity;
  for (const lj of logJoint) if (lj > maxLogJoint) maxLogJoint = lj;

  if (!Number.isFinite(maxLogJoint)) return null;

  const unnormalized = logJoint.map((lj) => Math.exp(lj - maxLogJoint));

  const total = unnormalized.reduce((acc, v) => acc + v, 0);

  if (!(total > 0) || !Number.isFinite(total)) return null;

  const posterior = unnormalized.map((v) => v / total);

  const estimate = nodes.reduce((acc, theta, i) => acc + theta * posterior[i], 0);

  const variance = nodes.reduce(
    (acc, theta, i) => acc + (theta - estimate) ** 2 * posterior[i],
    0
  );

  // Guard against a tiny negative from floating-point cancellation before
  // taking a square root.
  const sd = Math.sqrt(Math.max(variance, 0));

  if (!Number.isFinite(estimate) || !Number.isFinite(sd)) return null;

  /* The index of the posterior mode, and how flat the likelihood was
     across the whole grid. Both are diagnostics the adaptive wrapper needs
     to tell "this grid contains the answer" from "this grid is nowhere
     near it" -- see estimateWithAdaptiveGrid. */
  let modeIndex = 0;
  for (let i = 1; i < posterior.length; i += 1) {
    if (posterior[i] > posterior[modeIndex]) modeIndex = i;
  }

  return {
    estimate,
    sd,
    posterior,
    modeIndex,
    logLikelihoodRange: maxLogLikelihood - minLogLikelihood,
  };
}

/**
 * Accumulate every usable response in a session into a posterior for the
 * Student Model Variable they inform.
 *
 * Returns `{ posteriors, warnings }`. A posterior is only ever produced
 * for a case this module can compute CORRECTLY; every other case appears
 * as an entry with `supported: false` and a stated reason. That asymmetry
 * is deliberate and is the single most important property of this file:
 * an unsupported model family, an unresolvable parameter set, or an
 * ambiguous SMV binding must never come back as a plausible number.
 *
 * @param {object} session - a sessions record, with `responses[]`
 * @param {object} db - the full db snapshot
 * @param {{ gridPoints?: number }} [options]
 * @returns {{ posteriors: object[], warnings: string[] }}
 */
export function accumulateEvidence(session, db, options = {}) {
  if (!session) throw new Error("accumulateEvidence requires a session.");
  if (!db) throw new Error("accumulateEvidence requires a db snapshot.");

  const warnings = [];
  const responses = (session.responses || []).filter((r) => r && r.itemId);

  if (responses.length === 0) {
    return { posteriors: [], warnings };
  }

  /* Group by the Evidence Model each response was scored through. A
     session can legitimately span several. */
  const byEvidenceModel = new Map();
  for (const r of responses) {
    if (!r.evidenceModelId) {
      warnings.push(`Response for item '${r.itemId}' has no evidenceModelId and cannot be accumulated.`);
      continue;
    }
    if (!byEvidenceModel.has(r.evidenceModelId)) byEvidenceModel.set(r.evidenceModelId, []);
    byEvidenceModel.get(r.evidenceModelId).push(r);
  }

  const posteriors = [];

  for (const [evidenceModelId, group] of byEvidenceModel) {
    const evidenceModel = (db.evidenceModels || []).find((em) => em.id === evidenceModelId);

    if (!evidenceModel) {
      posteriors.push({
        evidenceModelId,
        supported: false,
        reason: `Evidence model '${evidenceModelId}' not found.`,
      });
      continue;
    }

    /* Day 38 (Week 8): PILOT-VS-CALIBRATED SPLIT (build reference Part
       0.2). Before this day, a response with no `parameterSetId` could not
       reach this file at all -- sessionRoutes.js's /submit refused to
       deliver any item whose Evidence Model had no active CALIBRATED
       parameter set, full stop. That made the whole dependency chain
       circular: R calibration needs a real response matrix (Part 0.2's
       diagram), a response matrix needs items to be deliverable, and items
       could not be delivered until calibration had already happened.
       sessionRoutes.js now lets a continuous-family item score against the
       Item Wizard's own pilot `psychometrics.irtParams` (Step 7) when no
       calibrated parameter set exists yet, tagging the response
       `parameterSource: "pilot"` instead of `"calibrated"`, and a
       raw-score-family item (CTT/sum/threshold) needs no parameter set at
       all -- it has never read one, `accumulateRawScoreFamily` below takes
       only Task Model weights -- so it is tagged `"not-applicable"`.
       A response predating this field carries neither `parameterSource`
       nor an absent `parameterSetId` together (the old gate guaranteed
       one), so it is treated as `"calibrated"` for backward compatibility.

       Responses in one group may in principle cite different parameter
       sets (a session that spanned a recalibration), or even mix pilot and
       calibrated evidence for the same Evidence Model (a session that
       started before a recalibration finished). Neither is silently
       averaged over -- both are refused explicitly, for the same reason
       the original mixed-parameterSetId check existed: a single posterior
       over evidence measured two different ways is not interpretable.

       Day 39 (adversarial review, P2-9 and P2-10 -- both KNOWN, both
       DEFERRED rather than fixed, documented here on purpose rather than
       silently left):

       P2-9: `effectiveSource` returns `null` for a response with neither
       `parameterSource` nor `parameterSetId` at all (fully untagged, hand-
       edited or otherwise malformed data -- distinct from the "predating
       this field" case immediately above, which always has a
       `parameterSetId`). `.filter(Boolean)` then drops that `null` from
       `parameterSources` entirely, so an untagged response is silently
       absorbed into whatever source the rest of the group resolves to
       instead of being flagged as its own ambiguous source. Low blast
       radius (this shape of response should not occur post-migration) and
       fixing it well means choosing new refusal UX for a fourth kind of
       "source", so it is left as a known gap rather than rushed in.

       P2-10: a raw-score (CTT/sum/threshold) response scored before this
       field existed also has `effectiveSource(r) === null` (no
       `parameterSetId` either -- raw-score has never used one), so a
       GROUP consisting ENTIRELY of such legacy responses falls through to
       `parameterSources.length === 0` and hits the final ambiguous-
       source refusal below, even though raw-score families need no
       parameterSource at all to be resolved unambiguously. Reachable only
       for a session with multiple Evidence Models where one receives a
       response after this deploy and another has only pre-deploy raw-
       score responses; non-fatal (a spurious `supported: false` entry for
       that one Evidence Model, not a blocked submission) and the window
       shrinks as old sessions close out. Left deferred for the same
       reason as P2-9: fixing it requires first computing the Evidence
       Model's family before this grouping step so a legacy raw-score
       response can default to `"not-applicable"` rather than `null`,
       which is a larger reordering than this pass's other fixes. */
    const effectiveSource = (r) => r.parameterSource || (r.parameterSetId ? "calibrated" : null);
    const parameterSources = [...new Set(group.map(effectiveSource).filter(Boolean))];

    if (parameterSources.length > 1) {
      posteriors.push({
        evidenceModelId,
        supported: false,
        reason: `Responses for evidence model '${evidenceModelId}' were scored under ${parameterSources.length} different parameter sources (${parameterSources.join(", ")}); a single posterior mixing pilot and calibrated evidence would not be interpretable.`,
      });
      continue;
    }

    const parameterSource = parameterSources[0] || null;
    const parameterSetIds = [...new Set(group.map((r) => r.parameterSetId).filter(Boolean))];

    if (parameterSource === "pilot") {
      if (parameterSetIds.length > 0) {
        posteriors.push({
          evidenceModelId,
          supported: false,
          reason: `Responses for evidence model '${evidenceModelId}' are tagged parameterSource 'pilot' but also carry a parameterSetId; refusing rather than guessing which is authoritative.`,
        });
        continue;
      }
    } else if (parameterSource === "calibrated") {
      if (parameterSetIds.length === 0) {
        posteriors.push({
          evidenceModelId,
          supported: false,
          reason: `No response for evidence model '${evidenceModelId}' records the parameterSetId it was scored against.`,
        });
        continue;
      }

      if (parameterSetIds.length > 1) {
        posteriors.push({
          evidenceModelId,
          supported: false,
          reason: `Responses for evidence model '${evidenceModelId}' cite ${parameterSetIds.length} different parameter sets (${parameterSetIds.join(", ")}); a single posterior over mixed calibrations would not be interpretable.`,
        });
        continue;
      }
    }

    const parameterSetId = parameterSetIds[0] || null;

    /* Resolve the statistical model. A calibrated (or legacy, undated)
       group is resolved STRICTLY by the parameter set the responses were
       scored against -- decision 1 in the header, unchanged, and a
       parameterSetId that does not resolve is refused outright rather than
       silently redirected to whichever statistical model happens to be
       active (that would report a posterior against a DIFFERENT
       calibration than the one the response actually cites). A pilot or
       not-applicable group carries no parameterSetId to resolve from AT
       ALL -- that is the whole distinction -- so only THAT case falls back
       to the Evidence Model's own ACTIVE statistical model, the same
       resolution sessionRoutes.js already used to decide which family an
       item belongs to at submit time. */
    let statisticalModel;

    if (parameterSetId) {
      statisticalModel = (evidenceModel.statisticalModels || []).find((sm) =>
        (sm.parameterSets || []).some((ps) => ps.parameterSetId === parameterSetId)
      );

      if (!statisticalModel) {
        posteriors.push({
          evidenceModelId,
          parameterSetId,
          supported: false,
          reason: `No statistical model on evidence model '${evidenceModelId}' owns parameter set '${parameterSetId}'.`,
        });
        continue;
      }
    } else if (parameterSource === "pilot" || parameterSource === "not-applicable") {
      statisticalModel = (evidenceModel.statisticalModels || []).find((sm) => sm.active);

      if (!statisticalModel) {
        posteriors.push({
          evidenceModelId,
          parameterSetId: null,
          supported: false,
          reason: `Evidence model '${evidenceModelId}' has no active statistical model to resolve '${parameterSource}' evidence against.`,
        });
        continue;
      }
    } else {
      // No response in this group recorded EITHER a parameterSetId or a
      // parameterSource -- a genuinely ambiguous group this module refuses
      // to guess about, matching this file's standing rule throughout.
      posteriors.push({
        evidenceModelId,
        supported: false,
        reason: `No response for evidence model '${evidenceModelId}' records the parameterSetId it was scored against.`,
      });
      continue;
    }

    const family = statisticalModel.type;

    if (
      !CONTINUOUS_MODEL_FAMILIES.includes(family) &&
      !RAW_SCORE_MODEL_FAMILIES.includes(family) &&
      !DIAGNOSTIC_MODEL_FAMILIES.includes(family)
    ) {
      /* The per-family dispatch the build reference calls for. Bayesian-
         network updating is still ahead; until it exists, saying so is the
         only honest output. */
      posteriors.push({
        evidenceModelId,
        parameterSetId,
        modelFamily: family,
        supported: false,
        reason: `Accumulation for the '${family}' model family is not implemented yet; no estimate is produced.`,
      });
      continue;
    }

    if (RAW_SCORE_MODEL_FAMILIES.includes(family)) {
      posteriors.push(
        accumulateRawScoreFamily({ evidenceModelId, parameterSetId, parameterSource, family, evidenceModel, statisticalModel, group, db, warnings })
      );
      continue;
    }

    if (DIAGNOSTIC_MODEL_FAMILIES.includes(family) && !parameterSetId) {
      /* D53b gave 'dina' an item-level pilot field
         (`psychometrics.dinaParams`, the slip/guess analogue of
         `psychometrics.irtParams`), mirroring the IRT pilot-vs-calibrated
         split (Day 38). 'gdina' still has none -- a saturated probability
         table sized to each item's own required-attribute count is real
         new authoring surface, not this unit's scope, so it is refused
         exactly as before, honestly, rather than invented. */
      if (family === "dina" && parameterSource === "pilot") {
        /* Same discipline as the continuous branch below: read each
           response's PINNED `r.pilotParams` snapshot (sessionRoutes.js),
           never the item's CURRENT `psychometrics.dinaParams` -- an
           author editing an item's pilot slip/guess after the fact must
           not silently rewrite a past session's historical posterior. A
           synthetic parameterSet built from those pins lets
           accumulateAttributeMastery run completely unchanged: it already
           does not care whether `parameterSet.parameters` came from a
           persisted calibration or was assembled here. */
        const pilotParameters = {};
        for (const r of group) {
          if (r.pilotParams) pilotParameters[r.itemId] = r.pilotParams;
        }

        posteriors.push(
          ...accumulateAttributeMastery({
            evidenceModelId, parameterSetId: null, parameterSource, family, evidenceModel, statisticalModel,
            parameterSet: { parameterSetId: null, parameters: pilotParameters }, group, db, warnings, scoreResponse,
          })
        );
        continue;
      }

      posteriors.push({
        evidenceModelId,
        modelFamily: family,
        supported: false,
        reason: family === "gdina"
          ? `Evidence model '${evidenceModelId}' has no active calibrated parameter set. Pilot parameters are not yet supported for the 'gdina' family (no item-level pilot probability-table field exists) -- a 'dina' item with pinned pilot slip/guess, or a continuous (IRT/Rasch) item, can score against pilot values today.`
          : `Evidence model '${evidenceModelId}' has no active calibrated parameter set, and these responses carry no pinned pilot parameters (parameterSource '${parameterSource}').`,
      });
      continue;
    }

    const parameterSet = (statisticalModel.parameterSets || []).find(
      (ps) => ps.parameterSetId === parameterSetId
    );

    if (DIAGNOSTIC_MODEL_FAMILIES.includes(family)) {
      // Returns one entry PER ATTRIBUTE, not one per evidence model.
      posteriors.push(
        ...accumulateAttributeMastery({
          evidenceModelId, parameterSetId, parameterSource, family, evidenceModel, statisticalModel,
          parameterSet, group, db, warnings, scoreResponse,
        })
      );
      continue;
    }

    /* Which SMV does this inform? Nothing in the schema yet declares the
       observable -> SMV binding (that is Day 34). Until it does, the only
       case that can be resolved WITHOUT GUESSING is a competency model
       carrying exactly one continuous SMV. Anything else is refused. */
    const smvResolution = resolveSmVariable(evidenceModel, statisticalModel, db, ["continuous"]);

    if (!smvResolution.smVariable) {
      posteriors.push({
        evidenceModelId,
        parameterSetId,
        modelFamily: family,
        supported: false,
        reason: smvResolution.reason,
      });
      continue;
    }

    const smVariable = smvResolution.smVariable;
    const competencyModelId = smvResolution.competencyModelId;
    const quadrature = buildQuadrature(smVariable, options);

    if (!quadrature) {
      posteriors.push({
        evidenceModelId,
        parameterSetId,
        modelFamily: family,
        smvId: smVariable.id,
        competencyModelId,
        supported: false,
        reason: `Student Model Variable '${smVariable.id}' has no prior distribution this module can build a continuous quadrature grid from (family '${smVariable.priorDistribution?.family}').`,
      });
      continue;
    }

    /* Score each response and attach its item parameters. */
    const scoredObservations = [];
    let excluded = 0;

    for (const r of group) {
      const { u, reason } = scoreResponse(r);

      if (u === null) {
        excluded += 1;
        if (reason === "unknown-direction") {
          warnings.push(`Response for item '${r.itemId}' has no usable evidence-rule direction ('${r.direction}') and was excluded.`);
        }
        continue;
      }

      /* Day 38: a PILOT-sourced group has no parameterSet at all -- its
         numbers live on the RESPONSE itself (`r.pilotParams`), a snapshot
         `sessionRoutes.js` took of the item's pilot
         `psychometrics.irtParams` (Item Wizard Step 7) at the moment this
         response was scored -- Day 39 (adversarial review, P0-3). Reading
         the item's CURRENT pilot values here instead (as a first pass did)
         let an author's later edit to an item's pilot a/b silently rewrite
         every past session's historical posterior on its next accumulation
         pass, since this function recomputes from `session.responses` on
         every call. `r.pilotParams` absent on an older response (scored
         before Day 39) is handled the same as any other missing-parameters
         case below -- excluded with a warning, not a crash. A CALIBRATED
         (or legacy) group is unchanged: the parameter set's own
         `parameters[observableId]` map, exactly as before Day 38. */
      let params;
      let sourceLabel;

      if (parameterSource === "pilot") {
        params = r.pilotParams;
        sourceLabel = `response for item '${r.itemId}''s pinned pilot parameters`;
      } else {
        const resolved = calibratedIrtParams(parameterSet, {
          observableId: r.observableId,
          itemId: r.itemId,
        });
        params = resolved.params;
        sourceLabel = `parameter set '${parameterSetId}'`;
      }

      if (!params) {
        excluded += 1;
        warnings.push(`${sourceLabel[0].toUpperCase()}${sourceLabel.slice(1)} has no parameters for observable '${r.observableId}'; that response was excluded.`);
        continue;
      }

      if (!itemParametersAreUsable(params)) {
        excluded += 1;
        warnings.push(`${sourceLabel[0].toUpperCase()}${sourceLabel.slice(1)} has unusable IRT parameters for observable '${r.observableId}' (a must be > 0, c in [0,1)); that response was excluded.`);
        continue;
      }

      scoredObservations.push({ u, params, observableId: r.observableId, itemId: r.itemId });
    }

    if (scoredObservations.length === 0) {
      posteriors.push({
        evidenceModelId,
        parameterSetId,
        modelFamily: family,
        smvId: smVariable.id,
        competencyModelId,
        supported: false,
        reason: `No response for evidence model '${evidenceModelId}' carried usable directional evidence; the prior is unchanged, so no posterior is reported.`,
      });
      continue;
    }

    const result = estimateWithAdaptiveGrid(scoredObservations, smVariable, options);

    if (!result) {
      posteriors.push({
        evidenceModelId,
        parameterSetId,
        modelFamily: family,
        smvId: smVariable.id,
        competencyModelId,
        supported: false,
        reason: "The posterior could not be normalised (no quadrature node carried usable probability mass).",
      });
      continue;
    }

    posteriors.push({
      smvId: smVariable.id,
      smvType: smVariable.type,
      evidenceModelId,
      parameterSetId,
      parameterSource: parameterSource || "calibrated",
      modelFamily: family,
      competencyModelId,
      method: "eap",
      supported: true,
      estimate: result.estimate,
      // Posterior SD -- the standard error of the EAP estimate. Reported
      // under both names because "precision" is the contract the build
      // reference states and "sem" is what a psychometrician will look for.
      precision: result.sd,
      sem: result.sd,
      responsesUsed: scoredObservations.length,
      responsesExcluded: excluded,
      /* True when the posterior still had meaningful mass on the widest
         grid's boundary -- the estimate is then a bound, not a point
         measurement, and the precision beside it understates the real
         uncertainty. Callers that report an estimate to a human should
         say so. */
      boundaryLimited: result.boundaryLimited === true,
      // Day 39 (adversarial review, P2-8): was computed by
      // estimateWithAdaptiveGrid but never copied onto the pushed
      // posterior, so applyPosteriorsToSession's `posterior.refined ===
      // true` read always saw `undefined` and every persisted posterior
      // silently reported `refined: false` -- a diagnostic that exists
      // specifically to distinguish the coarse-pass grid from the
      // posterior-adaptive REFINEMENT pass (see estimateWithAdaptiveGrid's
      // own REFINEMENT comment) was permanently uninformative.
      refined: result.refined === true,
    });
  }

  /* Day 39 (adversarial review, P0-1): a Student Model Variable can be
     targeted by more than one Evidence Model on the same competency model
     (e.g. two unidimensional Evidence Models both resolving to the
     session's one continuous SMV, via resolveSmVariable's own documented
     fallback). Grouping is per-EVIDENCE-MODEL above, so each such group
     independently computes and pushes ITS OWN "supported: true" posterior
     for the SAME smvId -- and applyPosteriorsToSession persists by smvId
     alone (schema.js's smvPosteriors is an object keyed by smvId), so
     whichever group happens to come last in Map insertion order silently
     OVERWRITES the other's posterior, with no warning and no trace beyond
     `responsesUsed` under-counting the session's real response total.
     Measured: two Evidence Models scored 4-correct/4-incorrect on
     identical items persisted +1.15 or -1.15 depending purely on which
     group iterated last, when the honest joint answer is 0.

     attributeAccumulation.js already refuses the analogous collision for a
     duplicated Q-matrix attribute (`duplicateAttribute`, "the second
     silently overwrites the first") -- this applies that same doctrine
     here: any smvId claimed by more than one SUPPORTED posterior is
     refused for ALL of the colliding groups, rather than silently letting
     one win. Pooling the evidence across Evidence Models into a single
     joint posterior would be the more complete fix, but is a real
     redesign of the per-evidence-model grouping above; refusing is the
     conservative, correct-over-convenient choice until that redesign
     happens -- an honest "not computed" is always safer than a
     confidently wrong number, which is this whole file's standing rule. */
  const supportedBySmvId = new Map();
  for (const p of posteriors) {
    if (!p.supported || !p.smvId) continue;
    if (!supportedBySmvId.has(p.smvId)) supportedBySmvId.set(p.smvId, []);
    supportedBySmvId.get(p.smvId).push(p);
  }

  for (const [smvId, claimants] of supportedBySmvId) {
    if (claimants.length <= 1) continue;

    const evidenceModelIds = [...new Set(claimants.map((c) => c.evidenceModelId))];
    const reason = `Student Model Variable '${smvId}' is targeted by ${evidenceModelIds.length} different Evidence Models in this session's responses (${evidenceModelIds.join(", ")}), which would each compute their own posterior for the same variable. Persisting either one would silently discard the other's evidence, so neither is reported as supported.`;

    for (const claimant of claimants) {
      claimant.supported = false;
      claimant.reason = reason;
      delete claimant.estimate;
      delete claimant.precision;
      delete claimant.sem;
      delete claimant.method;
      delete claimant.boundaryLimited;
      delete claimant.refined;
    }
  }

  return { posteriors, warnings };
}

/**
 * Day 33 (Week 7): write an accumulateEvidence() result onto a session's
 * persisted student model, at `session.studentModel.smvPosteriors[smvId]`.
 * See schema.js's `sessions` deep validation for the shape this produces
 * and validates identically -- the "one pointer, validated on both sides"
 * invariant (Part 1.3) applied here.
 *
 * Deliberately still pure (mutates and returns the SESSION OBJECT, no
 * database or HTTP concern) -- matching every other function in this file,
 * and matching evidenceIdentification.js's own precedent of stopping at
 * "here is the record to store," with the actual persistence call left to
 * the route that owns the request lifecycle (Day 34: wiring this into
 * sessionRoutes.js's item-based /submit path).
 *
 * Only a `supported: true` posterior is written. A refusal
 * (`supported: false`) is silence about that SMV, not a claim that its
 * ability is now unknown or zero -- overwriting a real prior measurement
 * with "no measurement" would throw away information the refusal itself
 * did not invalidate. Whatever posterior was persisted from an earlier,
 * successful accumulation step is left exactly as it was.
 */
export function applyPosteriorsToSession(session, accumulationResult, options = {}) {
  if (!session) throw new Error("applyPosteriorsToSession requires a session.");
  if (!accumulationResult) throw new Error("applyPosteriorsToSession requires an accumulateEvidence() result.");

  const updatedAt = options.now || new Date().toISOString();

  if (!session.studentModel) session.studentModel = {};
  if (!session.studentModel.smvPosteriors) session.studentModel.smvPosteriors = {};

  for (const posterior of accumulationResult.posteriors || []) {
    if (!posterior.supported) continue;

    session.studentModel.smvPosteriors[posterior.smvId] = {
      smvId: posterior.smvId,
      smvType: posterior.smvType,
      evidenceModelId: posterior.evidenceModelId,
      parameterSetId: posterior.parameterSetId,
      // Day 38: "calibrated" | "pilot" | "not-applicable" -- see the
      // pilot-vs-calibrated split note in accumulateEvidence(). Defaulted
      // to "calibrated" for a posterior computed before this field
      // existed, matching every response persisted under the old,
      // calibrated-only gate.
      parameterSource: posterior.parameterSource || "calibrated",
      modelFamily: posterior.modelFamily,
      method: posterior.method,
      estimate: posterior.estimate,
      precision: posterior.precision,
      sem: posterior.sem,
      responsesUsed: posterior.responsesUsed,
      responsesExcluded: posterior.responsesExcluded,
      boundaryLimited: posterior.boundaryLimited === true,
      refined: posterior.refined === true,
      updatedAt,
    };
  }

  return session;
}

/**
 * Day 31 scope: resolve the SMV a statistical model updates, WITHOUT
 * guessing. An explicit binding is honoured if one is present (forward-
 * compatible with Day 34, which makes that binding a real, validated
 * field); otherwise the only unambiguous case is a competency model with
 * exactly one SMV whose type is in `allowedTypes` -- `["continuous"]` for
 * IRT/Rasch, or the three ORDERED types for CTT/sum/threshold (see
 * RAW_SCORE_SMV_TYPES).
 */
function resolveSmVariable(evidenceModel, statisticalModel, db, allowedTypes) {
  const competency = (db.competencies || []).find((c) => c.id === evidenceModel.competencyId);

  if (!competency) {
    return { reason: `Evidence model '${evidenceModel.id}' references competency '${evidenceModel.competencyId}', which was not found.` };
  }

  const competencyModel = (db.competencyModels || []).find((m) => m.id === competency.modelId);

  if (!competencyModel) {
    return { reason: `Competency '${competency.id}' references competency model '${competency.modelId}', which was not found.` };
  }

  const smVariables = competencyModel.smVariables || [];

  if (smVariables.length === 0) {
    return { reason: `Competency model '${competencyModel.id}' declares no smVariables, so there is nothing to accumulate into.` };
  }

  const typeList = allowedTypes.join("/");
  const declaredId = statisticalModel.structureConfig?.smvId;

  if (declaredId) {
    const bound = smVariables.find((smv) => smv.id === declaredId);
    if (!bound) {
      return { reason: `Statistical model '${statisticalModel.id}' declares smvId '${declaredId}', which competency model '${competencyModel.id}' does not define.` };
    }
    if (!allowedTypes.includes(bound.type)) {
      return { reason: `Statistical model '${statisticalModel.id}' is a '${statisticalModel.type}' family but is bound to '${bound.id}', a '${bound.type}' Student Model Variable (expected one of: ${typeList}).` };
    }
    return { smVariable: bound, competencyModelId: competencyModel.id };
  }

  const candidates = smVariables.filter((smv) => allowedTypes.includes(smv.type));

  if (candidates.length === 1) return { smVariable: candidates[0], competencyModelId: competencyModel.id };

  if (candidates.length === 0) {
    return { reason: `Competency model '${competencyModel.id}' declares no ${typeList} Student Model Variable for a '${statisticalModel.type}' model to update.` };
  }

  return {
    reason: `Competency model '${competencyModel.id}' declares ${candidates.length} ${typeList} Student Model Variables and statistical model '${statisticalModel.id}' does not say which it updates (structureConfig.smvId). Refusing to guess.`,
  };
}

/**
 * The CTT/sum/threshold counterpart of the continuous branch inline in
 * accumulateEvidence. Pulled into its own function because it shares the
 * response-scoring and SMV-resolution conventions but not the quadrature
 * grid machinery -- there is no prior distribution or likelihood surface
 * here, only a (possibly weighted) observed proportion.
 */
function accumulateRawScoreFamily({ evidenceModelId, parameterSetId, parameterSource, family, evidenceModel, statisticalModel, group, db, warnings }) {
  const smvResolution = resolveSmVariable(evidenceModel, statisticalModel, db, RAW_SCORE_SMV_TYPES);

  if (!smvResolution.smVariable) {
    return { evidenceModelId, parameterSetId, modelFamily: family, supported: false, reason: smvResolution.reason };
  }

  const smVariable = smvResolution.smVariable;
  const competencyModelId = smvResolution.competencyModelId;

  const scoredObservations = [];
  let excluded = 0;

  for (const r of group) {
    const { u, reason } = scoreResponse(r);

    if (u === null) {
      excluded += 1;
      if (reason === "unknown-direction") {
        warnings.push(`Response for item '${r.itemId}' has no usable evidence-rule direction ('${r.direction}') and was excluded.`);
      }
      continue;
    }

    const { weight, invalid } = resolveObservationWeight(r, db);

    if (invalid) {
      excluded += 1;
      warnings.push(`Task Model for item '${r.itemId}' declares a non-positive or invalid weight for observable '${r.observableId}'; that response was excluded.`);
      continue;
    }

    scoredObservations.push({ u, weight, observableId: r.observableId, itemId: r.itemId });
  }

  if (scoredObservations.length === 0) {
    return {
      evidenceModelId,
      parameterSetId,
      modelFamily: family,
      smvId: smVariable.id,
      competencyModelId,
      supported: false,
      reason: `No response for evidence model '${evidenceModelId}' carried usable directional evidence; the prior is unchanged, so no posterior is reported.`,
    };
  }

  const result = estimateRawScore(scoredObservations);

  if (!result) {
    return {
      evidenceModelId,
      parameterSetId,
      modelFamily: family,
      smvId: smVariable.id,
      competencyModelId,
      supported: false,
      reason: "The raw score could not be computed (total observable weight was zero).",
    };
  }

  return {
    smvId: smVariable.id,
    smvType: smVariable.type,
    evidenceModelId,
    parameterSetId,
    parameterSource: parameterSource || "not-applicable",
    modelFamily: family,
    competencyModelId,
    method: "weighted-proportion",
    supported: true,
    estimate: result.estimate,
    precision: result.sd,
    sem: result.sd,
    responsesUsed: scoredObservations.length,
    responsesExcluded: excluded,
  };
}

/* Exported for direct unit testing of the arithmetic -- the posterior is
   the thing most worth testing in isolation, since an error in it is
   invisible at every layer above. */
export const __testing__ = {
  itemProbability,
  itemParametersAreUsable,
  buildQuadrature,
  scoreResponse,
  estimateContinuousPosterior,
  estimateWithAdaptiveGrid,
  normalDensity,
  resolveObservationWeight,
  estimateRawScore,
  CONTINUOUS_MODEL_FAMILIES,
  RAW_SCORE_MODEL_FAMILIES,
  RAW_SCORE_SMV_TYPES,
  SM_VARIABLE_TYPE_VALUES,
};
