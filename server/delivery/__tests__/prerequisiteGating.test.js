// server/delivery/__tests__/prerequisiteGating.test.js
// EM-R4: policy.config.prerequisiteGating blocks/reorders candidates.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { selectNextActivity, __testing__ } from "../activitySelection.js";

const { applyPrerequisiteGating } = __testing__;

const __dirname = dirname(fileURLToPath(import.meta.url));

function newtDb({ forceMastery = null } = {}) {
  const posteriors = {};
  if (forceMastery != null) {
    posteriors.smv_force = {
      smvId: "smv_force",
      evidenceModelId: "em_force",
      method: "map",
      modelFamily: "dina",
      estimate: forceMastery,
    };
  }

  return {
    competencyModels: [
      {
        id: "cm_newt",
        versionNumber: 1,
        status: "confirmed",
        smVariables: [
          { id: "smv_force", label: "Force Concept Mastery", type: "binary" },
          { id: "smv_kin", label: "Kinematic Reasoning", type: "ordinal" },
        ],
      },
    ],
    competencies: [
      { id: "smv_force", modelId: "cm_newt", name: "Force Concept Mastery" },
      { id: "smv_kin", modelId: "cm_newt", name: "Kinematic Reasoning" },
    ],
    evidenceModels: [
      {
        id: "em_force",
        competencyId: "smv_force",
        versionNumber: 1,
        statisticalModels: [
          {
            id: "sm_f",
            active: true,
            type: "irt",
            activeParameterSetId: "ps_f",
            parameterSets: [{ parameterSetId: "ps_f", parameters: { o_f: { a: 1, b: 0 } } }],
          },
        ],
        observables: [{ id: "o_f" }],
      },
      {
        id: "em_kin",
        competencyId: "smv_kin",
        versionNumber: 1,
        statisticalModels: [
          {
            id: "sm_k",
            active: true,
            type: "irt",
            activeParameterSetId: "ps_k",
            parameterSets: [{ parameterSetId: "ps_k", parameters: { o_k: { a: 1, b: 0.1 } } }],
          },
        ],
        observables: [{ id: "o_k" }],
      },
    ],
    taskModels: [
      { id: "tm_f", versionNumber: 1, evidenceModelIds: ["em_force"] },
      { id: "tm_k", versionNumber: 1, evidenceModelIds: ["em_kin"] },
    ],
    items: [
      {
        id: "item_force",
        taskModelId: "tm_f",
        observationId: "o_f",
        evidenceModelId: "em_force",
        status: "operational",
      },
      {
        id: "item_kin",
        taskModelId: "tm_k",
        observationId: "o_k",
        evidenceModelId: "em_kin",
        status: "operational",
      },
    ],
    compositeLibrary: [
      {
        id: "cl_f",
        taskModelId: "tm_f",
        taskModelVersion: 1,
        active: true,
        items: [
          {
            itemId: "item_force",
            observationId: "o_f",
            evidenceModelId: "em_force",
            evidenceModelVersion: 1,
          },
        ],
      },
      {
        id: "cl_k",
        taskModelId: "tm_k",
        taskModelVersion: 1,
        active: true,
        items: [
          {
            itemId: "item_kin",
            observationId: "o_k",
            evidenceModelId: "em_kin",
            evidenceModelVersion: 1,
          },
        ],
      },
    ],
    tasks: [
      { id: "t_force", itemId: "item_force", taskModelId: "tm_f" },
      { id: "t_kin", itemId: "item_kin", taskModelId: "tm_k" },
    ],
    policies: [
      {
        id: "pol_newt",
        type: "IRT",
        config: {
          model: "2PL",
          prerequisiteGating: [
            {
              before: "Kinematic Reasoning",
              requireMasteryOf: "Force Concept Mastery",
              threshold: 0.7,
            },
          ],
        },
      },
    ],
    assemblyModels: [
      {
        id: "am_newt",
        competencyModelId: "cm_newt",
        status: "operational",
        targetsBySMV: [],
        stoppingRules: { maxItems: 99 },
        selectionAlgorithm: { policyId: "pol_newt" },
      },
    ],
    _sessionPosteriors: posteriors,
  };
}

function sessionFrom(db, overrides = {}) {
  return {
    id: "s1",
    status: "in_progress",
    selectionStrategy: "IRT",
    currentTaskIndex: 0,
    taskIds: ["t_force", "t_kin"],
    responses: [],
    studentModel: { smvPosteriors: db._sessionPosteriors || {} },
    ...overrides,
  };
}

describe("EM-R4 prerequisiteGating", () => {
  it("blocks Kinematic candidates when Force mastery is unmet", () => {
    const db = newtDb({ forceMastery: 0.4 });
    const result = selectNextActivity(sessionFrom(db), db);
    expect(result.taskId).toBe("t_force");
    expect(result.warnings?.some((w) => /Prerequisite gating/i.test(w))).toBe(true);
  });

  it("allows Kinematic candidates when Force mastery meets threshold", () => {
    const db = newtDb({ forceMastery: 0.85 });
    // Force already answered → only kin left; must proceed.
    const result = selectNextActivity(
      sessionFrom(db, {
        responses: [{ taskId: "t_force", itemId: "item_force" }],
        taskIds: ["t_force", "t_kin"],
      }),
      db
    );
    expect(result.taskId).toBe("t_kin");
  });

  it("blocks when Force has no posterior yet", () => {
    const db = newtDb({ forceMastery: null });
    const warnings = [];
    const gated = applyPrerequisiteGating(
      [
        { taskId: "t_kin", task: db.tasks[1] },
        { taskId: "t_force", task: db.tasks[0] },
      ],
      sessionFrom(db),
      db,
      warnings
    );
    expect(gated.candidates.map((c) => c.taskId)).toEqual(["t_force"]);
    expect(gated.blocked.map((b) => b.taskId)).toEqual(["t_kin"]);
  });

  it("Newtonian policy fixture declares prerequisiteGating Force→Kinematics", () => {
    const policy = JSON.parse(
      readFileSync(join(__dirname, "../../../samples/newtonian_mechanics_policy.json"), "utf8")
    );
    const gating = policy[0]?.config?.prerequisiteGating || [];
    expect(gating[0]?.before).toMatch(/Kinematic/i);
    expect(gating[0]?.requireMasteryOf).toMatch(/Force Concept Mastery/i);
    expect(gating[0]?.threshold).toBe(0.7);
  });
});
