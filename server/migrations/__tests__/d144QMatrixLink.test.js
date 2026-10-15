import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../runner.js";
import migration from "../migrations/007-qmatrix-domain-analysis-link.js";
import { readRawDB } from "../../../src/utils/db-server.js";

describe("D144 Q-matrix migration", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d144-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({
      qMatrixModels: [{
        id: "qm1",
        name: "Force",
        competencyModelId: "cm1",
        attributeIds: ["smv1"],
        entries: [{ itemId: "item1", attributeId: "smv1", required: true }],
        status: "confirmed",
        locked: true,
      }],
      domainAnalyses: [{
        id: "da1",
        name: "Diagrams",
        status: "draft",
        knowledgeTaskRelationships: [{ label: "The task asks for the relation" }],
      }],
      evidenceModels: [{
        id: "em1",
        statisticalModels: [{ id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm1" } }],
      }],
    }));
  });

  afterEach(() => {
    if (prevDbFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDbFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("dry-run leaves the matrix, the DINA id, and the knowledge-task label", async () => {
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const result = await runMigration(migration, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.changed).toEqual([]);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(before);
  });

  it("does not mint a Domain Analysis or rewrite the competency binding", async () => {
    await runMigration(migration, { dryRun: false, force: true });
    const db = readRawDB();
    expect(db.domainAnalyses).toHaveLength(1);
    expect(db.qMatrixModels[0].id).toBe("qm1");
    expect(db.qMatrixModels[0].competencyModelId).toBe("cm1");
    expect(db.qMatrixModels[0].domainAnalysisId).toBeUndefined();
    expect(db.qMatrixModels[0].entries).toEqual([
      { itemId: "item1", attributeId: "smv1", required: true },
    ]);
    expect(db.evidenceModels[0].statisticalModels[0].structureConfig.qMatrixId).toBe("qm1");
    expect(db.domainAnalyses[0].knowledgeTaskRelationships[0].label).toBe(
      "The task asks for the relation"
    );
    const found = db.qMatrixModels.find(
      (row) => row.id === db.evidenceModels[0].statisticalModels[0].structureConfig.qMatrixId
    );
    expect(found.competencyModelId).toBe("cm1");
  });
});
