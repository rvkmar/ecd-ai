import { describe, it, expect } from "vitest";
import { zipFiles } from "../../utils/safeZip.js";
import { importZipIntoDb } from "../ecdZipImport.js";
import {
  DOMAIN_ANALYSIS_ENTRY_REF_PATHS,
  SEEDED_DOMAIN_ENTRY_REF_PATHS,
  TASK_MODEL_VARIABLE_DOMAIN_REF_PATHS,
} from "../idCatalog.js";

function emptyDb() {
  return {
    curricularPolicies: [],
    policies: [],
    domainAnalyses: [],
    taskModelVariables: [],
    workProducts: [],
    rubrics: [],
    competencyModels: [],
    competencies: [],
    designPatterns: [],
    evidenceModels: [],
    taskModels: [],
    items: [],
    qMatrixModels: [],
    assemblyModels: [],
    presentationModels: [],
    deliveryModels: [],
    templates: [],
  };
}

function sampleZip() {
  return zipFiles({
    "domainAnalyses.json": JSON.stringify([
      {
        id: "da-plant",
        name: "Plant structure",
        status: "draft",
        psychologicalPerspective: "information_processing",
        valuedKnowledge: [{ id: "vk-plant", label: "Leaf, root, stem, and flower" }],
        taskFeatures: [{ id: "tf-plant", label: "A labelled diagram of a flowering plant" }],
      },
    ]),
    "taskModelVariables.json": JSON.stringify([
      {
        id: "tmv-diagram",
        name: "Plant diagram",
        type: "categorical",
        possibleValues: [
          { value: "leaf", label: "Leaf" },
          { value: "root", label: "Root" },
        ],
        domainAnalysisId: "da-plant",
        taskFeatureId: "tf-plant",
      },
    ]),
    "competencyModels.json": JSON.stringify([
      {
        id: "cm-plant",
        name: "Plant part naming",
        measurementIntent: "multidimensional",
        domainAnalysisId: "da-plant",
        smVariables: [],
      },
    ]),
    "competencies.json": JSON.stringify([
      {
        id: "c-plant",
        name: "Names the part",
        modelId: "cm-plant",
        variableType: "binary",
      },
    ]),
    "designPatterns.json": JSON.stringify([
      {
        id: "dp-plant",
        name: "Name a plant part",
        status: "draft",
        domainAnalysisId: "da-plant",
        focalKsas: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" }],
        additionalKsas: [
          {
            label: "Reading a label",
            relationship: "required_but_not_measured",
            valuedKnowledgeId: "vk-plant",
          },
        ],
        characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
        variableFeatures: [
          { label: "Which part", taskModelVariableId: "tmv-diagram", taskFeatureId: "tf-plant" },
        ],
      },
    ]),
    "evidenceModels.json": JSON.stringify([
      {
        id: "em-plant",
        name: "Part naming evidence",
        competencyId: "c-plant",
        status: "draft",
        observables: [{ id: "obs-plant", statement: "Selects the name of the called-out part." }],
        seededFrom: {
          designPatternId: "dp-plant",
          valuedKnowledge: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" }],
          accepted: {
            characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
            variableFeatures: [
              { label: "Which part", taskModelVariableId: "tmv-diagram", taskFeatureId: "tf-plant" },
            ],
          },
          declined: {
            characteristicFeatures: [{ label: "Unused", taskFeatureId: "tf-plant" }],
          },
        },
      },
    ]),
    "taskModels.json": JSON.stringify([
      {
        id: "tm-plant",
        name: "Name the plant part",
        status: "draft",
        evidenceModelIds: ["em-plant"],
        primaryEvidenceModelId: "em-plant",
        blueprintConstraints: {
          characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
        },
        seededFrom: {
          designPatternId: "dp-plant",
          valuedKnowledge: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" }],
          accepted: {
            variableFeatures: [
              { label: "Which part", taskModelVariableId: "tmv-diagram", taskFeatureId: "tf-plant" },
            ],
          },
          declined: {
            variableFeatures: [{ label: "Other", taskModelVariableId: "tmv-diagram", taskFeatureId: "tf-plant" }],
          },
        },
      },
    ]),
  });
}

describe("domain analysis entry id remap", () => {
  it("lists the new citation paths", () => {
    expect(DOMAIN_ANALYSIS_ENTRY_REF_PATHS.map((row) => row[0])).toEqual([
      "focalKsas[].valuedKnowledgeId",
      "additionalKsas[].valuedKnowledgeId",
      "characteristicFeatures[].taskFeatureId",
      "variableFeatures[].taskFeatureId",
    ]);
    expect(SEEDED_DOMAIN_ENTRY_REF_PATHS.map((row) => row[0])).toEqual(
      expect.arrayContaining([
        "blueprintConstraints.characteristicFeatures[].taskFeatureId",
        "seededFrom.valuedKnowledge[].valuedKnowledgeId",
        "seededFrom.accepted.variableFeatures[].taskFeatureId",
        "seededFrom.declined.variableFeatures[].taskFeatureId",
      ])
    );
    expect(TASK_MODEL_VARIABLE_DOMAIN_REF_PATHS.map((row) => row[0])).toEqual([
      "domainAnalysisId",
      "taskFeatureId",
    ]);
  });

  it.each([
    ["new ids", false],
    ["keep original ids", true],
  ])("rewrites statement citations with the analysis (%s)", (_label, keepOriginalIds) => {
    const db = emptyDb();
    const report = importZipIntoDb(db, sampleZip(), {
      keepOriginalIds,
      user: { username: "admin1", role: "admin" },
    });
    expect(report.totals.failed, JSON.stringify(report.entities, null, 2)).toBe(0);

    const analysis = db.domainAnalyses.find((row) => row.name === "Plant structure");
    const pattern = db.designPatterns.find((row) => row.name === "Name a plant part");
    const variable = db.taskModelVariables.find((row) => row.name === "Plant diagram");
    const task = db.taskModels.find((row) => row.name === "Name the plant part");
    const evidence = db.evidenceModels.find((row) => row.name === "Part naming evidence");
    const knowledgeId = analysis.valuedKnowledge[0].id;
    const featureId = analysis.taskFeatures[0].id;

    expect(pattern.focalKsas[0].valuedKnowledgeId).toBe(knowledgeId);
    expect(pattern.additionalKsas[0].valuedKnowledgeId).toBe(knowledgeId);
    expect(pattern.characteristicFeatures[0].taskFeatureId).toBe(featureId);
    expect(pattern.variableFeatures[0].taskFeatureId).toBe(featureId);
    expect(pattern.variableFeatures[0].taskModelVariableId).toBe(variable.id);
    expect(variable.taskFeatureId).toBe(featureId);
    expect(variable.domainAnalysisId).toBe(analysis.id);
    expect(task.blueprintConstraints.characteristicFeatures[0].taskFeatureId).toBe(featureId);
    expect(task.seededFrom.valuedKnowledge[0].valuedKnowledgeId).toBe(knowledgeId);
    expect(task.seededFrom.accepted.variableFeatures[0].taskFeatureId).toBe(featureId);
    expect(task.seededFrom.declined.variableFeatures[0].taskFeatureId).toBe(featureId);
    expect(evidence.seededFrom.valuedKnowledge[0].valuedKnowledgeId).toBe(knowledgeId);
    expect(evidence.seededFrom.accepted.characteristicFeatures[0].taskFeatureId).toBe(featureId);
    expect(evidence.seededFrom.declined.characteristicFeatures[0].taskFeatureId).toBe(featureId);

    if (keepOriginalIds) {
      expect(knowledgeId).toBe("vk-plant");
      expect(featureId).toBe("tf-plant");
    } else {
      expect(knowledgeId).not.toBe("vk-plant");
      expect(featureId).not.toBe("tf-plant");
    }
  });
});
