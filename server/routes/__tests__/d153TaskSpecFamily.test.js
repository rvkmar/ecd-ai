// server/routes/__tests__/d153TaskSpecFamily.test.js

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

describe("D153 task spec preview, replace, and retire", () => {
  it("preview assignments match the generated tmvAssignment list exactly", async () => {
    const expressApp = await app();
    const preview = await request(expressApp)
      .get("/api/templates/tpl1/task-spec-preview")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(preview.status).toBe(200);
    expect(preview.body.count).toBe(10);
    expect(preview.body.existingCount).toBe(0);
    expect(preview.body.assignments).toHaveLength(10);

    const generated = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(generated.status).toBe(201);
    expect(generated.body.specs.map((spec) => spec.tmvAssignment)).toEqual(
      preview.body.assignments
    );

    const after = await request(expressApp)
      .get("/api/templates/tpl1/task-spec-preview")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(after.status).toBe(200);
    expect(after.body.existingCount).toBe(10);
    expect(after.body.assignments).toEqual(preview.body.assignments);
  });

  it("lets district read the preview but not generate, replace, or retire", async () => {
    const expressApp = await app();
    const preview = await request(expressApp)
      .get("/api/templates/tpl1/task-spec-preview")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(preview.status).toBe(200);
    expect(preview.body.count).toBe(10);

    const generate = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(generate.status).toBe(403);

    const retire = await request(expressApp)
      .delete("/api/templates/tpl1/task-specs")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(retire.status).toBe(403);
  });

  it("replaces an existing family from the current preview", async () => {
    const expressApp = await app();
    const first = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(first.status).toBe(201);
    const firstIds = first.body.specs.map((spec) => spec.id);

    dbState.current.taskModels[0].taskModelVariableSettings = [
      {
        taskModelVariableId: "tmv-bloom",
        variation: "varying",
        allowedValues: ["remember", "apply"],
      },
      {
        taskModelVariableId: "tmv-stimulus",
        variation: "fixed",
        fixedValue: "static",
      },
    ];

    const preview = await request(expressApp)
      .get("/api/templates/tpl1/task-spec-preview")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(preview.body.count).toBe(2);

    const blocked = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(blocked.status).toBe(409);

    const replaced = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ replace: true });
    expect(replaced.status).toBe(201);
    expect(replaced.body.count).toBe(2);
    expect(replaced.body.specs.map((spec) => spec.tmvAssignment)).toEqual(
      preview.body.assignments
    );
    expect(replaced.body.specs.map((spec) => spec.id)).not.toEqual(firstIds);
    expect(dbState.current.taskSpecs).toHaveLength(2);
    expect(dbState.current.taskSpecs.every((spec) => spec.stale === false)).toBe(true);
  });

  it("retires the whole family so generate can run again", async () => {
    const expressApp = await app();
    const first = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(first.status).toBe(201);

    const retired = await request(expressApp)
      .delete("/api/templates/tpl1/task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(retired.status).toBe(200);
    expect(retired.body.deleted).toBe(10);
    expect(dbState.current.taskSpecs).toEqual([]);

    const again = await request(expressApp)
      .post("/api/templates/tpl1/generate-task-specs")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(again.status).toBe(201);
    expect(again.body.count).toBe(10);
  });

  it("refuses preview on a draft template", async () => {
    dbState.current.templates[0].status = "draft";
    const expressApp = await app();
    const preview = await request(expressApp)
      .get("/api/templates/tpl1/task-spec-preview")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(preview.status).toBe(400);
  });
});
