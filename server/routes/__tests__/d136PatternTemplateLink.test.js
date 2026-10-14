import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  readRawDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function app() {
  const { default: patterns } = await import("../designPatternsRoutes.js");
  const { default: templates } = await import("../templatesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/designPatterns", patterns);
  expressApp.use("/api/templates", templates);
  return expressApp;
}

function seed() {
  return {
    competencyModels: [{ id: "cm1", name: "CM", status: "confirmed", locked: true }],
    competencies: [{ id: "c1", name: "Attr", modelId: "cm1" }],
    evidenceModels: [
      { id: "em1", name: "EM", competencyId: "c1", status: "confirmed", locked: true },
    ],
    taskModels: [
      {
        id: "tm1",
        name: "TM",
        evidenceModelIds: ["em1"],
        primaryEvidenceModelId: "em1",
        status: "confirmed",
        locked: true,
        versionNumber: 1,
      },
    ],
    presentationModels: [
      {
        id: "pm1",
        name: "PM",
        taskModelId: "tm1",
        taskModelVersion: 1,
        status: "confirmed",
        locked: true,
      },
    ],
    designPatterns: [
      {
        id: "dp1",
        name: "Explain",
        summary: "Explain a diagram.",
        rationale: "Explanation is the construct.",
        status: "confirmed",
      },
    ],
    templates: [],
  };
}

const bindings = {
  competencyModelId: "cm1",
  evidenceModelId: "em1",
  taskModelId: "tm1",
  presentationModelId: "pm1",
};

beforeEach(() => {
  dbState.current = seed();
});

describe("D136 pattern ↔ template link", () => {
  it("confirms an unpatterned template and stores a real pattern link", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");

    const plain = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Unpatterned", ...bindings });
    expect(plain.status).toBe(201);

    const confirmed = await request(expressApp)
      .post(`/api/templates/${plain.body.id}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
    expect(confirmed.body.designPatternId == null).toBe(true);

    const linked = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "From pattern", designPatternId: "dp1", ...bindings });
    expect(linked.status).toBe(201);
    expect(linked.body.designPatternId).toBe("dp1");

    const listed = await request(expressApp)
      .get("/api/templates/")
      .set("Authorization", `Bearer ${admin}`);
    expect(listed.body.filter((row) => row.designPatternId === "dp1")).toHaveLength(1);
  });

  it("refuses a missing pattern id and a delete while templates still cite it", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");

    const missing = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Broken", designPatternId: "nope", ...bindings });
    expect(missing.status).toBe(400);

    const linked = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Linked", designPatternId: "dp1", ...bindings });
    expect(linked.status).toBe(201);

    const blocked = await request(expressApp)
      .delete("/api/designPatterns/dp1")
      .set("Authorization", `Bearer ${admin}`);
    expect(blocked.status).toBe(409);

    const unlinked = await request(expressApp)
      .put(`/api/templates/${linked.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ designPatternId: null });
    expect(unlinked.status).toBe(200);

    const removed = await request(expressApp)
      .delete("/api/designPatterns/dp1")
      .set("Authorization", `Bearer ${admin}`);
    expect(removed.status).toBe(200);
  });
});
