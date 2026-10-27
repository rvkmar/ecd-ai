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
  const { default: router } = await import("../deliveryModelsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/deliveryModels", router);
  return expressApp;
}

function seed(overrides = {}) {
  dbState.current = {
    deliveryModels: [],
    sessions: [],
    competencyModels: [{ id: "cm1", status: "confirmed", name: "Student" }],
    assemblyModels: [
      { id: "am1", status: "confirmed", competencyModelId: "cm1", name: "Assembly" },
    ],
    policies: [{ id: "p1", type: "fixed", name: "Fixed" }],
    presentationModels: [{ id: "pm1", status: "operational", name: "Overlay" }],
    ...overrides,
  };
}

const body = {
  name: "Grade 6 delivery",
  description: "One sitting.",
  competencyModelId: "cm1",
  assemblyModelId: "am1",
  policyId: "p1",
  presentationModelId: "pm1",
  administration: {
    timeLimitMinutes: 20,
    attempts: 1,
    allowedReview: true,
    feedbackMode: "immediate",
  },
};

beforeEach(() => {
  seed();
});

describe("POST /api/deliveryModels", () => {
  it("creates a draft and confirms when the cited models are confirmed or operational", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/deliveryModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(body);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.id).toMatch(/^dm/);

    const confirmed = await request(expressApp)
      .post(`/api/deliveryModels/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
  });

  it("refuses confirm while the assembly model is still a draft", async () => {
    seed({
      assemblyModels: [{ id: "am1", status: "draft", competencyModelId: "cm1" }],
    });
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/deliveryModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(body);
    expect(created.status).toBe(201);

    const confirmed = await request(expressApp)
      .post(`/api/deliveryModels/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(400);
    expect(confirmed.body.error).toMatch(/Assembly model/);
    expect(dbState.current.deliveryModels[0].status).toBe("draft");
  });

  it("rejects a second delivery model with the same name", async () => {
    const expressApp = await app();
    await request(expressApp)
      .post("/api/deliveryModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(body);
    const again = await request(expressApp)
      .post("/api/deliveryModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(body);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already used/);
  });

  it("refuses delete while a session cites the model, then deletes when nothing cites it", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/deliveryModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(body);
    dbState.current.sessions.push({ id: "s1", deliveryModelId: created.body.id });

    const blocked = await request(expressApp)
      .delete(`/api/deliveryModels/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.sessionIds).toEqual(["s1"]);

    dbState.current.sessions = [];
    const removed = await request(expressApp)
      .delete(`/api/deliveryModels/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(removed.status).toBe(200);
    expect(dbState.current.deliveryModels).toEqual([]);
  });

  it("does not let a district user author a delivery model", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/deliveryModels")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send(body);
    expect(created.status).toBe(403);
  });
});
