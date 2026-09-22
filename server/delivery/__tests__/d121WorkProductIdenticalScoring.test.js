// server/delivery/__tests__/d121WorkProductIdenticalScoring.test.js
//
// D121 exit check: one Work Product type captured by two different
// interactions scores identically through the same Evidence Model.

import { describe, it, expect } from "vitest";
import { identifyEvidence } from "../evidenceIdentification.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const workProduct = {
  id: "wp-selected",
  name: "Selected answer",
  type: "selected_response",
};

const evidenceModel = {
  id: "em-d121",
  versionNumber: 1,
  observables: [
    {
      id: "o-d121",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "Correct selection.",
      },
    },
  ],
  evaluationProcedures: [
    {
      id: "ep-d121",
      observableId: "o-d121",
      workProductId: "wp-selected",
      workProductType: "selected_response",
      method: "key",
      description: "Key for selected response.",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
    },
  ],
};

const taskModel = {
  id: "tm-d121",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em-d121"],
  expectedObservations: [
    { observationId: "o-d121", evidenceModelId: "em-d121", required: true, weight: 1 },
  ],
};

function item(id, interactionType) {
  return {
    id,
    taskModelId: "tm-d121",
    taskModelVersion: 1,
    status: "confirmed",
    observationId: "o-d121",
    evidenceModelId: "em-d121",
    evidenceModelVersion: 1,
    interaction: {
      type: interactionType,
      workProductId: "wp-selected",
    },
    scoring: {
      method: "dichotomous",
      evidenceActivationMap: [
        {
          responsePattern: { selected: "opt_a" },
          activatesObservable: true,
          strengthOverride: 4,
          rationale: "Correct.",
        },
        {
          responsePattern: { selected: "opt_b" },
          activatesObservable: false,
          rationale: "Distractor.",
        },
      ],
    },
  };
}

describe("D121 exit check — one WP type, two interactions, identical score", () => {
  it("mcq and likert over the same Work Product identify identically", () => {
    const mcqItem = item("item-mcq", "mcq");
    const likertItem = item("item-likert", "likert");
    const db = seedActivePackages({
      workProducts: [workProduct],
      evidenceModels: [evidenceModel],
      taskModels: [taskModel],
      items: [mcqItem, likertItem],
      compositeLibrary: [],
    });

    const response = { selected: "opt_a" };
    const fromMcq = identifyEvidence(response, mcqItem, db, {
      taskModelId: "tm-d121",
    });
    const fromLikert = identifyEvidence(response, likertItem, db, {
      taskModelId: "tm-d121",
    });

    expect(fromMcq.refused).toBeFalsy();
    expect(fromLikert.refused).toBeFalsy();
    expect(fromMcq.activated).toBe(true);
    expect(fromLikert.activated).toBe(true);
    expect(fromMcq.strength).toBe(fromLikert.strength);
    expect(fromMcq.direction).toBe(fromLikert.direction);
    expect(fromMcq.observableId).toBe(fromLikert.observableId);
    expect(fromMcq.workProductId).toBe("wp-selected");
    expect(fromLikert.workProductId).toBe("wp-selected");
    expect(fromMcq.workProductType).toBe("selected_response");
    expect(fromLikert.workProductType).toBe("selected_response");

    // Interaction differs; Work Product and score do not.
    expect(mcqItem.interaction.type).not.toBe(likertItem.interaction.type);
  });

  it("non-activating response also matches across interactions", () => {
    const mcqItem = item("item-mcq-2", "mcq");
    const multiItem = item("item-multi", "multiselect");
    const db = seedActivePackages({
      workProducts: [workProduct],
      evidenceModels: [evidenceModel],
      taskModels: [taskModel],
      items: [mcqItem, multiItem],
      compositeLibrary: [],
    });

    const response = { selected: "opt_b" };
    const a = identifyEvidence(response, mcqItem, db, { taskModelId: "tm-d121" });
    const b = identifyEvidence(response, multiItem, db, { taskModelId: "tm-d121" });
    expect(a.activated).toBe(false);
    expect(b.activated).toBe(false);
    expect(a.strength).toBe(b.strength);
  });
});
