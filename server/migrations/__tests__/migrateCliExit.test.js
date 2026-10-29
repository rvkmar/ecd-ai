import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import { forgetDbCache } from "../../../src/utils/db-server.js";
import { MIGRATION_REGISTRY } from "../registry.js";
import { runMigration, shutdownMigrationConnections } from "../runner.js";

describe("migrate CLI exits", () => {
  const prev = {
    file: process.env.ECD_DB_FILE,
    backend: process.env.SESSIONS_BACKEND,
    auditBackend: process.env.AUDITLOG_BACKEND,
    jobsBackend: process.env.CALIBRATION_JOBS_BACKEND,
    artefactsBackend: process.env.ANALYSIS_ARTEFACTS_BACKEND,
    backup: process.env.ECD_BACKUP_DIR,
  };
  let tmp;

  afterEach(async () => {
    await shutdownMigrationConnections();
    forgetDbCache();
    if (prev.file === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prev.file;
    if (prev.backend === undefined) delete process.env.SESSIONS_BACKEND;
    else process.env.SESSIONS_BACKEND = prev.backend;
    if (prev.auditBackend === undefined) delete process.env.AUDITLOG_BACKEND;
    else process.env.AUDITLOG_BACKEND = prev.auditBackend;
    if (prev.jobsBackend === undefined) delete process.env.CALIBRATION_JOBS_BACKEND;
    else process.env.CALIBRATION_JOBS_BACKEND = prev.jobsBackend;
    if (prev.artefactsBackend === undefined) delete process.env.ANALYSIS_ARTEFACTS_BACKEND;
    else process.env.ANALYSIS_ARTEFACTS_BACKEND = prev.artefactsBackend;
    if (prev.backup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prev.backup;
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("dry-run returns and does not leave a Mongo connection open", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-migrate-cli-"));
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
    process.env.SESSIONS_BACKEND = "json";
    process.env.AUDITLOG_BACKEND = "json";
    process.env.CALIBRATION_JOBS_BACKEND = "json";
    process.env.ANALYSIS_ARTEFACTS_BACKEND = "json";
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({ sessions: [], auditLog: [] }));
    forgetDbCache();
    for (const migration of MIGRATION_REGISTRY) {
      const result = await runMigration(migration, { dryRun: true, force: true });
      expect(result.dryRun).toBe(true);
    }
    await shutdownMigrationConnections();
    expect(mongoose.connection.readyState).toBe(0);
  });
});
