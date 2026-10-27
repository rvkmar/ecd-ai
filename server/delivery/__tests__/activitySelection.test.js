// server/delivery/__tests__/activitySelection.test.js
//
// D56 (Week 12): Activity Selection.
//
// D56's exit check has two halves, and this file is organised around them:
//
//   "Selection reads the library and the live posterior"  -- sections 2-5.
//   "a fixed-policy session is byte-identical to today's behaviour
//    (regression guard), so any change in outcome is attributable to the
//    adaptive policies alone."                            -- section 1.
//
// Section 1 is the load-bearing one and is written as a REFERENCE ORACLE:
// the pre-D56 `fixed` branch is reproduced verbatim from the code this unit
// replaced, and the new module's output is compared to it for deep
// equality, including the absence of any key the old branch did not emit.
// A test that merely asserted `taskId === "t1"` would pass just as happily
// if D56 had quietly added a field, changed `debug`, or started consulting
// a posterior on the fixed path -- none of which would be byte-identical.
//
// Section 5's information-gain numbers are HAND-COMPUTED and written out in
// the comments, in the same spirit as evidenceAccumulation.test.js's own
// hand-computed fixture: they are the only tests here that could catch a
// systematically wrong but internally consistent implementation. They also
// pin the F24 fix explicitly by asserting the module does NOT reproduce the
// old branch's hardcoded-0.5 weighting.

import { describe, it, expect } from "vitest";
import { selectNextActivity, __testing__ } from "../activitySelection.js";
import {
  CONTINUOUS_MODEL_FAMILIES,
  RAW_SCORE_MODEL_FAMILIES,
  itemParametersAreUsable,
} from "../evidenceAccumulation.js";
import { dinaParametersAreUsable } from "../attributeAccumulation.js";

const {
  computeExpectedInformationGain,
  resolveContinuousParameters,
  resolveDinaParameters,
  resolveAssemblyModelForSession,
  evaluateStoppingRules,
  liveThetaFor,
} = __testing__;

/* ------------------------------------------------------------------
   Fixtures
------------------------------------------------------------------ */

const CONTINUOUS_SMV = {
  id: "smv-theta",
  label: "Numerical Reasoning Ability",
  type: "continuous",
  scale: { min: -4, max: 4 },
  priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
};

/** An easy item (b = -1) and a hard one (b = +1), so "closest difficulty
 *  to the current ability estimate" has a visibly correct answer either
 *  side of theta = 0. */
function irtDb(overrides = {}) {
  return {
    competencyModels: [{ id: "cm1", versionNumber: 1, smVariables: [CONTINUOUS_SMV] }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        versionNumber: 1,
        observables: [{ id: "o1" }, { id: "o2" }],
        statisticalModels: [
          {
            id: "sm1",
            active: true,
            type: "irt",
            activeParameterSetId: "ps1",
            parameterSets: [
              {
                parameterSetId: "ps1",
                parameters: { o1: { a: 1, b: -1 }, o2: { a: 1, b: 1 } },
              },
            ],
          },
        ],
      },
    ],
    taskModels: [{ id: "tm1", versionNumber: 1, evidenceModelIds: ["em1"] }],
    items: [
      { id: "item1", taskModelId: "tm1", observationId: "o1", evidenceModelId: "em1", status: "operational" },
      { id: "item2", taskModelId: "tm1", observationId: "o2", evidenceModelId: "em1", status: "operational" },
    ],
    compositeLibrary: [
      {
        id: "cl1",
        taskModelId: "tm1",
        taskModelVersion: 1,
        active: true,
        items: [
          { itemId: "item1", observationId: "o1", evidenceModelId: "em1", evidenceModelVersion: 1 },
          { itemId: "item2", observationId: "o2", evidenceModelId: "em1", evidenceModelVersion: 1 },
        ],
      },
    ],
    tasks: [
      { id: "t1", taskModelId: "tm1", itemId: "item1", questionId: null },
      { id: "t2", taskModelId: "tm1", itemId: "item2", questionId: null },
    ],
    questions: [],
    policies: [{ id: "p-fixed", type: "fixed" }, { id: "p-irt", type: "IRT" }],
    assemblyModels: [],
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    id: "s1",
    taskIds: ["t1", "t2"],
    currentTaskIndex: 0,
    responses: [],
    studentModel: {},
    selectionStrategy: "fixed",
    isCompleted: false,
    ...overrides,
  };
}

/** A live EAP posterior of the shape applyPosteriorsToSession() writes. */
function smvPosterior(overrides = {}) {
  return {
    smvId: "smv-theta",
    smvType: "continuous",
    evidenceModelId: "em1",
    parameterSetId: "ps1",
    parameterSource: "calibrated",
    modelFamily: "irt",
    method: "eap",
    estimate: 0,
    precision: 0.5,
    ...overrides,
  };
}

/* ------------------------------------------------------------------
   1. THE REGRESSION GUARD -- `fixed` is byte-identical to pre-D56
------------------------------------------------------------------ */

/**
 * The pre-D56 `fixed` branch, copied verbatim out of the sessionRoutes.js
 * /next-task handler this unit replaced. Do not "tidy" this: its value is
 * that it is the old code, not a paraphrase of it.
 */
function preD56Fixed(s) {
  if (s.selectionStrategy === "fixed") {
    if (s.currentTaskIndex < s.taskIds.length) {
      return {
        taskId: s.taskIds[s.currentTaskIndex],
        strategy: "fixed",
        debug: { index: s.currentTaskIndex },
      };
    }
    return {};
  }
  return {};
}

describe("D56 exit check, half 1: a fixed-policy session is byte-identical to pre-D56", () => {
  it("matches the old branch exactly at every index, including past the end", () => {
    const db = irtDb();

    for (const index of [0, 1, 2, 5]) {
      const s = session({ currentTaskIndex: index });
      expect(selectNextActivity(s, db)).toEqual(preD56Fixed(s));
    }
  });

  it("emits no key the old branch did not emit", () => {
    const result = selectNextActivity(session({ currentTaskIndex: 0 }), irtDb());

    // Deep equality above would already catch an extra key, but stating it
    // separately makes the intent explicit: no `warnings`, no `stopped`, no
    // `source`, nothing new on a session with no Assembly Model.
    expect(Object.keys(result).sort()).toEqual(["debug", "strategy", "taskId"]);
    expect(Object.keys(result.debug)).toEqual(["index"]);
  });

  it("ignores the composite library, the live posterior and item parameters entirely", () => {
    // A fixed form does not adapt. If any of these inputs could move the
    // fixed path's answer, "changes are attributable to the adaptive
    // policies alone" would be false.
    const rich = session({
      currentTaskIndex: 0,
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 3.5 }) } },
    });
    const bare = session({ currentTaskIndex: 0 });

    const withLibrary = selectNextActivity(rich, irtDb());
    const withoutLibrary = selectNextActivity(bare, irtDb({ compositeLibrary: [], items: [] }));

    expect(withLibrary).toEqual(withoutLibrary);
    expect(withLibrary).toEqual(preD56Fixed(bare));
  });

  it("is driven by currentTaskIndex, not by which tasks have responses", () => {
    // The old branch indexed blindly; it did not filter answered tasks.
    // Preserving that is part of byte-identical, even though the adaptive
    // strategies do filter.
    const s = session({
      currentTaskIndex: 0,
      responses: [{ taskId: "t1" }],
    });

    expect(selectNextActivity(s, irtDb())).toEqual({
      taskId: "t1",
      strategy: "fixed",
      debug: { index: 0 },
    });
  });

  it("an unknown strategy still returns {}, as the old fallthrough did", () => {
    expect(selectNextActivity(session({ selectionStrategy: "MarkovChain" }), irtDb())).toEqual({});
  });
});

/* ------------------------------------------------------------------
   2. IRT reads the LIBRARY
------------------------------------------------------------------ */

describe("IRT Fisher information (CAT criterion)", () => {
  it("matches the 2PL closed form at theta = b (I = a^2 / 4)", () => {
    const { itemInformationFisher } = __testing__;
    expect(itemInformationFisher(0, { a: 1, b: 0, c: 0 })).toBeCloseTo(0.25, 10);
    expect(itemInformationFisher(0, { a: 2, b: 0, c: 0 })).toBeCloseTo(1, 10);
  });
});

describe("D56 exit check, half 2a: selection reads the composite library", () => {
  it("selects the item with greater Fisher information at the live ability estimate", () => {
    const s = session({
      selectionStrategy: "IRT",
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.9 }) } },
    });

    const result = selectNextActivity(s, irtDb());

    // theta = 0.9; both a=1. Item.2 (b=+1) is more informative than Item.1 (b=-1).
    expect(result.taskId).toBe("t2");
    expect(result.strategy).toBe("IRT");
    expect(result.debug).toMatchObject({
      theta: 0.9,
      b: 1,
      itemId: "item2",
      criterion: "max-fisher",
      source: "composite-library",
      parameterSource: "calibrated",
      parameterSetId: "ps1",
    });
    expect(result.debug.information).toBeGreaterThan(0);
    expect(result.debug.diff).toBeCloseTo(0.1, 10);
  });

  it("prefers a more discriminating item over the closest difficulty", () => {
    const db = irtDb();
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = {
      o1: { a: 0.4, b: 0.05, c: 0 },
      o2: { a: 2.0, b: 0.8, c: 0 },
    };
    const s = session({
      selectionStrategy: "IRT",
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0 }) } },
    });
    const result = selectNextActivity(s, db);
    // Closest-b would pick t1 (b=0.05). Max Fisher picks t2.
    expect(result.taskId).toBe("t2");
    expect(result.debug.criterion).toBe("max-fisher");
    expect(result.debug.information).toBeGreaterThan(0.2);
  });

  it("an item present in db.items but ABSENT from the active package is not selectable", () => {
    // This is the test that proves the library is actually the source. If
    // selection re-walked taskModel -> items the way the authoring graph
    // does (the D49c complaint), item2 would still be reachable here.
    const db = irtDb();
    db.compositeLibrary[0].items = db.compositeLibrary[0].items.filter((e) => e.itemId !== "item2");

    const s = session({
      selectionStrategy: "IRT",
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.9 }) } },
    });

    const result = selectNextActivity(s, db);

    expect(result.taskId).toBe("t1");
    expect(result.debug.skipped).toEqual([
      { taskId: "t2", reason: expect.stringContaining("not in the active package") },
    ]);
  });

  it("an INACTIVE package is not used, and the session reports why it can rank nothing", () => {
    const db = irtDb();
    db.compositeLibrary[0].active = false;

    const result = selectNextActivity(session({ selectionStrategy: "IRT" }), db);

    expect(result.taskId).toBeUndefined();
    expect(result.warnings[0]).toContain("No active composite library package");
  });

  it("already-answered tasks are never re-selected", () => {
    const s = session({
      selectionStrategy: "IRT",
      responses: [{ taskId: "t2" }],
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.9 }) } },
    });

    // theta 0.9 would prefer t2 on information; it is answered, so t1.
    expect(selectNextActivity(s, irtDb()).taskId).toBe("t1");
  });
});

/* ------------------------------------------------------------------
   3. IRT reads the LIVE POSTERIOR
------------------------------------------------------------------ */

describe("D56 exit check, half 2b: selection reads the live posterior", () => {
  it("moving the posterior moves the selection", () => {
    const db = irtDb();

    const low = selectNextActivity(
      session({ selectionStrategy: "IRT", studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: -0.9 }) } } }),
      db
    );
    const high = selectNextActivity(
      session({ selectionStrategy: "IRT", studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.9 }) } } }),
      db
    );

    expect(low.taskId).toBe("t1");
    expect(high.taskId).toBe("t2");
  });

  it("falls back to theta = 0 on the first item of a session, as the old branch did", () => {
    const result = selectNextActivity(session({ selectionStrategy: "IRT" }), irtDb());

    expect(result.debug.theta).toBe(0);
    expect(result.debug.smvId).toBeNull();
    // Tie on |b| = 1 either side of 0; first candidate wins, as `>` implies.
    expect(result.taskId).toBe("t1");
  });

  it("does NOT read studentModel.irtTheta on the item path", () => {
    // irtTheta is only ever written by the legacy R-backend branch. An item
    // -path session that trusted it would be reading a number computed from
    // the legacy question bank against items it knows nothing about.
    const s = session({
      selectionStrategy: "IRT",
      studentModel: {
        irtTheta: 3.5,
        smvPosteriors: { "smv-theta": smvPosterior({ estimate: -0.9 }) },
      },
    });

    const result = selectNextActivity(s, irtDb());

    expect(result.debug.theta).toBe(-0.9);
    expect(result.taskId).toBe("t1");
  });

  it("ignores a posterior that is not on the theta scale", () => {
    // An attribute-mastery or raw-score posterior is a probability, not an
    // ability. Differencing it against a difficulty is the same category
    // error assemblyProgress.js refuses for requiredSEM.
    const s = session({
      selectionStrategy: "IRT",
      studentModel: {
        smvPosteriors: {
          attrA: smvPosterior({ smvId: "attrA", method: "map", modelFamily: "dina", estimate: 0.95 }),
        },
      },
    });

    expect(liveThetaFor("em1", s)).toEqual({ theta: 0, smvId: null });
  });

  it("matches a posterior to its own evidence model, not just the first one present", () => {
    const s = session({
      selectionStrategy: "IRT",
      studentModel: {
        smvPosteriors: {
          other: smvPosterior({ smvId: "other", evidenceModelId: "em-elsewhere", estimate: 3.5 }),
          "smv-theta": smvPosterior({ estimate: -0.5 }),
        },
      },
    });

    expect(liveThetaFor("em1", s)).toEqual({ theta: -0.5, smvId: "smv-theta" });
  });
});

/* ------------------------------------------------------------------
   4. AGREEMENT with the scoring path on WHICH parameters are used
------------------------------------------------------------------ */

/**
 * sessionRoutes.js's submit path, reduced to the decision this module must
 * agree with: which parameter SOURCE a given (family, calibrated-set,
 * pilot-values) combination resolves to. Transcribed from the branch at
 * sessionRoutes.js's `if (RAW_SCORE_MODEL_FAMILIES.includes(family))`.
 *
 * Two independent implementations plus an agreement test, per this
 * project's lesson 24 -- rather than extracting a shared helper out of a
 * live scoring path this unit has no other business touching.
 */
function submitPathParameterSource({ family, calibratedParameterSetId, item }) {
  if (RAW_SCORE_MODEL_FAMILIES.includes(family)) return "not-applicable";
  if (calibratedParameterSetId) return "calibrated";
  if (CONTINUOUS_MODEL_FAMILIES.includes(family)) {
    return itemParametersAreUsable(item.psychometrics?.irtParams) ? "pilot" : "refused";
  }
  if (family === "dina") {
    return dinaParametersAreUsable(item.psychometrics?.dinaParams) ? "pilot" : "refused";
  }
  return "refused";
}

describe("selection and scoring agree on which parameters an item is delivered under", () => {
  const cases = [
    { name: "calibrated set active", family: "irt", calibrated: "ps1", irtParams: { a: 1, b: 0.5 } },
    { name: "no calibrated set, usable pilot", family: "irt", calibrated: null, irtParams: { a: 1, b: 0.5 } },
    { name: "no calibrated set, no pilot", family: "irt", calibrated: null, irtParams: undefined },
    { name: "no calibrated set, unusable pilot (a <= 0)", family: "irt", calibrated: null, irtParams: { a: 0, b: 0.5 } },
    { name: "rasch behaves as irt", family: "rasch", calibrated: null, irtParams: { a: 1, b: -0.25 } },
    { name: "gdina has no pilot fallback", family: "gdina", calibrated: null, irtParams: { a: 1, b: 0 } },
  ];

  for (const c of cases) {
    it(`agrees on source: ${c.name}`, () => {
      const evidenceModel = {
        id: "em1",
        statisticalModels: [
          {
            id: "sm1",
            active: true,
            type: c.family,
            activeParameterSetId: c.calibrated,
            parameterSets: c.calibrated
              ? [{ parameterSetId: c.calibrated, parameters: { o1: { a: 1, b: 0.5 } } }]
              : [],
          },
        ],
      };
      const item = { id: "item1", psychometrics: c.irtParams ? { irtParams: c.irtParams } : {} };

      const mine = resolveContinuousParameters("o1", evidenceModel, item);
      const theirs = submitPathParameterSource({
        family: c.family,
        calibratedParameterSetId: c.calibrated,
        item,
      });

      if (theirs === "refused") {
        expect(mine.params).toBeUndefined();
        expect(mine.reason).toBeTruthy();
      } else {
        expect(mine.parameterSource).toBe(theirs);
      }
    });
  }

  it("pilot is never preferred over an active calibrated set, even when the set is missing this observable", () => {
    // THE ONE DELIBERATE DIVERGENCE, pinned so it cannot drift silently.
    // The submit path answers "calibrated" here and lets accumulation
    // exclude the response later. Selection cannot follow it that far --
    // an item chosen on pilot numbers but scored as calibrated contributes
    // no evidence at all -- so selection REFUSES the candidate rather than
    // reaching for the pilot values. Same source ORDER, stricter outcome.
    const evidenceModel = {
      id: "em1",
      statisticalModels: [
        {
          id: "sm1",
          active: true,
          type: "irt",
          activeParameterSetId: "ps1",
          parameterSets: [{ parameterSetId: "ps1", parameters: { somethingElse: { a: 1, b: 0 } } }],
        },
      ],
    };
    const item = { id: "item1", psychometrics: { irtParams: { a: 1, b: 0.5 } } };

    const mine = resolveContinuousParameters("o1", evidenceModel, item);

    expect(mine.params).toBeUndefined();
    expect(mine.parameterSource).toBeUndefined();
    expect(mine.reason).toContain("could be presented but not scored");
  });

  it("DINA: calibrated set wins, pilot is the fallback, gdina gets no pilot", () => {
    const calibrated = {
      id: "sm2",
      active: true,
      type: "dina",
      activeParameterSetId: "ps-d",
      parameterSets: [{ parameterSetId: "ps-d", parameters: { item1: { slip: 0.1, guess: 0.2 } } }],
    };
    const uncalibrated = { id: "sm2", active: true, type: "dina", activeParameterSetId: null, parameterSets: [] };
    const item = { id: "item1", psychometrics: { dinaParams: { slip: 0.15, guess: 0.25 } } };

    expect(resolveDinaParameters("item1", item, calibrated, "dina")).toMatchObject({
      parameterSource: "calibrated",
      params: { slip: 0.1, guess: 0.2 },
    });
    expect(resolveDinaParameters("item1", item, uncalibrated, "dina")).toMatchObject({
      parameterSource: "pilot",
      params: { slip: 0.15, guess: 0.25 },
    });
    expect(resolveDinaParameters("item1", item, { ...uncalibrated, type: "gdina" }, "gdina").params).toBeUndefined();
  });
});

/* ------------------------------------------------------------------
   5. BayesianNetwork -- real information gain (F24)
------------------------------------------------------------------ */

describe("expected information gain is weighted by the actual outcome probabilities (F24)", () => {
  /* HAND-COMPUTED, prior = 0.5, slip = 0.1, guess = 0.2.
       P(u=1 | mastered)     = 1 - slip = 0.9
       P(u=1 | not mastered) = guess    = 0.2
       P(u=1) = 0.5(0.9) + 0.5(0.2)              = 0.55
       P(u=0)                                     = 0.45
       posterior | u=1 = 0.5(0.9)/0.55            = 0.818181...
       posterior | u=0 = 0.5(0.1)/0.45            = 0.111111...
       H(0.5)          = 1
       H(0.818181...)  = 0.684038...
       H(0.111111...)  = 0.503258...
       E[H]  = 0.55(0.684038) + 0.45(0.503258)    = 0.602687...
       gain  = 1 - 0.602687                       = 0.397313...

     The pre-D56 branch's hardcoded 0.5/0.5 weighting would instead give
       E[H]  = 0.5(0.684038) + 0.5(0.503258)      = 0.593648...
       gain  = 0.406352...
     -- asserted against below, so this test fails if that weighting is
     ever reintroduced. */
  it("matches the hand-computed value, and not the old 0.5-weighted one", () => {
    const gain = computeExpectedInformationGain(0.5, 0.1, 0.2);

    expect(gain).toBeCloseTo(0.397313, 6);
    expect(gain).not.toBeCloseTo(0.406352, 4);
  });

  it("the difference from the old weighting is large away from prior = 0.5", () => {
    // prior = 0.8: correct gain 0.275458, 0.5-weighted 0.114044. The old
    // formula understates by a factor of ~2.4 -- it is not a rounding
    // difference, it is a different quantity.
    const gain = computeExpectedInformationGain(0.8, 0.1, 0.2);

    expect(gain).toBeCloseTo(0.275458, 6);
    expect(gain).not.toBeCloseTo(0.114044, 3);
  });

  it("a perfectly discriminating item fully resolves a 50/50 attribute (1 bit)", () => {
    expect(computeExpectedInformationGain(0.5, 0, 0)).toBeCloseTo(1, 10);
  });

  it("an item that cannot discriminate carries no information", () => {
    // slip = 1 - guess: P(correct) is the same whether mastered or not.
    expect(computeExpectedInformationGain(0.5, 0.4, 0.6)).toBeCloseTo(0, 10);
  });

  it("gain is never negative and never exceeds the prior entropy", () => {
    for (const prior of [0.01, 0.2, 0.5, 0.73, 0.99]) {
      for (const [slip, guess] of [[0, 0], [0.1, 0.2], [0.3, 0.3], [0.45, 0.5]]) {
        const gain = computeExpectedInformationGain(prior, slip, guess);
        expect(gain).toBeGreaterThanOrEqual(0);
        expect(gain).toBeLessThanOrEqual(__testing__.entropy(prior) + 1e-12);
      }
    }
  });
});

/** A diagnostic (DINA) fixture: two items requiring different attributes. */
function dinaDb(overrides = {}) {
  return {
    competencyModels: [
      {
        id: "cm1",
        versionNumber: 1,
        smVariables: [
          { id: "attrA", type: "binary" },
          { id: "attrB", type: "binary" },
        ],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "emD",
        competencyId: "c1",
        versionNumber: 1,
        statisticalModels: [
          {
            id: "smD",
            active: true,
            type: "dina",
            activeParameterSetId: null,
            structureConfig: { qMatrixId: "qm1" },
            parameterSets: [],
          },
        ],
      },
    ],
    qMatrixModels: [
      {
        id: "qm1",
        competencyModelId: "cm1",
        status: "confirmed",
        attributeIds: ["attrA", "attrB"],
        entries: [
          { itemId: "itemA", attributeId: "attrA" },
          { itemId: "itemB", attributeId: "attrB" },
        ],
      },
    ],
    taskModels: [{ id: "tmD", versionNumber: 1, evidenceModelIds: ["emD"] }],
    items: [
      { id: "itemA", taskModelId: "tmD", observationId: "oA", evidenceModelId: "emD", psychometrics: { dinaParams: { slip: 0.1, guess: 0.2 } } },
      { id: "itemB", taskModelId: "tmD", observationId: "oB", evidenceModelId: "emD", psychometrics: { dinaParams: { slip: 0.1, guess: 0.2 } } },
    ],
    compositeLibrary: [
      {
        id: "clD",
        taskModelId: "tmD",
        taskModelVersion: 1,
        active: true,
        items: [
          { itemId: "itemA", observationId: "oA", evidenceModelId: "emD", evidenceModelVersion: 1 },
          { itemId: "itemB", observationId: "oB", evidenceModelId: "emD", evidenceModelVersion: 1 },
        ],
      },
    ],
    tasks: [
      { id: "tA", taskModelId: "tmD", itemId: "itemA" },
      { id: "tB", taskModelId: "tmD", itemId: "itemB" },
    ],
    questions: [],
    policies: [{ id: "p-bn", type: "BayesianNetwork" }],
    assemblyModels: [],
    ...overrides,
  };
}

describe("BayesianNetwork selection now runs its own algorithm (F24)", () => {
  it("prefers the item measuring the attribute we are least certain about", () => {
    // attrA is nearly settled (0.97); attrB is a coin flip (0.5). The
    // informative item is the one about attrB.
    const s = session({
      taskIds: ["tA", "tB"],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        smvPosteriors: {
          attrA: smvPosterior({ smvId: "attrA", evidenceModelId: "emD", method: "map", modelFamily: "dina", estimate: 0.97 }),
          attrB: smvPosterior({ smvId: "attrB", evidenceModelId: "emD", method: "map", modelFamily: "dina", estimate: 0.5 }),
        },
      },
    });

    const result = selectNextActivity(s, dinaDb());

    expect(result.taskId).toBe("tB");
    expect(result.strategy).toBe("BayesianNetwork");
    expect(result.debug.totalGain).toBeCloseTo(computeExpectedInformationGain(0.5, 0.1, 0.2), 10);
    expect(result.debug.parameterSource).toBe("pilot");
    expect(result.debug.source).toBe("composite-library");
  });

  it("the preference flips when the beliefs flip", () => {
    const s = session({
      taskIds: ["tA", "tB"],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        smvPosteriors: {
          attrA: smvPosterior({ smvId: "attrA", evidenceModelId: "emD", method: "map", estimate: 0.5 }),
          attrB: smvPosterior({ smvId: "attrB", evidenceModelId: "emD", method: "map", estimate: 0.97 }),
        },
      },
    });

    expect(selectNextActivity(s, dinaDb()).taskId).toBe("tA");
  });

  it("an attribute with no live belief yet contributes nothing rather than a phantom 0.5", () => {
    // The pre-D56 branch's `?? 0.5` is exactly how a strategy comes to look
    // like it is computing something when it is not.
    const s = session({
      taskIds: ["tA", "tB"],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        smvPosteriors: {
          attrA: smvPosterior({ smvId: "attrA", evidenceModelId: "emD", method: "map", estimate: 0.6 }),
        },
      },
    });

    const result = selectNextActivity(s, dinaDb());

    expect(result.taskId).toBe("tA");
    expect(result.debug.unrankable).toEqual([
      { taskId: "tB", reason: expect.stringContaining("No live posterior exists yet") },
    ]);
  });

  it("with no diagnostic data at all it degrades to first-unanswered and SAYS SO", () => {

    // This is the pre-D56 behaviour in every case (F24). Preserving it is

    // deliberate; presenting it as a computed choice is what changed.

    const s = session({ taskIds: ["tA", "tB"], selectionStrategy: "BayesianNetwork" });

    const result = selectNextActivity(s, dinaDb());

    expect(result.taskId).toBe("tA");

    expect(result.debug.fallback).toBe("first-unanswered");

    expect(result.debug.totalGain).toBeNull();

    expect(result.warnings[0]).toContain("fell back to the first unanswered task");

  });

  it("an item requiring no attributes is not rankable", () => {
    const db = dinaDb();
    db.qMatrixModels[0].entries = db.qMatrixModels[0].entries.filter((e) => e.itemId !== "itemB");

    const s = session({
      taskIds: ["tB"],
      selectionStrategy: "BayesianNetwork",
      studentModel: { smvPosteriors: { attrB: smvPosterior({ smvId: "attrB", method: "map", estimate: 0.5 }) } },
    });

    const result = selectNextActivity(s, db);

    expect(result.debug.fallback).toBe("first-unanswered");

    expect(result.debug.unrankable[0].reason).toContain("no required attributes");
  });

  it("ranks an observable-keyed row from the item's observation", () => {
    const db = dinaDb();
    db.qMatrixModels[0].entries = [
      { observableId: "oA", evidenceModelId: "emD", attributeId: "attrA" },
      { observableId: "oB", evidenceModelId: "emD", attributeId: "attrB" },
    ];
    const s = session({
      taskIds: ["tA", "tB"],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        smvPosteriors: {
          attrA: smvPosterior({ smvId: "attrA", evidenceModelId: "emD", method: "map", modelFamily: "dina", estimate: 0.97 }),
          attrB: smvPosterior({ smvId: "attrB", evidenceModelId: "emD", method: "map", modelFamily: "dina", estimate: 0.5 }),
        },
      },
    });

    const result = selectNextActivity(s, db);
    expect(result.taskId).toBe("tB");
    expect(result.strategy).toBe("BayesianNetwork");
  });
});

/* ------------------------------------------------------------------
   6. The Assembly Model, and stopping
------------------------------------------------------------------ */

function assemblyModel(overrides = {}) {
  return {
    id: "am1",
    competencyModelId: "cm1",
    status: "confirmed",
    targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
    stoppingRules: { maxItems: 2 },
    ...overrides,
  };
}

describe("resolving the Assembly Model that governs a session", () => {
  it("resolves the single confirmed model declared for the session's competency model", () => {
    const db = irtDb({ assemblyModels: [assemblyModel()] });
    expect(resolveAssemblyModelForSession(session(), db).assemblyModel.id).toBe("am1");
  });

  it("refuses to guess between two governing models", () => {
    const db = irtDb({ assemblyModels: [assemblyModel(), assemblyModel({ id: "am2" })] });
    const resolution = resolveAssemblyModelForSession(session(), db);

    expect(resolution.assemblyModel).toBeUndefined();
    expect(resolution.reason).toContain("2 Assembly Models govern");
  });

  it("a draft Assembly Model does not govern a live session, and says why", () => {
    const db = irtDb({ assemblyModels: [assemblyModel({ status: "draft" })] });
    const resolution = resolveAssemblyModelForSession(session(), db);

    expect(resolution.assemblyModel).toBeUndefined();
    expect(resolution.reason).toContain("none is confirmed or operational");
  });

  it("a session whose competency model has no Assembly Model resolves none", () => {
    expect(resolveAssemblyModelForSession(session(), irtDb()).assemblyModel).toBeUndefined();
  });
});

describe("stopping rules", () => {
  it("maxItems stops the session once that many responses are recorded", () => {
    const db = irtDb({ assemblyModels: [assemblyModel({ stoppingRules: { maxItems: 2 } })] });
    const s = session({ responses: [{ taskId: "t1" }, { taskId: "t2" }] });

    const result = selectNextActivity(s, db);

    expect(result.taskId).toBeUndefined();
    expect(result.stopped).toMatchObject({ rule: "maxItems", assemblyModelId: "am1" });
  });

  it("maxItems does not stop before it is reached", () => {
    const db = irtDb({ assemblyModels: [assemblyModel({ stoppingRules: { maxItems: 2 } })] });
    const s = session({ responses: [{ taskId: "t1" }], currentTaskIndex: 1 });

    const result = selectNextActivity(s, db);

    expect(result.stopped).toBeUndefined();
    expect(result.taskId).toBe("t2");
  });

  it("minItems alone never stops anything", () => {
    const db = irtDb({ assemblyModels: [assemblyModel({ stoppingRules: { minItems: 1 } })] });
    const s = session({ responses: [{ taskId: "t1" }], currentTaskIndex: 1 });

    expect(selectNextActivity(s, db).stopped).toBeUndefined();
  });

  it("stopping outranks selection: a stopped session is not handed another task", () => {
    const db = irtDb({ assemblyModels: [assemblyModel({ stoppingRules: { maxItems: 1 } })] });
    const s = session({
      selectionStrategy: "IRT",
      responses: [{ taskId: "t1" }],
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.9 }) } },
    });

    const result = selectNextActivity(s, db);

    expect(result.taskId).toBeUndefined();
    expect(result.stopped.rule).toBe("maxItems");
  });

  /* Day 57 rewrote this test's REASON without changing its assertion.
     It was written as "a classification target can never satisfy
     targetsMet before D57", on the premise that assemblyProgress.js
     answers null for all of them. D57 makes most of them evaluable -- but
     not this fixture, because `smv-theta` is continuous and its posterior
     comes back from the EAP branch on the theta scale, which is not a
     mastery probability. So the assertion still holds, now as a scale
     guard rather than an unbuilt-feature guard.

     Worth stating plainly: this fixture is not schema-authorable at all
     (schema.js refuses requiredClassificationAccuracy on a continuous
     SMV) and reaches this code only because the test builds `db`
     directly. It is kept because the guard must hold for records that
     drift past validation, and because the *authorable* version of the
     same collision -- a binary SMV carrying a raw-score model -- is
     covered in attributeClassification.test.js. */
  it("a classification target against a theta-scale posterior never stops a session", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [{ smvId: "smv-theta", requiredClassificationAccuracy: 0.9 }],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    });
    const s = accumulatingSession();

    expect(selectNextActivity(s, db).stopped).toBeUndefined();
  });

  /** A session with real, scoreable responses, so the targetsMet branch
   *  runs the actual accumulation -> assemblyProgress chain rather than a
   *  stand-in for it. */
  function accumulatingSession(overrides = {}) {
    return session({
      selectionStrategy: "IRT",
      currentTaskIndex: 1,
      responses: [
        {
          taskId: "t1",
          itemId: "item1",
          evidenceModelId: "em1",
          evidenceModelVersion: 1,
          observableId: "o1",
          parameterSetId: "ps1",
          parameterSource: "calibrated",
          activated: true,
          direction: "supports",
          strength: 4,
        },
      ],
      ...overrides,
    });
  }

  it("targetsMet stops once every declared target is scored and met", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }], // trivially met
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    });

    const result = selectNextActivity(accumulatingSession(), db);

    expect(result.stopped).toMatchObject({ rule: "targetsMet", assemblyModelId: "am1" });
    expect(result.stopped.targets[0].smvId).toBe("smv-theta");
    expect(result.stopped.reason).toMatch(/Every declared Assembly Model target is scored and met \(1 of 1\)/);
  });

  /* Day 57's end-to-end clause: a DIAGNOSTIC session, driven through the
     real accumulation -> classification -> stopping chain. Before D57 this
     could not happen at all -- assemblyProgress.js answered null for every
     classification target, so a diagnostic Assembly Model's targetsMet rule
     was inert no matter what the student did. No code in THIS module
     changed to make it work; the tri-state D56 built simply started
     carrying a real boolean. */
  describe("a diagnostic session stops on its classification target (D57)", () => {
    function diagnosticSession(overrides = {}) {
      return session({
        taskIds: ["tA", "tB"],
        currentTaskIndex: 1,
        selectionStrategy: "BayesianNetwork",
        responses: [
          {
            taskId: "tA",
            itemId: "itemA",
            evidenceModelId: "emD",
            evidenceModelVersion: 1,
            observableId: "oA",
            parameterSource: "pilot",
            // D53b pins the item's pilot slip/guess onto the response so a
            // later edit to the item cannot rewrite a scored session.
            pilotParams: { slip: 0.1, guess: 0.2 },
            activated: true,
            direction: "supports",
            strength: 4,
          },
        ],
        ...overrides,
      });
    }

    function diagnosticDb(requiredClassificationAccuracy) {
      return dinaDb({
        assemblyModels: [
          assemblyModel({
            targetsBySMV: [{ smvId: "attrA", requiredClassificationAccuracy }],
            stoppingRules: { targetsMet: true, minItems: 1 },
          }),
        ],
      });
    }

    it("stops once the mastery classification is confident enough", () => {
      // One correct response to a slip-0.1 / guess-0.2 item moves attrA's
      // marginal to 0.9/(0.9+0.2) = 0.818..., so a target of 0.8 is met and
      // the session ends on measurement rather than on length.
      const result = selectNextActivity(diagnosticSession(), diagnosticDb(0.8));

      expect(result.taskId).toBeUndefined();
      expect(result.stopped.rule).toBe("targetsMet");

      const target = result.stopped.targets.find((t) => t.smvId === "attrA");
      expect(target.classification).toBe("master");
      expect(target.expectedClassificationAccuracy).toBeCloseTo(0.9 / (0.9 + 0.2), 10);
      expect(target.masteryThreshold).toBe(0.5);
      expect(target.requiredClassificationAccuracy).toBe(0.8);
    });

    it("does NOT stop while the classification is still short of its target", () => {
      // Same evidence, a stricter target: 0.818... < 0.95, so the student
      // gets another item.
      const result = selectNextActivity(diagnosticSession(), diagnosticDb(0.95));

      expect(result.stopped).toBeUndefined();
      expect(result.taskId).toBe("tB");
    });

    it("a SEM stop still reports the shape it always did", () => {
      // The stopped-session record gained classification fields; a
      // continuous target must not have gained them.
      const db = irtDb({
        assemblyModels: [
          assemblyModel({
            targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
            stoppingRules: { targetsMet: true, minItems: 1 },
          }),
        ],
      });

      const target = selectNextActivity(accumulatingSession(), db).stopped.targets[0];

      expect(target.requiredSEM).toBe(5);
      expect(target).not.toHaveProperty("classification");
      expect(target).not.toHaveProperty("requiredClassificationAccuracy");
      expect(target).not.toHaveProperty("expectedClassificationAccuracy");
    });

    /* The live D56/D57 walk that produced "1 of 1" / "Measurement target
       met" after only attrA was scored: an Assembly Model that declared
       BOTH attributes, plus stoppingRules.targetsMet, used to stop as soon
       as the reported slice was met. Multi-attribute diagnostics must
       refuse that. */
    function twoAttributeAm(attrAAccuracy, attrBAccuracy) {
      return dinaDb({
        assemblyModels: [
          assemblyModel({
            targetsBySMV: [
              { smvId: "attrA", requiredClassificationAccuracy: attrAAccuracy },
              { smvId: "attrB", requiredClassificationAccuracy: attrBAccuracy },
            ],
            stoppingRules: { targetsMet: true, minItems: 1 },
          }),
        ],
      });
    }

    function diagnosticResponse(taskId, itemId, observableId) {
      return {
        taskId,
        itemId,
        evidenceModelId: "emD",
        evidenceModelVersion: 1,
        observableId,
        parameterSource: "pilot",
        pilotParams: { slip: 0.1, guess: 0.2 },
        activated: true,
        direction: "supports",
        strength: 4,
      };
    }

    it("does NOT stop when only one of two declared classification targets has a posterior", () => {
      // Same evidence as the single-attribute D57 stop: attrA is master @
      // ~0.818. attrB was never touched, so it must not count as "1 of 1".
      const result = selectNextActivity(diagnosticSession(), twoAttributeAm(0.8, 0.8));

      expect(result.stopped).toBeUndefined();
      expect(result.taskId).toBe("tB");
    });

    it("stops once every declared classification target is scored and met", () => {
      const s = diagnosticSession({
        responses: [
          diagnosticResponse("tA", "itemA", "oA"),
          diagnosticResponse("tB", "itemB", "oB"),
        ],
      });

      const result = selectNextActivity(s, twoAttributeAm(0.8, 0.8));

      expect(result.taskId).toBeUndefined();
      expect(result.stopped.rule).toBe("targetsMet");
      expect(result.stopped.reason).toMatch(/Every declared Assembly Model target is scored and met \(2 of 2\)/);
      expect(result.stopped.targets.map((t) => t.smvId)).toEqual(["attrA", "attrB"]);
      expect(result.stopped.targets.every((t) => t.classification === "master")).toBe(true);
    });

    it("does NOT stop when both declared targets are scored and one is still unmet", () => {
      // Both attributes have a real posterior; attrB's 0.818... is short
      // of 0.95, so the session continues rather than stopping on attrA.
      const s = diagnosticSession({
        responses: [
          diagnosticResponse("tA", "itemA", "oA"),
          diagnosticResponse("tB", "itemB", "oB"),
        ],
      });

      const result = selectNextActivity(s, twoAttributeAm(0.8, 0.95));

      expect(result.stopped).toBeUndefined();
    });
  });

  it("targetsMet does NOT stop while a target is unmet", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0.001 }], // unreachable
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    });

    const result = selectNextActivity(accumulatingSession(), db);

    expect(result.stopped).toBeUndefined();
    expect(result.taskId).toBe("t2");
  });

  it("minItems gates targetsMet even when the targets are already met", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
          stoppingRules: { targetsMet: true, minItems: 5 },
        }),
      ],
    });

    expect(selectNextActivity(accumulatingSession(), db).stopped).toBeUndefined();
  });

  it("no evaluable target is not the same as all targets met", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [{ smvId: "some-other-smv", requiredSEM: 5 }],
          stoppingRules: { targetsMet: true },
        }),
      ],
    });

    expect(selectNextActivity(accumulatingSession(), db).stopped).toBeUndefined();
  });

  it("a session whose accumulation cannot run is never stopped by targetsMet", () => {
    // Whether accumulateEvidence throws on this shape or merely returns no
    // posteriors, the required outcome is the same and is the safe
    // direction: do not stop. A bookkeeping computation that cannot run
    // must never end a student's session on an unevaluated criterion.
    const db = irtDb({
      assemblyModels: [
        assemblyModel({ targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }], stoppingRules: { targetsMet: true } }),
      ],
    });
    const broken = accumulatingSession({ responses: null });

    expect(() => evaluateStoppingRules(broken, db.assemblyModels[0], db)).not.toThrow();
    expect(evaluateStoppingRules(broken, db.assemblyModels[0], db).stop).toBeUndefined();
  });
});

describe("the Assembly Model's selectionAlgorithm pointer advises, it does not override", () => {
  it("warns on a mismatch but keeps using the session's own strategy", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          stoppingRules: { maxItems: 99 },
          selectionAlgorithm: { policyId: "p-irt" },
        }),
      ],
    });
    const s = session({ selectionStrategy: "fixed" });

    const result = selectNextActivity(s, db);

    expect(result.taskId).toBe("t1");
    expect(result.strategy).toBe("fixed");
    expect(result.warnings[0]).toContain("is not applied retroactively");
  });

  it("says nothing when the two agree", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({ stoppingRules: { maxItems: 99 }, selectionAlgorithm: { policyId: "p-fixed" } }),
      ],
    });

    expect(selectNextActivity(session(), db).warnings).toBeUndefined();
  });
});

describe("a cited delivery model is authoritative", () => {
  function deliveryDb(overrides = {}) {
    return irtDb({
      assemblyModels: [
        assemblyModel({ id: "am-draft", status: "draft", stoppingRules: { maxItems: 1 } }),
        assemblyModel({ id: "am-live", status: "confirmed", stoppingRules: { maxItems: 99 } }),
      ],
      deliveryModels: [
        {
          id: "dm1",
          competencyModelId: "cm1",
          assemblyModelId: "am-draft",
          policyId: "p-irt",
          presentationModelId: null,
        },
      ],
      ...overrides,
    });
  }

  it("uses the named assembly model even when another governing model exists", () => {
    const db = deliveryDb();
    const resolution = resolveAssemblyModelForSession(
      session({ deliveryModelId: "dm1", selectionStrategy: "fixed" }),
      db
    );
    expect(resolution.authoritative).toBe(true);
    expect(resolution.assemblyModel.id).toBe("am-draft");
  });

  it("selects with the delivery model's policy and does not warn about the assembly pointer", () => {
    const db = deliveryDb();
    const result = selectNextActivity(
      session({ deliveryModelId: "dm1", selectionStrategy: "fixed" }),
      db
    );
    expect(result.strategy).toBe("IRT");
    expect(result.taskId).toBeTruthy();
    expect((result.warnings || []).join(" ")).not.toContain("not applied retroactively");
  });

  it("stops on the named assembly model, not the inferred governing one", () => {
    const db = deliveryDb();
    const result = selectNextActivity(
      session({
        deliveryModelId: "dm1",
        selectionStrategy: "fixed",
        responses: [{ taskId: "t1" }],
      }),
      db
    );
    expect(result.stopped.rule).toBe("maxItems");
    expect(result.stopped.assemblyModelId).toBe("am-draft");
    expect(result.strategy).toBe("IRT");
  });

  it("does not infer an assembly model when the cited delivery model is missing", () => {
    const db = deliveryDb();
    const resolution = resolveAssemblyModelForSession(
      session({ deliveryModelId: "dm-missing" }),
      db
    );
    expect(resolution.assemblyModel).toBeUndefined();
    expect(resolution.code).toBe("DELIVERY_MODEL_MISSING");
    const result = selectNextActivity(session({ deliveryModelId: "dm-missing" }), db);
    expect(result.stopped).toBeUndefined();
    expect(result.strategy).toBe("fixed");
    expect(result.warnings[0]).toContain("dm-missing");
  });

  it("uses the assembly model policy when that model declares one", () => {
    const db = deliveryDb({
      assemblyModels: [
        assemblyModel({
          id: "am-draft",
          status: "draft",
          stoppingRules: { maxItems: 99 },
          selectionAlgorithm: { policyId: "p-fixed" },
        }),
      ],
    });
    const result = selectNextActivity(
      session({ deliveryModelId: "dm1", selectionStrategy: "IRT" }),
      db
    );
    expect(result.strategy).toBe("fixed");
    expect(result.taskId).toBe("t1");
    expect(result.warnings.join(" ")).toMatch(/drives this session/);
    expect(result.warnings.join(" ")).not.toMatch(/not applied retroactively/);
  });

  it("keeps the advisory warning when no delivery model is cited", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({ stoppingRules: { maxItems: 99 }, selectionAlgorithm: { policyId: "p-irt" } }),
      ],
    });
    const result = selectNextActivity(session({ selectionStrategy: "fixed" }), db);
    expect(result.strategy).toBe("fixed");
    expect(result.warnings[0]).toContain("not applied retroactively");
  });
});

/* ------------------------------------------------------------------
   7. The quarantined legacy question path
------------------------------------------------------------------ */

describe("the legacy question path still works and is the only db.questions reader", () => {
  function legacyDb() {
    const db = irtDb({
      tasks: [
        { id: "t1", taskModelId: "tm1", itemId: null, questionId: "q1" },
        { id: "t2", taskModelId: "tm1", itemId: null, questionId: "q2" },
      ],
      questions: [
        { id: "q1", metadata: { b: -1 } },
        { id: "q2", metadata: { b: 1 } },
      ],
    });
    return db;
  }

  it("selects on legacy question difficulty against studentModel.irtTheta, as before D56", () => {
    const s = session({ selectionStrategy: "IRT", studentModel: { irtTheta: 0.9 } });

    const result = selectNextActivity(s, legacyDb());

    expect(result.taskId).toBe("t2");
    expect(result.debug.source).toBe("legacy-question");
    expect(result.debug.theta).toBe(0.9);
    expect(result.debug.b).toBe(1);
  });

  it("a session mixing item and legacy tasks ranks only the item ones, and says so", () => {
    // Differencing a live posterior against studentModel.irtTheta inside a
    // single comparison would be a scale error: two estimates from
    // different machinery, silently resolved by whichever number happened
    // to be smaller.
    const db = irtDb({
      tasks: [
        { id: "t1", taskModelId: "tm1", itemId: "item1", questionId: null },
        { id: "t2", taskModelId: "tm1", itemId: null, questionId: "q2" },
      ],
      questions: [{ id: "q2", metadata: { b: 0.9 } }],
    });
    // Chosen so the legacy candidate WINS if the two pools are mixed:
    // item1 sits 1.5 away from the live posterior (0.5 vs b = -1), while
    // legacy q2 is an exact match for irtTheta (0.9 vs b = 0.9). A fixture
    // where both scored equally would pass whether the guard existed or
    // not -- which is no test at all.
    const s = session({
      selectionStrategy: "IRT",
      studentModel: {
        irtTheta: 0.9,
        smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.5 }) },
      },
    });

    const result = selectNextActivity(s, db);

    expect(result.taskId).toBe("t1");
    expect(result.debug.source).toBe("composite-library");
    expect(result.warnings[0]).toContain("not on a common scale");
  });

  it("a legacy question with no numeric difficulty is skipped, not crashed on", () => {
    const db = legacyDb();
    db.questions[1] = { id: "q2", metadata: {} };

    const s = session({ selectionStrategy: "IRT", studentModel: { irtTheta: 0.9 } });

    expect(selectNextActivity(s, db).taskId).toBe("t1");
  });
});

/* ------------------------------------------------------------------
   8. Purity
------------------------------------------------------------------ */

describe("selectNextActivity is pure", () => {
  it("mutates neither the session nor the db", () => {
    const db = irtDb({ assemblyModels: [assemblyModel()] });
    const s = session({
      selectionStrategy: "IRT",
      studentModel: { smvPosteriors: { "smv-theta": smvPosterior({ estimate: 0.9 }) } },
    });

    const dbBefore = JSON.stringify(db);
    const sessionBefore = JSON.stringify(s);

    selectNextActivity(s, db);

    expect(JSON.stringify(db)).toBe(dbBefore);
    expect(JSON.stringify(s)).toBe(sessionBefore);
  });

  it("refuses to run without its arguments", () => {
    expect(() => selectNextActivity(null, irtDb())).toThrow(/requires a session/);
    expect(() => selectNextActivity(session(), null)).toThrow(/requires a db/);
  });
});



describe("assembly model content constraints", () => {

  function constrainedDb(constraints, stoppingRules = { maxItems: 99 }) {

    return irtDb({
      taskModels: [
        { id: "tm1", versionNumber: 1, evidenceModelIds: ["em1"], taskModelVariableSettings: [{ taskModelVariableId: "tmv-bloom", variation: "fixed", fixedValue: "remember" }] },
        { id: "tm2", versionNumber: 1, evidenceModelIds: ["em1"] },
      ],
      tasks: [
        { id: "t1", taskModelId: "tm1", itemId: "item1" },
        { id: "t2", taskModelId: "tm1", itemId: "item2" },
        { id: "t3", taskModelId: "tm2", itemId: "item3" },
      ],
      items: [
        { id: "item1", taskModelId: "tm1", observationId: "o1", evidenceModelId: "em1", status: "operational" },
        { id: "item2", taskModelId: "tm1", observationId: "o2", evidenceModelId: "em1", status: "operational" },
        { id: "item3", taskModelId: "tm2", observationId: "o1", evidenceModelId: "em1", status: "operational", metadata: { contentStandardCodes: ["CG-S1"] } },
      ],
      // IRT can only rank a task whose item sits in an active composite
      // library package. tm2 is a second task model, so it needs its own.
      compositeLibrary: [
        {
          id: "cl1",
          taskModelId: "tm1",
          taskModelVersion: 1,
          active: true,
          items: [
            { itemId: "item1", observationId: "o1", evidenceModelId: "em1", evidenceModelVersion: 1 },
            { itemId: "item2", observationId: "o2", evidenceModelId: "em1", evidenceModelVersion: 1 },
          ],
        },
        {
          id: "cl2",
          taskModelId: "tm2",
          taskModelVersion: 1,
          active: true,
          items: [
            { itemId: "item3", observationId: "o1", evidenceModelId: "em1", evidenceModelVersion: 1 },
          ],
        },
      ],
      assemblyModels: [
        assemblyModel({
          stoppingRules,
          constraints,
        }),
      ],
    });

  }



  it("skips a task model that is already at its maximum and keeps a fixed form otherwise unchanged", () => {
    const db = constrainedDb({ taskModelCounts: [{ taskModelId: "tm1", max: 1 }] });
    const open = selectNextActivity(session({ taskIds: ["t1", "t2", "t3"] }), db);
    expect(open.taskId).toBe("t1");
    expect(open.strategy).toBe("fixed");

    const after = selectNextActivity(
      session({
        taskIds: ["t1", "t2", "t3"],
        currentTaskIndex: 1,
        responses: [{ taskId: "t1" }],
      }),
      db
    );
    expect(after.taskId).toBe("t3");
  });

  it("prefers a task that fills an open minimum", () => {
    const db = constrainedDb({
      taskModelCounts: [{ taskModelId: "tm2", min: 1 }],
    });
    const result = selectNextActivity(
      session({ selectionStrategy: "IRT", taskIds: ["t1", "t2", "t3"] }),
      db
    );
    expect(result.taskId).toBe("t3");
  });

  it("does not stop on targetsMet while a minimum can still be filled", () => {
    const db = constrainedDb(
      { taskModelCounts: [{ taskModelId: "tm2", min: 1 }] },
      { targetsMet: true, minItems: 1, maxItems: 99 }
    );
    const s = session({
      selectionStrategy: "fixed",
      taskIds: ["t1", "t2", "t3"],
      currentTaskIndex: 1,
      responses: [
        {
          taskId: "t1",
          itemId: "item1",
          evidenceModelId: "em1",
          evidenceModelVersion: 1,
          observableId: "o1",
          parameterSetId: "ps1",
          parameterSource: "calibrated",
          activated: true,
          direction: "supports",
          strength: 4,
        },
      ],
    });
    const decision = evaluateStoppingRules(s, db.assemblyModels[0], db);
    expect(decision.stop).toBeUndefined();
    expect(decision.warnings.join(" ")).toMatch(/open minimum/);
    expect(selectNextActivity(s, db).taskId).toBe("t3");
  });

  it("stops when every remaining task would break an enemy group or the exposure cap", () => {
    const enemies = constrainedDb({ enemies: [{ itemIds: ["item1", "item2"] }] });
    const blocked = selectNextActivity(
      session({
        selectionStrategy: "IRT",
        taskIds: ["t1", "t2"],
        responses: [{ taskId: "t1" }],
      }),
      enemies
    );
    expect(blocked.stopped.rule).toBe("constraints");
    expect(blocked.stopped.reason).toMatch(/content constraints/);

    const exposure = constrainedDb({ exposure: { maxPerItem: 1 } });
    exposure.tasks = [
      { id: "t1", taskModelId: "tm1", itemId: "item1" },
      { id: "t2", taskModelId: "tm1", itemId: "item1" },
    ];
    const repeated = selectNextActivity(
      session({
        selectionStrategy: "IRT",
        taskIds: ["t1", "t2"],
        responses: [{ taskId: "t1" }],
      }),
      exposure
    );
    expect(repeated.stopped.rule).toBe("constraints");
  });

  it("counts a fixed task model variable value and a content standard code", () => {
    const db = constrainedDb({
      taskModelVariableCounts: [{ taskModelVariableId: "tmv-bloom", value: "remember", max: 1 }],
      contentStandardCounts: [{ code: "CG-S1", min: 1 }],
    });
    const result = selectNextActivity(
      session({
        selectionStrategy: "fixed",
        taskIds: ["t1", "t2", "t3"],
        currentTaskIndex: 1,
        responses: [{ taskId: "t1" }],
      }),
      db
    );
    expect(result.taskId).toBe("t3");
  });

});
