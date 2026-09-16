// src/utils/__tests__/evidenceModelEnterpriseFields.test.js
// Enterprise EM gates: evaluationProcedures, fairnessNotes, difReviewChecklist.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";

const competency = {
  id: "c_force",
  name: "Force Concept Mastery",
  variableType: "binary",
  modelId: "cm1",
  facet: "Force Concepts",
  states: [{ value: "non-mastery" }, { value: "mastery" }],
};

const cm = {
  id: "cm1",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
  smVariables: [
    {
      id: "c_force",
      label: "Force Concept Mastery",
      type: "binary",
      scale: { states: ["non-mastery", "mastery"] },
    },
  ],
};

function baseEm(overrides = {}) {
  return {
    id: "em1",
    name: "Force EM",
    description: "Test",
    competencyId: "c_force",
    competencyModelVersion: 1,
    claimStatement:
      "The student can identify action-reaction force pairs in Force Concepts contexts across textbook diagrams, with reasoning sufficient to distinguish impetus misconceptions at mastery level.",
    warrants: [
      {
        id: "w1",
        reasoningStatement: "Naming action-reaction pairs requires third-law reasoning rather than impetus.",
        cognitiveAttribute: "Concept Differentiation",
        performanceCondition: "Given an interacting-pair diagram.",
        limitationClause: "Does not prove net-force composition.",
      },
    ],
    observables: [
      {
        id: "obs1",
        statement: "The learner selects both members of an action-reaction pair.",
        type: "selected_response",
        warrantId: "w1",
        boundaryNote: "Qualitative equality only.",
        evidenceRule: {
          direction: "supports",
          strengthLevel: 4,
          activationCondition: "Both members named.",
          justification: "Supports the third-law warrant.",
        },
      },
    ],
    evidenceRules: [
      {
        id: "er1",
        observableId: "obs1",
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "Both members named.",
        justification: "Supports the third-law warrant.",
      },
    ],
    statisticalModels: [
      {
        id: "sm1",
        type: "irt",
        subtype: "1pl",
        active: true,
        structureConfig: { observableIds: ["obs1"], dimensions: 1 },
        parameterSets: [],
        activeParameterSetId: null,
      },
    ],
    decisionRule: {
      type: "mastery",
      threshold: 0.7,
      direction: "above",
      justification: "Mastery after calibration on a Grade 10 pilot.",
    },
    evaluationProcedures: [
      {
        id: "ep1",
        observableId: "obs1",
        workProductType: "mcq_selection",
        workProductId: "wp_force_mcq",
        method: "key",
        description: "Answer key maps selected option to dichotomous observable value.",
        artifactRef: "inline:key/obs1",
        artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
      },
    ],
    fairnessNotes:
      "Diagram vocabulary is introduced in an orientation screen; residual language risk accepted for Grade 10.",
    difReviewChecklist: [
      { id: "dif1", prompt: "Gender DIF on force-pair items reviewed?", status: "pass" },
      { id: "dif2", prompt: "Language-load review completed?", status: "pass" },
      { id: "dif3", prompt: "Diagram accessibility checked?", status: "na", note: "Text-only alt forms planned." },
    ],
    calibrationPlan: {
      pilotSampleSize: 200,
      method: "mml",
      packageHint: "mirt",
      targetFitNotes: "Aim for outfit within 0.7–1.3 after pilot.",
    },
    status: "draft",
    locked: false,
    ...overrides,
  };
}

function db() {
  return {
    competencies: [competency],
    competencyModels: [cm],
    evidenceModels: [],
    qMatrixModels: [],
  };
}

describe("evidence model enterprise fields", () => {
  it("accepts a draft with evaluation procedures and fairness fields", () => {
    const { valid, errors } = validateEntity("evidenceModels", baseEm(), db(), { strict: true });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("strict mode requires one evaluationProcedure per observable", () => {
    const em = baseEm({ evaluationProcedures: [] });
    const { errors } = validateEntity("evidenceModels", em, db(), { strict: true });
    expect(errors.some((e) => /evaluationProcedure/i.test(e))).toBe(true);
  });

  it("reviewed status requires a bakeable scoring artifact for key methods", () => {
    const em = baseEm({
      status: "reviewed",
      evaluationProcedures: [
        {
          id: "ep1",
          observableId: "obs1",
          workProductType: "mcq_selection",
          method: "key",
          description: "Answer key maps selected option to dichotomous observable value.",
        },
      ],
    });
    const { errors } = validateEntity("evidenceModels", em, db(), { strict: false });
    expect(errors.some((e) => /artifact/i.test(e))).toBe(true);
  });

  it("allows multiple evaluationProcedures that share a workProductId (TR9 multi-OV)", () => {
    const em = baseEm({
      observables: [
        {
          id: "obs1",
          statement: "The learner selects both members of an action-reaction pair.",
          type: "selected_response",
          warrantId: "w1",
          boundaryNote: "Qualitative equality only.",
          evidenceRule: {
            direction: "supports",
            strengthLevel: 4,
            activationCondition: "Both members named.",
            justification: "Supports the third-law warrant.",
          },
        },
        {
          id: "obs2",
          statement: "The learner names the interaction objects correctly.",
          type: "selected_response",
          warrantId: "w1",
          boundaryNote: "Labels only.",
          evidenceRule: {
            direction: "supports",
            strengthLevel: 3,
            activationCondition: "Objects named.",
            justification: "Converging evidence for the same warrant.",
          },
        },
      ],
      evidenceRules: [
        {
          id: "er1",
          observableId: "obs1",
          direction: "supports",
          strengthLevel: 4,
          activationCondition: "Both members named.",
          justification: "Supports the third-law warrant.",
        },
        {
          id: "er2",
          observableId: "obs2",
          direction: "supports",
          strengthLevel: 3,
          activationCondition: "Objects named.",
          justification: "Converging evidence.",
        },
      ],
      statisticalModels: [
        {
          id: "sm1",
          type: "irt",
          subtype: "1pl",
          active: true,
          structureConfig: { observableIds: ["obs1", "obs2"], dimensions: 1 },
          parameterSets: [],
          activeParameterSetId: null,
        },
      ],
      evaluationProcedures: [
        {
          id: "ep1",
          observableId: "obs1",
          workProductId: "wp_shared",
          workProductType: "mcq_selection",
          method: "key",
          description: "Key scores pair selection from the shared stem.",
          artifactRef: "inline:key/obs1",
          artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
        },
        {
          id: "ep2",
          observableId: "obs2",
          workProductId: "wp_shared",
          workProductType: "mcq_selection",
          method: "key",
          description: "Key scores object labels from the same stem.",
          artifactRef: "inline:key/obs2",
          artifact: { kind: "key", correctPatterns: [{ labeled: "both" }] },
        },
      ],
    });
    const { valid, errors } = validateEntity("evidenceModels", em, db(), { strict: true });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("strict mode refuses observables missing from the active statistical model", () => {
    const em = baseEm({
      statisticalModels: [
        {
          id: "sm1",
          type: "irt",
          subtype: "1pl",
          active: true,
          structureConfig: { observableIds: ["other"], dimensions: 1 },
          parameterSets: [],
          activeParameterSetId: null,
        },
      ],
    });
    const { errors } = validateEntity("evidenceModels", em, db(), { strict: true });
    expect(errors.some((e) => /structureConfig\.observableIds/i.test(e))).toBe(true);
  });

  it("strict mode refuses pending DIF checklist rows", () => {
    const em = baseEm({
      difReviewChecklist: [
        { id: "dif1", prompt: "Gender DIF?", status: "pending" },
        { id: "dif2", prompt: "Language?", status: "pass" },
        { id: "dif3", prompt: "Access?", status: "pass" },
      ],
    });
    const { errors } = validateEntity("evidenceModels", em, db(), { strict: true });
    expect(errors.some((e) => /pending/i.test(e))).toBe(true);
  });

  it("reviewed status requires meaningful fairnessNotes", () => {
    const em = baseEm({ status: "reviewed", fairnessNotes: "" });
    const { errors } = validateEntity("evidenceModels", em, db(), { strict: false });
    expect(errors.some((e) => /fairnessNotes/i.test(e))).toBe(true);
  });

  it("draft without fairnessNotes still validates when not strict", () => {
    const em = baseEm({ fairnessNotes: "", difReviewChecklist: [], evaluationProcedures: [] });
    const { valid, errors } = validateEntity("evidenceModels", em, db(), { strict: false });
    expect(errors.filter((e) => /fairnessNotes|evaluationProcedure|difReview/i.test(e))).toEqual([]);
    expect(valid).toBe(true);
  });
});
