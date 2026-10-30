import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { forgetDbCache } from "../../../src/utils/db-server.js";
import migration from "../migrations/015-slim-evidence-model-parameter-sets.js";
import {
  exportAllAnalysisArtefacts,
  resetAnalysisArtefactStoreForTests,
  upsertAnalysisArtefacts,
} from "../../analysisArtefacts/analysisArtefactRepository.js";

const REPORT = `<html><body>${"R".repeat(8000)}</body></html>`;
const PERSON_SCORES = {
  method: "EAP",
  personIds: ["stud-1", "stud-2", "stud-3"],
  theta: [0.1, -0.2, 0.4],
  se: [0.3, 0.31, 0.28],
};

function parameterSet(extra = {}) {
  return {
    parameterSetId: "ps1",
    parameters: { item_a: { a: 1.25, b: -0.15 } },
    standardErrors: { item_a: { a: 0.04, b: 0.06 } },
    fitStatistics: {
      global: { RMSEA: 0.029 },
      itemFit: { item_a: { S_X2: 0.9 } },
      personScores: PERSON_SCORES,
    },
    packageVersion: "mirt 1.41",
    converged: true,
    sampleSize: 300,
    calibratedAt: "2026-10-01T00:00:00.000Z",
    calibrationJobId: "job-keep",
    reportHtml: REPORT,
    diagnostics: { iterations: 12, plots: { theta: [-3, 3], information: [0.2, 0.4] } },
    ...extra,
  };
}

function writeDb(evidenceModels, extra = {}) {
  fs.writeFileSync(
    process.env.ECD_DB_FILE,
    JSON.stringify({
      items: [{ id: "i1" }],
      evidenceModels,
      ...extra,
    })
  );
  forgetDbCache();
}

function readDb() {
  return JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
}

function storedSet(db = readDb()) {
  return db.evidenceModels[0].statisticalModels[0].parameterSets[0];
}

describe("015 slim evidence model parameter sets", () => {
  let tmp;
  let prevFile;
  let prevBackup;
  let prevArtefacts;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-em-slim-"));
    prevFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    prevArtefacts = process.env.ANALYSIS_ARTEFACTS_BACKEND;
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
    process.env.ANALYSIS_ARTEFACTS_BACKEND = "memory";
    resetAnalysisArtefactStoreForTests();
  });

  afterEach(() => {
    resetAnalysisArtefactStoreForTests();
    if (prevFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    if (prevArtefacts === undefined) delete process.env.ANALYSIS_ARTEFACTS_BACKEND;
    else process.env.ANALYSIS_ARTEFACTS_BACKEND = prevArtefacts;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function seed() {
    writeDb([
      {
        id: "em1",
        statisticalModels: [
          {
            id: "sm1",
            type: "irt",
            parameterSets: [parameterSet(), { parameterSetId: "ps-plain", parameters: { item_b: { a: 1 } }, packageVersion: "mirt 1.41", converged: true, sampleSize: 20, calibratedAt: "2026-10-02T00:00:00.000Z" }],
          },
        ],
      },
    ]);
  }

  it("dry-run reports byte savings and writes nothing", async () => {
    seed();
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const result = await migration.migrateEvidenceModelParameterSets({ dryRun: true });
    expect(result.bytesSaved).toBeGreaterThan(1000);
    expect(result.summary).toMatch(/Would slim 1 parameter set/);
    expect(result.summary).toMatch(/saving \d+ bytes/);
    expect(result.changed).toEqual([
      expect.objectContaining({
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        parameterSetId: "ps1",
      }),
    ]);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(before);
    expect(fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-evidence-slim"))).toBe(false);
    expect(await exportAllAnalysisArtefacts()).toEqual([]);
    expect(storedSet().reportHtml).toBe(REPORT);
  });

  it("preserves the stripped payload, then slims the file", async () => {
    seed();
    const result = await migration.migrateEvidenceModelParameterSets({
      dryRun: false,
      now: new Date("2026-10-30T12:00:00.000Z"),
    });
    expect(result.bytesSaved).toBeGreaterThan(1000);
    expect(result.backup).toBe(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-evidence-slim"));
    expect(fs.existsSync(result.backup)).toBe(true);

    const ps = storedSet();
    expect(ps.reportHtml).toBeUndefined();
    expect(ps.fitStatistics.personScores).toBeUndefined();
    expect(ps.diagnostics.plots).toBeUndefined();
    expect(ps.diagnostics.iterations).toBe(12);
    expect(ps.parameters).toEqual({ item_a: { a: 1.25, b: -0.15 } });
    expect(ps.standardErrors).toEqual({ item_a: { a: 0.04, b: 0.06 } });
    expect(ps.fitStatistics.global).toEqual({ RMSEA: 0.029 });
    expect(ps.fitStatistics.itemFit).toEqual({ item_a: { S_X2: 0.9 } });
    expect(ps.calibrationJobId).toBe("job-keep");
    expect(ps.analysisArtefactId).toBe(result.changed[0].analysisArtefactId);
    expect(JSON.stringify(readDb().evidenceModels)).not.toMatch(/stud-1/);
    expect(readDb().evidenceModels[0].statisticalModels[0].parameterSets[1].parameterSetId).toBe("ps-plain");
    expect(readDb().items).toEqual([{ id: "i1" }]);

    const stored = await exportAllAnalysisArtefacts();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(ps.analysisArtefactId);
    expect(stored[0].payload.reportHtml).toBe(REPORT);
    expect(stored[0].payload.fitStatistics.personScores).toEqual(PERSON_SCORES);
    expect(stored[0].payload.preservedParameterSet.reportHtml).toBe(REPORT);
    expect(stored[0].payload.scores.map((row) => row.personId)).toEqual(["stud-1", "stud-2", "stud-3"]);
    expect(stored[0].payload.source).toBe("015-slim-evidence-model-parameter-sets");

    const backup = JSON.parse(fs.readFileSync(result.backup, "utf8"));
    expect(backup.evidenceModels[0].statisticalModels[0].parameterSets[0].reportHtml).toBe(REPORT);
  });

  it("is idempotent", async () => {
    seed();
    await migration.migrateEvidenceModelParameterSets({ dryRun: false });
    const afterFirst = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    const ids = (await exportAllAnalysisArtefacts()).map((row) => row.id);

    const again = await migration.migrateEvidenceModelParameterSets({ dryRun: false });
    expect(again.changed).toEqual([]);
    expect(again.summary).toMatch(/Nothing to slim/);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(afterFirst);
    expect((await exportAllAnalysisArtefacts()).map((row) => row.id)).toEqual(ids);
  });

  it("links an existing artefact when the payload already matches", async () => {
    await upsertAnalysisArtefacts([
      {
        id: "aa-existing",
        kind: "item-analysis",
        jobId: "job-keep",
        scope: { evidenceModelId: "em1", parameterSetId: "ps1" },
        packageVersion: "mirt 1.41",
        sampleSize: 300,
        computedAt: "2026-10-01T00:00:00.000Z",
        payload: {
          reportHtml: REPORT,
          fitStatistics: { personScores: PERSON_SCORES },
        },
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    writeDb([
      {
        id: "em1",
        statisticalModels: [
          {
            id: "sm1",
            type: "irt",
            parameterSets: [parameterSet({ diagnostics: undefined })],
          },
        ],
      },
    ]);
    const result = await migration.migrateEvidenceModelParameterSets({ dryRun: false });
    expect(result.changed[0].analysisArtefactId).toBe("aa-existing");
    expect(storedSet().analysisArtefactId).toBe("aa-existing");
    expect(storedSet().reportHtml).toBeUndefined();
    const stored = await exportAllAnalysisArtefacts();
    expect(stored.map((row) => row.id)).toEqual(["aa-existing"]);
    expect(stored[0].payload.reportHtml).toBe(REPORT);
  });

  it("does not rewrite db.json when artefact verification fails", async () => {
    seed();
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    await expect(
      migration.migrateEvidenceModelParameterSets({
        dryRun: false,
        loadArtefacts: async () => [],
      })
    ).rejects.toThrow(/db\.json was not changed/);
    expect(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).toBe(before);
    expect(storedSet().reportHtml).toBe(REPORT);
    expect(storedSet().fitStatistics.personScores.personIds).toContain("stud-1");
  });

  it("writes the preserved payload into db.json on the JSON harness", async () => {
    process.env.ANALYSIS_ARTEFACTS_BACKEND = "json";
    seed();
    const result = await migration.migrateEvidenceModelParameterSets({
      dryRun: false,
      artefactsBackend: "json",
    });
    const db = readDb();
    expect(storedSet(db).reportHtml).toBeUndefined();
    expect(storedSet(db).analysisArtefactId).toBe(result.changed[0].analysisArtefactId);
    expect(db.analysisArtefacts).toHaveLength(1);
    expect(db.analysisArtefacts[0].payload.reportHtml).toBe(REPORT);
    expect(db.analysisArtefacts[0].payload.fitStatistics.personScores.personIds[0]).toBe("stud-1");
    expect(await exportAllAnalysisArtefacts()).toBeNull();
  });
});
