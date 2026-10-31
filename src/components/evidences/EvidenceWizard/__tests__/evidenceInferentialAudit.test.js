import { describe, it, expect } from "vitest";
import { computeEvidenceInferentialAudit } from "../evidenceInferentialAudit";

function completeModel(overrides = {}) {
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
        backing: "Third-law studies and the Grade 10 force curriculum.",
      },
    ],
    observables: [
      {
        id: "obs1",
        statement: "The learner selects both members of an action-reaction pair.",
        type: "selected_response",
        warrantId: "w1",
        evidenceRule: {
          direction: "supports",
          strengthLevel: 4,
          activationCondition: "Both members named.",
          justification: "Supports the third-law warrant.",
        },
      },
      {
        id: "obs2",
        statement: "The learner selects the reaction member of the pair.",
        type: "selected_response",
        warrantId: "w1",
        evidenceRule: {
          direction: "supports",
          strengthLevel: 4,
          activationCondition: "Reaction member named.",
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
      {
        id: "er2",
        observableId: "obs2",
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "Reaction member named.",
        justification: "Supports the third-law warrant.",
      },
    ],
    statisticalModels: [
      {
        id: "sm1",
        type: "ctt",
        subtype: "raw_total",
        active: true,
        structureConfig: { observableIds: ["obs1", "obs2"] },
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
        workProductId: "wp1",
        method: "key",
        description: "Answer key maps selected option to dichotomous observable value.",
        artifactRef: "inline:key/obs1",
        artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
      },
      {
        id: "ep2",
        observableId: "obs2",
        workProductType: "mcq_selection",
        workProductId: "wp2",
        method: "key",
        description: "Answer key maps the second selected option to a dichotomous value.",
        artifactRef: "inline:key/obs2",
        artifact: { kind: "key", correctPatterns: [{ selected: "opt_b" }] },
      },
    ],
    fairnessNotes:
      "Diagram vocabulary is introduced in an orientation screen; residual language risk accepted for Grade 10.",
    difReviewChecklist: [
      { id: "dif1", prompt: "Gender DIF on force-pair items reviewed?", status: "pass" },
      { id: "dif2", prompt: "Language-load review completed?", status: "pass" },
      { id: "dif3", prompt: "Diagram accessibility checked?", status: "na" },
    ],
    status: "reviewed",
    locked: false,
    ...overrides,
  };
}

describe("computeEvidenceInferentialAudit", () => {
  it("passes a complete model without the audit step having been opened", () => {
    const audit = computeEvidenceInferentialAudit({ draftModel: completeModel() });
    expect(audit.errors).toEqual([]);
    expect(audit.isValid).toBe(true);
  });

  it("fails Classical Test Theory that scores only one observable", () => {
    const model = completeModel();
    model.statisticalModels[0].structureConfig.observableIds = ["obs1"];
    const audit = computeEvidenceInferentialAudit({ draftModel: model, db: {} });
    expect(audit.isValid).toBe(false);
    expect(audit.errors.some((e) => /at least two scored observables/i.test(e))).toBe(true);
  });
});
