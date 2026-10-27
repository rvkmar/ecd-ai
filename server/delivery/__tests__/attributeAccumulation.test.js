// server/delivery/__tests__/attributeAccumulation.test.js
//
// Day 36 (Week 8): DINA / G-DINA attribute-mastery updating. Held to the
// same standard as the continuous branch (evidenceAccumulation.test.js),
// because the failure mode is identical: a mastery probability of 0.83
// looks exactly as credible whether the math is right or wrong.
//
//   1. HAND-COMPUTED fixtures, with the arithmetic written out in the
//      comment, matched to full double precision.
//   2. INVARIANTS any correct diagnostic updater must satisfy -- prior
//      recovery, symmetry, monotone response to evidence, and the
//      DINA/G-DINA equivalence that must hold when a saturated table is
//      given a conjunctive shape.
//   3. REFUSALS -- every case that cannot be computed correctly.
//
// Plus an INDEPENDENT reference implementation (referenceMarginals below),
// written from the model definition rather than by calling the code under
// test, for the same reason the continuous branch needed one: internal
// consistency proves nothing about correctness.

import { describe, it, expect } from "vitest";
import { accumulateEvidence } from "../evidenceAccumulation.js";
import { accumulateAttributeMastery, __testing__ } from "../attributeAccumulation.js";

const {
  enumerateProfiles, reducedPatternIndex, masteryPrior,
  dinaParametersAreUsable, gdinaParametersAreUsable, gdinaTableIsMonotonic,
  computeProfilePosterior, MAX_ATTRIBUTES,
} = __testing__;

// The direction-honouring scorer the real dispatch injects.
const scoreResponse = (r) => {
  if (r.activated !== true && r.activated !== false) return { u: null, reason: "indeterminate" };
  if (r.direction === "supports") return { u: r.activated ? 1 : 0 };
  if (r.direction === "weakens") return { u: r.activated ? 0 : 1 };
  if (r.direction === "neutral") return { u: null, reason: "neutral" };
  return { u: null, reason: "unknown-direction" };
};

/* ------------------------------------------------------------------
   AN INDEPENDENT REFERENCE
   Brute force, straight from the DINA definition, deliberately not
   sharing a line of code with the module under test.
------------------------------------------------------------------ */
function referenceMarginals(k, priors, responses) {
  const total = 2 ** k;
  const weights = [];

  for (let p = 0; p < total; p += 1) {
    const alpha = [];
    for (let a = 0; a < k; a += 1) alpha.push((p >> a) & 1);

    let w = 1;
    for (let a = 0; a < k; a += 1) w *= alpha[a] === 1 ? priors[a] : 1 - priors[a];

    for (const r of responses) {
      const eta = r.requires.every((a) => alpha[a] === 1) ? 1 : 0;
      const pCorrect = eta === 1 ? 1 - r.slip : r.guess;
      w *= r.u === 1 ? pCorrect : 1 - pCorrect;
    }

    weights.push({ alpha, w });
  }

  const den = weights.reduce((acc, x) => acc + x.w, 0);
  return Array.from({ length: k }, (_, a) =>
    weights.reduce((acc, x) => acc + (x.alpha[a] === 1 ? x.w : 0), 0) / den
  );
}

/* ------------------------------------------------------------------
   1. HAND-COMPUTED FIXTURES
------------------------------------------------------------------ */

describe("computeProfilePosterior — hand-computed fixtures", () => {
  it("one attribute, one correct response: matches pen-and-paper to double precision", () => {
    // Prior: P(mastery) = 0.5.  Item requires attribute 0.
    // slip = 0.1, guess = 0.2, response CORRECT.
    //
    //   profile [0]: 0.5 * guess     = 0.5 * 0.2 = 0.10
    //   profile [1]: 0.5 * (1 - slip) = 0.5 * 0.9 = 0.45
    //   total = 0.55
    //   P(mastery | correct) = 0.45 / 0.55 = 9/11 = 0.8181818181818181
    const result = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0], params: { slip: 0.1, guess: 0.2 } }],
      [0.5],
      "dina"
    );

    expect(result.marginals[0]).toBeCloseTo(0.8181818181818181, 15);
    expect(result.posterior[0] + result.posterior[1]).toBeCloseTo(1, 15);
  });

  it("one attribute, one INCORRECT response: the same arithmetic, mirrored", () => {
    //   profile [0]: 0.5 * (1 - guess) = 0.5 * 0.8 = 0.40
    //   profile [1]: 0.5 * slip        = 0.5 * 0.1 = 0.05
    //   P(mastery | incorrect) = 0.05 / 0.45 = 1/9 = 0.1111111111111111
    const result = computeProfilePosterior(
      [{ u: 0, requiredIndices: [0], params: { slip: 0.1, guess: 0.2 } }],
      [0.5],
      "dina"
    );

    expect(result.marginals[0]).toBeCloseTo(0.11111111111111112, 15);
  });

  it("two attributes, one conjunctive item: both marginals move together", () => {
    // Priors 0.5 / 0.5. Item requires BOTH attributes. Correct response.
    // Only profile [1,1] has eta = 1.
    //   [0,0]: 0.25 * 0.2 = 0.05    [1,0]: 0.25 * 0.2 = 0.05
    //   [0,1]: 0.25 * 0.2 = 0.05    [1,1]: 0.25 * 0.9 = 0.225
    //   total = 0.375
    //   P(a0) = (0.05 + 0.225) / 0.375 = 0.275 / 0.375 = 11/15
    const result = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0, 1], params: { slip: 0.1, guess: 0.2 } }],
      [0.5, 0.5],
      "dina"
    );

    expect(result.marginals[0]).toBeCloseTo(0.7333333333333334, 15);
    expect(result.marginals[1]).toBeCloseTo(0.7333333333333334, 15);
  });

  it("agrees with the independent reference across a range of configurations", () => {
    const cases = [
      { k: 1, priors: [0.5], responses: [{ requires: [0], slip: 0.1, guess: 0.2, u: 1 }] },
      { k: 2, priors: [0.3, 0.7], responses: [{ requires: [0], slip: 0.15, guess: 0.25, u: 1 }, { requires: [1], slip: 0.05, guess: 0.1, u: 0 }] },
      { k: 3, priors: [0.5, 0.4, 0.6], responses: [
        { requires: [0, 1], slip: 0.2, guess: 0.15, u: 1 },
        { requires: [1, 2], slip: 0.1, guess: 0.3, u: 0 },
        { requires: [0, 1, 2], slip: 0.05, guess: 0.05, u: 1 },
      ] },
      { k: 4, priors: [0.2, 0.5, 0.8, 0.35], responses: Array.from({ length: 12 }, (_, i) => ({
        requires: [i % 4, (i + 1) % 4], slip: 0.1 + (i % 3) * 0.05, guess: 0.1 + (i % 4) * 0.03, u: i % 3 === 0 ? 0 : 1,
      })) },
    ];

    for (const { k, priors, responses } of cases) {
      const mine = computeProfilePosterior(
        responses.map((r) => ({ u: r.u, requiredIndices: r.requires, params: { slip: r.slip, guess: r.guess } })),
        priors,
        "dina"
      );
      const reference = referenceMarginals(k, priors, responses);

      for (let a = 0; a < k; a += 1) {
        expect(mine.marginals[a]).toBeCloseTo(reference[a], 12);
      }
    }
  });
});

/* ------------------------------------------------------------------
   2. INVARIANTS
------------------------------------------------------------------ */

describe("computeProfilePosterior — invariants any correct updater must satisfy", () => {
  it("with no responses, returns the prior exactly", () => {
    const result = computeProfilePosterior([], [0.3, 0.75], "dina");
    expect(result.marginals[0]).toBeCloseTo(0.3, 14);
    expect(result.marginals[1]).toBeCloseTo(0.75, 14);
  });

  it("a correct answer raises mastery, an incorrect one lowers it, from the same prior", () => {
    const params = { slip: 0.1, guess: 0.2 };
    const right = computeProfilePosterior([{ u: 1, requiredIndices: [0], params }], [0.5], "dina");
    const wrong = computeProfilePosterior([{ u: 0, requiredIndices: [0], params }], [0.5], "dina");

    expect(right.marginals[0]).toBeGreaterThan(0.5);
    expect(wrong.marginals[0]).toBeLessThan(0.5);
  });

  it("mastery rises monotonically with the number of correct responses", () => {
    const params = { slip: 0.1, guess: 0.2 };
    const values = [0, 1, 2, 5, 10].map((n) =>
      computeProfilePosterior(
        Array.from({ length: n }, () => ({ u: 1, requiredIndices: [0], params })),
        [0.5],
        "dina"
      ).marginals[0]
    );

    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it("an item that requires an attribute leaves an UNRELATED attribute's prior untouched", () => {
    // The sharpest structural check on the marginalisation: attribute 1 is
    // required by nothing here, so no amount of evidence about attribute 0
    // may move it. If it drifts, the joint is being collapsed wrongly.
    const result = computeProfilePosterior(
      Array.from({ length: 8 }, () => ({ u: 1, requiredIndices: [0], params: { slip: 0.1, guess: 0.2 } })),
      [0.5, 0.42],
      "dina"
    );

    expect(result.marginals[0]).toBeGreaterThan(0.9);
    expect(result.marginals[1]).toBeCloseTo(0.42, 14);
  });

  it("a less reliable item (higher slip and guess) moves the posterior less", () => {
    const sharp = computeProfilePosterior([{ u: 1, requiredIndices: [0], params: { slip: 0.02, guess: 0.02 } }], [0.5], "dina");
    const noisy = computeProfilePosterior([{ u: 1, requiredIndices: [0], params: { slip: 0.35, guess: 0.35 } }], [0.5], "dina");

    expect(sharp.marginals[0]).toBeGreaterThan(noisy.marginals[0]);
  });

  it("a conjunctive saturated G-DINA table reproduces DINA exactly", () => {
    // The equivalence that must hold: G-DINA with probabilities
    // [g, g, g, 1-s] over two required attributes IS the DINA model. If
    // these two branches disagree, at least one of them is wrong, and this
    // is the only test here that can tell you so without a reference.
    const slip = 0.12;
    const guess = 0.23;
    const responses = [{ u: 1, requiredIndices: [0, 1] }, { u: 0, requiredIndices: [0, 1] }, { u: 1, requiredIndices: [0, 1] }];

    const asDina = computeProfilePosterior(
      responses.map((r) => ({ ...r, params: { slip, guess } })), [0.5, 0.6], "dina"
    );
    const asGdina = computeProfilePosterior(
      responses.map((r) => ({ ...r, params: { probabilities: [guess, guess, guess, 1 - slip] } })), [0.5, 0.6], "gdina"
    );

    expect(asGdina.marginals[0]).toBeCloseTo(asDina.marginals[0], 15);
    expect(asGdina.marginals[1]).toBeCloseTo(asDina.marginals[1], 15);
  });

  it("a saturated G-DINA can express a DISJUNCTIVE item, which DINA cannot", () => {
    // Proves the G-DINA branch is not just DINA in disguise: with
    // [low, high, high, high] either attribute alone nearly suffices, so a
    // correct answer should raise both marginals only modestly rather than
    // driving the conjunction.
    const result = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0, 1], params: { probabilities: [0.05, 0.85, 0.85, 0.9] } }],
      [0.5, 0.5],
      "gdina"
    );

    expect(result.marginals[0]).toBeGreaterThan(0.5);
    expect(result.marginals[1]).toBeGreaterThan(0.5);
    // Neither is driven as hard as a conjunctive item would drive it.
    expect(result.marginals[0]).toBeLessThan(0.8);
  });

  it("indexes a THREE-attribute saturated G-DINA table correctly", () => {
    // The log-lookup optimisation gave DINA a two-row table and G-DINA a
    // full 2^m one, computing the index differently in each branch. A
    // three-required-attribute item (an 8-entry table) is where an
    // ordering slip in that branch would show; the two-attribute cases
    // above are too small to tell several wrong orderings from the right
    // one apart, since K=2 is where every plausible convention agrees.
    //
    // Table is built so probability rises strictly with the pattern
    // INDEX. Day 37 settled what "the pattern index" means by compiling
    // and running GDINA's actual source (see REDUCED_PATTERN_ORDER): rows
    // are grouped by how many attributes are mastered, ascending, so this
    // table's rows are 000, 100, 010, 001, 110, 101, 011, 111 in that
    // order -- NOT a binary counter (which would visit 110 before 001).
    const probabilities = [0.02, 0.2, 0.3, 0.45, 0.5, 0.65, 0.75, 0.95];
    const params = { probabilities };

    // A correct answer must push all three attributes up...
    const up = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0, 1, 2], params }], [0.5, 0.5, 0.5], "gdina"
    );
    expect(up.marginals.every((m) => m > 0.5)).toBe(true);

    // ...and an incorrect one must push all three down.
    const down = computeProfilePosterior(
      [{ u: 0, requiredIndices: [0, 1, 2], params }], [0.5, 0.5, 0.5], "gdina"
    );
    expect(down.marginals.every((m) => m < 0.5)).toBe(true);

    /* This is the assertion that actually discriminates the ordering.
       Averaging this table's probability over the four rows where each
       attribute IS mastered, versus the four where it is not (row ->
       profile mapping above):

         attr0 mastered {100,110,101,111} = {.2,.5,.65,.95} ~ .575
              unmastered {000,010,001,011} = {.02,.3,.45,.75} ~ .380
         attr1 mastered {010,110,011,111} = {.3,.5,.75,.95}  ~ .625
              unmastered {000,100,001,101} = {.02,.2,.45,.65} ~ .330
         attr2 mastered {001,101,011,111} = {.45,.65,.75,.95} ~ .700
              unmastered {000,100,010,110} = {.02,.2,.3,.5}   ~ .255

       So a correct answer must move attr2 most and attr0 least -- and,
       tellingly, that is the same ordering a (wrong) little-endian
       reading of this same table would also produce, which is exactly
       why the unit tests just above -- checking reducedPatternIndex's
       exact return value against GDINA's verified row order -- are the
       ones actually capable of catching a regression back to it; this
       integration-level check only confirms the ordering is monotonic in
       mastery count, which any of the conventions considered would give. */
    expect(up.marginals[2]).toBeGreaterThan(up.marginals[1]);
    expect(up.marginals[1]).toBeGreaterThan(up.marginals[0]);
  });

  it("does not underflow across a long session", () => {
    // The lesson the continuous branch learned the hard way: the raw
    // product of 400 probabilities is exactly 0 in a double.
    const result = computeProfilePosterior(
      Array.from({ length: 400 }, () => ({ u: 1, requiredIndices: [0, 1], params: { slip: 0.1, guess: 0.2 } })),
      [0.5, 0.5],
      "dina"
    );

    expect(Number.isFinite(result.marginals[0])).toBe(true);
    expect(result.marginals[0]).toBeGreaterThan(0.999);
  });

  it("survives a prior pinned at exactly 0 or 1 rather than producing NaN", () => {
    // log(0) is legitimate here -- it pins the attribute -- and must not
    // poison the whole grid.
    const result = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0], params: { slip: 0.1, guess: 0.2 } }],
      [0, 0.5],
      "dina"
    );

    expect(result.marginals[0]).toBe(0);
    expect(Number.isFinite(result.marginals[1])).toBe(true);
  });

  it("refuses (returns null) when the responses are jointly impossible under the model", () => {
    // slip = guess = 0 makes the item deterministic: a master always
    // succeeds and a non-master always fails. Answering the SAME item both
    // correctly and incorrectly cannot happen under that model, so every
    // profile is ruled out. Returning any number here would be a fiction.
    const params = { slip: 0, guess: 0 };
    const result = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0], params }, { u: 0, requiredIndices: [0], params }],
      [0.5],
      "dina"
    );

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------
   PROFILE ENUMERATION AND PATTERN ORDERING
------------------------------------------------------------------ */

describe("enumerateProfiles / reducedPatternIndex — the ordering convention", () => {
  it("enumerates 2^k profiles little-endian", () => {
    expect(enumerateProfiles(1)).toEqual([[0], [1]]);
    expect(enumerateProfiles(2)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
    expect(enumerateProfiles(3)).toHaveLength(8);
  });

  it("indexes a two-attribute reduced pattern (little-endian and graded-lex agree at K=2)", () => {
    // GDINA's actual `attributepattern()` row order -- verified Day 37 by
    // compiling and running the package's own source, not recollected --
    // groups profiles by mastery COUNT first, then lexicographically. At
    // K=2 every weight class has at most one member, so that coincides
    // with a plain little-endian binary count: [00, 10, 01, 11] either
    // way. This case alone cannot tell the two conventions apart -- see
    // the K=3 case below, where they diverge.
    expect(reducedPatternIndex([0, 0], [0, 1])).toBe(0);
    expect(reducedPatternIndex([1, 0], [0, 1])).toBe(1);
    expect(reducedPatternIndex([0, 1], [0, 1])).toBe(2);
    expect(reducedPatternIndex([1, 1], [0, 1])).toBe(3);
  });

  it("indexes a three-attribute reduced pattern in GDINA's graded-lex order, not binary count", () => {
    // This is the case that actually discriminates the convention. GDINA's
    // attributepattern(3) -- reproduced by compiling GDINA's own
    // src/util.cpp (alpha2/combnCpp) and running it -- visits
    // 000, 100, 010, 001, 110, 101, 011, 111 in that order: grouped by
    // how many of the three attributes are mastered (ascending), and
    // within a group, by which ones. A little-endian binary counter would
    // instead visit 000, 100, 010, 110, 001, 101, 011, 111 -- patterns 3
    // and 4 swapped, which is exactly where 001 and 110 land below.
    const index = (bits) => reducedPatternIndex(bits, [0, 1, 2]);

    expect(index([0, 0, 0])).toBe(0);
    expect(index([1, 0, 0])).toBe(1);
    expect(index([0, 1, 0])).toBe(2);
    expect(index([0, 0, 1])).toBe(3); // NOT 4 -- the binary-count answer
    expect(index([1, 1, 0])).toBe(4); // NOT 3 -- the binary-count answer
    expect(index([1, 0, 1])).toBe(5);
    expect(index([0, 1, 1])).toBe(6);
    expect(index([1, 1, 1])).toBe(7);
  });

  it("indexes by POSITION IN THE REQUIRED LIST, not by absolute attribute index", () => {
    // An item requiring attributes 2 and 3 of a five-attribute matrix
    // still has a four-entry table indexed 0..3.
    const profile = [0, 0, 0, 1, 0];
    expect(reducedPatternIndex(profile, [2, 3])).toBe(2); // second required attr set
    expect(reducedPatternIndex(profile, [3, 2])).toBe(1); // order matters
  });
});

/* ------------------------------------------------------------------
   PARAMETER AND PRIOR VALIDATION
------------------------------------------------------------------ */

describe("parameter validation — degenerate calibrations are refused, not consumed", () => {
  it("accepts an ordinary DINA pair", () => {
    expect(dinaParametersAreUsable({ slip: 0.1, guess: 0.2 })).toBe(true);
  });

  it("refuses a non-monotonic DINA item (guess >= 1 - slip)", () => {
    // The DINA analogue of a negative IRT discrimination -- it inverts the
    // item, so correct answers would argue AGAINST mastery.
    expect(dinaParametersAreUsable({ slip: 0.5, guess: 0.5 })).toBe(false);
    expect(dinaParametersAreUsable({ slip: 0.7, guess: 0.4 })).toBe(false);
  });

  it("refuses out-of-range or missing slip/guess", () => {
    for (const params of [
      { slip: -0.1, guess: 0.2 }, { slip: 1, guess: 0.2 }, { slip: 0.1, guess: 1 },
      { slip: 0.1 }, { guess: 0.2 }, { slip: NaN, guess: 0.2 }, null, "x",
    ]) {
      expect(dinaParametersAreUsable(params)).toBe(false);
    }
  });

  it("refuses a G-DINA table whose length disagrees with the item's Q-vector", () => {
    // The loudest failure worth catching: the calibration and the Q-matrix
    // disagree about which attributes the item measures, so every lookup
    // into the table is meaningless.
    expect(gdinaParametersAreUsable({ probabilities: [0.1, 0.9] }, 2)).toBe(false);
    expect(gdinaParametersAreUsable({ probabilities: [0.1, 0.4, 0.5, 0.9] }, 2)).toBe(true);
    expect(gdinaParametersAreUsable({ probabilities: [0.1, 0.9] }, 1)).toBe(true);
  });

  it("refuses out-of-range G-DINA probabilities", () => {
    expect(gdinaParametersAreUsable({ probabilities: [0.1, 1.2] }, 1)).toBe(false);
    expect(gdinaParametersAreUsable({ probabilities: [-0.1, 0.9] }, 1)).toBe(false);
    expect(gdinaParametersAreUsable({ probabilities: "no" }, 1)).toBe(false);
  });

  it("detects a non-monotonic G-DINA table without refusing it", () => {
    expect(gdinaTableIsMonotonic([0.1, 0.4, 0.5, 0.9], 2)).toBe(true);
    expect(gdinaTableIsMonotonic([0.1, 0.9, 0.5, 0.6], 2)).toBe(false);
  });

  // Day 39 (adversarial review, P2-7): for m = 2 required attributes,
  // graded-lex order (the table's actual row order -- see
  // REDUCED_PATTERN_ORDER) and a plain little-endian binary counter
  // happen to coincide, which is why the m = 2 test above could not have
  // caught a function that walked `probabilities` as a binary counter
  // instead of translating through the graded-lex ranking. They diverge
  // starting at m = 3: index 3 means "third required attribute mastered
  // alone" (weight 1) in graded-lex order, but means "the first two
  // attributes both mastered" (weight 2) as a raw bitmask. This table is
  // genuinely monotonic under the correct (graded-lex) reading --
  //   weight 0:            idx0 = 0.10
  //   weight 1 (a0,a1,a2):  idx1 = 0.20, idx2 = 0.18, idx3 = 0.15
  //   weight 2 (a0a1,a0a2,a1a2): idx4 = 0.50, idx5 = 0.55, idx6 = 0.60
  //   weight 3:             idx7 = 0.90
  // every weight-1 entry is below every weight-2 entry, which is below
  // the weight-3 entry -- but the pre-fix binary-counter version would
  // compare probabilities[1] (0.20, "a0 alone") against probabilities[3]
  // (0.15, actually "a2 alone", misread as "a0+a1") and see a decrease,
  // wrongly reporting this monotonic table as non-monotonic.
  it("compares the correct pair of rows for m = 3 required attributes, where graded-lex and binary-counter order diverge", () => {
    const probabilities = [0.10, 0.20, 0.18, 0.15, 0.50, 0.55, 0.60, 0.90];
    expect(gdinaTableIsMonotonic(probabilities, 3)).toBe(true);
  });

  it("still detects a genuinely non-monotonic m = 3 table", () => {
    // Same table as above, but idx5 ("a0+a2 mastered") is dropped below
    // idx1 ("a0 alone") -- mastering a2 in addition to a0 should never
    // reduce the probability of success.
    const probabilities = [0.10, 0.20, 0.18, 0.15, 0.50, 0.05, 0.60, 0.90];
    expect(gdinaTableIsMonotonic(probabilities, 3)).toBe(false);
  });

  it("reads a bernoulli prior directly and a beta prior through its mean", () => {
    expect(masteryPrior({ id: "a", priorDistribution: { family: "bernoulli", params: { p: 0.3 } } })).toEqual({ p: 0.3 });
    // Beta(2, 6) has mean 2/8 = 0.25.
    expect(masteryPrior({ id: "a", priorDistribution: { family: "beta", params: { alpha: 2, beta: 6 } } })).toEqual({ p: 0.25 });
  });

  it("defaults an ABSENT prior to 0.5 but refuses a PRESENT degenerate one", () => {
    expect(masteryPrior({ id: "a" })).toEqual({ p: 0.5 });
    expect(masteryPrior({ id: "a", priorDistribution: { family: "bernoulli", params: { p: 1.5 } } }).reason).toMatch(/invalid p/);
    expect(masteryPrior({ id: "a", priorDistribution: { family: "beta", params: { alpha: 0, beta: 2 } } }).reason).toMatch(/must be positive/);
    expect(masteryPrior({ id: "a", priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } } }).reason).toMatch(/not a distribution over a binary attribute/);
  });
});

/* ------------------------------------------------------------------
   3. THE FULL BRANCH, THROUGH accumulateAttributeMastery
------------------------------------------------------------------ */

function binaryAttr(id, p) {
  return { id, type: "binary", label: id, priorDistribution: { family: "bernoulli", params: { p } } };
}

function makeContext(overrides = {}) {
  const {
    family = "dina",
    attributeIds = ["attr-a", "attr-b"],
    smVariables = [binaryAttr("attr-a", 0.5), binaryAttr("attr-b", 0.5)],
    entries = [
      { itemId: "i1", attributeId: "attr-a" },
      { itemId: "i1", attributeId: "attr-b" },
    ],
    parameters = { i1: { slip: 0.1, guess: 0.2 } },
    structureConfig = { qMatrixId: "qm1" },
    group = [{ itemId: "i1", observableId: "o1", activated: true, direction: "supports" }],
  } = overrides;

  const warnings = [];

  return {
    warnings,
    args: {
      evidenceModelId: "em1",
      parameterSetId: "ps1",
      family,
      evidenceModel: { id: "em1", competencyId: "c1" },
      statisticalModel: { id: "sm1", type: family, structureConfig },
      parameterSet: { parameterSetId: "ps1", parameters },
      group,
      db: {
        qMatrixModels: [{ id: "qm1", competencyModelId: "cm1", attributeIds, entries }],
        competencyModels: [{ id: "cm1", smVariables }],
      },
      warnings,
      scoreResponse,
    },
  };
}

describe("accumulateAttributeMastery — the full branch", () => {
  it("produces one posterior PER ATTRIBUTE, each naming its own binary SMV", () => {
    const { args } = makeContext();
    const posteriors = accumulateAttributeMastery(args);

    expect(posteriors).toHaveLength(2);
    expect(posteriors.map((p) => p.smvId)).toEqual(["attr-a", "attr-b"]);

    for (const p of posteriors) {
      expect(p.supported).toBe(true);
      expect(p.smvType).toBe("binary");
      expect(p.method).toBe("attribute-mastery-posterior");
      expect(p.modelFamily).toBe("dina");
      expect(p.competencyModelId).toBe("cm1");
      expect(p.responsesUsed).toBe(1);
      // The hand-computed two-attribute conjunctive fixture from above.
      expect(p.estimate).toBeCloseTo(0.7333333333333334, 12);
      expect(p.precision).toBeCloseTo(Math.sqrt(0.7333333333333334 * (1 - 0.7333333333333334)), 12);
    }
  });

  // D53b: `parameterSource` used to be hardcoded to "calibrated" inside this
  // function (Day 38's own comment said so, because no caller could ever
  // pass anything else). The caller now can, for a 'dina' pilot group --
  // this asserts the value is THREADED THROUGH, not just accepted as a
  // parameter and ignored, and that an omitted parameterSource still
  // defaults to "calibrated" exactly as before (every pre-existing call
  // site in this file omits it).
  it("carries parameterSource through to every posterior when the caller supplies one", () => {
    const { args } = makeContext();
    const posteriors = accumulateAttributeMastery({ ...args, parameterSource: "pilot" });

    expect(posteriors.length).toBeGreaterThan(0);
    for (const p of posteriors) expect(p.parameterSource).toBe("pilot");
  });

  it("defaults parameterSource to 'calibrated' when the caller omits it", () => {
    const { args } = makeContext();
    const posteriors = accumulateAttributeMastery(args);

    for (const p of posteriors) expect(p.parameterSource).toBe("calibrated");
  });

  it("honours evidence-rule direction: a weakens observable inverts the response", () => {
    const supports = accumulateAttributeMastery(makeContext().args);
    const weakens = accumulateAttributeMastery(makeContext({
      group: [{ itemId: "i1", observableId: "o1", activated: true, direction: "weakens" }],
    }).args);

    expect(weakens[0].estimate).toBeLessThan(supports[0].estimate);
    expect(weakens[0].estimate).toBeLessThan(0.5);
  });

  it("excludes an item the Q-matrix does not place, rather than counting it as evidence", () => {
    const { args, warnings } = makeContext({
      group: [
        { itemId: "i1", observableId: "o1", activated: true, direction: "supports" },
        { itemId: "i-unplaced", observableId: "o1", activated: true, direction: "supports" },
      ],
    });
    const posteriors = accumulateAttributeMastery(args);

    expect(posteriors[0].responsesUsed).toBe(1);
    expect(posteriors[0].responsesExcluded).toBe(1);
    expect(warnings.join(" ")).toMatch(/no required attributes for item 'i-unplaced'/);
  });

  it("treats an entry marked required:false as a ZERO cell, not a required attribute", () => {
    const conjunctive = accumulateAttributeMastery(makeContext().args);
    const onlyA = accumulateAttributeMastery(makeContext({
      entries: [
        { itemId: "i1", attributeId: "attr-a" },
        { itemId: "i1", attributeId: "attr-b", required: false },
      ],
    }).args);

    // With attr-b no longer required, a correct answer is stronger
    // evidence for attr-a and no evidence at all about attr-b.
    expect(onlyA[0].estimate).toBeGreaterThan(conjunctive[0].estimate);
    // Day 39 (adversarial review, P1-4): attr-b is now touched by NO
    // scored response's Q-vector, so it is refused rather than reported at
    // the prior it started from -- that used to come back
    // `supported: true, estimate: 0.5`, indistinguishable from a genuine
    // measurement that happened to land at 0.5.
    expect(onlyA[1].supported).toBe(false);
    expect(onlyA[1].reason).toMatch(/No scored response.*required attribute 'attr-b'/);
  });

  it("excludes a response whose item has no calibrated parameters, with a warning", () => {
    const { args, warnings } = makeContext({ parameters: {} });
    const posteriors = accumulateAttributeMastery(args);

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/carried usable diagnostic evidence/);
    expect(warnings.join(" ")).toMatch(/no dina parameters for item 'i1'/);
  });

  it("excludes a non-monotonic DINA item rather than silently inverting it", () => {
    const { args, warnings } = makeContext({ parameters: { i1: { slip: 0.6, guess: 0.5 } } });
    const posteriors = accumulateAttributeMastery(args);

    expect(posteriors[0].supported).toBe(false);
    expect(warnings.join(" ")).toMatch(/unusable DINA parameters for item 'i1'/);
  });

  it("warns about, but still uses, a non-monotonic saturated G-DINA table", () => {
    const { args, warnings } = makeContext({
      family: "gdina",
      parameters: { i1: { probabilities: [0.1, 0.9, 0.5, 0.6] } },
    });
    const posteriors = accumulateAttributeMastery(args);

    expect(posteriors[0].supported).toBe(true);
    expect(warnings.join(" ")).toMatch(/non-monotonic G-DINA table for item 'i1'/);
  });

  it("refuses a G-DINA table of the wrong length for the item's Q-vector", () => {
    const { args, warnings } = makeContext({
      family: "gdina",
      parameters: { i1: { probabilities: [0.2, 0.9] } }, // 2 entries, but 2 attributes need 4
    });
    const posteriors = accumulateAttributeMastery(args);

    expect(posteriors[0].supported).toBe(false);
    expect(warnings.join(" ")).toMatch(/expected a probabilities\[\] of length 4/);
  });
});

describe("accumulateAttributeMastery — refuses rather than guessing", () => {
  const refusalFor = (overrides) => accumulateAttributeMastery(makeContext(overrides).args)[0];

  it("refuses when the statistical model declares no qMatrixId", () => {
    expect(refusalFor({ structureConfig: {} }).reason).toMatch(/declares no structureConfig\.qMatrixId/);
  });

  it("refuses a dangling qMatrixId", () => {
    expect(refusalFor({ structureConfig: { qMatrixId: "qm-ghost" } }).reason).toMatch(/unknown qMatrixId 'qm-ghost'/);
  });

  it("refuses a Q-matrix with no attributes", () => {
    expect(refusalFor({ attributeIds: [] }).reason).toMatch(/declares no attributes/);
  });

  it("refuses a Q-matrix wider than the profile-enumeration cost bound", () => {
    const attributeIds = Array.from({ length: MAX_ATTRIBUTES + 1 }, (_, i) => `a${i}`);
    const result = refusalFor({
      attributeIds,
      smVariables: attributeIds.map((id) => binaryAttr(id, 0.5)),
    });
    expect(result.reason).toMatch(new RegExp(`declares ${MAX_ATTRIBUTES + 1} attributes`));
  });

  it("refuses an attribute the competency model does not define", () => {
    expect(refusalFor({ attributeIds: ["attr-a", "attr-ghost"] }).reason)
      .toMatch(/names attribute 'attr-ghost', which competency model 'cm1' does not define/);
  });

  it("refuses a NON-BINARY attribute -- the Day 18 exit criterion, enforced at delivery", () => {
    const result = refusalFor({
      smVariables: [
        binaryAttr("attr-a", 0.5),
        { id: "attr-b", type: "continuous", priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } } },
      ],
    });
    expect(result.reason).toMatch(/a 'continuous' Student Model Variable. Attribute-mastery accumulation requires binary attributes/);
  });

  it("refuses a degenerate declared prior instead of substituting a default", () => {
    expect(refusalFor({
      smVariables: [binaryAttr("attr-a", 0.5), { id: "attr-b", type: "binary", priorDistribution: { family: "beta", params: { alpha: -1, beta: 2 } } }],
    }).reason).toMatch(/beta prior with invalid parameters/);
  });

  it("reports the refusal once per attribute, so no SMV is silently left out", () => {
    const posteriors = accumulateAttributeMastery(makeContext({ parameters: {} }).args);
    expect(posteriors).toHaveLength(2);
    expect(posteriors.every((p) => p.supported === false)).toBe(true);
    expect(posteriors.map((p) => p.smvId)).toEqual(["attr-a", "attr-b"]);
  });
});

/* ------------------------------------------------------------------
   THROUGH THE PUBLIC DISPATCH
------------------------------------------------------------------ */

describe("accumulateEvidence — dina/gdina reach the attribute branch end to end", () => {
  function diagnosticDb(family = "dina") {
    return {
      competencyModels: [{
        id: "cm1",
        versionNumber: 1,
        smVariables: [binaryAttr("attr-a", 0.5), binaryAttr("attr-b", 0.5)],
      }],
      competencies: [{ id: "c1", modelId: "cm1" }],
      qMatrixModels: [{
        id: "qm1",
        competencyModelId: "cm1",
        attributeIds: ["attr-a", "attr-b"],
        entries: [
          { itemId: "i1", attributeId: "attr-a" },
          { itemId: "i2", attributeId: "attr-b" },
        ],
      }],
      evidenceModels: [{
        id: "em1",
        competencyId: "c1",
        versionNumber: 1,
        observables: [{ id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
        statisticalModels: [{
          id: "sm1",
          type: family,
          active: true,
          structureConfig: { qMatrixId: "qm1" },
          parameterSets: [{
            parameterSetId: "ps1",
            parameters: family === "dina"
              ? { i1: { slip: 0.1, guess: 0.2 }, i2: { slip: 0.15, guess: 0.25 } }
              : { i1: { probabilities: [0.2, 0.9] }, i2: { probabilities: [0.25, 0.85] } },
            packageVersion: "pilot-1",
            converged: true,
            sampleSize: 500,
            calibratedAt: "2026-01-01T00:00:00.000Z",
          }],
          activeParameterSetId: "ps1",
        }],
      }],
    };
  }

  const responseFor = (itemId, activated) => ({
    taskId: `t-${itemId}`, itemId, evidenceModelId: "em1", parameterSetId: "ps1",
    observationId: "o1", observableId: "o1", activated, direction: "supports",
  });

  it("returns a separate posterior for every attribute from one submit", () => {
    const session = { id: "s1", status: "in_progress", responses: [responseFor("i1", true), responseFor("i2", false)] };
    const { posteriors, warnings } = accumulateEvidence(session, diagnosticDb("dina"));

    expect(warnings).toEqual([]);
    expect(posteriors).toHaveLength(2);
    expect(posteriors.map((p) => p.smvId).sort()).toEqual(["attr-a", "attr-b"]);
    expect(posteriors.every((p) => p.supported)).toBe(true);

    // i1 (requires attr-a) correct -> attr-a up; i2 (requires attr-b)
    // incorrect -> attr-b down.
    const a = posteriors.find((p) => p.smvId === "attr-a");
    const b = posteriors.find((p) => p.smvId === "attr-b");
    expect(a.estimate).toBeGreaterThan(0.5);
    expect(b.estimate).toBeLessThan(0.5);
  });

  it("works identically through the gdina family", () => {
    const session = { id: "s1", status: "in_progress", responses: [responseFor("i1", true)] };
    const { posteriors } = accumulateEvidence(session, diagnosticDb("gdina"));

    expect(posteriors).toHaveLength(2);
    // Day 39 (adversarial review, P1-4): only i1 was answered, and i1's
    // Q-vector only requires attr-a (diagnosticDb's i2, the item that
    // requires attr-b, was never submitted) -- so attr-b is correctly
    // refused, not reported at its untouched prior.
    expect(posteriors.find((p) => p.smvId === "attr-a").supported).toBe(true);
    expect(posteriors.find((p) => p.smvId === "attr-a").modelFamily).toBe("gdina");
    expect(posteriors.find((p) => p.smvId === "attr-b").supported).toBe(false);
  });

  it("is deterministic and reproducible from the stored responses alone", () => {
    const db = diagnosticDb("dina");
    const session = () => ({ id: "s1", status: "in_progress", responses: [responseFor("i1", true), responseFor("i2", true)] });

    const first = accumulateEvidence(session(), db).posteriors;
    const second = accumulateEvidence(session(), db).posteriors;

    expect(second).toEqual(first);
  });
});

describe("observable-keyed Q-matrix rows", () => {
  it("uses the observable row and leaves an item-only row out of that response", () => {
    const { args, warnings } = makeContext({
      entries: [
        { itemId: "i1", attributeId: "attr-b" },
        { observableId: "o-a", evidenceModelId: "em1", attributeId: "attr-a" },
      ],
      group: [{
        itemId: "i1",
        observableId: "o-a",
        evidenceModelId: "em1",
        activated: true,
        direction: "supports",
      }],
    });
    const posteriors = accumulateAttributeMastery(args);
    expect(warnings).toEqual([]);
    const attrA = posteriors.find((row) => row.smvId === "attr-a");
    const attrB = posteriors.find((row) => row.smvId === "attr-b");
    // One required attribute, correct response, slip 0.1, guess 0.2, prior 0.5.
    // That is 9/11. The two-attribute conjunctive case is 11/15, so this
    // number is also the proof that the item-only row was not added in.
    expect(attrA.estimate).toBeCloseTo(0.8181818181818181, 10);
    expect(attrA.responsesUsed).toBe(1);
    expect(attrB.supported).toBe(false);
  });

  it("scores two observables from one item against different attributes", () => {
    const { args } = makeContext({
      entries: [
        { observableId: "o-a", evidenceModelId: "em1", attributeId: "attr-a" },
        { observableId: "o-b", evidenceModelId: "em1", attributeId: "attr-b" },
      ],
      group: [
        { itemId: "i1", observableId: "o-a", evidenceModelId: "em1", activated: true, direction: "supports" },
        { itemId: "i1", observableId: "o-b", evidenceModelId: "em1", activated: false, direction: "supports" },
      ],
    });
    const posteriors = accumulateAttributeMastery(args);
    expect(posteriors.every((row) => row.supported)).toBe(true);
    const attrA = posteriors.find((row) => row.smvId === "attr-a");
    const attrB = posteriors.find((row) => row.smvId === "attr-b");
    expect(attrA.responsesUsed).toBe(1);
    expect(attrB.responsesUsed).toBe(1);
    expect(attrA.estimate).toBeGreaterThan(0.5);
    expect(attrB.estimate).toBeLessThan(0.5);
  });
});
