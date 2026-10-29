import { entriesForResponse } from "../../src/utils/qMatrixEntries.js";

// server/delivery/attributeAccumulation.js
//
// Day 36 (Week 8): the binary-attribute-mastery branch of Evidence
// Accumulation -- DINA and G-DINA. Where the continuous branch
// (evidenceAccumulation.js) updates ONE latent ability from an item
// response function over theta, this updates a JOINT distribution over
// 2^K attribute-mastery profiles and reports the marginal mastery
// probability of each attribute separately.
//
// The near-term DINA requirement (build reference Part 0.3) is why
// Evidence Accumulation had to dispatch per model family from its first
// line rather than being written for IRT and generalised later. This file
// is what that dispatch was reserved for.
//
// It carries the same standard the continuous branch was held to, for the
// same reason: a mastery probability of 0.83 looks exactly as credible
// whether the math is right or wrong. Every case that cannot be computed
// correctly returns an explicit refusal rather than a number.
//
// FIVE DECISIONS WORTH READING BEFORE CHANGING ANYTHING HERE
//
// 1. PARAMETERS FOLLOW THE Q-VECTOR'S GRAIN. The DINA response function
//    P(X=1 | alpha) is a function of BOTH the Q-vector and (slip, guess)
//    together, so those parameters must live at the same granularity as
//    the Q-vector or the two can disagree. Day 18 keyed both by item.
//    G18 lets a cell cite an observable; R4 lets one item yield several
//    observables, each with its own Q-row. Looking up slip/guess by
//    itemId alone then forces those observables to share a pair they
//    should not. Lookup is therefore the D50 rule: observableId wins
//    when the parameter set has that key, else itemId. Two items that
//    share an observation share a row when the set is keyed that way;
//    an R-ingested set that still keys by item (R1) still scores.
//    Pilot `psychometrics.dinaParams` stay on the item.
//
// 2. THE PRIOR ASSUMES ATTRIBUTE INDEPENDENCE; THE POSTERIOR DOES NOT.
//    Competency models declare a prior per binary SMV, one at a time --
//    there is nowhere to author a joint distribution over profiles, and
//    inventing correlations that nobody stated would be a fabrication.
//    D128 jointPrior is a continuous MVN and is not read here (R10). So
//    the prior is the product of the marginals. The POSTERIOR is computed
//    over all 2^K profiles jointly and only then marginalised, so the
//    dependence the data induces between attributes is preserved. This is
//    the standard independence-prior starting point, and it is an
//    assumption, not a derivation -- it is stated here because it is
//    invisible in the output.
//
// 3. A ZERO PROBABILITY IS NOT CLAMPED, unlike the continuous branch.
//    There, log(0) arose from a logistic function SATURATING in floating
//    point, so clamping recovered the intended value. Here, P(X=1 | alpha)
//    = 0 is an exact modelling statement: with guess = 0, a student
//    lacking the required attributes cannot answer correctly, so observing
//    a correct answer genuinely rules those profiles out. Clamping would
//    silently soften a deterministic constraint the author wrote on
//    purpose. If the data rules out EVERY profile -- which is possible,
//    and means the responses are impossible under the calibrated model --
//    that is refused explicitly rather than normalised into noise.
//
// 4. DINA MONOTONICITY IS ENFORCED; G-DINA MONOTONICITY IS NOT. DINA
//    requires guess < 1 - slip: a student who has every required attribute
//    must be likelier to succeed than one who has none. Violating it
//    inverts the item, exactly as a negative IRT discrimination did (a
//    defect the Day 31 adversarial review caught reporting theta = -2.21
//    for twenty CORRECT answers). A SATURATED G-DINA is a different
//    matter -- non-monotonic estimates are legitimate output there and
//    the package that produced them did not treat them as errors -- so
//    those are surfaced as a warning, not a refusal.
//
// 5. THE REDUCED-PATTERN ORDERING IS LITTLE-ENDIAN, and it matters more
//    than it looks. See REDUCED_PATTERN_ORDER below.

/* Cost bound, not a modelling claim -- mirrors MAX_GRID_POINTS in the
   continuous branch. The posterior is computed over all 2^K profiles, so
   the work doubles per attribute: K=12 is 4,096 profiles per response,
   K=20 would be a million. A Q-matrix wider than this is refused with a
   reason rather than silently hanging a request. */
const MAX_ATTRIBUTES = 12;

/* The canonical index of an item's REDUCED attribute pattern -- the
   sub-vector of only the attributes that item requires -- used to look up
   a saturated G-DINA probability.

   Getting this backwards does not throw. It permutes the probability
   table, so a well-calibrated item quietly answers with another pattern's
   probability, and every posterior downstream is plausible and wrong.

   *** DAY 37 RESOLUTION: NEITHER LITTLE-ENDIAN NOR BIG-ENDIAN. ***

   Day 36 left this as a straight little-endian-vs-big-endian bit question
   ("is the first required attribute the least or most significant bit?").
   That framing was wrong on both sides. GDINA's `attributepattern()` (and
   the internal `alpha2()` it calls for a purely dichotomous, non-Q-matrix
   K) does not walk a binary counter at all -- it groups profiles by the
   NUMBER of mastered attributes (Hamming weight) ascending, and within
   each weight class, by the standard lexicographic order of the mastered
   attributes' positions. For K=2 this happens to coincide with a
   little-endian binary counter ([00, 10, 01, 11] either way), which is
   almost certainly why the Day 36 review's recollection framed this as a
   bit-order question -- the two-attribute case cannot distinguish "binary
   counting" from "graded lexicographic" at all. They diverge starting at
   K=3: a naive little-endian counter over (a0,a1,a2) visits
   000,100,010,110,001,101,011,111, while GDINA visits
   000,100,010,001,110,101,011,111 -- patterns 3 and 4 are swapped, and
   the gap widens with K.

   THIS WAS VERIFIED, NOT RECOLLECTED. R is still not installed in this
   environment, but its absence is no longer an excuse: R (r-base-core)
   was installed, and the actual GDINA source (github.com/cran/GDINA, the
   official CRAN read-only mirror, v2.9.12) was cloned rather than trusted
   from memory. `attributepattern(K, Q)` (R/ExportedFuncs.R) calls the
   compiled `alpha2(K)` for the dichotomous case, implemented in
   src/util.cpp using `combnCpp` (also in src/util.cpp) to enumerate each
   weight class in lexicographic order. Both were extracted verbatim,
   compiled standalone with Rcpp/RcppArmadillo, and RUN:

     alpha2(2) -> 00,10,01,11                     (matches a binary counter)
     alpha2(3) -> 000,100,010,001,110,101,011,111 (a binary counter would
                                                     give ...,010,110,001,...)
     alpha2(4) -> confirms the same weight-then-lex pattern at K=4

   So: attributes still appear in the order the Q-matrix's own
   `attributeIds[]` declares them (that part of the Day 36 convention was
   right), but the INDEX within an item's 2^m-row table is the
   weight-then-lexicographic rank computed by `reducedPatternIndex` below,
   not a positional bit-sum. DINA remains unaffected either way, since eta
   is a conjunction and so order-free -- only the G-DINA branch reads
   `reducedPatternIndex`'s return value as a table index. */
const REDUCED_PATTERN_ORDER = "gdina-graded-lex";

/**
 * n-choose-r, computed directly rather than via a Pascal's-triangle cache.
 * K is capped at MAX_ATTRIBUTES (12), so the largest call here is C(12,6)
 * = 924 -- small enough that the naive multiplicative loop is exact in
 * ordinary floating point and there is no benefit to memoising it.
 */
function binomial(n, r) {
  if (r < 0 || r > n) return 0;
  let result = 1;
  for (let i = 0; i < r; i += 1) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * The lexicographic rank (0-indexed) of a combination among all
 * `combo.length`-sized subsets of {0, ..., n-1}, where `combo` is given
 * as strictly increasing 0-indexed positions. "Lexicographic" here means
 * the same order R's `combn()` (and GDINA's `combnCpp`) produce: the
 * combination is compared position by position, so (0,3) precedes (1,2)
 * because 0 < 1 at the first position, not because 0+3 < 1+2.
 *
 * Standard combinatorial-ranking construction: at each position i, count
 * every combination that starts the same way up to i and then picks a
 * SMALLER next element than `combo[i]` actually is -- there are
 * C(n - x - 1, combo.length - i - 1) ways to fill the remaining slots for
 * each smaller candidate x, and summing those counts across all earlier
 * positions gives exactly the number of combinations preceding this one.
 */
function combinationLexRank(combo, n) {
  const size = combo.length;
  let rank = 0;
  let previous = -1;

  for (let i = 0; i < size; i += 1) {
    for (let x = previous + 1; x < combo[i]; x += 1) {
      rank += binomial(n - x - 1, size - i - 1);
    }
    previous = combo[i];
  }

  return rank;
}

/**
 * Every binary profile over `k` attributes, as arrays of 0/1.
 *
 * This ordering is an internal bookkeeping choice only -- it enumerates
 * the FULL joint profile space so `computeProfilePosterior` can sum over
 * it, and both the posterior mass and the per-attribute marginals it
 * produces are order-invariant in every consumer. It is NOT compared
 * against any externally-authored table (unlike `reducedPatternIndex`
 * below, which is), so it does not need to -- and does not -- follow
 * REDUCED_PATTERN_ORDER. A plain little-endian binary counter is simplest
 * to generate and is kept for that reason alone.
 */
function enumerateProfiles(k) {
  const total = 2 ** k;
  const profiles = new Array(total);

  for (let p = 0; p < total; p += 1) {
    const profile = new Array(k);
    for (let a = 0; a < k; a += 1) {
      profile[a] = (p >> a) & 1;
    }
    profiles[p] = profile;
  }

  return profiles;
}

/**
 * The index of a profile's reduced pattern over `requiredIndices` -- the
 * positions (into the full attribute list) that this item requires -- in
 * the row order GDINA's `attributepattern()` uses for a saturated item's
 * probability table. See REDUCED_PATTERN_ORDER for how this was verified.
 *
 * Profiles are grouped by how many of the required attributes are
 * mastered (ascending), and within a group, by the lexicographic order of
 * WHICH ones are mastered. The all-unmastered and all-mastered profiles
 * are the fixed first and last rows of any such table (weight 0 and
 * weight m are each their own, singleton group) and are handled directly
 * rather than routed through the general combination-ranking formula,
 * which is not meaningful for a 0-length or a full-length combination.
 */
function reducedPatternIndex(profile, requiredIndices) {
  const m = requiredIndices.length;
  const mastered = [];

  for (let i = 0; i < m; i += 1) {
    if (profile[requiredIndices[i]] === 1) mastered.push(i);
  }

  const weight = mastered.length;

  if (weight === 0) return 0;
  if (weight === m) return (2 ** m) - 1;

  // Rows before this profile's weight class: the singleton weight-0 row,
  // then every weight from 1 up to (but not including) this profile's.
  let offset = 1;
  for (let w = 1; w < weight; w += 1) offset += binomial(m, w);

  return offset + combinationLexRank(mastered, m);
}

/**
 * The prior probability that a single binary attribute is mastered.
 *
 * `bernoulli` states it directly. `beta` states a distribution OVER that
 * probability, whose mean alpha/(alpha+beta) is exactly the marginal
 * mastery probability implied for one student -- a reduction, but the
 * mathematically correct one, not a convenience.
 *
 * An ABSENT priorDistribution defaults to 0.5 -- maximum entropy, the
 * honest "no information stated" prior for a binary attribute, and the
 * usual DINA default. A prior that is PRESENT but degenerate is refused
 * instead of defaulted, matching the continuous branch's treatment of a
 * declared-but-invalid standard deviation: substituting a default there
 * would report a posterior against a prior the author never wrote.
 */
function masteryPrior(smVariable) {
  const prior = smVariable?.priorDistribution;

  // Absent entirely -- the documented default.
  if (!prior) return { p: 0.5 };

  /* Present but with no family named. This used to fall into the default
     above, which is the one case the rule was written to exclude: a
     priorDistribution of `{ params: { p: 0.05 } }` (a typo, or a record
     predating the family field) silently became p = 0.5, reporting a
     posterior against a prior nobody wrote and burying the author's own
     stated 0.05. */
  if (!prior.family) {
    return { reason: `Student Model Variable '${smVariable.id}' declares a priorDistribution with no family; it cannot be read as a distribution over a binary attribute.` };
  }

  const params = prior.params || {};

  if (prior.family === "bernoulli") {
    if (!(Number.isFinite(params.p) && params.p >= 0 && params.p <= 1)) {
      return { reason: `Student Model Variable '${smVariable.id}' declares a bernoulli prior with an invalid p ('${params.p}'); p must be between 0 and 1.` };
    }
    return { p: params.p };
  }

  if (prior.family === "beta") {
    const { alpha, beta } = params;
    if (!(Number.isFinite(alpha) && alpha > 0 && Number.isFinite(beta) && beta > 0)) {
      return { reason: `Student Model Variable '${smVariable.id}' declares a beta prior with invalid parameters (alpha '${alpha}', beta '${beta}'); both must be positive.` };
    }
    return { p: alpha / (alpha + beta) };
  }

  return { reason: `Student Model Variable '${smVariable.id}' declares a '${prior.family}' prior, which is not a distribution over a binary attribute (expected bernoulli or beta).` };
}

/**
 * Is this a usable DINA parameter pair?
 *
 * See decision 4 in the header for why monotonicity is a refusal here.
 * `slip` is the probability a master answers incorrectly; `guess` the
 * probability a non-master answers correctly.
 */
export function dinaParametersAreUsable(params) {
  if (!params || typeof params !== "object") return false;
  const { slip, guess } = params;
  if (!(Number.isFinite(slip) && slip >= 0 && slip < 1)) return false;
  if (!(Number.isFinite(guess) && guess >= 0 && guess < 1)) return false;
  // Monotonicity: P(correct | mastered) > P(correct | not mastered).
  if (!(guess < 1 - slip)) return false;
  return true;
}

/**
 * Validate a saturated G-DINA probability table against the number of
 * attributes the item actually requires.
 *
 * A table of the wrong LENGTH is the failure mode worth catching loudest:
 * it means the item's Q-vector and its calibrated parameters disagree
 * about which attributes the item measures, and any index into it is then
 * meaningless. Refused, never truncated or padded.
 */
export function gdinaParametersAreUsable(params, requiredCount) {
  if (!params || typeof params !== "object") return false;
  const { probabilities } = params;
  if (!Array.isArray(probabilities)) return false;
  if (probabilities.length !== 2 ** requiredCount) return false;
  return probabilities.every((p) => Number.isFinite(p) && p >= 0 && p <= 1);
}

/**
 * D50 / R9: the same observable-then-item lookup IRT uses. Lives here
 * rather than importing evidenceAccumulation.js (that file imports this
 * one). Keep the two copies in step: observable wins when present.
 */
export function calibratedDiagnosticParams(parameterSet, { observableId, itemId } = {}) {
  const map = parameterSet?.parameters || {};
  if (observableId && map[observableId]) {
    return { params: map[observableId], keyedBy: "observableId" };
  }
  if (itemId && map[itemId]) {
    return { params: map[itemId], keyedBy: "itemId" };
  }
  return { params: undefined, keyedBy: null };
}

/**
 * DINA-equivalent saturated G-DINA table of length 2^m.
 *
 * Graded-lex order puts all-unmastered first and all-mastered last, so
 * the conjunctive identity is `[g, g, …, g, 1 − s]`: every reduced
 * pattern except full mastery uses guess. This is the same identity
 * `computeProfilePosterior` already treats as DINA ≡ G-DINA.
 *
 * R8: G-DINA has no separate authored probability-table field.
 * `psychometrics.dinaParams` slip/guess are the starting values;
 * calibration replaces the table. Returns null rather than inventing 0.5.
 */
export function conjunctiveGdinaTable(dinaParams, requiredCount) {
  if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > MAX_ATTRIBUTES) {
    return null;
  }
  if (!dinaParametersAreUsable(dinaParams)) return null;
  const length = 2 ** requiredCount;
  const probabilities = new Array(length).fill(dinaParams.guess);
  probabilities[length - 1] = 1 - dinaParams.slip;
  return { probabilities };
}

/**
 * The graded-lexicographic row index (see REDUCED_PATTERN_ORDER /
 * `reducedPatternIndex` above) of the profile whose mastered-required-
 * attributes are given as a plain little-endian bitmask over `m` bits
 * (bit i set = required attribute i is mastered). This is the same
 * ranking `reducedPatternIndex` computes from a full profile array plus
 * `requiredIndices`, restated to take a bare mask directly -- convenient
 * here where there is no full profile, only "which of the m required
 * attributes are mastered".
 */
function gradedLexIndexOfMask(mask, m) {
  const mastered = [];
  for (let bit = 0; bit < m; bit += 1) {
    if ((mask >> bit) & 1) mastered.push(bit);
  }

  const weight = mastered.length;
  if (weight === 0) return 0;
  if (weight === m) return (2 ** m) - 1;

  let offset = 1;
  for (let w = 1; w < weight; w += 1) offset += binomial(m, w);

  return offset + combinationLexRank(mastered, m);
}

/**
 * Is a saturated G-DINA table monotonic -- does mastering an ADDITIONAL
 * required attribute never reduce the probability of success?
 *
 * Not a refusal (decision 4), but worth surfacing: a non-monotonic
 * estimate usually means a small calibration sample or a misspecified
 * Q-vector, and it is invisible in the posterior it produces.
 *
 * Day 39 (adversarial review, P2-7): `probabilities` is indexed in
 * REDUCED_PATTERN_ORDER (graded-lexicographic -- see the block comment
 * above `reducedPatternIndex`), NOT as a plain little-endian binary
 * counter. The original version of this function walked `pattern` and
 * `pattern + (1 << bit)` as if they WERE direct table indices -- the two
 * orderings coincide only for m <= 2 required attributes (which is all
 * the existing tests exercised), and diverge for m >= 3, so this could
 * compare the wrong pair of rows and report a table "monotonic" (or
 * flag one as non-monotonic) based on entries that don't actually
 * correspond to "one more attribute mastered". Fixed by treating
 * `pattern` as a bitmask over WHICH required attributes are mastered
 * (the same convention `reducedPatternIndex` takes a full profile in)
 * and translating both the base and the one-more-mastered mask through
 * `gradedLexIndexOfMask` before indexing `probabilities`.
 */
function gdinaTableIsMonotonic(probabilities, requiredCount) {
  const total = 2 ** requiredCount;

  for (let mask = 0; mask < total; mask += 1) {
    const baseIndex = gradedLexIndexOfMask(mask, requiredCount);

    for (let bit = 0; bit < requiredCount; bit += 1) {
      if ((mask >> bit) & 1) continue;          // already mastered
      const withOneMore = mask + (1 << bit);
      const withOneMoreIndex = gradedLexIndexOfMask(withOneMore, requiredCount);

      if (probabilities[withOneMoreIndex] < probabilities[baseIndex]) return false;
    }
  }

  return true;
}

/**
 * Is the table INVERTED -- is mastering every required attribute strictly
 * worse than mastering none?
 *
 * The refusable case, as distinct from the merely non-monotonic one a
 * finite calibration sample legitimately produces. Deliberately the
 * weakest test that still catches a sign error: it compares only the two
 * extreme patterns, so a table that wanders in the middle but still
 * rewards full mastery is left alone.
 */
function gdinaTableIsInverted(probabilities) {
  return probabilities[probabilities.length - 1] < probabilities[0];
}

/**
 * Is every entry identical? Such an item's response probability does not
 * depend on the profile at all, so it separates nothing.
 */
function gdinaTableIsFlat(probabilities) {
  return probabilities.every((p) => p === probabilities[0]);
}

function categoricalEntropy(masses) {
  let entropy = 0;
  for (const probability of masses) {
    if (probability > 0) entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/**
 * Expected reduction in Shannon entropy of the reduced attribute pattern
 * from administering a saturated G-DINA item. `priors` is P(mastered) for
 * each required attribute in Q-matrix order. `probabilities` is the 2^m
 * table in graded-lex order. A one-attribute table [guess, 1-slip] is the
 * same quantity DINA selection already computes. Returns null when the
 * table cannot be used (wrong length, inverted, or priors out of range).
 */
export function computeGdinaExpectedInformationGain(priors, probabilities) {
  if (!Array.isArray(priors) || priors.length === 0) return null;
  if (priors.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return null;
  if (!gdinaParametersAreUsable({ probabilities }, priors.length)) return null;
  if (gdinaTableIsInverted(probabilities)) return null;
  if (gdinaTableIsFlat(probabilities)) return 0;

  const m = priors.length;
  const requiredIndices = Array.from({ length: m }, (_, index) => index);
  const total = 2 ** m;
  const priorMass = new Array(total);
  const success = new Array(total);
  let probabilityOfOne = 0;

  for (let pattern = 0; pattern < total; pattern += 1) {
    const profile = new Array(m);
    let mass = 1;
    for (let attribute = 0; attribute < m; attribute += 1) {
      profile[attribute] = (pattern >> attribute) & 1;
      mass *= profile[attribute] === 1 ? priors[attribute] : 1 - priors[attribute];
    }
    const probability = probabilities[reducedPatternIndex(profile, requiredIndices)];
    priorMass[pattern] = mass;
    success[pattern] = probability;
    probabilityOfOne += mass * probability;
  }

  if (!(probabilityOfOne > 0) || !(probabilityOfOne < 1)) return 0;

  const probabilityOfZero = 1 - probabilityOfOne;
  const ifOne = new Array(total);
  const ifZero = new Array(total);
  for (let pattern = 0; pattern < total; pattern += 1) {
    ifOne[pattern] = (priorMass[pattern] * success[pattern]) / probabilityOfOne;
    ifZero[pattern] = (priorMass[pattern] * (1 - success[pattern])) / probabilityOfZero;
  }

  const gain = categoricalEntropy(priorMass) - (
    probabilityOfOne * categoricalEntropy(ifOne) + probabilityOfZero * categoricalEntropy(ifZero)
  );
  return gain > 0 ? gain : 0;
}

/**
 * The joint posterior over attribute-mastery profiles, and each
 * attribute's marginal mastery probability.
 *
 * Accumulated in LOG space and re-centred on the maximum of the JOINT
 * (prior + likelihood) before exponentiating -- the same discipline the
 * continuous branch arrived at, and for the same reason: re-centring the
 * likelihood alone leaves the prior as a separate exp() that can underflow
 * to exactly zero on its own, at which point the whole posterior is 0/0.
 * Only the joint has to be representable.
 *
 * @returns {{ posterior: number[], marginals: number[] } | null}
 */
function computeProfilePosterior(scoredResponses, attributePriors, family) {
  const k = attributePriors.length;
  const profiles = enumerateProfiles(k);

  /* Every log() below is hoisted out of the per-profile loop.
     The naive shape -- calling Math.log inside the 2^K x responses loop --
     recomputed the SAME handful of logarithms 4,096 times per response and
     cost 206ms at the K=12 cap, on a path that now runs on every submit.
     The number of DISTINCT probabilities is tiny: K priors, and per
     response either 2 (DINA: eta is 0 or 1) or 2^m (a saturated G-DINA
     table over the m attributes that item requires). Precomputing them
     into lookup tables leaves only integer work in the hot loop. */
  const logPriorTrue = attributePriors.map((p) => Math.log(p));
  const logPriorFalse = attributePriors.map((p) => Math.log(1 - p));

  const responseLogTables = scoredResponses.map((response) => {
    const size = family === "dina" ? 2 : 2 ** response.requiredIndices.length;
    const table = new Array(size);

    for (let pattern = 0; pattern < size; pattern += 1) {
      const probability = family === "dina"
        ? (pattern === 1 ? 1 - response.params.slip : response.params.guess)
        : response.params.probabilities[pattern];

      table[pattern] = response.u === 1 ? Math.log(probability) : Math.log(1 - probability);
    }

    return { table, requiredIndices: response.requiredIndices };
  });

  const logJoint = profiles.map((profile) => {
    let total = 0;

    for (let a = 0; a < k; a += 1) {
      total += profile[a] === 1 ? logPriorTrue[a] : logPriorFalse[a];
    }

    for (const { table, requiredIndices } of responseLogTables) {
      /* For DINA the table has two rows, so the "pattern" collapses to
         eta -- 1 only when every required attribute is mastered. For
         G-DINA it is the full reduced-pattern index. Both are the same
         integer walk over requiredIndices. */
      let index;

      if (family === "dina") {
        index = 1;
        for (let i = 0; i < requiredIndices.length; i += 1) {
          if (profile[requiredIndices[i]] !== 1) { index = 0; break; }
        }
      } else {
        index = reducedPatternIndex(profile, requiredIndices);
      }

      total += table[index];
    }

    return total;
  });

  let maxLogJoint = -Infinity;
  for (const value of logJoint) if (value > maxLogJoint) maxLogJoint = value;

  // Every profile carries zero density. Either the priors are degenerate
  // or -- the interesting case -- the responses are jointly impossible
  // under the calibrated parameters (see decision 3). Both are refusals.
  if (!Number.isFinite(maxLogJoint)) return null;

  const unnormalized = logJoint.map((value) => Math.exp(value - maxLogJoint));
  const total = unnormalized.reduce((acc, v) => acc + v, 0);

  if (!(total > 0) || !Number.isFinite(total)) return null;

  const posterior = unnormalized.map((v) => v / total);

  // Marginalise: P(attribute a mastered) is the total mass of every
  // profile in which it is mastered. The joint is computed first and
  // collapsed second, precisely so the dependence between attributes that
  // the data induced is not thrown away before it is used.
  const marginals = new Array(k).fill(0);
  for (let p = 0; p < profiles.length; p += 1) {
    for (let a = 0; a < k; a += 1) {
      if (profiles[p][a] === 1) marginals[a] += posterior[p];
    }
  }

  if (marginals.some((m) => !Number.isFinite(m))) return null;

  return { posterior, marginals };
}

/**
 * Accumulate attribute mastery for one Evidence Model's responses.
 *
 * Returns an ARRAY of posterior entries -- one per Q-matrix attribute,
 * each naming its own binary Student Model Variable. This is the shape
 * that differs most from the continuous and raw-score branches, which
 * each produce a single posterior: a diagnostic model's whole purpose is
 * to report per-attribute mastery separately, so one response set updates
 * K Student Model Variables at once.
 */
export function accumulateAttributeMastery({
  evidenceModelId, parameterSetId, parameterSource, family, evidenceModel, statisticalModel,
  parameterSet, group, db, warnings, scoreResponse,
}) {
  const refuse = (reason) => [{ evidenceModelId, parameterSetId, modelFamily: family, supported: false, reason }];

  const qMatrixId = statisticalModel.structureConfig?.qMatrixId;

  if (!qMatrixId) {
    return refuse(`Statistical model '${statisticalModel.id}' is a '${family}' model but declares no structureConfig.qMatrixId; there is no Q-matrix to accumulate against.`);
  }

  const qMatrix = (db.qMatrixModels || []).find((q) => q.id === qMatrixId);

  if (!qMatrix) {
    return refuse(`Statistical model '${statisticalModel.id}' references unknown qMatrixId '${qMatrixId}'.`);
  }

  /* A Q-matrix deliberately pulled from service must not keep scoring live
     sessions. Mirrors the item-delivery rule in sessionRoutes.js exactly:
     a draft or reviewed Q-matrix is still deliverable (preview and test
     delivery score correctly), but `suspended` and `archived` both mean
     somebody withdrew it on purpose. Every other governed entity in this
     pipeline is status-gated; this was reading by id alone. */
  if (["suspended", "archived"].includes(qMatrix.status)) {
    return refuse(`Q-matrix '${qMatrixId}' is '${qMatrix.status}' and cannot be used to score responses.`);
  }

  const attributeIds = qMatrix.attributeIds || [];

  if (attributeIds.length === 0) {
    return refuse(`Q-matrix '${qMatrixId}' declares no attributes, so there is nothing to accumulate into.`);
  }

  /* A duplicated attribute doubles the profile space and emits two
     posterior rows for one Student Model Variable -- and since
     applyPosteriorsToSession keys smvPosteriors by smvId, the second
     silently overwrites the first, so which of two different numbers gets
     persisted depends on array order. schema.js rejects this at insert;
     `update` does not revalidate, so a record can still reach here. */
  const duplicateAttribute = attributeIds.find((id, i) => attributeIds.indexOf(id) !== i);

  if (duplicateAttribute) {
    return refuse(`Q-matrix '${qMatrixId}' declares attribute '${duplicateAttribute}' more than once; the attribute list must be unique before a posterior can be reported per attribute.`);
  }

  if (attributeIds.length > MAX_ATTRIBUTES) {
    return refuse(`Q-matrix '${qMatrixId}' declares ${attributeIds.length} attributes; this module computes a full posterior over all 2^K profiles and refuses beyond ${MAX_ATTRIBUTES} (${2 ** MAX_ATTRIBUTES} profiles) rather than exhaust the request.`);
  }

  const competencyModel = (db.competencyModels || []).find((m) => m.id === qMatrix.competencyModelId);

  if (!competencyModel) {
    return refuse(`Q-matrix '${qMatrixId}' references competency model '${qMatrix.competencyModelId}', which was not found.`);
  }

  /* The Q-matrix and the Evidence Model must be talking about the SAME
     competency model. They are reached by two independent routes -- this
     branch resolves one from `qMatrix.competencyModelId`, while the
     continuous branch resolves it from
     evidenceModel.competencyId -> competencies -> modelId -- and nothing,
     here or in schema.js, previously compared them.

     An adversarial review cross-wired an Evidence Model bound to a
     mathematics competency model to a Q-matrix declared on a reading one,
     and got two confident reading-attribute posteriors back with no
     warning. That is worse than a wrong number: it files a measurement
     under Student Model Variables the assessment never targeted, and
     applyPosteriorsToSession keys smvPosteriors by smvId alone, so the
     stored record carries no trace of where it came from. */
  const competency = (db.competencies || []).find((c) => c.id === evidenceModel.competencyId);

  if (competency && competency.modelId !== competencyModel.id) {
    return refuse(`Evidence model '${evidenceModelId}' measures competency '${competency.id}' on competency model '${competency.modelId}', but its '${family}' statistical model points at Q-matrix '${qMatrixId}', which is declared on competency model '${competencyModel.id}'. Refusing to report attribute mastery against a competency model this evidence does not measure.`);
  }

  /* Resolve every attribute to its binary SMV and its prior. schema.js
     already enforces binary-ness at authoring time; it is re-checked here
     because this may be running against a db snapshot in which some other
     path violated it -- the same reasoning schema.js's own DINA block
     gives for duplicating the check. */
  const attributes = [];

  for (const attributeId of attributeIds) {
    const smVariable = (competencyModel.smVariables || []).find((smv) => smv.id === attributeId);

    if (!smVariable) {
      return refuse(`Q-matrix '${qMatrixId}' names attribute '${attributeId}', which competency model '${competencyModel.id}' does not define.`);
    }

    if (smVariable.type !== "binary") {
      return refuse(`Q-matrix '${qMatrixId}' names attribute '${attributeId}', a '${smVariable.type}' Student Model Variable. Attribute-mastery accumulation requires binary attributes.`);
    }

    const prior = masteryPrior(smVariable);
    if (prior.reason) return refuse(prior.reason);

    attributes.push({ smVariable, prior: prior.p });
  }

  const attributeIndexById = new Map(attributeIds.map((id, i) => [id, i]));

  /* Each item's Q-vector, as indices into the attribute list.

     An entry whose `required` is present and falsy is an explicitly
     declared ZERO cell, not a required attribute -- a Q-matrix is a 0/1
     matrix and this flag is how a 0 is written down. Tested for falsiness
     rather than `=== false` because a numeric 0 is the natural encoding of
     a zero cell coming out of a CSV or an R export, and `required: 0`
     reading as "required" would invert the cell's meaning.

     SORTED, and this is load-bearing rather than tidiness. The reduced-
     pattern index (see REDUCED_PATTERN_ORDER) is defined over the
     attributes in `attributeIds[]` order. Building it in `entries[]` order
     instead makes the bit order depend on the sequence cells happened to
     be authored in -- and nothing constrains that: schema.js validates an
     entries array in any order as entirely valid, and a cell-clicking
     Q-matrix editor produces click order by default. An adversarial review
     measured the consequence: with the same Q-matrix authored in two entry
     orders, two attributes' mastery probabilities were EXCHANGED (0.914 /
     0.571 becoming 0.571 / 0.914), silently and with `supported: true`,
     and per-attribute classification accuracy over 2,000 simulated
     students fell from 94.9% to 90.3%. DINA is immune because eta is a
     conjunction and so order-free, which is exactly why the DINA/G-DINA
     equivalence test could not catch it. */
  function requiredIndicesFor(response) {
    const matched = entriesForResponse(qMatrix.entries, {
      itemId: response?.itemId,
      observableId: response?.observableId,
      evidenceModelId: response?.evidenceModelId || evidenceModelId,
    });
    const indices = [];
    const seen = new Set();
    for (const entry of matched) {
      if (entry.required !== undefined && !entry.required) continue;
      const index = attributeIndexById.get(entry.attributeId);
      /* An entry naming an attribute the Q-matrix never declared. Dropping
         the cell silently would TRUNCATE the Q-vector -- scoring a
         two-attribute observation as though it required only one, which
         reports a higher mastery probability than the evidence supports
         (measured: 0.818 where the honest answer is 0.733) and compounds
         across responses. The response is excluded below instead. */
      if (index === undefined) return { unknown: true, indices: [] };
      if (seen.has(index)) continue;
      seen.add(index);
      indices.push(index);
    }
    indices.sort((a, b) => a - b);
    return { unknown: false, indices };
  }

  const scoredResponses = [];
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

    const resolvedVector = requiredIndicesFor(r);

    if (resolvedVector.unknown) {
      excluded += 1;
      warnings.push(`Q-matrix '${qMatrixId}' places item '${r.itemId}' on an attribute it does not declare in attributeIds; the item's Q-vector cannot be resolved, so that response was excluded rather than scored against a truncated one.`);
      continue;
    }

    const requiredIndices = resolvedVector.indices;

    /* An item the Q-matrix does not place requires no attributes, so its
       response function is constant across every profile: it discriminates
       between none of them. Including it would add a flat term that
       changes no posterior while inflating responsesUsed -- which reads,
       wrongly, as evidence having been gathered. */
    if (!requiredIndices || requiredIndices.length === 0) {
      excluded += 1;
      warnings.push(`Q-matrix '${qMatrixId}' declares no required attributes for item '${r.itemId}'; that response carries no diagnostic information and was excluded.`);
      continue;
    }

    // Decision 1 / R9: observableId wins when the set has that key.
    const { params } = calibratedDiagnosticParams(parameterSet, {
      observableId: r.observableId,
      itemId: r.itemId,
    });

    if (!params) {
      excluded += 1;
      warnings.push(`Parameter set '${parameterSetId}' has no ${family} parameters for item '${r.itemId}'; that response was excluded.`);
      continue;
    }

    if (family === "dina") {
      if (!dinaParametersAreUsable(params)) {
        excluded += 1;
        warnings.push(`Parameter set '${parameterSetId}' has unusable DINA parameters for item '${r.itemId}' (slip and guess must each be in [0,1) and satisfy guess < 1 - slip); that response was excluded.`);
        continue;
      }
    } else if (!gdinaParametersAreUsable(params, requiredIndices.length)) {
      excluded += 1;
      warnings.push(`Parameter set '${parameterSetId}' has unusable G-DINA parameters for item '${r.itemId}': expected a probabilities[] of length ${2 ** requiredIndices.length} (2^${requiredIndices.length} required attributes), each in [0,1]. That response was excluded.`);
      continue;
    } else if (gdinaTableIsInverted(params.probabilities)) {
      /* Not merely non-monotonic -- INVERTED: mastering every required
         attribute makes success LESS likely than mastering none. That is
         the G-DINA form of a negative IRT discrimination, and decision 4
         only ever meant to tolerate the mild non-monotonicity a finite
         calibration sample produces, not this.

         Consuming it produces exactly the Day 31 defect this pipeline
         already fixed once: an adversarial review drove twenty CORRECT
         answers from a prior of 0.5 down to a mastery probability of
         3.1e-34, reported as `supported: true`. The equivalence is the
         argument -- a DINA item with slip=0.9, guess=0.9 is refused, so
         the mathematically identical table [0.9, 0.9, 0.9, 0.1] cannot be
         accepted without the two parameterisations of one model
         contradicting each other. */
      excluded += 1;
      warnings.push(`Parameter set '${parameterSetId}' has an INVERTED G-DINA table for item '${r.itemId}': mastering every required attribute is less likely to succeed than mastering none. That response was excluded rather than allowed to drive mastery in the wrong direction.`);
      continue;
    } else if (gdinaTableIsFlat(params.probabilities)) {
      /* A constant table discriminates between no profiles at all -- the
         same situation as an item the Q-matrix never placed, which is
         excluded a few lines above for the same stated reason: counting it
         inflates responsesUsed, which reads as evidence having been
         gathered. */
      excluded += 1;
      warnings.push(`Parameter set '${parameterSetId}' has a constant G-DINA table for item '${r.itemId}' (every attribute pattern has the same success probability); that response carries no diagnostic information and was excluded.`);
      continue;
    } else if (!gdinaTableIsMonotonic(params.probabilities, requiredIndices.length)) {
      warnings.push(`Parameter set '${parameterSetId}' has a non-monotonic G-DINA table for item '${r.itemId}': mastering a further required attribute lowers the probability of success. The response was still used, but the calibration is worth reviewing.`);
    }

    scoredResponses.push({ u, params, requiredIndices, itemId: r.itemId });
  }

  const common = {
    evidenceModelId,
    parameterSetId,
    // Day 38 originally hardcoded "calibrated" here, because
    // accumulateEvidence() refused every pilot/not-applicable group before
    // this function was ever called. D53b gave 'dina' a pilot path
    // (item.psychometrics.dinaParams, pinned onto the response the same
    // way IRT's pilot a/b/c already are). R8 derives a conjunctive G-DINA
    // table from that same slip/guess pair and pins `{ probabilities }`
    // the same way. The CALLER now resolves and passes the real source, so
    // this simply carries it through rather than asserting one. Defaults to
    // "calibrated" only for a caller that omits it, matching every other
    // family's fallback.
    parameterSource: parameterSource || "calibrated",
    modelFamily: family,
    competencyModelId: competencyModel.id,
  };

  if (scoredResponses.length === 0) {
    return attributes.map(({ smVariable }) => ({
      ...common,
      smvId: smVariable.id,
      supported: false,
      reason: `No response for evidence model '${evidenceModelId}' carried usable diagnostic evidence; the prior is unchanged, so no posterior is reported.`,
    }));
  }

  const result = computeProfilePosterior(scoredResponses, attributes.map((a) => a.prior), family);

  if (!result) {
    /* Name the likely culprits. A single item calibrated to a boundary
       estimate -- slip = guess = 0, which real DINA EM fits do produce --
       makes a correct and an incorrect response to it jointly impossible,
       and that one contradiction nullifies EVERY attribute and every other
       response in the set. The refusal is mathematically right (decision
       3), but a bare "could not be normalised" leaves an author with a
       whole evidence model reporting nothing and no idea which item did
       it. Deterministic items are where a contradiction can arise at all,
       so they are the ones worth pointing at. */
    const deterministic = [...new Set(
      scoredResponses
        .filter((r) => (family === "dina"
          ? r.params.slip === 0 || r.params.guess === 0
          : r.params.probabilities.some((p) => p === 0 || p === 1)))
        .map((r) => r.itemId)
    )];

    const culprits = deterministic.length
      ? ` The following item(s) are calibrated deterministically (a success or failure probability of exactly 0 or 1) and are the only ones capable of ruling a profile out outright: ${deterministic.join(", ")}.`
      : "";

    return attributes.map(({ smVariable }) => ({
      ...common,
      smvId: smVariable.id,
      supported: false,
      reason: `The attribute-mastery posterior could not be normalised: no profile carried usable probability mass, which means the responses are jointly impossible under this parameter set (or a declared prior rules out every profile).${culprits}`,
    }));
  }

  /* Day 39 (adversarial review, P1-4): which attribute INDICES were
     actually touched by at least one scored response's Q-vector. Before
     this, every attribute in the Q-matrix got a "supported: true"
     posterior regardless of whether any delivered item measured it -- an
     attribute nothing measured got its marginal back EXACTLY (the prior
     the joint posterior started from), reported at a real-looking
     precision and a real-looking responsesUsed count, indistinguishable
     from a genuine measurement that happened to land near the prior. The
     continuous and raw-score branches both already refuse this exact
     situation ("the prior is unchanged, so no posterior is reported") --
     this makes the diagnostic branch agree with them. */
  const touchedIndices = new Set();
  for (const response of scoredResponses) {
    for (const index of response.requiredIndices) touchedIndices.add(index);
  }

  return attributes.map(({ smVariable }, index) => {
    if (!touchedIndices.has(index)) {
      return {
        ...common,
        smvId: smVariable.id,
        supported: false,
        reason: `No scored response for evidence model '${evidenceModelId}' required attribute '${smVariable.id}' in its Q-vector; the prior is unchanged, so no posterior is reported.`,
      };
    }

    const p = result.marginals[index];
    const responsesForAttribute = scoredResponses.filter((r) => r.requiredIndices.includes(index)).length;

    return {
      ...common,
      smvId: smVariable.id,
      smvType: smVariable.type,
      method: "attribute-mastery-posterior",
      supported: true,
      estimate: p,
      /* The posterior SD of a Bernoulli with probability p. Unlike the
         raw-score branch, this needs no small-sample correction: p here is
         a genuine posterior probability, not an observed proportion, so it
         only reaches 0 or 1 when the model and data really do determine
         the attribute -- it is not the artefact of a single unanimous
         response that made the Wald SE unusable there. */
      precision: Math.sqrt(Math.max(p * (1 - p), 0)),
      sem: Math.sqrt(Math.max(p * (1 - p), 0)),
      // Day 39: counted per-attribute (only responses whose Q-vector
      // actually includes this attribute), not the whole group's response
      // count -- the joint posterior is computed over every scored
      // response at once (attributes are not independent, decision 2 in
      // this file's header), but "responsesUsed" reporting the FULL group
      // size for every attribute overstated how much evidence a
      // lightly-measured attribute actually had.
      responsesUsed: responsesForAttribute,
      responsesExcluded: excluded,
    };
  });
}

export const __testing__ = {
  enumerateProfiles,
  reducedPatternIndex,
  masteryPrior,
  dinaParametersAreUsable,
  gdinaParametersAreUsable,
  conjunctiveGdinaTable,
  gdinaTableIsMonotonic,
  gdinaTableIsInverted,
  gdinaTableIsFlat,
  computeProfilePosterior,
  computeGdinaExpectedInformationGain,
  MAX_ATTRIBUTES,
  REDUCED_PATTERN_ORDER,
};
