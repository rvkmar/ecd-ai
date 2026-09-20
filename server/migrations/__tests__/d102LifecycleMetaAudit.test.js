// server/migrations/__tests__/d102LifecycleMetaAudit.test.js
//
// D102 exit check: every entity's known lifecycle history appears in
// auditLog marked reconstructed; a dry run reports exactly what a
// removal migration would delete, and nothing is deleted yet.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigration } from "../runner.js";
import backfillLifecycleAudit from "../migrations/003-backfill-lifecycle-audit.js";
import previewRemoveLifecycleMeta from "../migrations/004-preview-remove-lifecycle-meta.js";
import {
  collectRemovableLifecycleFields,
  pendingReconstructedEntries,
} from "../lifecycleMetaAudit.js";

describe("D102 lifecycle meta → audit", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d102-"));
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

  function seed() {
    const db = {
      evidenceModels: [
        {
          id: "em1",
          versionNumber: 2,
          status: "suspended",
          reviewMeta: {
            submittedForReviewAt: "2026-01-01T10:00:00.000Z",
            submittedBy: "admin1",
            returnedToDraftAt: "2026-01-01T11:00:00.000Z",
            returnedBy: "admin1",
          },
          operationalMeta: {
            activatedAt: "2026-01-02T10:00:00.000Z",
            suspendedAt: "2026-01-03T10:00:00.000Z",
            suspensionReason: "Drift review",
            reactivationCount: 1,
          },
        },
      ],
      competencyModels: [
        {
          id: "cm1",
          versionNumber: 1,
          reviewMeta: {
            submittedForReviewAt: "2026-01-01T09:00:00.000Z",
            submittedBy: "admin1",
          },
        },
      ],
      taskModels: [
        {
          id: "tm1",
          status: "suspended",
          deactivation: {
            deactivatedAt: "2026-01-04T10:00:00.000Z",
            forced: true,
            closedSessionCount: 2,
            reason: "emergency",
          },
        },
      ],
      auditLog: [],
    };
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }

  it("collectors find reconstructed history and removable paths", () => {
    const db = seed();
    const history = pendingReconstructedEntries(db);
    expect(history.length).toBeGreaterThanOrEqual(5);
    expect(history.every((e) => e.detail?.reconstructed === true)).toBe(true);
    expect(history.every((e) => e.action === "lifecycle.reconstructed")).toBe(true);
    // No invented roles
    expect(history.every((e) => e.actor.role === null)).toBe(true);

    const removable = collectRemovableLifecycleFields(db);
    expect(removable.some((r) => r.path === "operationalMeta" && r.id === "em1")).toBe(true);
    expect(removable.some((r) => r.path === "reviewMeta" && r.id === "cm1")).toBe(true);
    expect(removable.some((r) => r.path === "deactivation" && r.id === "tm1")).toBe(true);
  });

  it("003 dry-run reports backfill and writes nothing", async () => {
    seed();
    const result = await runMigration(backfillLifecycleAudit, { dryRun: true, force: true });
    expect(result.dryRun).toBe(true);
    expect(result.changed.length).toBeGreaterThanOrEqual(5);

    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(onDisk.auditLog || []).toEqual([]);
    expect(onDisk.evidenceModels[0].operationalMeta.activatedAt).toBeTruthy();
  });

  it("003 apply backfills reconstructed rows and retains source fields", async () => {
    seed();
    const result = await runMigration(backfillLifecycleAudit, { dryRun: false, force: true });
    expect(result.changed.length).toBeGreaterThanOrEqual(5);

    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    const recon = (onDisk.auditLog || []).filter((e) => e.detail?.reconstructed);
    expect(recon.length).toBe(result.changed.length);
    expect(recon.every((e) => e.action === "lifecycle.reconstructed")).toBe(true);

    // Fields retained
    expect(onDisk.evidenceModels[0].operationalMeta.activatedAt).toBe(
      "2026-01-02T10:00:00.000Z"
    );
    expect(onDisk.evidenceModels[0].reviewMeta.submittedForReviewAt).toBeTruthy();
    expect(onDisk.taskModels[0].deactivation.deactivatedAt).toBeTruthy();

    // Idempotent: second apply adds nothing
    const again = await runMigration(backfillLifecycleAudit, { dryRun: false, force: true });
    expect(again.changed).toEqual([]);
    const after = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(after.auditLog.length).toBe(onDisk.auditLog.length);
  });

  it("004 reports removal targets and never deletes (dry-run or apply)", async () => {
    seed();
    await runMigration(backfillLifecycleAudit, { dryRun: false, force: true });

    const dry = await runMigration(previewRemoveLifecycleMeta, { dryRun: true, force: true });
    expect(dry.changed.length).toBeGreaterThanOrEqual(3);
    expect(dry.summary).toMatch(/would be deleted|Removal preview/i);

    const applied = await runMigration(previewRemoveLifecycleMeta, {
      dryRun: false,
      force: true,
    });
    expect(applied.changed.length).toBe(dry.changed.length);

    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(onDisk.evidenceModels[0].operationalMeta).toBeTruthy();
    expect(onDisk.evidenceModels[0].reviewMeta).toBeTruthy();
    expect(onDisk.competencyModels[0].reviewMeta).toBeTruthy();
    expect(onDisk.taskModels[0].deactivation).toBeTruthy();
  });

  it("pendingReconstructedEntries skips ids already in auditLog", () => {
    const db = seed();
    const all = pendingReconstructedEntries(db);
    db.auditLog = [all[0]];
    const pending = pendingReconstructedEntries(db);
    expect(pending).toHaveLength(all.length - 1);
    expect(pending.find((e) => e.id === all[0].id)).toBeUndefined();
  });
});
