// server/delivery/__tests__/attributeClassification.test.js
//
// Day 57 (Week 12): the mastery classification decision rule. Held to the
// standard the accumulation math it consumes is held to, because the
// failure mode is the same one: "has mastered fractions, 0.83 confident"
// reads exactly as credible whether the rule behind it is right or wrong.
//
//   1. HAND-COMPUTED fixtures with the arithmetic written out.
//   2. THE SCALE GUARD -- including the collision that is authorable today
//      through entirely valid records, not just through drift.
//   3. A KNOWN-PROFILE RECOVERY check driven through the REAL accumulation
//      (computeProfilePosterior), not through this module's own arithmetic.
//   4. THE BORDERLINE/CONFIDENT distinction the unit's exit check names.
//   5. REFUSALS.
//
// ADR 0004 carries the reasoning.

import { describe, it, expect } from "vitest";
import {
  evaluateClassificationTarget,
  classifyAttributeProfile,
  classifyByRule,
  resolveDecision,
  sourcesForPosterior,
  __testing__,
} from "../attributeClassification.js";
import { __testing__ as accumulationTesting } from "../attributeAccumulation.js";

/* evaluateClassificationTarget and classifyAttributeProfile are the public
   exports; the rule they are built from is reached through __testing__ so
   the arithmetic can be tested at the level ADR 0004 reasons about it. */
const {
  classifyMastery,
  meetsClassificationTarget,
  isClassifiablePosterior,
  accuracyFloor,
  DEFAULT_MASTERY_THRESHOLD,
  CLASSIFIABLE_METHOD,
} = __testing__;

const { computeProfilePosterior } = accumulationTesting;

function masteryPosterior(overrides = {}) {
  return {
    smvId: "attr-fractions",
    competencyModelId: "cm1",
    supported: true,
    method: CLASSIFIABLE_METHOD,
    modelFamily: "dina",
    smvType: "binary",
    estimate: 0.9,
    precision: Math.sqrt(0.9 * 0.1),
    ...overrides,
  };
}

/* ------------------------------------------------------------------
   1. HAND-COMPUTED FIXTURES
------------------------------------------------------------------ */

describe("classifyMastery — hand-computed", () => {
  it("classifies above the threshold as master, accuracy = p", () => {
    // p = 0.83 > 0.5, so the assigned class is "master", and the
    // probability that assignment is correct is P(alpha = 1 | X) = 0.83.
    expect(classifyMastery(0.83)).toEqual({
      classification: "master",
      expectedClassificationAccuracy: 0.83,
      threshold: 0.5,
    });
  });

  it("classifies below the threshold as nonmaster, accuracy = 1 - p", () => {
    // p = 0.17 < 0.5 -> "nonmaster", correct with probability
    // P(alpha = 0 | X) = 1 - 0.17 = 0.83.
    const result = classifyMastery(0.17);
    expect(result.classification).toBe("nonmaster");
    expect(result.expectedClassificationAccuracy).toBeCloseTo(0.83, 12);
  });

  it("a certain posterior classifies at accuracy 1", () => {
    expect(classifyMastery(1).expectedClassificationAccuracy).toBe(1);
    expect(classifyMastery(0).expectedClassificationAccuracy).toBe(1);
    expect(classifyMastery(0).classification).toBe("nonmaster");
  });

  it("records the threshold it used on every decision", () => {
    expect(classifyMastery(0.9).threshold).toBe(DEFAULT_MASTERY_THRESHOLD);
    expect(classifyMastery(0.9, 0.8).threshold).toBe(0.8);
  });
});

/* ------------------------------------------------------------------
   THE GENERAL FORM, NOT max(p, 1 - p)
   The two agree at 0.5 and disagree everywhere else. This is the test
   that fails if someone "simplifies" the accuracy to max(p, 1 - p).
------------------------------------------------------------------ */

describe("expected accuracy is the probability of the ASSIGNED class", () => {
  it("at threshold 0.5 it coincides with max(p, 1 - p)", () => {
    for (const p of [0.01, 0.3, 0.49, 0.51, 0.7, 0.99]) {
      expect(classifyMastery(p).expectedClassificationAccuracy).toBeCloseTo(Math.max(p, 1 - p), 12);
    }
  });

  it("at an asymmetric threshold it can be BELOW 0.5, and max() would be wrong", () => {
    // threshold 0.8, p = 0.7: 0.7 is not above the cut, so the rule
    // assigns "nonmaster" -- deliberately, because an asymmetric threshold
    // is an asymmetric loss function. That decision is correct with
    // probability 1 - 0.7 = 0.3. max(p, 1-p) would report 0.7, which is
    // the probability of the class NOT assigned.
    const result = classifyMastery(0.7, 0.8);
    expect(result.classification).toBe("nonmaster");
    expect(result.expectedClassificationAccuracy).toBeCloseTo(0.3, 12);
    expect(result.expectedClassificationAccuracy).not.toBeCloseTo(Math.max(0.7, 0.3), 12);
  });

  it("the floor of the measure moves with the threshold", () => {
    expect(accuracyFloor(0.5)).toBe(0.5);
    expect(accuracyFloor(0.8)).toBeCloseTo(0.2, 12);
    expect(accuracyFloor(0.2)).toBeCloseTo(0.2, 12);
  });
});

/* ------------------------------------------------------------------
   THE EXACT TIE
   masteryPrior() returns {p: 0.5} for an SMV with no declared prior, so
   exactly 0.5 is a value this pipeline produces on purpose.
------------------------------------------------------------------ */

describe("an exact tie is indeterminate, not nonmaster", () => {
  it("reports indeterminate with no accuracy", () => {
    expect(classifyMastery(0.5)).toEqual({
      classification: "indeterminate",
      expectedClassificationAccuracy: null,
      threshold: 0.5,
    });
  });

  it("ties at a non-default threshold too", () => {
    expect(classifyMastery(0.8, 0.8).classification).toBe("indeterminate");
  });

  it("an indeterminate classification meets no target, however low", () => {
    expect(meetsClassificationTarget(null, 0.01)).toBe(false);
  });

  it("an indeterminate target evaluation is not met", () => {
    const result = evaluateClassificationTarget(masteryPosterior({ estimate: 0.5 }), 0.1);
    expect(result.classification).toBe("indeterminate");
    expect(result.met).toBe(false);
    expect(result.expectedClassificationAccuracy).toBeNull();
  });
});

/* ------------------------------------------------------------------
   2. THE SCALE GUARD
------------------------------------------------------------------ */

describe("only a mastery posterior may be classified", () => {
  it("accepts an attribute-mastery posterior", () => {
    expect(isClassifiablePosterior(masteryPosterior())).toBe(true);
  });

  it("refuses an EAP (theta-scale) posterior", () => {
    expect(isClassifiablePosterior({ method: "eap", estimate: 1.7 })).toBe(false);
  });

  it("refuses a raw-score weighted proportion", () => {
    expect(isClassifiablePosterior({ method: "weighted-proportion", estimate: 0.75 })).toBe(false);
  });

  it("refuses a missing or malformed posterior", () => {
    expect(isClassifiablePosterior(null)).toBe(false);
    expect(isClassifiablePosterior(undefined)).toBe(false);
    expect(isClassifiablePosterior({})).toBe(false);
  });

  /* The collision that is AUTHORABLE TODAY, not a drift scenario:
     RAW_SCORE_SMV_TYPES includes "binary", and schema.js REQUIRES
     requiredClassificationAccuracy on a binary SMV. So a binary SMV
     carrying a CTT/sum/threshold model yields smvType "binary" and an
     estimate in [0, 1] that is an observed proportion of score, not a
     posterior probability of mastery. Gating on smvType would let it
     straight through -- the Day 39 P1-6 finding, on this side of the
     module. */
  it("refuses a BINARY SMV carrying a raw-score model — the authorable collision", () => {
    const rawScoreOnBinary = {
      smvId: "attr-fractions",
      supported: true,
      method: "weighted-proportion",
      modelFamily: "ctt",
      smvType: "binary", // <- schema-valid, and NOT a mastery probability
      estimate: 0.88,
    };

    expect(isClassifiablePosterior(rawScoreOnBinary)).toBe(false);

    const result = evaluateClassificationTarget(rawScoreOnBinary, 0.85);
    expect(result.met).toBeNull(); // null, never false, and never true
    expect(result.note).toMatch(/not on that scale/);
    expect(result.note).toMatch(/weighted-proportion/);
    expect(result.classification).toBeUndefined();
  });

  it("a theta-scale estimate is refused rather than classified as a probability", () => {
    // The quiet failure this guard exists for: theta = 1.7 is > 0.5, so an
    // ungated rule would call it "master" and report an "accuracy" of 1.7.
    const result = evaluateClassificationTarget({ method: "eap", modelFamily: "irt", estimate: 1.7 }, 0.9);
    expect(result.met).toBeNull();
    expect(result.expectedClassificationAccuracy).toBeUndefined();
  });
});

/* ------------------------------------------------------------------
   3. KNOWN-PROFILE RECOVERY, THROUGH THE REAL ACCUMULATION
   The exit check's second clause. The posterior here is produced by
   attributeAccumulation.js's own computeProfilePosterior, so this
   exercises accumulation -> classification end to end rather than
   re-testing this module against itself.
------------------------------------------------------------------ */

describe("known-profile recovery", () => {
  const SLIP = 0.1;
  const GUESS = 0.2;

  /** Nine items over three attributes, each attribute measured alone
   *  twice and in two conjunctive pairs -- enough to identify all three. */
  const Q_VECTORS = [[0], [0], [1], [1], [2], [2], [0, 1], [1, 2], [0, 2]];

  /** The DINA modal response for a given true profile: a student with
   *  every required attribute answers correctly (1 - slip = 0.9 > 0.5);
   *  one without answers incorrectly (guess = 0.2 < 0.5). Noise-free, so
   *  the check is about the rule and the updater, not about sampling. */
  function modalResponses(trueProfile) {
    return Q_VECTORS.map((requiredIndices) => ({
      u: requiredIndices.every((a) => trueProfile[a] === 1) ? 1 : 0,
      requiredIndices,
      params: { slip: SLIP, guess: GUESS },
    }));
  }

  function recover(trueProfile) {
    const { marginals } = computeProfilePosterior(
      modalResponses(trueProfile),
      trueProfile.map(() => 0.5), // uninformative priors
      "dina"
    );
    return marginals.map((p) => classifyMastery(p));
  }

  /* STATED TOLERANCE: every attribute must be classified correctly AND
     carry an expected accuracy of at least 0.95. Nine noise-free responses
     at slip 0.1 / guess 0.2 is a generous amount of evidence, so a rule
     that recovers the profile only weakly is as much a failure here as one
     that recovers it wrongly. */
  const TOLERANCE = 0.95;

  it.each([
    [[1, 0, 1]],
    [[0, 0, 0]],
    [[1, 1, 1]],
    [[0, 1, 0]],
    [[1, 1, 0]],
  ])("recovers the true profile %j at the stated tolerance", (trueProfile) => {
    const decisions = recover(trueProfile);

    decisions.forEach((decision, a) => {
      expect(decision.classification).toBe(trueProfile[a] === 1 ? "master" : "nonmaster");
      expect(decision.expectedClassificationAccuracy).toBeGreaterThanOrEqual(TOLERANCE);
    });
  });

  it("recovers every one of the eight profiles over three attributes", () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const trueProfile = [mask & 1, (mask >> 1) & 1, (mask >> 2) & 1];
      const decisions = recover(trueProfile);

      decisions.forEach((decision, a) => {
        expect(decision.classification).toBe(trueProfile[a] === 1 ? "master" : "nonmaster");
      });
    }
  });

  it("weak evidence classifies correctly but reports a LOWER accuracy", () => {
    // One response about attribute 0 instead of nine about three. The
    // classification is still right; what changes is the warrant, and the
    // record has to show that rather than reporting the same confidence.
    const { marginals } = computeProfilePosterior(
      [{ u: 1, requiredIndices: [0], params: { slip: SLIP, guess: GUESS } }],
      [0.5],
      "dina"
    );
    const weak = classifyMastery(marginals[0]);
    const strong = recover([1, 0, 1])[0];

    expect(weak.classification).toBe("master");
    expect(strong.classification).toBe("master");
    expect(weak.expectedClassificationAccuracy).toBeLessThan(strong.expectedClassificationAccuracy);
    expect(weak.expectedClassificationAccuracy).toBeLessThan(TOLERANCE);
  });
});

/* ------------------------------------------------------------------
   4. BORDERLINE vs CONFIDENT — the exit check's third clause
------------------------------------------------------------------ */

describe("a borderline posterior is distinguishable from a confident one", () => {
  it("same classification, different recorded warrant", () => {
    const borderline = classifyMastery(0.51);
    const confident = classifyMastery(0.99);

    expect(borderline.classification).toBe("master");
    expect(confident.classification).toBe("master");
    expect(borderline.expectedClassificationAccuracy).toBeCloseTo(0.51, 12);
    expect(confident.expectedClassificationAccuracy).toBeCloseTo(0.99, 12);
  });

  it("and they are separated by any target above the floor", () => {
    expect(meetsClassificationTarget(classifyMastery(0.51).expectedClassificationAccuracy, 0.9)).toBe(false);
    expect(meetsClassificationTarget(classifyMastery(0.99).expectedClassificationAccuracy, 0.9)).toBe(true);
  });

  it("the exactly-balanced case is its own state, not a weak master", () => {
    expect(classifyMastery(0.5).classification).toBe("indeterminate");
    expect(classifyMastery(0.500001).classification).toBe("master");
  });
});

/* ------------------------------------------------------------------
   TARGET COMPARISON
------------------------------------------------------------------ */

describe("meetsClassificationTarget", () => {
  it("is met exactly at the boundary (>=, mirroring requiredSEM's <=)", () => {
    expect(meetsClassificationTarget(0.85, 0.85)).toBe(true);
  });

  it("is not met just below", () => {
    expect(meetsClassificationTarget(0.8499999, 0.85)).toBe(false);
  });

  it("refuses non-finite inputs rather than coercing them", () => {
    expect(meetsClassificationTarget(NaN, 0.5)).toBe(false);
    expect(meetsClassificationTarget(0.9, NaN)).toBe(false);
    expect(meetsClassificationTarget(0.9, undefined)).toBe(false);
  });
});

describe("evaluateClassificationTarget", () => {
  it("reports met with the full decision attached", () => {
    const result = evaluateClassificationTarget(masteryPosterior({ estimate: 0.94 }), 0.9);
    expect(result).toEqual({
      met: true,
      classification: "master",
      expectedClassificationAccuracy: 0.94,
      threshold: 0.5,
    });
  });

  it("reports FALSE (not null) when the posterior is evaluable but short", () => {
    const result = evaluateClassificationTarget(masteryPosterior({ estimate: 0.7 }), 0.9);
    expect(result.met).toBe(false);
    expect(result.classification).toBe("master");
  });

  it("attaches an advisory for a target at or below the floor", () => {
    const result = evaluateClassificationTarget(masteryPosterior({ estimate: 0.6 }), 0.5);
    expect(result.met).toBe(true);
    expect(result.advisory).toMatch(/cannot fail/);
  });

  it("attaches no advisory for a target above the floor", () => {
    expect(evaluateClassificationTarget(masteryPosterior({ estimate: 0.6 }), 0.55).advisory).toBeUndefined();
  });
});

/* ------------------------------------------------------------------
   5. REFUSALS
------------------------------------------------------------------ */

describe("refusals", () => {
  it.each([NaN, Infinity, -Infinity, undefined, null, "0.9"])(
    "refuses a non-numeric estimate (%s)", (estimate) => {
      expect(classifyMastery(estimate)).toBeNull();
    }
  );

  it.each([-0.0001, 1.0001, 2])("refuses an out-of-range estimate (%s)", (estimate) => {
    expect(classifyMastery(estimate)).toBeNull();
  });

  it("refuses an out-of-range threshold", () => {
    expect(classifyMastery(0.9, 1.5)).toBeNull();
    expect(classifyMastery(0.9, -0.1)).toBeNull();
    expect(classifyMastery(0.9, NaN)).toBeNull();
  });

  it("an unusable estimate on a classifiable posterior is null, with a reason", () => {
    const result = evaluateClassificationTarget(masteryPosterior({ estimate: 1.4 }), 0.9);
    expect(result.met).toBeNull();
    expect(result.note).toMatch(/not a usable/);
  });
});

/* ------------------------------------------------------------------
   6. D59 — classifyAttributeProfile (report surface, no target)
------------------------------------------------------------------ */

describe("classifyAttributeProfile — D59 report profile", () => {
  it("classifies every classifiable posterior and skips the rest", () => {
    const profile = classifyAttributeProfile([
      masteryPosterior({ smvId: "attrA", estimate: 0.9 }),
      masteryPosterior({ smvId: "attrB", estimate: 0.2 }),
      masteryPosterior({ smvId: "theta", method: "eap", estimate: 0.4 }),
      masteryPosterior({ smvId: "unsupported", supported: false, estimate: 0.99 }),
    ]);
    expect(profile.map((r) => r.smvId)).toEqual(["attrA", "attrB"]);
    expect(profile[0]).toMatchObject({
      smvId: "attrA",
      classification: "master",
      expectedClassificationAccuracy: 0.9,
      masteryThreshold: 0.5,
    });
    expect(profile[1].classification).toBe("nonmaster");
    expect(profile[1].expectedClassificationAccuracy).toBeCloseTo(0.8, 12);
  });

  it("accepts the persisted smvPosteriors map (no `supported` flag)", () => {
    const profile = classifyAttributeProfile({
      attrA: {
        smvId: "attrA",
        method: CLASSIFIABLE_METHOD,
        modelFamily: "dina",
        estimate: 0.95,
      },
    });
    expect(profile).toHaveLength(1);
    expect(profile[0].classification).toBe("master");
  });

  it("returns [] for missing or empty input", () => {
    expect(classifyAttributeProfile(undefined)).toEqual([]);
    expect(classifyAttributeProfile(null)).toEqual([]);
    expect(classifyAttributeProfile({})).toEqual([]);
  });
});

/* ------------------------------------------------------------------
   TU1 — authored cut precedence
   SMV masteryThreshold, then Assembly Model masteryThreshold, then a
   mastery decisionRule that defines a cut, then 0.5.
------------------------------------------------------------------ */

const MASTERY_RULE = { type: "mastery", threshold: 0.8, direction: "above" };

describe("resolveDecision — precedence and defaults", () => {
  it("is 0.5 when nothing is authored", () => {
    expect(resolveDecision()).toEqual({ threshold: 0.5, source: "default" });
    expect(resolveDecision({})).toEqual({ threshold: 0.5, source: "default" });
    expect(resolveDecision(null)).toEqual({ threshold: 0.5, source: "default" });
    expect(classifyByRule(0.83, {})).toEqual(classifyMastery(0.83));
    expect(classifyByRule(0.17)).toEqual(classifyMastery(0.17));
  });

  it("prefers the SMV cut, then the Assembly Model cut, then the decision rule", () => {
    const smv = { masteryThreshold: 0.6 };
    const assemblyModel = { masteryThreshold: 0.7 };
    const decisionRule = MASTERY_RULE;

    expect(resolveDecision({ smv, assemblyModel, decisionRule })).toEqual({
      threshold: 0.6,
      source: "smv",
    });
    expect(resolveDecision({ assemblyModel, decisionRule })).toEqual({
      threshold: 0.7,
      source: "assemblyModel",
    });
    expect(resolveDecision({ decisionRule })).toEqual({
      threshold: 0.8,
      source: "decisionRule",
    });
  });

  it("treats an omitted mastery direction as above", () => {
    expect(resolveDecision({
      decisionRule: { type: "mastery", threshold: 0.8 },
    })).toEqual({ threshold: 0.8, source: "decisionRule" });
  });

  it("accepts a mastery rule cut of 0 or 1", () => {
    expect(resolveDecision({
      decisionRule: { type: "mastery", threshold: 0, direction: "above" },
    }).threshold).toBe(0);
    expect(resolveDecision({
      decisionRule: { type: "mastery", threshold: 1, direction: "above" },
    }).threshold).toBe(1);
  });

  it("skips an invalid masteryThreshold and uses the next source", () => {
    expect(resolveDecision({
      smv: { masteryThreshold: 0 },
      assemblyModel: { masteryThreshold: 1 },
      decisionRule: MASTERY_RULE,
    })).toEqual({ threshold: 0.8, source: "decisionRule" });

    expect(resolveDecision({
      smv: { masteryThreshold: 1.2 },
      assemblyModel: { masteryThreshold: 0.66 },
    })).toEqual({ threshold: 0.66, source: "assemblyModel" });
  });

  it("ignores non-cuts and falls back to 0.5", () => {
    const notCuts = [
      { type: "classification", threshold: 0.4, direction: "above" },
      { type: "score_band", threshold: 0.4, direction: "above" },
      { type: "posterior_threshold", threshold: 0.3, direction: "above" },
      { type: "mastery", threshold: 0.2, direction: "below" },
      { type: "mastery", threshold: 0.2, direction: "within" },
      { type: "mastery", threshold: 1.5, direction: "above" },
      { type: "mastery", threshold: "0.8", direction: "above" },
      { cutScore: 5 },
      {},
      null,
    ];
    for (const decisionRule of notCuts) {
      expect(resolveDecision({
        smv: { masteryThreshold: "0.6" },
        assemblyModel: { masteryThreshold: NaN },
        decisionRule,
      })).toEqual({ threshold: 0.5, source: "default" });
    }
  });

  it("classifies at the authored cut, including an exact tie", () => {
    const below = classifyByRule(0.7, { decisionRule: MASTERY_RULE });
    expect(below.classification).toBe("nonmaster");
    expect(below.threshold).toBe(0.8);
    expect(below.expectedClassificationAccuracy).toBeCloseTo(0.3, 12);
    expect(classifyByRule(0.8, { decisionRule: MASTERY_RULE }).classification).toBe("indeterminate");
    expect(classifyByRule(0.7, { smv: { masteryThreshold: 0.65 } }).classification).toBe("master");
  });
});

describe("sourcesForPosterior", () => {
  const posterior = {
    smvId: "attrA",
    competencyModelId: "cm1",
    evidenceModelId: "em1",
    method: "attribute-mastery-posterior",
    estimate: 0.62,
  };

  function dbWith(overrides = {}) {
    return {
      competencyModels: [{
        id: "cm1",
        smVariables: [{ id: "attrA", type: "binary", masteryThreshold: 0.9 }],
      }],
      assemblyModels: [
        { id: "am-live", competencyModelId: "cm1", masteryThreshold: 0.7 },
        { id: "am-draft", competencyModelId: "cm1", masteryThreshold: 0.4 },
      ],
      evidenceModels: [{
        id: "em1",
        decisionRule: { type: "mastery", threshold: 0.55, direction: "above" },
      }],
      deliveryModels: [{ id: "dm1", assemblyModelId: "am-live" }],
      ...overrides,
    };
  }

  it("lets the SMV cut win even when two Assembly Models exist", () => {
    expect(resolveDecision(sourcesForPosterior(posterior, dbWith()))).toEqual({
      threshold: 0.9,
      source: "smv",
    });
  });

  it("does not guess an Assembly Model, and uses the decision rule", () => {
    const db = dbWith({
      competencyModels: [{ id: "cm1", smVariables: [{ id: "attrA", type: "binary" }] }],
    });
    expect(resolveDecision(sourcesForPosterior(posterior, db))).toEqual({
      threshold: 0.55,
      source: "decisionRule",
    });
  });

  it("uses the Assembly Model the session snapshot names", () => {
    const db = dbWith({
      competencyModels: [{ id: "cm1", smVariables: [{ id: "attrA", type: "binary" }] }],
    });
    const sources = sourcesForPosterior(posterior, db, {
      session: { assemblyProgress: { assemblyModelId: "am-draft" } },
    });
    expect(resolveDecision(sources)).toEqual({ threshold: 0.4, source: "assemblyModel" });
  });

  it("uses a cited delivery model when the session has no snapshot", () => {
    const db = dbWith({
      competencyModels: [{ id: "cm1", smVariables: [{ id: "attrA", type: "binary" }] }],
      evidenceModels: [],
    });
    const sources = sourcesForPosterior(posterior, db, {
      session: { deliveryModelId: "dm1" },
    });
    expect(resolveDecision(sources)).toEqual({ threshold: 0.7, source: "assemblyModel" });
  });

  it("prefers a hinted Assembly Model over the session snapshot", () => {
    const db = dbWith({
      competencyModels: [{ id: "cm1", smVariables: [{ id: "attrA", type: "binary" }] }],
    });
    const sources = sourcesForPosterior(posterior, db, {
      assemblyModel: { id: "am-hint", masteryThreshold: 0.62 },
      session: { stopped: { assemblyModelId: "am-draft" } },
    });
    expect(resolveDecision(sources).threshold).toBe(0.62);
  });

  it("uses the single Assembly Model for the competency", () => {
    const db = dbWith({
      competencyModels: [{ id: "cm1", smVariables: [{ id: "attrA", type: "binary" }] }],
      assemblyModels: [{ id: "am-only", competencyModelId: "cm1", masteryThreshold: 0.66 }],
      evidenceModels: [],
    });
    expect(resolveDecision(sourcesForPosterior(posterior, db)).threshold).toBe(0.66);
  });
});
