// server/routes/__tests__/d126TemplatesRoutes.test.js

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
  const { default: router } = await import("../templatesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/templates", router);
  return expressApp;
}

function seedDb() {
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
      {
        id: "tm2",
        name: "TM2",
        evidenceModelIds: ["em1"],
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
      {
        id: "pm2",
        name: "PM other TM",
        taskModelId: "tm2",
        taskModelVersion: 1,
        status: "confirmed",
        locked: true,
      },
    ],
    templates: [],
  };
}

beforeEach(() => {
  dbState.current = seedDb();
});

describe("D126 /api/templates", () => {
  it("creates a draft and confirms coherent bindings", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Blueprint",
        competencyModelId: "cm1",
        evidenceModelId: "em1",
        taskModelId: "tm1",
        presentationModelId: "pm1",
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.id).toMatch(/^tpl/);

    const confirmed = await request(expressApp)
      .post(`/api/templates/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
  });

  it("refuses confirm when Presentation Model is for another Task Model", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Bad PM",
        competencyModelId: "cm1",
        evidenceModelId: "em1",
        taskModelId: "tm1",
        presentationModelId: "pm2",
      });
    // Draft create still validates present ids for coherence when all four set
    expect(created.status).toBe(400);
    expect(created.body.details?.some((e) => /presentationModelId/.test(e))).toBe(
      true
    );
  });

  it("lets district read and refuses district write", async () => {
    const expressApp = await app();
    dbState.current.templates = [
      {
        id: "tpl-seed",
        name: "Seed",
        status: "draft",
        competencyModelId: "cm1",
        evidenceModelId: "em1",
        taskModelId: "tm1",
        presentationModelId: "pm1",
      },
    ];

    const list = await request(expressApp)
      .get("/api/templates/")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const write = await request(expressApp)
      .post("/api/templates/")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send({ name: "Nope" });
    expect(write.status).toBe(403);
  });
});
