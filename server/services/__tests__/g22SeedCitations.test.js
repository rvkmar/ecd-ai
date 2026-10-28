import { describe, it, expect } from "vitest";
import { seedFromDesignPattern } from "../seedFromDesignPattern.js";
import { validateEntity } from "../../../src/utils/schema.js";

const pattern = {
  id: "dp-plant",
  name: "Name a plant part",
  status: "confirmed",
  summary: "The examinee names the part.",
  rationale: "Naming is the recognition task.",
  domainAnalysisId: "da-plant",
  focalKsas: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" }],
  additionalKsas: [
    {
      label: "Reading a label",
      relationship: "potentially_confounding",
      valuedKnowledgeId: "vk-plant",
    },
  ],
  potentialObservations: [{ label: "Selects the name" }],
  characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
  variableFeatures: [
    { label: "Which part", taskModelVariableId: "tmv-diagram", taskFeatureId: "tf-plant" },
  ],
};

describe("seed carries domain analysis citations", () => {
  it("copies valued knowledge and task feature ids onto the drafts that can store them", () => {
    const db = {
      domainAnalyses: [
        {
          id: "da-plant",
          valuedKnowledge: [{ id: "vk-plant", label: "Parts" }],
          taskFeatures: [{ id: "tf-plant", label: "Diagram" }],
        },
      ],
      competencies: [{ id: "c1", name: "Names the part", modelId: "cm1" }],
      competencyModels: [{ id: "cm1", name: "Plant", status: "confirmed", locked: true }],
      taskModelVariables: [{ id: "tmv-diagram", name: "Plant diagram", taskFeatureId: "tf-plant" }],
      evidenceModels: [],
      taskModels: [],
      rubrics: [],
    };

    const seeded = seedFromDesignPattern({
      pattern,
      body: {
        competencyId: "c1",
        selections: {
          potentialObservations: [0],
          characteristicFeatures: [0],
          variableFeatures: [0],
        },
      },
      db,
      createEvidenceModelRecord: (body) => {
        const record = { id: "em1", status: "draft", ...body };
        db.evidenceModels.push(record);
        return { ok: true, record };
      },
      createTaskModelRecord: (body) => {
        const record = { id: "tm1", status: "draft", locked: false, versionNumber: 1, ...body };
        const check = validateEntity("taskModels", record, db, {
          strict: false,
          allowDraftParents: true,
        });
        if (!check.valid) return { ok: false, error: check.errors[0], details: check.errors };
        db.taskModels.push(record);
        return { ok: true, record };
      },
    });

    expect(seeded.ok, seeded.error).toBe(true);
    expect(seeded.taskModel.blueprintConstraints.characteristicFeatures).toEqual([
      { label: "One part is called out", taskFeatureId: "tf-plant" },
    ]);
    expect(seeded.evidenceModel.seededFrom.valuedKnowledge).toEqual([
      { label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" },
      { label: "Reading a label", valuedKnowledgeId: "vk-plant" },
    ]);
    expect(seeded.taskModel.seededFrom.accepted.variableFeatures[0].taskFeatureId).toBe("tf-plant");
    expect(seeded.taskModel.taskModelVariableIds).toEqual(["tmv-diagram"]);
  });
});
