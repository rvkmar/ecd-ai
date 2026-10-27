import { describe, it, expect } from "vitest";
import { zipFiles } from "../../utils/safeZip.js";
import { importZipIntoDb } from "../ecdZipImport.js";
import { SEEDED_RUBRIC_REF_PATHS } from "../idCatalog.js";

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

describe("seeded rubric id remap", () => {
  it("lists the seed-snapshot rubric paths and not characteristic-feature labels", () => {
    const paths = SEEDED_RUBRIC_REF_PATHS.map((row) => row[0]);
    expect(paths).toEqual([
      "seededFrom.accepted.potentialRubrics[].rubricId",
      "seededFrom.declined.potentialRubrics[].rubricId",
    ]);
    expect(paths.join(" ")).not.toMatch(/characteristicFeatures/);
  });

  it("rewrites rubric ids on the procedure and the seed snapshot, and keeps the feature label", () => {
    const zip = zipFiles({
      "competencyModels.json": JSON.stringify([
        {
          id: "cm-plant",
          name: "Plant part naming",
          measurementIntent: "multidimensional",
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
      "rubrics.json": JSON.stringify([
        {
          id: "rub-function",
          name: "Plant function judgement",
          status: "draft",
          dimensions: [{ id: "function-match", levels: ["no", "yes"] }],
        },
      ]),
      "designPatterns.json": JSON.stringify([
        {
          id: "dp-plant",
          name: "Name a plant part",
          status: "draft",
          characteristicFeatures: [{ label: "Uses a labelled diagram" }],
          potentialRubrics: [{ label: "Plant function judgement", rubricId: "rub-function" }],
        },
      ]),
      "evidenceModels.json": JSON.stringify([
        {
          id: "em-plant",
          name: "Part naming evidence",
          competencyId: "c-plant",
          observables: [
            {
              id: "obs-plant-name",
              statement: "The learner selects the name of the called-out plant part.",
            },
          ],
          evaluationProcedures: [
            {
              id: "ep-plant",
              observableId: "obs-plant-name",
              method: "rubric",
              rubricId: "rub-function",
              description: "Scored with the plant function rubric.",
            },
          ],
          seededFrom: {
            designPatternId: "dp-plant",
            accepted: {
              potentialRubrics: [{ label: "Plant function judgement", rubricId: "rub-function" }],
              characteristicFeatures: [{ label: "Uses a labelled diagram" }],
            },
            declined: {
              potentialRubrics: [{ label: "Other rubric", rubricId: "rub-function" }],
            },
          },
          status: "draft",
        },
      ]),
      "taskModels.json": JSON.stringify([
        {
          id: "tm-plant",
          name: "Name the plant part",
          evidenceModelIds: ["em-plant"],
          primaryEvidenceModelId: "em-plant",
          blueprintConstraints: {
            characteristicFeatures: [{ label: "Uses a labelled diagram" }],
          },
          seededFrom: {
            designPatternId: "dp-plant",
            accepted: {
              potentialRubrics: [{ label: "Plant function judgement", rubricId: "rub-function" }],
              characteristicFeatures: [{ label: "Uses a labelled diagram" }],
            },
            declined: {
              potentialRubrics: [{ label: "Other rubric", rubricId: "rub-function" }],
            },
          },
          status: "draft",
        },
      ]),
    });

    const db = emptyDb();
    const report = importZipIntoDb(db, zip, {
      keepOriginalIds: false,
      user: { username: "admin1", role: "admin" },
    });
    expect(report.totals.failed).toBe(0);
    const rubric = db.rubrics[0];
    const evidence = db.evidenceModels[0];
    const task = db.taskModels[0];
    expect(rubric.id).not.toBe("rub-function");
    expect(evidence.evaluationProcedures[0].rubricId).toBe(rubric.id);
    expect(evidence.seededFrom.accepted.potentialRubrics[0].rubricId).toBe(rubric.id);
    expect(evidence.seededFrom.declined.potentialRubrics[0].rubricId).toBe(rubric.id);
    expect(evidence.seededFrom.accepted.characteristicFeatures[0].label).toBe("Uses a labelled diagram");
    expect(task.blueprintConstraints.characteristicFeatures).toEqual([
      { label: "Uses a labelled diagram" },
    ]);
    expect(task.seededFrom.accepted.potentialRubrics[0].rubricId).toBe(rubric.id);
    expect(task.seededFrom.declined.potentialRubrics[0].rubricId).toBe(rubric.id);
    expect(task.evidenceModelIds).toEqual([evidence.id]);
  });
});
