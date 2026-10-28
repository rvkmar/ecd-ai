// server/routes/__tests__/d151TaskSpecsRoutes.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { insertGeneratedTaskSpec } from "../../services/insertGeneratedTaskSpec.js";

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
  const { default: taskSpecs } = await import("../taskSpecsRoutes.js");
  const { default: templates } = await import("../templatesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/taskSpecs", taskSpecs);
  expressApp.use("/api/templates", templates);
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
    templates: [
      {
        id: "tpl1",
        name: "Blueprint",
        status: "confirmed",
        competencyModelId: "cm1",
        evidenceModelId: "em1",
        taskModelId: "tm1",
        presentationModelId: "pm1",
      },
    ],
    taskSpecs: [],
  };
}

beforeEach(() => {
  dbState.current = seedDb();
});

describe("D151 /api/taskSpecs", () => {
  it("refuses an authored POST", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/taskSpecs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        templateId: "tpl1",
        tmvAssignment: [{ taskModelVariableId: "tmv-bloom", value: "remember" }],
      });
    expect(res.status).toBe(405);
    expect(res.body.error).toMatch(/generated, not authored/);
    expect(dbState.current.taskSpecs).toEqual([]);
  });

  it("refuses PUT of a generated spec", async () => {
    insertGeneratedTaskSpec(dbState.current, { templateId: "tpl1", tmvAssignment: [] });
    const id = dbState.current.taskSpecs[0].id;
    const expressApp = await app();
    const res = await request(expressApp)
      .put(`/api/taskSpecs/${id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ tmvAssignment: [{ taskModelVariableId: "tmv-bloom", value: "create" }] });
    expect(res.status).toBe(405);
    expect(dbState.current.taskSpecs[0].tmvAssignment).toEqual([]);
  });

  it("lists generated specs", async () => {
    insertGeneratedTaskSpec(dbState.current, {
      templateId: "tpl1",
      tmvAssignment: [{ taskModelVariableId: "tmv-bloom", value: "remember" }],
    });
    const expressApp = await app();
    const res = await request(expressApp)
      .get("/api/taskSpecs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].stale).toBe(false);
  });

  it("marks specs stale when the source template is PUT", async () => {
    insertGeneratedTaskSpec(dbState.current, { templateId: "tpl1", tmvAssignment: [] });
    const expressApp = await app();
    const res = await request(expressApp)
      .put("/api/templates/tpl1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Blueprint revised" });
    expect(res.status).toBe(200);
    expect(dbState.current.taskSpecs[0].stale).toBe(true);
  });

  it("marks specs stale when the source template is confirmed", async () => {
    dbState.current.templates[0].status = "draft";
    insertGeneratedTaskSpec(dbState.current, { templateId: "tpl1", tmvAssignment: [] });
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/confirm")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(200);
    expect(dbState.current.taskSpecs[0].stale).toBe(true);
  });

  it("refuses to delete a template that still has specs", async () => {
    insertGeneratedTaskSpec(dbState.current, { templateId: "tpl1", tmvAssignment: [] });
    const expressApp = await app();
    const res = await request(expressApp)
      .delete("/api/templates/tpl1")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(409);
    expect(dbState.current.templates).toHaveLength(1);
  });

  it("insertGeneratedTaskSpec stamps stale false and generatedAt", () => {
    const result = insertGeneratedTaskSpec(dbState.current, {
      templateId: "tpl1",
      tmvAssignment: [{ taskModelVariableId: "tmv-register", value: "formal" }],
    });
    expect(result.ok).toBe(true);
    expect(result.record.stale).toBe(false);
    expect(result.record.generatedAt).toBeTruthy();
    expect(dbState.current.taskSpecs).toHaveLength(1);
  });

  it("insertGeneratedTaskSpec refuses a payload with no template", () => {
    const result = insertGeneratedTaskSpec(dbState.current, {
      name: "hand typed",
      tmvAssignment: [],
    });
    expect(result.ok).toBe(false);
    expect(result.details.some((e) => /templateId is required/.test(e))).toBe(true);
    expect(dbState.current.taskSpecs).toEqual([]);
  });

  it("district may list and must not POST", async () => {
    const expressApp = await app();
    const list = await request(expressApp)
      .get("/api/taskSpecs/")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(list.status).toBe(200);

    const created = await request(expressApp)
      .post("/api/taskSpecs/")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send({ templateId: "tpl1", tmvAssignment: [] });
    expect(created.status).toBe(403);
  });
});
