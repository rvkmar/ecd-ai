import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../runner.js";
import migration from "../migrations/008-perspective-inheritance.js";
import { readRawDB } from "../../../src/utils/db-server.js";

describe("D146 perspective migration", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d146-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({
      competencyModels: [{
        id: "cm1",
        name: "Diagram explanation",
        psychologicalPerspective: "trait",
        status: "confirmed",
      }],
      domainAnalyses: [{
        id: "da1",
        name: "Diagrams",
        psychologicalPerspective: "information_processing",
        status: "confirmed",
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

  it("does not copy or clear a stored perspective", async () => {
    const result = await runMigration(migration, { dryRun: false, force: true });
    const db = readRawDB();
    expect(db.competencyModels[0].psychologicalPerspective).toBe("trait");
    expect(db.competencyModels[0].domainAnalysisId).toBeUndefined();
    expect(result.summary).toMatch(/stay stored until rebuilt/);
  });
});
