import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { forgetDbCache } from "../../../src/utils/db-server.js";
import { runMigration } from "../runner.js";
import migration from "../migrations/016-validity-evidence.js";

const personFit = { nPersons: 10, nMisfit: 1, cutoff: -2 };

function seed() {
  return {
    evidenceModels: [
      {
        id: "em1",
        statisticalModels: [
          {
            id: "sm1",
            parameterSets: [
              {
                parameterSetId: "ps1",
                calibrationJobId: "job1",
                analysisArtefactId: "aa1",
                calibratedBy: "admin1",
                fitStatistics: { personFit },
              },
            ],
          },
        ],
      },
    ],
    analysisArtefacts: [
      {
        id: "aa1",
        kind: "irt-parameters",
        jobId: "job1",
        scope: { evidenceModelId: "em1" },
        payload: { fitStatistics: { personFit, localDependence: { maxAbsQ3: 0.22, flaggedPairs: [] } } },
        createdAt: "2026-10-31T00:00:00.000Z",
      },
    ],
    auditLog: [],
  };
}

describe("016 validity evidence migration", () => {
  let tmp;
  let prevFile;
  let prevBackup;
  let prevBackend;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-ve-mig-"));
    prevFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    prevBackend = process.env.VALIDITY_EVIDENCE_BACKEND;
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
    process.env.VALIDITY_EVIDENCE_BACKEND = "json";
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify(seed()));
    forgetDbCache();
  });

  afterEach(() => {
    forgetDbCache();
    if (prevFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    if (prevBackend === undefined) delete process.env.VALIDITY_EVIDENCE_BACKEND;
    else process.env.VALIDITY_EVIDENCE_BACKEND = prevBackend;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("dry run links nothing and writes no backup", async () => {
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const result = await runMigration(migration, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.summary).toMatch(/Would add validityEvidence/);
    expect(result.summary).toMatch(/Would link 1/);
    expect(result.changed).toHaveLength(1);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(before);
    expect(fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-validity-evidence"))).toBe(false);
  });

  it("adds one row for the artefact and the parameter set, then does nothing on a second run", async () => {
    const applied = await runMigration(migration, { dryRun: false });
    expect(applied.summary).toMatch(/Linked 1/);
    expect(fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-validity-evidence"))).toBe(true);
    forgetDbCache();
    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(onDisk.validityEvidence).toHaveLength(1);
    expect(onDisk.validityEvidence[0].type).toBe("internal-structure");
    expect(onDisk.validityEvidence[0].analysisArtefactId).toBe("aa1");
    expect(onDisk.validityEvidence[0].source).toBe("tu4-fit");
    expect(onDisk.evidenceModels[0].statisticalModels[0].parameterSets[0].parameterSetId).toBe("ps1");

    const snapshot = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const again = await runMigration(migration, { dryRun: false, force: true });
    expect(again.summary).toMatch(/No new TU4 links/);
    expect(again.changed).toEqual([]);
    forgetDbCache();
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(snapshot);
  });
});
