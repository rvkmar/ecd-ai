// The committed sample zip must import cleanly. Counts and a few links
// are asserted so a validator change cannot leave the archive half-broken
// while the file still sits in samples/.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { unzipSafe } from "../../utils/safeZip.js";
import { exportDbAsZip, importZipIntoDb } from "../../import/ecdZipImport.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ZIP_PATH = path.join(ROOT, "samples/ecd-sample-complete.zip");
const JSON_DIR = path.join(ROOT, "samples/ecd-sample-complete");

const EXPECTED = {
  curricularPolicies: 2,
  policies: 3,
  domainAnalyses: 3,
  taskModelVariables: 3,
  workProducts: 3,
  rubrics: 2,
  competencyModels: 2,
  competencies: 3,
  designPatterns: 3,
  evidenceModels: 3,
  taskModels: 3,
  items: 4,
  qMatrixModels: 2,
  assemblyModels: 2,
  presentationModels: 3,
  deliveryModels: 1,
  templates: 3,
};

function emptyDb() {
  return {
    items: [],
    evidenceModels: [],
    competencyModels: [],
    competencies: [],
    taskModels: [],
    taskModelVariables: [],
    workProducts: [],
    rubrics: [],
    templates: [],
    designPatterns: [],
    domainAnalyses: [],
    policies: [],
    curricularPolicies: [],
    qMatrixModels: [],
    assemblyModels: [],
    presentationModels: [],
    deliveryModels: [],
  };
}

function importZip(keepOriginalIds) {
  const db = emptyDb();
  const report = importZipIntoDb(db, fs.readFileSync(ZIP_PATH), {
    keepOriginalIds,
    user: { username: "admin1", role: "admin" },
  });
  return { db, report };
}

describe("ecd-sample-complete.zip", () => {
  it("matches the JSON files next to it", () => {
    const files = unzipSafe(fs.readFileSync(ZIP_PATH));
    const names = files.map((file) => file.name).sort();
    const onDisk = fs
      .readdirSync(JSON_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(names).toEqual(onDisk);
    for (const file of files) {
      const disk = JSON.parse(fs.readFileSync(path.join(JSON_DIR, file.name), "utf8"));
      expect(JSON.parse(file.data.toString("utf8"))).toEqual(disk);
    }
  });

  it.each([
    ["new ids", false],
    ["keep original ids", true],
  ])("imports into an empty store with 0 failures (%s)", (_label, keepOriginalIds) => {
    const { db, report } = importZip(keepOriginalIds);

    expect(report.totals.failed).toBe(0);
    expect(report.totals.fileErrors).toBe(0);
    expect(report.skipped).toEqual([]);
    expect(report.qMatrixLinksBound).toBe(1);

    let created = 0;
    for (const [collection, count] of Object.entries(EXPECTED)) {
      expect(report.entities[collection].created, collection).toBe(count);
      expect(report.entities[collection].failed, collection).toBe(0);
      created += count;
      for (const row of report.entities[collection].results) {
        expect(row.ok, `${collection} ${row.name}`).toBe(true);
        expect(row.warnings || [], `${collection} ${row.name}`).toEqual([]);
        if (keepOriginalIds && row.sourceId) expect(row.idKept).toBe(true);
        if (!keepOriginalIds) expect(row.idKept).toBe(false);
      }
    }
    expect(report.totals.created).toBe(created);

    const evidence = db.evidenceModels.find((row) => row.name === "Part function evidence");
    const qMatrix = db.qMatrixModels.find((row) => row.name === "Plant part Q-matrix");
    expect(evidence.statisticalModels[0].structureConfig.qMatrixId).toBe(qMatrix.id);
    const observableRow = qMatrix.entries.find((entry) => entry.observableId === "obs-plant-function");
    expect(observableRow.evidenceModelId).toBe(evidence.id);
    expect(observableRow.attributeId).toBe("smv-names-function");
    expect(observableRow.itemId).toBeUndefined();
    const functionItem = db.items.find((row) => row.name === "Job of the leaf");
    expect(qMatrix.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: functionItem.id,
          attributeId: "smv-names-function",
        }),
      ])
    );

    const task = db.taskModels.find((row) => row.name === "Name the plant part");
    const partEvidence = db.evidenceModels.find((row) => row.name === "Part naming evidence");
    expect(task.evidenceModelIds).toContain(partEvidence.id);
    expect(task.primaryEvidenceModelId).toBe(partEvidence.id);

    const item = db.items.find((row) => row.name === "Equivalent to 2/4");
    const fractionTask = db.taskModels.find((row) => row.name === "Name the fraction");
    expect(item.taskModelId).toBe(fractionTask.id);

    const delivery = db.deliveryModels.find((row) => row.name === "Plant part naming delivery");
    const plantAssembly = db.assemblyModels.find((row) => row.name === "Plant part naming assembly");
    const plantTask = db.taskModels.find((row) => row.name === "Name the plant part");
    const functionTask = db.taskModels.find((row) => row.name === "Name the plant function");
    expect(plantAssembly.constraints.exposure.maxPerItem).toBe(1);
    expect(plantAssembly.constraints.taskModelCounts).toEqual([
      { taskModelId: plantTask.id, min: 1, max: 8 },
      { taskModelId: functionTask.id, min: 1, max: 4 },
    ]);
    const plantStudent = db.competencyModels.find((row) => row.name === "Plant part naming");
    const fixedPolicy = db.policies.find((row) => row.name === "Fixed Form - Grade 6 Numeracy Benchmark");
    const plantPresentation = db.presentationModels.find((row) => row.name === "Plant part presentation");
    expect(delivery.assemblyModelId).toBe(plantAssembly.id);
    expect(delivery.competencyModelId).toBe(plantStudent.id);
    expect(delivery.policyId).toBe(fixedPolicy.id);
    expect(delivery.presentationModelId).toBe(plantPresentation.id);
    expect(delivery.administration.timeLimitMinutes).toBe(20);
    expect(delivery.administration.feedbackMode).toBe("immediate");
    expect(delivery.status).toBe("draft");
    if (keepOriginalIds) {
      expect(delivery.id).toBe("dm-plant");
    } else {
      expect(delivery.id).not.toBe("dm-plant");
      expect(delivery.assemblyModelId).not.toBe("am-plant");
      expect(delivery.competencyModelId).not.toBe("cm-plant");
      expect(delivery.policyId).not.toBe("p-fixed");
      expect(delivery.presentationModelId).not.toBe("pm-plant");
    }

    const template = db.templates.find((row) => row.name === "Plant part template");
    const presentation = db.presentationModels.find((row) => row.id === template.presentationModelId);
    expect(presentation.taskModelId).toBe(template.taskModelId);

    const pattern = db.designPatterns.find((row) => row.name === "Name a plant part");
    const parent = db.designPatterns.find((row) => row.name === "Explain a labelled diagram");
    expect(pattern.relationships[0].targetPatternId).toBe(parent.id);

    const partName = db.workProducts.find((row) => row.name === "Selected plant-part name");
    const partFunction = db.workProducts.find((row) => row.name === "Selected plant-part function");
    const equivProduct = db.workProducts.find((row) => row.name === "Selected equivalent fraction");
    const functionRubric = db.rubrics.find((row) => row.name === "Plant function judgement");
    const fractionRubric = db.rubrics.find((row) => row.name === "Fraction equivalence judgement");
    expect(partName.type).toBe("selected_response");
    expect(partName.status).toBeUndefined();
    expect(partFunction.status).toBeUndefined();
    expect(equivProduct.status).toBeUndefined();
    expect(functionRubric.status).toBe(keepOriginalIds ? "confirmed" : "draft");
    expect(fractionRubric.status).toBe("draft");
    if (!keepOriginalIds) {
      expect(partName.id).not.toBe("wp-part-name");
      expect(functionRubric.id).not.toBe("rub-function");
    } else {
      expect(partName.id).toBe("wp-part-name");
      expect(functionRubric.id).toBe("rub-function");
    }

    expect(db.items.find((row) => row.name === "Leaf on the diagram").interaction.workProductId).toBe(
      partName.id
    );
    expect(db.items.find((row) => row.name === "Root on the diagram").interaction.workProductId).toBe(
      partName.id
    );
    expect(db.items.find((row) => row.name === "Job of the leaf").interaction.workProductId).toBe(
      partFunction.id
    );
    expect(item.interaction.workProductId).toBe(equivProduct.id);

    const naming = db.evidenceModels.find((row) => row.name === "Part naming evidence");
    expect(naming.evaluationProcedures[0].method).toBe("key");
    expect(naming.evaluationProcedures[0].workProductId).toBe(partName.id);
    expect(naming.evaluationProcedures[0].rubricId).toBeUndefined();

    const functionProc = evidence.evaluationProcedures[0];
    expect(functionProc.method).toBe("rubric");
    expect(functionProc.workProductId).toBe(partFunction.id);
    expect(functionProc.rubricId).toBe(functionRubric.id);
    expect(functionProc.phases[0].rubricId).toBe(functionRubric.id);

    const fractionEvidence = db.evidenceModels.find((row) => row.name === "Fraction evidence");
    const fractionBn = fractionEvidence.statisticalModels.find((row) => row.id === "sm-frac-bn");
    expect(fractionBn.type).toBe("bayesian_network");
    expect(fractionBn.active).toBe(false);
    expect(fractionBn.structureConfig.smvId).toBe("smv-equiv");
    expect(fractionBn.structureConfig.cpt["obs-equiv"].levels.mastered).toBe(0.8);
    expect(fractionEvidence.statisticalModels.find((row) => row.active).type).toBe("irt");
    const fractionProc = fractionEvidence.evaluationProcedures[0];
    expect(fractionProc.method).toBe("rubric");
    expect(fractionProc.workProductId).toBe(equivProduct.id);
    expect(fractionProc.rubricId).toBe(fractionRubric.id);
    expect(fractionProc.phases[0].rubricId).toBe(fractionRubric.id);

    const plantCompetency = db.competencies.find((row) => row.name === "Names the part");
    const plantModel = db.competencyModels.find((row) => row.name === "Plant part naming");
    expect(pattern.focalKsas[0].competencyId).toBe(plantCompetency.id);
    expect(pattern.focalKsas[0].competencyModelId).toBe(plantModel.id);
    expect(pattern.focalKsas[0].smvId).toBe("smv-names-part");
    expect(plantModel.smVariables.some((row) => row.id === "smv-names-part")).toBe(true);
    expect(pattern.focalKsas[0].label).toBe("Plant-part vocabulary");
    const plantAnalysis = db.domainAnalyses.find((row) => row.name === "Plant structure");
    const diagramAnalysis = db.domainAnalyses.find((row) => row.name === "Explaining a labelled scientific diagram");
    const diagramVariable = db.taskModelVariables.find((row) => row.name === "Plant diagram");
    expect(pattern.focalKsas[0].valuedKnowledgeId).toBe(plantAnalysis.valuedKnowledge[0].id);
    expect(pattern.characteristicFeatures[0].taskFeatureId).toBe(plantAnalysis.taskFeatures[0].id);
    expect(parent.focalKsas[0].valuedKnowledgeId).toBe(diagramAnalysis.valuedKnowledge[0].id);
    expect(parent.characteristicFeatures[0].taskFeatureId).toBe(diagramAnalysis.taskFeatures[0].id);
    expect(diagramVariable.taskFeatureId).toBe(plantAnalysis.taskFeatures[0].id);
    expect(diagramVariable.domainAnalysisId).toBe(plantAnalysis.id);
    if (keepOriginalIds) {
      expect(plantAnalysis.valuedKnowledge[0].id).toBe("vk-plant-parts");
      expect(plantAnalysis.taskFeatures[0].id).toBe("tf-plant-diagram");
    } else {
      expect(plantAnalysis.valuedKnowledge[0].id).not.toBe("vk-plant-parts");
      expect(pattern.focalKsas[0].valuedKnowledgeId).not.toBe("vk-plant-parts");
    }

    expect(pattern.potentialWorkProducts[0].workProductId).toBe(partName.id);
    expect(pattern.potentialWorkProducts[0].workProductType).toBe("selected_response");
    expect(parent.potentialWorkProducts[0].workProductId).toBe(partFunction.id);
    expect(parent.potentialRubrics[0].rubricId).toBe(functionRubric.id);
    const fractionPattern = db.designPatterns.find((row) => row.name === "Explain a fraction");
    expect(fractionPattern.potentialWorkProducts[0].workProductId).toBe(equivProduct.id);
    expect(fractionPattern.potentialRubrics[0].rubricId).toBe(fractionRubric.id);

    expect(report.order.indexOf("taskModelVariables")).toBeLessThan(
      report.order.indexOf("workProducts")
    );
    expect(report.order.indexOf("workProducts")).toBeLessThan(report.order.indexOf("rubrics"));
    expect(report.order.indexOf("rubrics")).toBeLessThan(report.order.indexOf("designPatterns"));

    // Curricular-policy create upserts one content-standard shell per policy.
    expect(db.domainAnalyses).toHaveLength(EXPECTED.domainAnalyses + EXPECTED.curricularPolicies);
  });

  it("exports work products and rubrics with the other collections", () => {
    const { db } = importZip(false);
    const files = unzipSafe(exportDbAsZip(db));
    const names = files.map((file) => file.name);
    expect(names.indexOf("taskModelVariables.json")).toBeLessThan(names.indexOf("workProducts.json"));
    expect(names.indexOf("workProducts.json")).toBeLessThan(names.indexOf("rubrics.json"));
    expect(names.indexOf("rubrics.json")).toBeLessThan(names.indexOf("designPatterns.json"));

    const workProducts = JSON.parse(
      files.find((file) => file.name === "workProducts.json").data.toString("utf8")
    );
    const rubrics = JSON.parse(
      files.find((file) => file.name === "rubrics.json").data.toString("utf8")
    );
    expect(workProducts.map((row) => row.name).sort()).toEqual([
      "Selected equivalent fraction",
      "Selected plant-part function",
      "Selected plant-part name",
    ]);
    expect(rubrics.map((row) => row.name).sort()).toEqual([
      "Fraction equivalence judgement",
      "Plant function judgement",
    ]);
    expect(workProducts.every((row) => row.status == null)).toBe(true);
    expect(rubrics.every((row) => row.status === "draft")).toBe(true);
    for (const row of workProducts) {
      expect(db.workProducts.some((stored) => stored.id === row.id)).toBe(true);
    }
    for (const row of rubrics) {
      expect(db.rubrics.some((stored) => stored.id === row.id)).toBe(true);
    }
  });
});
