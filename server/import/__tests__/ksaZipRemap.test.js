import { describe, it, expect } from "vitest";
import { zipFiles } from "../../utils/safeZip.js";
import { importZipIntoDb } from "../ecdZipImport.js";
import { DESIGN_PATTERN_KSA_REF_PATHS } from "../idCatalog.js";

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

describe("design pattern KSA id remap", () => {
  it("lists the collection references and leaves smvId off that list", () => {
    const paths = DESIGN_PATTERN_KSA_REF_PATHS.map((row) => row[0]);
    expect(paths).toEqual([
      "focalKsas[].competencyId",
      "focalKsas[].competencyModelId",
      "additionalKsas[].competencyId",
      "additionalKsas[].competencyModelId",
    ]);
    expect(paths.join(" ")).not.toMatch(/smvId/);
  });

  it("rewrites competency and student-model ids and keeps the SMV id", () => {
    const zip = zipFiles({
      "competencyModels.json": JSON.stringify([
        {
          id: "cm-plant",
          name: "Plant part naming",
          measurementIntent: "multidimensional",
          smVariables: [
            {
              id: "smv-names-part",
              label: "Names the part",
              type: "binary",
              scale: { states: ["not_mastered", "mastered"] },
            },
          ],
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
          focalKsas: [
            {
              label: "Plant-part vocabulary",
              competencyId: "c-plant",
              competencyModelId: "cm-plant",
              smvId: "smv-names-part",
            },
          ],
          additionalKsas: [
            {
              label: "Reading a label",
              relationship: "potentially_confounding",
              competencyId: "c-plant",
            },
          ],
        },
      ]),
    });

    const db = emptyDb();
    const report = importZipIntoDb(db, zip, {
      keepOriginalIds: false,
      user: { username: "admin1", role: "admin" },
    });
    expect(report.totals.failed).toBe(0);
    const model = db.competencyModels[0];
    const competency = db.competencies[0];
    const pattern = db.designPatterns[0];
    expect(model.id).not.toBe("cm-plant");
    expect(competency.id).not.toBe("c-plant");
    expect(competency.modelId).toBe(model.id);
    expect(pattern.focalKsas[0].competencyId).toBe(competency.id);
    expect(pattern.focalKsas[0].competencyModelId).toBe(model.id);
    expect(pattern.focalKsas[0].smvId).toBe("smv-names-part");
    expect(pattern.additionalKsas[0].competencyId).toBe(competency.id);
    expect(model.smVariables.some((row) => row.id === "smv-names-part")).toBe(true);
  });
});
