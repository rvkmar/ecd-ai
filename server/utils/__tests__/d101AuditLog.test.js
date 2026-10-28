// server/utils/__tests__/d101AuditLog.test.js
//
// D101 exit check: a lifecycle transition through the persistence path
// produces an audit entry; evidenceModels.js never mentions the audit
// module — saveDB is the chokepoint, not per-route discipline.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { applySaveAudits, pushAuditEvent } from "../auditLog.js";
import { beginAuditRequest, bindAuditActor } from "../auditContext.js";

const EVIDENCE_ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../routes/evidenceModels.js"),
  "utf8"
);
const TASK_ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../routes/taskModelsRoutes.js"),
  "utf8"
);
const ITEM_ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../routes/itemsRoutes.js"),
  "utf8"
);

describe("D101 auditLog chokepoint", () => {
  it("lifecycle route files never import the audit module (exit check)", () => {
    for (const [name, src] of [
      ["evidenceModels.js", EVIDENCE_ROUTE],
      ["taskModelsRoutes.js", TASK_ROUTE],
      ["itemsRoutes.js", ITEM_ROUTE],
    ]) {
      expect(src, name).not.toMatch(/auditLog/);
      expect(src, name).not.toMatch(/recordAuditEvent/);
      expect(src, name).not.toMatch(/from ["'].*auditContext/);
    }
  });

  it("applySaveAudits records a status transition", () => {
    beginAuditRequest("req-test");
    bindAuditActor({ userId: "admin1", role: "admin" });
    const before = {
      evidenceModels: [{ id: "em1", status: "confirmed", versionNumber: 1 }],
    };
    const after = {
      evidenceModels: [{ id: "em1", status: "operational", versionNumber: 1 }],
      auditLog: [],
    };
    applySaveAudits(before, after);
    expect(after.auditLog).toHaveLength(1);
    expect(after.auditLog[0].action).toBe("lifecycle.transition");
    expect(after.auditLog[0].entity).toEqual({
      collection: "evidenceModels",
      id: "em1",
      version: 1,
    });
    expect(after.auditLog[0].detail).toEqual({ from: "confirmed", to: "operational" });
    expect(after.auditLog[0].actor).toEqual({ userId: "admin1", role: "admin" });
    expect(after.auditLog[0].requestId).toBe("req-test");
  });

  it("applySaveAudits records parameter-set replacement and ingest markers", () => {
    const before = {
      evidenceModels: [
        {
          id: "em1",
          status: "operational",
          statisticalModels: [{ id: "sm1", activeParameterSetId: "ps1" }],
        },
      ],
      calibrationJobs: [
        { id: "job1", status: "succeeded", kind: "irt-parameters", evidenceModelId: "em1" },
      ],
    };
    const after = {
      evidenceModels: [
        {
          id: "em1",
          status: "operational",
          statisticalModels: [{ id: "sm1", activeParameterSetId: "ps2" }],
        },
      ],
      calibrationJobs: [
        {
          id: "job1",
          status: "succeeded",
          kind: "irt-parameters",
          evidenceModelId: "em1",
          ingestedParameterSetId: "ps2",
        },
      ],
      auditLog: [],
    };
    applySaveAudits(before, after);
    const actions = after.auditLog.map((e) => e.action).sort();
    expect(actions).toEqual(["calibration.ingest", "parameter_set.replace"]);
  });

  it("a candidate ingest that leaves the active pointer does not record a replacement", () => {
    beginAuditRequest("req-candidate");
    bindAuditActor({ userId: "admin1", role: "admin" });
    const before = {
      evidenceModels: [
        {
          id: "em1",
          versionNumber: 1,
          statisticalModels: [{ id: "sm1", activeParameterSetId: "ps1" }],
        },
      ],
      calibrationJobs: [{ id: "job1", status: "succeeded", kind: "irt-parameters" }],
    };
    const after = {
      evidenceModels: [
        {
          id: "em1",
          versionNumber: 1,
          statisticalModels: [
            {
              id: "sm1",
              activeParameterSetId: "ps1",
              parameterSets: [{ parameterSetId: "ps-new", status: "candidate" }],
            },
          ],
        },
      ],
      calibrationJobs: [
        {
          id: "job1",
          status: "succeeded",
          kind: "irt-parameters",
          ingestedParameterSetId: "ps-new",
        },
      ],
      auditLog: [],
    };
    applySaveAudits(before, after);
    expect(after.auditLog.map((e) => e.action)).toEqual(["calibration.ingest"]);
  });

  it("activating a candidate still records who moved the pointer and when", () => {
    beginAuditRequest("req-activate");
    bindAuditActor({ userId: "admin1", role: "admin" });
    const before = {
      evidenceModels: [
        {
          id: "em1",
          versionNumber: 1,
          statisticalModels: [{ id: "sm1", activeParameterSetId: "ps1" }],
        },
      ],
    };
    const after = {
      evidenceModels: [
        {
          id: "em1",
          versionNumber: 1,
          statisticalModels: [{ id: "sm1", activeParameterSetId: "ps2" }],
        },
      ],
      auditLog: [],
    };
    applySaveAudits(before, after);
    expect(after.auditLog).toHaveLength(1);
    expect(after.auditLog[0].action).toBe("parameter_set.replace");
    expect(after.auditLog[0].actor).toEqual({ userId: "admin1", role: "admin" });
    expect(typeof after.auditLog[0].at).toBe("string");
    expect(after.auditLog[0].detail).toEqual({
      statisticalModelId: "sm1",
      from: "ps1",
      to: "ps2",
    });
  });

  it("applySaveAudits records entity.create for bulk-style inserts", () => {
    const before = { items: [] };
    const after = { items: [{ id: "i1", status: "draft", versionNumber: 1 }], auditLog: [] };
    applySaveAudits(before, after);
    expect(after.auditLog).toHaveLength(1);
    expect(after.auditLog[0].action).toBe("entity.create");
    expect(after.auditLog[0].entity.collection).toBe("items");
  });

  it("pushAuditEvent shape matches the calendar contract", () => {
    const db = { auditLog: [] };
    const entry = pushAuditEvent(db, {
      action: "auth.failure",
      entity: { collection: "users", id: "teach1" },
      detail: { reason: "invalid_credentials" },
      actor: { userId: "teach1", role: null },
      requestId: "r1",
    });
    expect(entry).toMatchObject({
      action: "auth.failure",
      actor: { userId: "teach1", role: null },
      entity: { collection: "users", id: "teach1", version: null },
      detail: { reason: "invalid_credentials" },
      requestId: "r1",
    });
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.at).toBe("string");
    expect(db.auditLog).toHaveLength(1);
  });
});

describe("D101 saveDB writes audit without route imports", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d101-"));
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

  it("persists a lifecycle.transition when status changes through saveDB", async () => {
    const { saveDB, readRawDB } = await import("../../../src/utils/db-server.js");

    saveDB(
      {
        evidenceModels: [{ id: "em1", status: "confirmed", versionNumber: 1 }],
        auditLog: [],
      },
      { skipAudit: true }
    );

    beginAuditRequest("req-save");
    bindAuditActor({ userId: "admin1", role: "admin" });
    const db = readRawDB();
    db.evidenceModels[0].status = "operational";
    saveDB(db);

    const raw = readRawDB();
    const transitions = (raw.auditLog || []).filter(
      (e) => e.action === "lifecycle.transition"
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0].detail).toEqual({ from: "confirmed", to: "operational" });
    expect(transitions[0].actor.userId).toBe("admin1");
    expect(transitions[0].requestId).toBe("req-save");
  });

  it("applySaveAudits is skipped when skipAudit is set", () => {
    const before = {
      evidenceModels: [{ id: "em1", status: "confirmed" }],
    };
    const after = {
      evidenceModels: [{ id: "em1", status: "operational" }],
      auditLog: [],
    };
    applySaveAudits(before, after, { skipAudit: true });
    expect(after.auditLog).toEqual([]);
  });
});
