import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { zipFiles, unzipSafe } from "../../utils/safeZip.js";

const authState = vi.hoisted(() => ({ role: "admin", unauth: false }));

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, res, next) => {
    if (authState.unauth) return res.sendStatus(401);
    req.user = { id: "u1", username: "admin1", role: authState.role };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
}));

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import dataZipRouter from "../dataZipRoutes.js";

const sampleZip = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "by-entity-final.zip"
);

function emptyDb() {
  return {
    policies: [],
    curricularPolicies: [],
    domainAnalyses: [],
    competencyModels: [],
    competencies: [],
    taskModelVariables: [],
    evidenceModels: [],
    taskModels: [],
    items: [],
    qMatrixModels: [],
    assemblyModels: [],
    designPatterns: [],
    presentationModels: [],
    templates: [],
    workProducts: [],
    rubrics: [],
  };
}

function makeApp() {
  const app = express();
  app.use("/api/data/zip", dataZipRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

function postZip(app, buffer, query = "") {
  return request(app)
    .post(`/api/data/zip${query}`)
    .set("Content-Type", "application/zip")
    .send(buffer);
}

let db;

beforeEach(() => {
  authState.role = "admin";
  authState.unauth = false;
  db = emptyDb();
  loadDB.mockImplementation(() => db);
  saveDB.mockReset();
});

describe("POST /api/data/zip", () => {
  it("refuses a caller who is not an admin", async () => {
    authState.role = "teacher";
    const zip = zipFiles({ "policies.json": "[]" });
    const res = await postZip(makeApp(), zip, "?dryRun=1");
    expect(res.status).toBe(403);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("refuses a caller with no token", async () => {
    authState.unauth = true;
    const zip = zipFiles({ "policies.json": "[]" });
    const res = await postZip(makeApp(), zip, "?dryRun=1");
    expect(res.status).toBe(401);
  });

  it("rejects path traversal and does not write", async () => {
    const zip = zipFiles({ "ok.json": "[]" });
    const from = Buffer.from("ok.json");
    const to = Buffer.from("../a.js");
    const patched = Buffer.from(zip);
    let offset = 0;
    while (offset < patched.length) {
      const at = patched.indexOf(from, offset);
      if (at === -1) break;
      to.copy(patched, at);
      offset = at + to.length;
    }
    const res = await postZip(makeApp(), patched, "?dryRun=0");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/escapes the archive/);
    expect(saveDB).not.toHaveBeenCalled();
    expect(db.policies).toEqual([]);
  });

  it("rejects an entry that expands too far", async () => {
    const zip = zipFiles({ "policies.json": "[]".padEnd(200_000, " ") });
    const res = await postZip(makeApp(), zip, "?dryRun=1");
    expect(res.status).toBe(400);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("does not persist a dry run, and a bad row does not drop the good one", async () => {
    const zip = zipFiles({
      "notes.txt": "hello",
      "policies.json": JSON.stringify([
        { id: "p-fixed", name: "Fixed form", type: "fixed" },
        { name: "Missing type" },
      ]),
    });
    const res = await postZip(makeApp(), zip, "?dryRun=1");
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.entities.policies.created).toBe(1);
    expect(res.body.entities.policies.failed).toBe(1);
    expect(res.body.skipped.some((row) => row.file === "notes.txt")).toBe(true);
    expect(saveDB).not.toHaveBeenCalled();
    expect(db.policies).toEqual([]);
  });

  it("imports in dependency order and rewrites ids", async () => {
    const zip = zipFiles({
      // Evidence is listed first in the archive on purpose. The importer
      // still creates the competency before it.
      "evidenceModels.json": JSON.stringify([
        { id: "em1", name: "Addition evidence", competencyId: "c1" },
      ]),
      "competencies.json": JSON.stringify([
        { id: "c1", name: "Addition", modelId: "cm1", variableType: "binary" },
      ]),
      "competencyModels.json": JSON.stringify([
        { id: "cm1", name: "Numeracy", measurementIntent: "unidimensional" },
      ]),
      "designPatterns.json": JSON.stringify([
        {
          id: "dp-child",
          name: "Child pattern",
          relationships: [{ type: "kind-of", targetPatternId: "dp-parent" }],
        },
        { id: "dp-parent", name: "Parent pattern" },
      ]),
      "domainAnalyses.json": JSON.stringify([
        { id: "da1", name: "Plant structure" },
      ]),
    });

    const res = await postZip(makeApp(), zip, "?dryRun=0");
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
    expect(res.body.order.indexOf("domainAnalyses")).toBeLessThan(
      res.body.order.indexOf("designPatterns")
    );
    expect(res.body.order.indexOf("competencyModels")).toBeLessThan(
      res.body.order.indexOf("competencies")
    );
    expect(res.body.order.indexOf("competencies")).toBeLessThan(
      res.body.order.indexOf("evidenceModels")
    );

    expect(res.body.entities.competencyModels.created).toBe(1);
    expect(res.body.entities.competencies.created).toBe(1);
    expect(res.body.entities.evidenceModels.created).toBe(1);
    expect(res.body.entities.designPatterns.created).toBe(2);
    expect(res.body.entities.domainAnalyses.created).toBe(1);

    const model = db.competencyModels[0];
    const competency = db.competencies[0];
    const evidence = db.evidenceModels[0];
    expect(model.id).not.toBe("cm1");
    expect(competency.id).not.toBe("c1");
    expect(competency.modelId).toBe(model.id);
    expect(evidence.competencyId).toBe(competency.id);
    expect(evidence.status).toBe("draft");

    const parent = db.designPatterns.find((row) => row.name === "Parent pattern");
    const child = db.designPatterns.find((row) => row.name === "Child pattern");
    expect(child.relationships[0].targetPatternId).toBe(parent.id);
    expect(saveDB).toHaveBeenCalledTimes(1);
  });

  it("keeps a free original id and assigns a new id when that id is taken", async () => {
    db.domainAnalyses.push({ id: "da1", name: "Already there", status: "draft" });
    const zip = zipFiles({
      "domainAnalyses.json": JSON.stringify([
        { id: "da1", name: "Imported plant", status: "confirmed" },
        { id: "da-free", name: "Free analysis", status: "confirmed" },
      ]),
      "designPatterns.json": JSON.stringify([
        { id: "dp1", name: "Linked", domainAnalysisId: "da1", status: "confirmed" },
      ]),
    });

    const kept = await postZip(makeApp(), zip, "?dryRun=0&keepOriginalIds=1");
    expect(kept.status).toBe(200);
    const free = kept.body.entities.domainAnalyses.results.find(
      (row) => row.sourceId === "da-free"
    );
    const collided = kept.body.entities.domainAnalyses.results.find(
      (row) => row.sourceId === "da1"
    );
    expect(free.ok).toBe(true);
    expect(free.idKept).toBe(true);
    expect(free.id).toBe("da-free");
    expect(collided.ok).toBe(true);
    expect(collided.idKept).toBe(false);
    expect(collided.id).not.toBe("da1");
    expect(collided.warnings.join(" ")).toMatch(/already used/);

    const pattern = db.designPatterns.find((row) => row.name === "Linked");
    expect(pattern.domainAnalysisId).toBe(collided.id);
    expect(pattern.domainAnalysisId).not.toBe("da1");
    expect(db.domainAnalyses.filter((row) => row.id === "da1")).toHaveLength(1);
    expect(db.domainAnalyses.find((row) => row.id === "da1").name).toBe("Already there");

    const keptRow = db.domainAnalyses.find((row) => row.id === "da-free");
    expect(keptRow.status === "confirmed" || keptRow.status === "draft").toBe(true);
  });

  it("fails an ambiguous id instead of binding an arbitrary fixture copy", async () => {
    const zip = zipFiles({
      "domainAnalyses.json": JSON.stringify([
        {
          id: "da-plant",
          name: "From patterns",
          _sources: ["src/components/designPatterns/__tests__/designPatternTabFixture.js#domainAnalyses"],
          _origin: "screenshot-test-fixture",
        },
        {
          id: "da-plant",
          name: "From diagnostics",
          _sources: ["src/components/qMatrix/__tests__/diagnosticDesignTabFixture.js#domainAnalyses"],
          _origin: "screenshot-test-fixture",
        },
      ]),
      "designPatterns.json": JSON.stringify([
        { id: "dp1", name: "Unscoped", domainAnalysisId: "da-plant" },
      ]),
    });
    const res = await postZip(makeApp(), zip, "?dryRun=1&keepOriginalIds=1");
    expect(res.status).toBe(200);
    expect(res.body.entities.domainAnalyses.created).toBe(2);
    expect(res.body.entities.designPatterns.failed).toBe(1);
    expect(res.body.entities.designPatterns.results[0].details.join(" ")).toMatch(/Ambiguous/);
    expect(saveDB).not.toHaveBeenCalled();
  });

  it("imports the attached by-entity zip without aborting on bad rows", async () => {
    const zip = fs.readFileSync(sampleZip);
    const preview = await postZip(makeApp(), zip, "?dryRun=1");
    expect(preview.status).toBe(200);
    expect(preview.body.skipped.some((row) => row.file.endsWith("README-by-entity.txt"))).toBe(
      true
    );
    expect(preview.body.entities.policies.created).toBeGreaterThan(0);
    expect(preview.body.totals.failed).toBeGreaterThan(0);
    expect(preview.body.totals.created).toBeGreaterThan(0);
    expect(saveDB).not.toHaveBeenCalled();
    expect(db.policies).toEqual([]);

    const committed = await postZip(makeApp(), zip, "?dryRun=0");
    expect(committed.status).toBe(200);
    expect(committed.body.totals).toEqual(preview.body.totals);
    expect(saveDB).toHaveBeenCalledTimes(1);

    for (const pattern of db.designPatterns) {
      if (!pattern.domainAnalysisId) continue;
      expect(db.domainAnalyses.some((row) => row.id === pattern.domainAnalysisId)).toBe(true);
    }
    for (const evidence of db.evidenceModels) {
      expect(db.competencies.some((row) => row.id === evidence.competencyId)).toBe(true);
    }
    for (const item of db.items) {
      expect(db.taskModels.some((row) => row.id === item.taskModelId)).toBe(true);
    }
  });

  it("keeps original policy ids from the attached zip when they are free", async () => {
    const zip = fs.readFileSync(sampleZip);
    const res = await postZip(makeApp(), zip, "?dryRun=0&keepOriginalIds=1");
    expect(res.status).toBe(200);
    const fixed = res.body.entities.policies.results.find((row) => row.sourceId === "p-fixed");
    expect(fixed.ok).toBe(true);
    expect(fixed.idKept).toBe(true);
    expect(db.policies.some((row) => row.id === "p-fixed")).toBe(true);
    const fresh = await postZip(makeApp(), zip, "?dryRun=1");
    const freshFixed = fresh.body.entities.policies.results.find(
      (row) => row.sourceId === "p-fixed"
    );
    expect(freshFixed.id).not.toBe("p-fixed");
    expect(freshFixed.idKept).toBe(false);
  });
});

describe("GET /api/data/zip", () => {
  it("exports one JSON file per entity collection", async () => {
    db.policies.push({ id: "p1", name: "Fixed", type: "fixed" });
    const res = await request(makeApp())
      .get("/api/data/zip")
      .buffer(true)
      .parse((incoming, callback) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/zip/);
    const files = unzipSafe(res.body);
    const names = files.map((file) => file.name).sort();
    expect(names).toContain("policies.json");
    expect(names).toContain("templates.json");
    expect(names).toContain("taskModelVariables.json");
    expect(names).toContain("workProducts.json");
    expect(names).toContain("rubrics.json");
    expect(names).toContain("presentationModels.json");
    const policies = JSON.parse(
      files.find((file) => file.name === "policies.json").data.toString()
    );
    expect(policies).toEqual([{ id: "p1", name: "Fixed", type: "fixed" }]);
  });

  it("is admin-only", async () => {
    authState.role = "student";
    const res = await request(makeApp()).get("/api/data/zip");
    expect(res.status).toBe(403);
  });
});
