// src/utils/__tests__/assemblySufficiency.test.js
// EM-R5: confirm hard-gates Assembly floors; reviewed stays soft (Step 7).

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { evaluateAssemblySufficiency } from "../assemblySufficiency.js";

const competency = {
  id: "c_theta",
  name: "Newtonian Proficiency Theta",
  variableType: "continuous",
  modelId: "cm1",
};

const cm = {
  id: "cm1",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
  smVariables: [
    {
      id: "c_theta",
      label: "Newtonian Proficiency Theta",
      type: "continuous",
      scale: { min: -4, max: 4 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
    },
  ],
};

const assembly = {
  id: "am1",
  name: "Grade 10 Newtonian Mechanics Assembly",
  competencyModelId: "cm1",
  status: "operational",
  targetsBySMV: [{ smvName: "Newtonian Proficiency Theta", requiredSEM: 0.35 }],
};

function thinEm(overrides = {}) {
  return {
    id: "em1",
    name: "Theta thin",
    description: "Test",
    competencyId: "c_theta",
    competencyModelVersion: 1,
    status: "confirmed",
    claimStatement:
      "The student can apply Newtonian ideas in Overall Proficiency contexts within Newtonian Mechanics across Grade 10 situations, with performance patterns sufficient to support a continuous proficiency estimate.",
    warrants: [
      {
        id: "w1",
        reasoningStatement: "Mixed items support a general proficiency claim.",
        cognitiveAttribute: "Integration",
        performanceCondition: "Given mixed items under Grade 10 constraints.",
        limitationClause: "Does not replace attribute diagnostics.",
        rebuttalCondition: "Facet imbalance may inflate proficiency.",
        observableEvidence: "Scored mixed-item outcomes.",
        warrantRule: "If keyed, support higher theta.",
        backingEvidence: "TR9 continuous SMV via IRT.",
      },
    ],
    observables: [{ id: "o1", type: "selected_response", warrantId: "w1" }],
    evidenceRules: [
      {
        id: "er1",
        observableId: "o1",
        direction: "supports",
        strengthLevel: 3,
        activationCondition: "keyed",
        justification: "Keyed response supports the claim.",
      },
    ],
    evaluationProcedures: [
      {
        id: "ep1",
        observableId: "o1",
        workProductType: "mcq_selection",
        method: "key",
        description: "Answer key for the mixed proficiency item stem.",
        artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
      },
    ],
    fairnessNotes: "Fairness review notes for thin EM assembly sufficiency tests (EM-R5).",
    difReviewChecklist: [
      { id: "d1", prompt: "Gender?", status: "pass", note: "ok" },
      { id: "d2", prompt: "Language?", status: "pass", note: "ok" },
      { id: "d3", prompt: "Access?", status: "na", note: "n/a" },
    ],
    decisionRule: {
      type: "posterior_threshold",
      threshold: 0,
      direction: "above",
      justification: "EAP theta above zero supports higher proficiency.",
    },
    statisticalModels: [
      {
        id: "sm1",
        type: "irt",
        subtype: "2pl",
        active: true,
        structureConfig: { observableIds: ["o1"], dimensions: 1 },
        parameterSets: [
          {
            parameterSetId: "ps1",
            parameters: { o1: { a: 1, b: 0 } },
            packageVersion: "test-1.0.0",
            converged: true,
            sampleSize: 100,
            calibratedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        activeParameterSetId: "ps1",
      },
    ],
    ...overrides,
  };
}

describe("evaluateAssemblySufficiency", () => {
  it("warns and errors when SEM target has too few observables and empty plan", () => {
    const { warnings, errors } = evaluateAssemblySufficiency(thinEm({ calibrationPlan: {} }), {
      assemblyModels: [assembly],
      competencies: [competency],
    });
    expect(warnings.some((w) => /SEM/i.test(w))).toBe(true);
    expect(errors.some((e) => /at least 3 observables/i.test(e))).toBe(true);
    expect(errors.some((e) => /pilotSampleSize/i.test(e))).toBe(true);
  });
});

describe("validateEntity confirm hard-gate (EM-R5)", () => {
  it("refuses confirmed EM with Assembly SEM target and thin observables", () => {
    const db = {
      competencyModels: [cm],
      competencies: [competency],
      assemblyModels: [assembly],
    };
    const { valid, errors } = validateEntity(
      "evidenceModels",
      thinEm({ calibrationPlan: { pilotSampleSize: 200 } }),
      db,
      { strict: true }
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /at least 3 observables/i.test(e))).toBe(true);
  });

  it("passes when observables and calibrationPlan meet floors", () => {
    const db = {
      competencyModels: [cm],
      competencies: [competency],
      assemblyModels: [assembly],
    };
    const em = thinEm({
      calibrationPlan: { pilotSampleSize: 200, method: "mirt 2PL" },
      observables: [
        { id: "o1", type: "selected_response", warrantId: "w1" },
        { id: "o2", type: "selected_response", warrantId: "w1" },
        { id: "o3", type: "selected_response", warrantId: "w1" },
      ],
      evidenceRules: [
        {
          id: "er1",
          observableId: "o1",
          direction: "supports",
          strengthLevel: 3,
          activationCondition: "keyed",
          justification: "Keyed response supports the claim.",
        },
        {
          id: "er2",
          observableId: "o2",
          direction: "supports",
          strengthLevel: 3,
          activationCondition: "keyed",
          justification: "Keyed response supports the claim.",
        },
        {
          id: "er3",
          observableId: "o3",
          direction: "supports",
          strengthLevel: 3,
          activationCondition: "keyed",
          justification: "Keyed response supports the claim.",
        },
      ],
      evaluationProcedures: [
        {
          id: "ep1",
          observableId: "o1",
          workProductType: "mcq_selection",
          method: "key",
          description: "Answer key for proficiency item stem one.",
          artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
        },
        {
          id: "ep2",
          observableId: "o2",
          workProductType: "mcq_selection",
          method: "key",
          description: "Answer key for proficiency item stem two.",
          artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
        },
        {
          id: "ep3",
          observableId: "o3",
          workProductType: "mcq_selection",
          method: "key",
          description: "Answer key for proficiency item stem three.",
          artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
        },
      ],
      statisticalModels: [
        {
          id: "sm1",
          type: "irt",
          subtype: "2pl",
          active: true,
          structureConfig: { observableIds: ["o1", "o2", "o3"], dimensions: 1 },
          parameterSets: [
            {
              parameterSetId: "ps1",
              parameters: {
                o1: { a: 1, b: 0 },
                o2: { a: 1, b: 0.2 },
                o3: { a: 1.1, b: -0.1 },
              },
              packageVersion: "test-1.0.0",
              converged: true,
              sampleSize: 100,
              calibratedAt: "2026-09-01T00:00:00.000Z",
            },
          ],
          activeParameterSetId: "ps1",
        },
      ],
    });
    const { errors } = validateEntity("evidenceModels", em, db, { strict: true });
    expect(errors.filter((e) => /Assembly/i.test(e))).toEqual([]);
  });

  it("does not hard-gate at reviewed (soft warnings only via evaluateAssemblySufficiency)", () => {
    const db = {
      competencyModels: [cm],
      competencies: [competency],
      assemblyModels: [assembly],
    };
    const em = thinEm({ status: "reviewed", calibrationPlan: {} });
    // Drop confirm-only parameter requirements noise by not using strict.
    const { errors } = validateEntity("evidenceModels", em, db, { strict: false });
    expect(errors.filter((e) => /Assembly/i.test(e))).toEqual([]);
    const { warnings } = evaluateAssemblySufficiency(em, db);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
