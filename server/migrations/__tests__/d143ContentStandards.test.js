import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../runner.js";
import migration from "../migrations/006-domain-analysis-content-standards.js";
import { listCurricularPolicies } from "../contentStandards.js";
import { readRawDB } from "../../../src/utils/db-server.js";

const goals = [
  {
    code: "CG-1",
    statement: "Explain how a labelled diagram works",
    competencies: [
      {
        code: "C-1.1",
        statement: "Name the relation between two parts",
        learningOutcomes: ["Points to the link"],
      },
    ],
  },
];

describe("D143 curricular policy migration", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d143-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({
      curricularPolicies: [{
        id: "cp-ncf",
        name: "NCF science",
        curricularGoals: goals,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      domainAnalyses: [],
      competencyModels: [{
        id: "cm1",
        status: "confirmed",
        constructFramework: {
          policyId: "cp-ncf",
          policyName: "NCF science",
          curricularGoalCodes: ["CG-1"],
          curricularGoals: goals,
        },
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

  it("dry-run reports the policy and writes nothing", async () => {
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const result = await runMigration(migration, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.changed).toEqual(["cp-ncf"]);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(before);
  });

  it("copies the goal tree onto a Domain Analysis and leaves Step 3's citation", async () => {
    const result = await runMigration(migration, { dryRun: false, force: true });
    expect(result.changed).toEqual(["cp-ncf"]);

    const db = readRawDB();
    expect(db.curricularPolicies).toHaveLength(1);
    expect(db.competencyModels[0].constructFramework.policyId).toBe("cp-ncf");
    expect(db.competencyModels[0].constructFramework.curricularGoals).toEqual(goals);

    const analysis = db.domainAnalyses.find((row) => row.contentStandards?.id === "cp-ncf");
    expect(analysis.status).toBe("draft");
    expect(analysis.contentStandards.curricularGoals).toEqual(goals);
    expect(analysis.valuedKnowledge).toEqual([]);

    const resolved = listCurricularPolicies(db).find((row) => row.id === "cp-ncf");
    expect(resolved.curricularGoals).toEqual(goals);

    const again = await runMigration(migration, { dryRun: false, force: true });
    expect(again.changed).toEqual([]);
    expect(readRawDB().domainAnalyses).toHaveLength(1);
  });
});
