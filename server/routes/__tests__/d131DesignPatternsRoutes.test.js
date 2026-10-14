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
  potentialWorkProducts: [{ label: "Written explanation", workProductType: "essay" }],
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
});