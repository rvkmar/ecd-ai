// server/routes/__tests__/d152GenerateTaskSpecFamily.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { TASK_SPEC_FAMILY_MAX } from "../../../src/utils/taskModelVariableFamily.js";

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
  const { default: templates } = await import("../templatesRoutes.js");
  const { default: taskSpecs } = await import("../taskSpecsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/templates", templates);
  expressApp.use("/api/taskSpecs", taskSpecs);
  return expressApp;
}

const TEN_SPEC_SETTINGS = [
  {
    taskModelVariableId: "tmv-bloom",
    variation: "varying",
    required: true,
    allowedValues: ["remember", "understand", "apply", "analyze", "evaluate"],
  },
  {
    taskModelVariableId: "tmv-register",
    variation: "varying",
    required: true,
    allowedValues: ["formal", "informal"],
  },
  {
    taskModelVariableId: "tmv-stimulus",
    variation: "fixed",
    required: true,
    fixedValue: "static",
  },
];

function seedDb(overrides = {}) {
  return {
    competencyModels: [{ id: "cm1", name: "CM", status: "confirmed", locked: true }],
    competencies: [{ id: "c1", name: "Attr", modelId: "cm1" }],
    evidenceModels: [
      { id: "em1", name: "EM", competencyId: "c1", status: "confirmed", locked: true },
    ],
    taskModelVariables: [
      {
        id: "tmv-bloom",
        name: "Cognitive demand",
        type: "categorical",
        valueSet: "bloomLevel",
      },
      {
        id: "tmv-register",
        name: "Scenario register",
        type: "categorical",
        possibleValues: [
          { value: "formal", label: "Formal" },
          { value: "informal", label: "Informal" },
        ],
      },
      {
        id: "tmv-stimulus",
        name: "Stimulus policy",
        type: "categorical",
        valueSet: "stimulusPolicy",
      },
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
        taskModelVariableSettings: TEN_SPEC_SETTINGS,
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
    ...overrides,
  };
}

beforeEach(() => {
  dbState.current = seedDb();
});

describe("D152 generate task spec family", () => {
  it("generates the D120 ten-spec family and records each assignment", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(10);
    expect(res.body.specs).toHaveLength(10);
    expect(dbState.current.taskSpecs).toHaveLength(10);

    const keys = new Set();
    for (const spec of res.body.specs) {
      expect(spec.templateId).toBe("tpl1");
      expect(spec.stale).toBe(false);
      const bloom = spec.tmvAssignment.find((a) => a.taskModelVariableId === "tmv-bloom");
      const register = spec.tmvAssignment.find(
        (a) => a.taskModelVariableId === "tmv-register"
      );
      const stimulus = spec.tmvAssignment.find(
        (a) => a.taskModelVariableId === "tmv-stimulus"
      );
      expect(stimulus.value).toBe("static");
      keys.add(`${bloom.value}|${register.value}`);
    }
    expect(keys.size).toBe(10);

    const authored = await request(expressApp)
      .post("/api/taskSpecs/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ templateId: "tpl1", tmvAssignment: [] });
    expect(authored.status).toBe(405);
    expect(dbState.current.taskSpecs).toHaveLength(10);
  });

  it("refuses an oversized family rather than truncating it", async () => {
    const levels = Array.from({ length: 26 }, (_, i) => ({
      value: `v${i}`,
      label: `v${i}`,
    }));
    dbState.current.taskModelVariables.push(
      { id: "tmv-a", name: "A", type: "categorical", possibleValues: levels },
      { id: "tmv-b", name: "B", type: "categorical", possibleValues: levels }
    );
    dbState.current.taskModels[0].taskModelVariableSettings = [
      { taskModelVariableId: "tmv-a", variation: "varying" },
      { taskModelVariableId: "tmv-b", variation: "varying" },
    ];
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(400);
    expect(res.body.projectedSize).toBe(676);
    expect(res.body.error).toMatch(String(TASK_SPEC_FAMILY_MAX));
    expect(dbState.current.taskSpecs).toEqual([]);
  });

  it("refuses a family of size 0", async () => {
    dbState.current.taskModels[0].taskModelVariableSettings = [
      { taskModelVariableId: "tmv-bloom", variation: "fixed" },
    ];
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(400);
    expect(dbState.current.taskSpecs).toEqual([]);
  });

  it("returns 409 when the template already has specs", async () => {
    const expressApp = await app();
    const first = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(first.status).toBe(201);
    const second = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(second.status).toBe(409);
    expect(dbState.current.taskSpecs).toHaveLength(10);
  });

  it("refuses a draft template", async () => {
    dbState.current.templates[0].status = "draft";
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(400);
    expect(dbState.current.taskSpecs).toEqual([]);
  });

  it("district may not generate", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(res.status).toBe(403);
    expect(dbState.current.taskSpecs).toEqual([]);
  });
});
