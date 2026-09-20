// server/routes/__tests__/d101LifecycleAuditRoute.test.js
//
// Exit check through a real lifecycle route that does not import audit:
// PATCH /evidenceModels/:id/lifecycle → saveDB → auditLog entry.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { username: "admin1", role: "admin" };
    next();
  },
  authorizeRole: () => (_req, _res, next) => next(),
}));

describe("D101 lifecycle route → audit via saveDB", () => {
  let tmpDir;
  let prevDbFile;
  let prevBackup;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d101-route-"));
    prevDbFile = process.env.ECD_DB_FILE;
    prevBackup = process.env.ECD_BACKUP_DIR;
    process.env.ECD_DB_FILE = path.join(tmpDir, "db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    vi.resetModules();
  });

  afterEach(() => {
    if (prevDbFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDbFile;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces lifecycle.transition without the route importing audit", async () => {
    const { saveDB, readRawDB } = await import("../../../src/utils/db-server.js");
    const { bindAuditActor, beginAuditRequest } = await import(
      "../../utils/auditContext.js"
    );
    const { default: router } = await import("../evidenceModels.js");

    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, "../evidenceModels.js"),
      "utf8"
    );
    expect(routeSrc).not.toMatch(/auditLog/);

    saveDB(
      {
        evidenceModels: [
          {
            id: "em1",
            name: "Numerical Reasoning",
            competencyId: "c1",
            competencyModelVersion: 1,
            versionNumber: 1,
            status: "confirmed",
            locked: true,
            observables: [{ id: "o1", statement: "Computes the answer." }],
            statisticalModels: [
              {
                id: "sm1",
                type: "irt",
                subtype: "2pl",
                active: true,
                structureConfig: { observableIds: ["o1"] },
                parameterSets: [
                  {
                    parameterSetId: "ps1",
                    parameters: { o1: { a: 1.2, b: 0.3 } },
                    packageVersion: "mirt-1.42.1",
                    converged: true,
                    sampleSize: 480,
                    calibratedAt: "2026-06-01T00:00:00.000Z",
                  },
                ],
                activeParameterSetId: "ps1",
              },
            ],
            decisionRule: {
              type: "posterior_threshold",
              threshold: 0.35,
              direction: "above",
              justification: "Cut from the June 2026 standard setting.",
            },
          },
        ],
        taskModels: [
          {
            id: "tm1",
            name: "Fractions Task",
            status: "confirmed",
            evidenceModelIds: ["em1"],
          },
        ],
        competencies: [{ id: "c1", modelId: "cm1", variableType: "continuous" }],
        competencyModels: [
          { id: "cm1", versionNumber: 1, status: "confirmed", locked: true },
        ],
        auditLog: [],
      },
      { skipAudit: true }
    );

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      beginAuditRequest("req-route");
      bindAuditActor({ userId: "admin1", role: "admin" });
      next();
    });
    app.use("/api/evidenceModels", router);

    const res = await request(app)
      .patch("/api/evidenceModels/em1/lifecycle")
      .send({ nextStatus: "operational" });

    expect(res.status).toBe(200);

    const raw = readRawDB();
    expect(raw.evidenceModels[0].status).toBe("operational");
    const transitions = (raw.auditLog || []).filter(
      (e) => e.action === "lifecycle.transition" && e.entity?.id === "em1"
    );
    expect(transitions.length).toBeGreaterThanOrEqual(1);
    expect(transitions[0].detail).toEqual({ from: "confirmed", to: "operational" });
  });
});
