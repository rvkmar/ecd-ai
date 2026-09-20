// server/migrations/__tests__/d109ProductionShapedMigration.test.js
//
// D109 exit check: full migration chain runs clean on a production-shaped
// dataset; every migration has rollback or forward-only; generator is
// regenerable from a seed.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../runner.js";
import { MIGRATION_REGISTRY } from "../registry.js";
import {
  collectRemovableLifecycleFields,
} from "../lifecycleMetaAudit.js";
import {
  DEFAULTS,
  generateProductionShapedDataset,
} from "../../fixtures/productionShaped/generate.js";
import { SESSION_STATUS } from "../../../src/utils/sessionStatus.js";

describe("D109 production-shaped migration rehearsal", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d109-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
  });

  afterEach(() => {
    if (prevDbFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDbFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDataset(options) {
    const { db, manifest } = generateProductionShapedDataset(options);
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify(db));
    return { db, manifest };
  }

  it("generator is deterministic for a seed", () => {
    const a = generateProductionShapedDataset({ seed: 42 });
    const b = generateProductionShapedDataset({ seed: 42 });
    expect(a.manifest.counts).toEqual(b.manifest.counts);
    expect(a.db.items[0].id).toBe(b.db.items[0].id);
    expect(a.db.sessions[10].status).toBe(b.db.sessions[10].status);
  });

  it("default shape meets production-sized floors", () => {
    const { manifest } = generateProductionShapedDataset(DEFAULTS);
    expect(manifest.counts.items).toBeGreaterThanOrEqual(1000);
    expect(manifest.counts.sessions).toBeGreaterThanOrEqual(400);
    expect(manifest.districts).toBeGreaterThanOrEqual(5);
    expect(manifest.legacy.hyphenSessionStatus).toBeGreaterThan(0);
    expect(manifest.legacy.stringToolsAllowed).toBeGreaterThan(0);
    expect(manifest.legacy.lifecycleMetaGroups).toBeGreaterThan(0);
  });

  it("every registry migration declares rollback or forwardOnly", () => {
    for (const m of MIGRATION_REGISTRY) {
      const hasRollback = typeof m.rollback === "string" && m.rollback.length > 10;
      const forwardOnly = m.forwardOnly === true;
      expect(hasRollback || forwardOnly).toBe(true);
      if (forwardOnly) {
        expect(hasRollback).toBe(true);
      }
    }
  });

  it("dry-run full chain writes nothing on the production-shaped dataset", async () => {
    const { manifest } = writeDataset(DEFAULTS);
    const before = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");

    for (const migration of MIGRATION_REGISTRY) {
      const result = await runMigration(migration, { dryRun: true, force: true });
      expect(result.skipped).toBeFalsy();
      expect(result.dryRun).toBe(true);
    }

    const after = fs.readFileSync(process.env.ECD_DB_FILE, "utf8");
    expect(after).toBe(before);
    expect(manifest.legacy.lifecycleMetaGroups).toBeGreaterThan(0);
  });

  it("apply full chain: normalize, backfill, strip meta; audit retained", async () => {
    writeDataset(DEFAULTS);

    for (const migration of MIGRATION_REGISTRY) {
      const result = await runMigration(migration, { dryRun: false, force: true });
      expect(result.skipped).toBeFalsy();
    }

    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));

    // 001
    const legacyHyphen = ["in", "progress"].join("-");
    expect(onDisk.sessions.every((s) => s.status !== legacyHyphen)).toBe(true);
    expect(
      onDisk.sessions.some((s) => s.status === SESSION_STATUS.IN_PROGRESS)
    ).toBe(true);

    // 002
    for (const tm of onDisk.taskModels) {
      const tools = tm.taskStructure?.resourceConstraints?.toolsAllowed;
      if (tools != null) expect(Array.isArray(tools)).toBe(true);
    }

    // 003 — reconstructed history present
    const recon = (onDisk.auditLog || []).filter((e) => e.detail?.reconstructed);
    expect(recon.length).toBeGreaterThan(0);

    // 005 — meta gone
    expect(collectRemovableLifecycleFields(onDisk)).toEqual([]);
    for (const em of onDisk.evidenceModels) {
      expect(em.reviewMeta).toBeUndefined();
      expect(em.operationalMeta).toBeUndefined();
    }
    for (const tm of onDisk.taskModels) {
      expect(tm.deactivation).toBeUndefined();
    }

    // Idempotent strip
    const again = await runMigration(
      MIGRATION_REGISTRY.find((m) => m.id === "005-remove-lifecycle-meta"),
      { dryRun: false, force: true }
    );
    expect(again.changed).toEqual([]);
  });

  it("registry includes 005 after 004", () => {
    const ids = MIGRATION_REGISTRY.map((m) => m.id);
    expect(ids).toContain("004-preview-remove-lifecycle-meta");
    expect(ids).toContain("005-remove-lifecycle-meta");
    expect(ids.indexOf("005-remove-lifecycle-meta")).toBeGreaterThan(
      ids.indexOf("004-preview-remove-lifecycle-meta")
    );
  });
});
