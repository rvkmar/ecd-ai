import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { performRestoreRehearsal } from "../restoreRehearsal.js";
import { runRestore } from "../runRestore.js";

describe("D108 restore rehearsal", () => {
  it("performs a timed restore that meets RPO/RTO and all four checks", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d108-"));
    const recordPath = path.join(tmp, "record.json");
    try {
      const result = await performRestoreRehearsal({
        tmpRoot: tmp,
        keepWorkDir: true,
        recordPath,
        key: crypto.randomBytes(32),
      });

      expect(result.ok).toBe(true);
      expect(result.statedRpoMs).toBe(24 * 60 * 60 * 1000);
      expect(result.statedRtoMs).toBe(60 * 60 * 1000);
      expect(result.rpoMet).toBe(true);
      expect(result.rtoMet).toBe(true);
      expect(result.backupAgeMs).toBeLessThanOrEqual(result.statedRpoMs);
      expect(result.restoreElapsedMs).toBeLessThanOrEqual(result.statedRtoMs);
      expect(result.restoreElapsedMs).toBeLessThan(60_000);

      expect(result.verification.checks.posteriorRecomputes.ok).toBe(true);
      expect(result.verification.checks.parameterSetResolvesToJob.ok).toBe(true);
      expect(result.verification.checks.materialsRender.ok).toBe(true);
      expect(result.verification.checks.auditLogIntact.ok).toBe(true);
      expect(result.mongoUsersRestored).toBe(true);

      const onDisk = JSON.parse(fs.readFileSync(recordPath, "utf8"));
      expect(onDisk.ok).toBe(true);
      expect(onDisk.restoreElapsedMs).toBe(result.restoreElapsedMs);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("runRestore refuses a missing archive", async () => {
    const result = await runRestore({
      key: crypto.randomBytes(32),
      archivePath: path.join(os.tmpdir(), "no-such-ecd-backup.enc"),
      targetRoot: path.join(os.tmpdir(), "ecd-d108-missing"),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/archivePath|not found/i);
  });

  it("runRestore refuses without an encryption key", async () => {
    const result = await runRestore({
      key: null,
      blob: Buffer.from("x"),
      targetRoot: path.join(os.tmpdir(), "ecd-d108-nokey"),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECD_BACKUP_ENCRYPTION_KEY/);
  });
});
