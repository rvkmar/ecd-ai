import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role, extra = {}) =>
  jwt.sign({ username: `${role}1`, role, ...extra }, JWT_SECRET, { expiresIn: "1h" });

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  readRawDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function app() {
  const { default: router } = await import("../designPatternsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/designPatterns", router);
  return expressApp;
}

beforeEach(() => {
  dbState.current = { designPatterns: [] };
});

const complete = {
  name: "Explain a diagram",
  summary: "Students explain a labelled scientific diagram.",
  rationale: "The pattern exists to separate explanation from recognition.",
  focalKsas: [{ label: "Model-based explanation" }],
};

describe("D131 /api/designPatterns", () => {
  it("lets an admin save a draft and confirm a complete pattern", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/designPatterns/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(complete);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.id).toMatch(/^dp/);

    const confirmed = await request(expressApp)
      .post(`/api/designPatterns/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
  });

  it("refuses confirm when the rationale is empty", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/designPatterns/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "No reason", summary: "A title without an argument." });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");

    const confirmed = await request(expressApp)
      .post(`/api/designPatterns/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(400);
    expect(confirmed.body.details?.some((e) => /rationale/i.test(e))).toBe(true);
    expect(dbState.current.designPatterns[0].status).toBe("draft");
  });

  it("lets district read and refuses district write", async () => {
    const expressApp = await app();
    dbState.current.designPatterns = [
      { id: "dp-seed", name: "Seed", status: "draft", rationale: "Already written." },
    ];

    const list = await request(expressApp)
      .get("/api/designPatterns/")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const write = await request(expressApp)
      .post("/api/designPatterns/")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send({ name: "Nope", rationale: "District does not author patterns." });
    expect(write.status).toBe(403);
  });

  it("confirms a pattern whose menus cite library objects", async () => {
    const expressApp = await app();
    dbState.current = {
      designPatterns: [],
      workProducts: [{ id: "wp1", name: "Written explanation", type: "essay" }],
      rubrics: [{ id: "rb1", name: "Explanation rubric" }],
      taskModelVariables: [{ id: "tmv1", name: "Diagram complexity" }],
    };
    const created = await request(expressApp)
      .post("/api/designPatterns/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        ...complete,
        potentialWorkProducts: [
          { label: "Written explanation", workProductId: "wp1", workProductType: "essay" },
        ],
        potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
        characteristicFeatures: [{ label: "Uses a labelled diagram" }],
        variableFeatures: [{ label: "Diagram complexity", taskModelVariableId: "tmv1" }],
      });
    expect(created.status).toBe(201);

    const confirmed = await request(expressApp)
      .post(`/api/designPatterns/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.potentialWorkProducts[0].workProductId).toBe("wp1");
    expect(confirmed.body.status).toBe("confirmed");
  });

  it("bulk-imports drafts and reports unresolvable library ids", async () => {
    const expressApp = await app();
    dbState.current = {
      designPatterns: [],
      workProducts: [{ id: "wp1", name: "Written explanation", type: "essay" }],
      rubrics: [{ id: "rb1", name: "Explanation rubric" }],
      taskModelVariables: [{ id: "tmv1", name: "Diagram complexity" }],
    };

    const res = await request(expressApp)
      .post("/api/designPatterns/bulk")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send([
        {
          ...complete,
          status: "confirmed",
          potentialWorkProducts: [
            { label: "Written explanation", workProductId: "wp1" },
          ],
          potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
          variableFeatures: [
            { label: "Diagram complexity", taskModelVariableId: "tmv1" },
          ],
        },
        {
          ...complete,
          name: "Missing library",
          potentialWorkProducts: [
            { label: "Missing", workProductId: "wp-missing" },
          ],
        },
      ]);

    expect(res.status).toBe(207);
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.results[0].ok).toBe(true);
    expect(dbState.current.designPatterns[0].status).toBe("draft");
    expect(res.body.results[1].ok).toBe(false);
    expect(res.body.results[1].details.some((e) => /wp-missing/.test(e))).toBe(true);
  });
});