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
    if (prev.backup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prev.backup;
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("dry-run returns and does not leave a Mongo connection open", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-migrate-cli-"));
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
    process.env.SESSIONS_BACKEND = "json";
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
