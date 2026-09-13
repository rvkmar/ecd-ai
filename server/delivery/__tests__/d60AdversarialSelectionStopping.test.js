// server/delivery/__tests__/d60AdversarialSelectionStopping.test.js
//
// D60 — never-compress adversarial review of selection + stopping.
// Tries to REFUTE D56–D58 by running the real modules, not by reading
// their comments. Ranked findings live in
// claude/day60-adversarial-selection-stopping.md.
//
// P0 regression (must stay red if reintroduced):
//   a draft / archived sibling Assembly Model must not disable targetsMet
//   on the unique governing model.
//
// Cheap P1 regressions:
//   draft-only / two-governing matches must warn, not fail silently;
//   /submit after a persisted stop is refused (sessionRoutes.test.js).
//
// Characterisation (deferred P1/P2 — pin today's behaviour so a later
// unit cannot "fix" them by accident without noticing):
//   unmeasured-attribute items stay unrankable; G-DINA falls back to
//   first-unanswered; IRT still ranks nearest difficulty, not max info.

import { describe, it, expect } from "vitest";
import { selectNextActivity, __testing__ } from "../activitySelection.js";
import { resolveAssemblyProgress } from "../assemblyProgress.js";
import { evaluateClassificationTarget } from "../attributeClassification.js";

const { resolveAssemblyModelForSession, computeExpectedInformationGain } = __testing__;

const CONTINUOUS_SMV = {
  id: "smv-theta",
  label: "Numerical Reasoning Ability",
  type: "continuous",
  scale: { min: -4, max: 4 },
  priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
};

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
          { itemId: "itemA2", attributeId: "attrA" },
          { itemId: "itemB", attributeId: "attrB" },
        ],
      },
    ],
    taskModels: [{ id: "tmD", versionNumber: 1, evidenceModelIds: ["emD"] }],
    items: [
      { id: "itemA", taskModelId: "tmD", observationId: "oA", evidenceModelId: "emD", psychometrics: { dinaParams: { slip: 0.1, guess: 0.2 } } },
      { id: "itemA2", taskModelId: "tmD", observationId: "oA2", evidenceModelId: "emD", psychometrics: { dinaParams: { slip: 0.1, guess: 0.2 } } },
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
          { itemId: "itemA2", observationId: "oA2", evidenceModelId: "emD", evidenceModelVersion: 1 },
          { itemId: "itemB", observationId: "oB", evidenceModelId: "emD", evidenceModelVersion: 1 },
        ],
      },
    ],
    tasks: [
      { id: "tA", taskModelId: "tmD", itemId: "itemA" },
      { id: "tA2", taskModelId: "tmD", itemId: "itemA2" },
      { id: "tB", taskModelId: "tmD", itemId: "itemB" },
    ],
    questions: [],
    policies: [{ id: "p-bn", type: "BayesianNetwork" }],
    assemblyModels: [],
    ...overrides,
  };
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

function diagnosticSession(overrides = {}) {
  return session({
    taskIds: ["tA", "tA2", "tB"],
    currentTaskIndex: 1,
    selectionStrategy: "BayesianNetwork",
    responses: [diagnosticResponse("tA", "itemA", "oA")],
    ...overrides,
  });
}

/* ------------------------------------------------------------------
   P0 — draft / archived sibling must not kill targetsMet
------------------------------------------------------------------ */

describe("D60 P0: a sibling Assembly Model must not disable the governing stop", () => {
  it("targetsMet still fires when a draft revision sits next to the operational AM", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          id: "am-live",
          status: "operational",
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
        assemblyModel({
          id: "am-draft",
          status: "draft",
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0.0001 }],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    });

    const result = selectNextActivity(accumulatingSession(), db);

    expect(result.taskId).toBeUndefined();
    expect(result.stopped).toMatchObject({ rule: "targetsMet", assemblyModelId: "am-live" });
    expect(result.stopped.reason).toMatch(/1 of 1/);
  });

  it("targetsMet still fires when the predecessor AM has been archived", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          id: "am-old",
          status: "archived",
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
        assemblyModel({
          id: "am-new",
          status: "confirmed",
          targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    });

    const result = selectNextActivity(accumulatingSession(), db);

    expect(result.stopped).toMatchObject({ rule: "targetsMet", assemblyModelId: "am-new" });
  });

  it("two confirmed models still apply neither — refuse, do not guess", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({ id: "am-a", status: "confirmed", stoppingRules: { targetsMet: true, minItems: 1 } }),
        assemblyModel({ id: "am-b", status: "confirmed", stoppingRules: { targetsMet: true, minItems: 1 } }),
      ],
    });

    const result = selectNextActivity(accumulatingSession(), db);

    expect(result.stopped).toBeUndefined();
    expect(resolveAssemblyModelForSession(accumulatingSession(), db).code).toBe("AMBIGUOUS");
    expect(result.warnings[0]).toMatch(/2 Assembly Models govern/);
  });
});

/* ------------------------------------------------------------------
   P1 — silent fallthroughs that look like smart selection / stopping
------------------------------------------------------------------ */

describe("D60 P1: draft-only or ambiguous AM matches are said out loud", () => {
  it("a draft-only Assembly Model does not stop, and warns why", () => {
    const db = irtDb({
      assemblyModels: [
        assemblyModel({
          status: "draft",
          stoppingRules: { targetsMet: true, minItems: 1, maxItems: 1 },
        }),
      ],
    });

    const result = selectNextActivity(accumulatingSession(), db);

    expect(result.stopped).toBeUndefined();
    expect(result.taskId).toBe("t2");
    expect(result.warnings[0]).toMatch(/none is confirmed or operational/);
  });

  it("no Assembly Model at all stays silent — the D56 byte-identical contract", () => {
    const result = selectNextActivity(session(), irtDb());
    expect(result.warnings).toBeUndefined();
    expect(result.stopped).toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(["debug", "strategy", "taskId"]);
  });
});

describe("D60: classification accuracy is not a CTT proportion", () => {
  it("a weighted-proportion posterior never meets a classification target", () => {
    // Authorable today: binary SMV + sum/CTT model. The estimate is in
    // [0, 1] and looks like a mastery probability. It is not one.
    const decision = evaluateClassificationTarget(
      {
        method: "weighted-proportion",
        modelFamily: "ctt",
        smvType: "binary",
        estimate: 0.99,
        precision: 0.05,
      },
      0.8
    );

    expect(decision.met).toBeNull();
    expect(decision.note).toMatch(/not on that scale/);
  });

  it("a CTT binary session does not stop on requiredClassificationAccuracy", () => {
    const db = {
      competencyModels: [
        { id: "cm1", versionNumber: 1, smVariables: [{ id: "skill", type: "binary" }] },
      ],
      competencies: [{ id: "c1", modelId: "cm1" }],
      evidenceModels: [
        {
          id: "emCtt",
          competencyId: "c1",
          versionNumber: 1,
          statisticalModels: [
            {
              id: "smCtt",
              active: true,
              type: "ctt",
              activeParameterSetId: "ps1",
              structureConfig: { smvId: "skill" },
              parameterSets: [{ parameterSetId: "ps1", parameters: {} }],
            },
          ],
        },
      ],
      taskModels: [{ id: "tmCtt", versionNumber: 1, evidenceModelIds: ["emCtt"] }],
      items: [{ id: "itemC", taskModelId: "tmCtt", observationId: "o1", evidenceModelId: "emCtt" }],
      compositeLibrary: [
        {
          id: "clC",
          taskModelId: "tmCtt",
          taskModelVersion: 1,
          active: true,
          items: [{ itemId: "itemC", observationId: "o1", evidenceModelId: "emCtt", evidenceModelVersion: 1 }],
        },
      ],
      tasks: [
        { id: "t1", taskModelId: "tmCtt", itemId: "itemC" },
        { id: "t2", taskModelId: "tmCtt", itemId: "itemC" },
      ],
      questions: [],
      policies: [{ id: "p-fixed", type: "fixed" }],
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [{ smvId: "skill", requiredClassificationAccuracy: 0.5 }],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    };

    const s = session({
      currentTaskIndex: 1,
      responses: [
        {
          taskId: "t1",
          itemId: "itemC",
          evidenceModelId: "emCtt",
          evidenceModelVersion: 1,
          observableId: "o1",
          parameterSetId: "ps1",
          parameterSource: "not-applicable",
          activated: true,
          direction: "supports",
          strength: 4,
        },
      ],
    });

    const result = selectNextActivity(s, db);

    expect(result.stopped).toBeUndefined();
    expect(result.taskId).toBe("t2");
  });
});

/* ------------------------------------------------------------------
   Dual-attribute: stopping is closed; selection-side hole remains
------------------------------------------------------------------ */

describe("D60: dual-attribute — stopping closed, selection hole remains", () => {
  function twoAttributeAm() {
    return dinaDb({
      assemblyModels: [
        assemblyModel({
          targetsBySMV: [
            { smvId: "attrA", requiredClassificationAccuracy: 0.8 },
            { smvId: "attrB", requiredClassificationAccuracy: 0.8 },
          ],
          stoppingRules: { targetsMet: true, minItems: 1 },
        }),
      ],
    });
  }

  it("does NOT stop after only attrA is scored (D56 walk / D58 finding, closed)", () => {
    const result = selectNextActivity(diagnosticSession(), twoAttributeAm());

    expect(result.stopped).toBeUndefined();
  });

  it("P1 characterisation: an unmeasured-attribute item stays unrankable while an attrA item remains", () => {
    // Production /submit writes smvPosteriors via applyPosteriorsToSession;
    // BayesianNetwork ranks those persisted beliefs, it does not re-run
    // accumulation. After tA, attrA is on the session and attrB is not.
    // itemB cannot compete (D56 refused to invent a 0.5 prior). Remaining
    // attrA items win. Combined with a tight maxItems this can exhaust
    // the form without ever measuring attrB. Held — a prior-choice change.
    const s = diagnosticSession({
      studentModel: {
        smvPosteriors: {
          attrA: {
            smvId: "attrA",
            evidenceModelId: "emD",
            method: "attribute-mastery-posterior",
            modelFamily: "dina",
            estimate: 0.8181818181818182,
          },
        },
      },
    });
    const result = selectNextActivity(s, twoAttributeAm());

    expect(result.taskId).toBe("tA2");
    expect(result.debug.fallback).toBeUndefined();
    expect(result.debug.unrankable).toEqual([
      { taskId: "tB", reason: expect.stringContaining("No live posterior exists yet") },
    ]);
  });

  it("once only the unmeasured-attribute item remains, first-unanswered fallback presents it", () => {
    const s = diagnosticSession({
      taskIds: ["tA", "tB"],
      responses: [diagnosticResponse("tA", "itemA", "oA")],
    });
    const result = selectNextActivity(s, twoAttributeAm());

    expect(result.stopped).toBeUndefined();
    expect(result.taskId).toBe("tB");
    expect(result.debug.fallback).toBe("first-unanswered");
  });
});

/* ------------------------------------------------------------------
   Characterisation of held / remaining gaps
------------------------------------------------------------------ */

describe("D60 characterisation: G-DINA BayesianNetwork is sequential", () => {
  it("a calibrated G-DINA item cannot be ranked and falls back with a warning", () => {
    // resolveDinaParameters requires family === "dina" AND slip/guess.
    // A G-DINA probability table is never usable there, so every
    // candidate is unrankable. F24-shaped: strategy name says
    // BayesianNetwork; the choice is first-unanswered. Held — real
    // G-DINA information gain is its own unit.
    const db = dinaDb();
    db.evidenceModels[0].statisticalModels[0] = {
      id: "smG",
      active: true,
      type: "gdina",
      activeParameterSetId: "psG",
      structureConfig: { qMatrixId: "qm1" },
      parameterSets: [
        {
          parameterSetId: "psG",
          parameters: {
            itemA: { table: [0.2, 0.8] },
            itemB: { table: [0.2, 0.8] },
          },
        },
      ],
    };

    const s = session({
      taskIds: ["tA", "tB"],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        smvPosteriors: {
          attrA: {
            smvId: "attrA",
            method: "attribute-mastery-posterior",
            estimate: 0.5,
          },
          attrB: {
            smvId: "attrB",
            method: "attribute-mastery-posterior",
            estimate: 0.5,
          },
        },
      },
    });

    const result = selectNextActivity(s, db);

    expect(result.taskId).toBe("tA");
    expect(result.debug.fallback).toBe("first-unanswered");
    expect(result.warnings[0]).toMatch(/fell back to the first unanswered task/);
    expect(result.debug.unrankable[0].reason).toMatch(/no usable 'gdina' parameters/);
  });
});

describe("D60 characterisation: IRT still ranks nearest difficulty, not max information", () => {
  it("a low-a item closer to theta beats a high-a item slightly farther away", () => {
    // Held for the benchmark unit. This test exists so a quiet swap to
    // Fisher information cannot land inside a "cleanup" without failing.
    const db = irtDb();
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = {
      o1: { a: 0.4, b: 0.05 },
      o2: { a: 2.5, b: 0.35 },
    };

    const result = selectNextActivity(
      session({
        selectionStrategy: "IRT",
        studentModel: {
          smvPosteriors: {
            "smv-theta": {
              smvId: "smv-theta",
              evidenceModelId: "em1",
              method: "eap",
              estimate: 0,
            },
          },
        },
      }),
      db
    );

    expect(result.taskId).toBe("t1");
    expect(result.debug.b).toBe(0.05);
    expect(result.debug.diff).toBeCloseTo(0.05, 10);
  });
});

describe("D60: unknown strategy is still an empty object, not a silent sequential pick", () => {
  it("does not fall through to first-unanswered wearing another strategy's name", () => {
    const result = selectNextActivity(session({ selectionStrategy: "MarkovChain" }), irtDb());
    expect(result).toEqual({});
  });
});

describe("D60: progress against a caller-supplied AM cannot be vetoed by a sibling", () => {
  it("evaluate path: resolveAssemblyProgress({ assemblyModel }) uses that model", () => {
    const preferred = assemblyModel({
      id: "am-live",
      status: "operational",
      targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 5 }],
    });
    const result = resolveAssemblyProgress(
      [
        {
          smvId: "smv-theta",
          competencyModelId: "cm1",
          supported: true,
          estimate: 0.1,
          precision: 0.2,
          method: "eap",
          modelFamily: "irt",
        },
      ],
      { assemblyModels: [preferred, assemblyModel({ id: "am-other", status: "confirmed" })] },
      { assemblyModel: preferred }
    );

    expect(result).toHaveLength(1);
    expect(result[0].assemblyModelId).toBe("am-live");
    expect(result[0].stoppingCriterionMet).toBe(true);
  });
});

describe("D60: expected information gain is still the F24-weighted quantity", () => {
  it("has not regressed to the dead branch's 0.5/0.5 weighting", () => {
    const gain = computeExpectedInformationGain(0.8, 0.1, 0.2);
    expect(gain).toBeCloseTo(0.275458, 6);
    expect(gain).not.toBeCloseTo(0.114044, 3);
  });
});
