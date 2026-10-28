import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../runner.js";
import migration from "../migrations/010-parameter-set-status.js";
import { readRawDB } from "../../../src/utils/db-server.js";
import { backfillParameterSetStatus } from "../../../src/utils/parameterSetStatus.js";

describe("parameter set status migration", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-ps-status-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        evidenceModels: [
          {
            id: "em1",
            statisticalModels: [
              {
                id: "sm1",
                activeParameterSetId: "ps-live",
                parameterSets: [
                  { parameterSetId: "ps-live", packageVersion: "mirt 1.41" },
                  { parameterSetId: "ps-old", packageVersion: "ecd-pilot-1.0.0" },
                ],
              },
            ],
          },
        ],
      })
    );
  });

  afterEach(() => {
    if (prevDbFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDbFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("dry-run reports the stamps and does not write", async () => {
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const result = await runMigration(migration, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.changed).toEqual(["em1/sm1/ps-live", "em1/sm1/ps-old"]);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(before);
  });

  it("marks the live pointer active, other sets candidate, and does not move the pointer", async () => {
    await runMigration(migration, { dryRun: false, force: true });
    const db = readRawDB();
    const sm = db.evidenceModels[0].statisticalModels[0];
    expect(sm.activeParameterSetId).toBe("ps-live");
    expect(sm.parameterSets[0].status).toBe("active");
    expect(sm.parameterSets[1].status).toBe("candidate");

    const again = backfillParameterSetStatus(db);
    expect(again).toEqual([]);
  });
});
