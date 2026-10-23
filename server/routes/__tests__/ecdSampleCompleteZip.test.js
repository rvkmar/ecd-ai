// The committed sample zip must import cleanly. Counts and a few links
// are asserted so a validator change cannot leave the archive half-broken
// while the file still sits in samples/.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { unzipSafe } from "../../utils/safeZip.js";
import { importZipIntoDb } from "../../import/ecdZipImport.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ZIP_PATH = path.join(ROOT, "samples/ecd-sample-complete.zip");
const JSON_DIR = path.join(ROOT, "samples/ecd-sample-complete");

const EXPECTED = {
  curricularPolicies: 2,
  policies: 3,
  domainAnalyses: 3,
  taskModelVariables: 3,
  competencyModels: 2,
  competencies: 3,
  designPatterns: 3,
  evidenceModels: 3,
  taskModels: 3,
  items: 4,
  qMatrixModels: 2,
  assemblyModels: 2,
  presentationModels: 3,
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

    const task = db.taskModels.find((row) => row.name === "Name the plant part");
    const partEvidence = db.evidenceModels.find((row) => row.name === "Part naming evidence");
    expect(task.evidenceModelIds).toContain(partEvidence.id);
    expect(task.primaryEvidenceModelId).toBe(partEvidence.id);

    const item = db.items.find((row) => row.name === "Equivalent to 2/4");
    const fractionTask = db.taskModels.find((row) => row.name === "Name the fraction");
    expect(item.taskModelId).toBe(fractionTask.id);

    const template = db.templates.find((row) => row.name === "Plant part template");
    const presentation = db.presentationModels.find((row) => row.id === template.presentationModelId);
    expect(presentation.taskModelId).toBe(template.taskModelId);

    const pattern = db.designPatterns.find((row) => row.name === "Name a plant part");
    const parent = db.designPatterns.find((row) => row.name === "Explain a labelled diagram");
    expect(pattern.relationships[0].targetPatternId).toBe(parent.id);

    // Curricular-policy create upserts one content-standard shell per policy.
    expect(db.domainAnalyses).toHaveLength(EXPECTED.domainAnalyses + EXPECTED.curricularPolicies);
  });
});
