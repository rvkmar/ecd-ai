// server/routes/__tests__/d116TaskModelVariables.test.js
//
// D116: HTTP surface for taskModelVariables, author tenancy, and the
// W24 gate — one variable id stored on at least two Task Models.

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
  const { default: variableRouter } = await import("../taskModelVariablesRoutes.js");
  const { default: taskModelRouter } = await import("../taskModelsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/taskModelVariables", variableRouter);
  expressApp.use("/api/taskModels", taskModelRouter);
  return expressApp;
}

beforeEach(() => {
  dbState.current = {
    taskModelVariables: [],
    taskModels: [],
    evidenceModels: [],
    items: [],
    compositeLibrary: [],
    sessions: [],
  };
});

describe("D116 POST /api/taskModelVariables", () => {
  it("stamps author tenancy and does not store a CAF status", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set(
        "Authorization",
        `Bearer ${tokenFor("district", { districtId: "tn-chennai", schoolId: "sch-1" })}`
      )
      .send({
        name: "Cognitive demand",
        type: "categorical",
        valueSet: "bloomLevel",
        status: "operational",
        locked: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^tmv/);
    expect(res.body.districtId).toBe("tn-chennai");
    expect(res.body.schoolId).toBe("sch-1");
    expect(res.body.createdBy).toBe("district1");
    expect(res.body.status).toBeUndefined();
    expect(res.body.locked).toBeUndefined();
    expect(res.body.valueSet).toBe("bloomLevel");
    expect(res.body.possibleValues).toBeUndefined();
  });

  it("refuses a teacher write", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`)
      .send({ name: "Nope", type: "boolean" });
    expect(res.status).toBe(403);
  });

  it("refuses an incomplete record", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Missing type" });
    expect(res.status).toBe(400);
  });
});

describe("W24 gate — one variable consumed by two Task Models", () => {
  it("stores the same Task Model Variable id on two Task Models", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Cognitive demand",
        description: "Bloom level of the task situation",
        type: "categorical",
        valueSet: "bloomLevel",
      });
    expect(created.status).toBe(201);
    const variableId = created.body.id;

    const settings = [
      {
        taskModelVariableId: variableId,
        allowedValues: ["apply", "analyze"],
        required: true,
      },
    ];

    const first = await request(expressApp)
      .post("/api/taskModels/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Forces — qualitative",
        taskModelVariableIds: [variableId],
        taskModelVariableSettings: settings,
      });
    const second = await request(expressApp)
      .post("/api/taskModels/")
      .set("Authorization", `Bearer ${tokenFor("district", { districtId: "tn-chennai" })}`)
      .send({
        name: "Forces — quantitative",
        taskModelVariableIds: [variableId],
        taskModelVariableSettings: settings,
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.taskModelVariableIds).toEqual([variableId]);
    expect(second.body.taskModelVariableIds).toEqual([variableId]);

    const consumers = [first.body, second.body].filter((tm) =>
      (tm.taskModelVariableIds || []).includes(variableId)
    );
    expect(consumers.length).toBeGreaterThanOrEqual(2);
    expect(dbState.current.taskModelVariables).toHaveLength(1);
  });

  it("refuses to delete a variable a Task Model still consumes", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Diagram present", type: "boolean" });
    const variableId = created.body.id;

    await request(expressApp)
      .post("/api/taskModels/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "A", taskModelVariableIds: [variableId] });
    await request(expressApp)
      .post("/api/taskModels/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "B", taskModelVariableIds: [variableId] });

    const removed = await request(expressApp)
      .delete(`/api/taskModelVariables/${variableId}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(removed.status).toBe(409);
    expect(removed.body.taskModelIds).toHaveLength(2);
  });

  it("refuses a variable edit that drops a level a Task Model still allows", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Cover story",
        type: "categorical",
        possibleValues: [
          { value: "sports", label: "Sports" },
          { value: "kitchen", label: "Kitchen" },
        ],
      });
    const variableId = created.body.id;
    await request(expressApp)
      .post("/api/taskModels/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "A",
        taskModelVariableIds: [variableId],
        taskModelVariableSettings: [
          { taskModelVariableId: variableId, allowedValues: ["sports"] },
        ],
      });

    const updated = await request(expressApp)
      .put(`/api/taskModelVariables/${variableId}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        possibleValues: [
          { value: "kitchen", label: "Kitchen" },
          { value: "lab", label: "Lab" },
        ],
      });
    expect(updated.status).toBe(400);
    expect(dbState.current.taskModelVariables[0].possibleValues.map((v) => v.value)).toEqual([
      "sports",
      "kitchen",
    ]);
  });

  it("keeps author tenancy on update", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/taskModelVariables/")
      .set(
        "Authorization",
        `Bearer ${tokenFor("district", { districtId: "tn-chennai", schoolId: "sch-1" })}`
      )
      .send({ name: "Diagram present", type: "boolean" });

    const updated = await request(expressApp)
      .put(`/api/taskModelVariables/${created.body.id}`)
      .set(
        "Authorization",
        `Bearer ${tokenFor("admin", { districtId: "other", schoolId: "other-school" })}`
      )
      .send({ description: "Whether a figure is shown" });

    expect(updated.status).toBe(200);
    expect(updated.body.districtId).toBe("tn-chennai");
    expect(updated.body.schoolId).toBe("sch-1");
    expect(updated.body.createdBy).toBe("district1");
    expect(updated.body.description).toBe("Whether a figure is shown");
  });
});
