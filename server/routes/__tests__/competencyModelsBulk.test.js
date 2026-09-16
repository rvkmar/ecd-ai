// server/routes/__tests__/competencyModelsBulk.test.js
// Pins Student Model bulk import: nested relationships remap, SMV sync,
// specification export shape, and unidimensional multi-comp rejection.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "u1", username: "admin1", role: "admin" };
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
import competencyRouter from "../competencyModels.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(
  __dirname,
  "../../../samples/competency_models_bulk_upload_sample.json"
);

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/competencies", competencyRouter);
  return app;
}

let db;

beforeEach(() => {
  db = {
    users: [],
    competencyModels: [],
    competencies: [],
    evidenceModels: [],
    taskModels: [],
    items: [],
  };
  loadDB.mockReturnValue(db);
  saveDB.mockImplementation((next) => {
    db = next;
  });
});

describe("POST /api/competencies/models/bulk", () => {
  it("imports the sample wrapper with nested relationships and synced SMVs", async () => {
    const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    const res = await request(makeApp())
      .post("/api/competencies/models/bulk")
      .send(sample);

    expect(res.status).toBe(207);
    expect(res.body.created).toBe(2);
    expect(res.body.failed).toBe(0);

    const numeracy = db.competencyModels.find((m) => m.name === "Grade 6 Numeracy");
    expect(numeracy).toBeTruthy();
    expect(numeracy.status).toBe("draft");
    expect(numeracy.psychologicalPerspective).toBe("information_processing");
    expect(numeracy.smVariables).toHaveLength(5);
    expect(numeracy.smVariables[0].priorDistribution.params.p).toBe(0.45);

    const comps = db.competencies.filter((c) => c.modelId === numeracy.id);
    expect(comps).toHaveLength(5);

    const frac = comps.find((c) => c.name === "Fraction Reasoning");
    const whole = comps.find((c) => c.name === "Whole Number Operations");
    const theta = comps.find((c) => c.name === "Quantitative Reasoning Ability");
    expect(frac.relationships).toEqual(
      expect.arrayContaining([
        { targetCompetencyId: whole.id, type: "prerequisite" },
        { targetCompetencyId: theta.id, type: "part-of" },
      ])
    );

    // SMV ids match competency ids after remap
    const smvIds = new Set(numeracy.smVariables.map((s) => s.id));
    comps.forEach((c) => expect(smvIds.has(c.id)).toBe(true));
  });

  it("accepts a Step 9 specification export shape", async () => {
    const payload = {
      specificationVersion: "1.1",
      model: {
        name: "Spec Import SM",
        description: "Imported from a Step 9 specification download.",
        measurementIntent: "unidimensional",
        psychologicalPerspective: "trait",
        constructFramework: {
          ungroundedWaiver: true,
          ungroundedReason: "Lab import of a specification download.",
        },
      },
      competencies: [
        {
          id: "old_c1",
          name: "Theta",
          description: "Continuous proficiency.",
          variableType: "continuous",
          scale: { min: -3, max: 3 },
          domain: "Math",
          strand: "Overall",
          facet: "Theta",
          relationships: [],
        },
      ],
      smVariables: [
        {
          id: "old_c1",
          label: "Theta",
          type: "continuous",
          priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
        },
      ],
    };

    const res = await request(makeApp())
      .post("/api/competencies/models/bulk")
      .send(payload);

    expect(res.status).toBe(207);
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(db.competencyModels[0].smVariables[0].id).toBe(db.competencies[0].id);
    expect(db.competencyModels[0].smVariables[0].priorDistribution.family).toBe(
      "normal"
    );
  });

  it("rejects unidimensional rows with multiple nested competencies", async () => {
    const res = await request(makeApp())
      .post("/api/competencies/models/bulk")
      .send([
        {
          name: "Bad Uni",
          description: "Should fail nested multi-comp unidimensional.",
          measurementIntent: "unidimensional",
          competencies: [
            { name: "A", variableType: "binary" },
            { name: "B", variableType: "binary" },
          ],
        },
      ]);

    expect(res.status).toBe(207);
    expect(res.body.created).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.results[0].details.join(" ")).toMatch(/Unidimensional/i);
    expect(db.competencyModels).toHaveLength(0);
    expect(db.competencies).toHaveLength(0);
  });
});
