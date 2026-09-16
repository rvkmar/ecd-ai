// server/delivery/__tests__/evaluationArtifacts.test.js
//
// EM-R1 exit check: rubric / process_log / auto artifacts produce the
// expected OV activation when the item activation map is empty. Key
// regression stays in evidenceIdentification.test.js.

import { describe, it, expect } from "vitest";
import { applyEvaluationArtifact } from "../evaluationArtifacts.js";
import { identifyEvidence } from "../evidenceIdentification.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const taskModel = {
  id: "tm-em-r1",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em-em-r1"],
  expectedObservations: [
    { observationId: "obs_rubric", evidenceModelId: "em-em-r1", required: true, weight: 1 },
    { observationId: "obs_process", evidenceModelId: "em-em-r1", required: true, weight: 1 },
    { observationId: "obs_auto", evidenceModelId: "em-em-r1", required: true, weight: 1 },
    { observationId: "obs_key", evidenceModelId: "em-em-r1", required: true, weight: 1 },
  ],
};

const evidenceModel = {
  id: "em-em-r1",
  versionNumber: 1,
  observables: [
    {
      id: "obs_rubric",
      type: "constructed_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "Rubric proficiency supports the claim.",
      },
    },
    {
      id: "obs_process",
      type: "performance",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 3,
        activationCondition: "any",
        justification: "Diagram-first process supports the claim.",
      },
    },
    {
      id: "obs_auto",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 2,
        activationCondition: "any",
        justification: "Auto pattern match.",
      },
    },
    {
      id: "obs_key",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 5,
        activationCondition: "any",
        justification: "Key match.",
      },
    },
  ],
  evaluationProcedures: [
    {
      id: "ep-rubric",
      observableId: "obs_rubric",
      workProductType: "constructed_diagram",
      method: "rubric",
      description: "Analytic rubric for force arrows.",
      artifact: {
        kind: "rubric",
        dimensions: [
          { id: "accuracy", levels: [0, 1, 2], description: "Feature accuracy" },
        ],
      },
    },
    {
      id: "ep-process",
      observableId: "obs_process",
      workProductType: "process_trace",
      method: "process_log",
      description: "First substantive move is diagram.",
      artifact: {
        kind: "auto",
        scorerId: "process_log_v1",
        config: {
          events: ["edge_draw", "equation_entry", "text_submit"],
          activateOnFirstMove: "diagram",
          classByEvent: {
            edge_draw: "diagram",
            equation_entry: "equation",
            text_submit: "narrative",
          },
        },
      },
    },
    {
      id: "ep-auto",
      observableId: "obs_auto",
      workProductType: "mcq_selection",
      method: "auto",
      description: "Generic auto pattern scorer.",
      artifact: {
        kind: "auto",
        scorerId: "pattern_v1",
        config: {
          activatingPatterns: [{ selected: "opt_yes" }],
        },
      },
    },
    {
      id: "ep-key",
      observableId: "obs_key",
      workProductType: "mcq_selection",
      method: "key",
      description: "Key for regression.",
      artifact: {
        kind: "key",
        correctPatterns: [{ selected: "opt_a" }],
      },
    },
  ],
};

function emptyMapItem(observationId) {
  return {
    id: `item-${observationId}`,
    taskModelId: "tm-em-r1",
    taskModelVersion: 1,
    status: "confirmed",
    observationId,
    evidenceModelId: "em-em-r1",
    evidenceModelVersion: 1,
    scoring: { method: "dichotomous", evidenceActivationMap: [] },
  };
}

function makeDb(items) {
  const db = {
    evidenceModels: [evidenceModel],
    taskModels: [taskModel],
    items,
  };
  seedActivePackages(db);
  return db;
}

describe("evaluationArtifacts — rubric", () => {
  const proc = () => evidenceModel.evaluationProcedures[0];

  it("activates when dimension rating meets default positive threshold", () => {
    const result = applyEvaluationArtifact(proc(), { dimensions: { accuracy: 1 } });
    expect(result.matched).toBe(true);
    expect(result.activatesObservable).toBe(true);
  });

  it("does not activate on zero when activatesAt defaults to 1", () => {
    const result = applyEvaluationArtifact(proc(), { dimensions: { accuracy: 0 } });
    expect(result.matched).toBe(true);
    expect(result.activatesObservable).toBe(false);
  });

  it("accepts SessionPlayer rubricLevel on a single-dimension rubric", () => {
    const result = applyEvaluationArtifact(proc(), { rubricLevel: 2 });
    expect(result.activatesObservable).toBe(true);
  });

  it("warns when a rating is outside declared levels", () => {
    const result = applyEvaluationArtifact(proc(), { dimensions: { accuracy: 9 } });
    expect(result.matched).toBe(false);
    expect(result.warning).toMatch(/not in declared levels/);
  });
});

describe("evaluationArtifacts — process_log_v1", () => {
  const proc = () => evidenceModel.evaluationProcedures[1];

  it("activates when first event class matches activateOnFirstMove", () => {
    const result = applyEvaluationArtifact(proc(), {
      events: [{ type: "edge_draw", t: 1 }, { type: "equation_entry", t: 2 }],
    });
    expect(result.matched).toBe(true);
    expect(result.activatesObservable).toBe(true);
  });

  it("does not activate when firstMove is a different class", () => {
    const result = applyEvaluationArtifact(proc(), {
      events: [{ type: "equation_entry", t: 1 }],
    });
    expect(result.matched).toBe(true);
    expect(result.activatesObservable).toBe(false);
  });

  it("honours an explicit firstMove on the work product", () => {
    const result = applyEvaluationArtifact(proc(), {
      firstMove: "diagram",
      events: [],
    });
    expect(result.activatesObservable).toBe(true);
  });
});

describe("identifyEvidence — EM-R1 artifact fallback (empty activation map)", () => {
  it("constructed WP + rubric → activated OV with evidenceRule strength", () => {
    const item = emptyMapItem("obs_rubric");
    const result = identifyEvidence(
      { dimensions: { accuracy: 2 } },
      item,
      makeDb([item])
    );
    expect(result.refused).toBeUndefined();
    expect(result.activated).toBe(true);
    expect(result.strength).toBe(4);
    expect(result.evaluationMethod).toBe("rubric");
    expect(result.evaluationProcedureId).toBe("ep-rubric");
    expect(result).not.toHaveProperty("score");
  });

  it("process_log events → declared observable activation", () => {
    const item = emptyMapItem("obs_process");
    const result = identifyEvidence(
      { events: [{ type: "edge_draw" }] },
      item,
      makeDb([item])
    );
    expect(result.activated).toBe(true);
    expect(result.strength).toBe(3);
    expect(result.evaluationMethod).toBe("process_log");
    expect(result.evaluationProcedureId).toBe("ep-process");
  });

  it("auto activatingPatterns match and miss", () => {
    const item = emptyMapItem("obs_auto");
    const db = makeDb([item]);
    expect(identifyEvidence({ selected: "opt_yes" }, item, db).activated).toBe(true);
    expect(identifyEvidence({ selected: "opt_no" }, item, db).activated).toBe(false);
    expect(identifyEvidence({ selected: "opt_yes" }, item, db).evaluationMethod).toBe("auto");
  });

  it("empty map + key still green (hit and miss)", () => {
    const item = emptyMapItem("obs_key");
    const db = makeDb([item]);
    const hit = identifyEvidence({ selected: "opt_a" }, item, db);
    expect(hit.activated).toBe(true);
    expect(hit.evaluationMethod).toBe("key");
    const miss = identifyEvidence({ selected: "opt_z" }, item, db);
    expect(miss.activated).toBe(false);
    expect(miss.evaluationMethod).toBe("key");
    expect(miss.warning).toBeUndefined();
  });

  it("non-empty activation map still wins over artifact (no reinterpretation)", () => {
    const item = {
      ...emptyMapItem("obs_rubric"),
      scoring: {
        method: "dichotomous",
        evidenceActivationMap: [
          {
            responsePattern: { selected: "opt_map" },
            activatesObservable: true,
            rationale: "Map entry wins.",
          },
        ],
      },
    };
    // Rubric-shaped WP would activate via artifact, but map is non-empty and
    // does not match → warning, not rubric fallback.
    const result = identifyEvidence(
      { dimensions: { accuracy: 2 } },
      item,
      makeDb([item])
    );
    expect(result.activated).toBeNull();
    expect(result.warning).toMatch(/did not match any declared responsePattern/);
  });

  it("applyEvaluationArtifact returns null without an artifact", () => {
    expect(applyEvaluationArtifact({ method: "key" }, { selected: "a" })).toBeNull();
  });
});
