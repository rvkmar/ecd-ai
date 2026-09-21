// server/routes/__tests__/d115bInstantiatedTasks.test.js
//
// D115b authoring gates on POST/PUT /api/tasks: instantiable Task Model,
// validateEntity wiring, author tenancy stamp, DELETE→sessions cascade.
// D47 XOR binding stays in d47ItemDelivery.test.js.

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

async function tasksApp() {
  const { default: router } = await import("../tasksRoutes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/tasks", router);
  return app;
}

const TASK_MODEL = {
  id: "tm1",
  name: "Fractions",
  status: "operational",
  locked: true,
  versionNumber: 1,
};

const ITEM = {
  id: "item1",
  taskModelId: "tm1",
  status: "confirmed",
};

beforeEach(() => {
  dbState.current = {
    tasks: [],
    items: [structuredClone(ITEM)],
    taskModels: [structuredClone(TASK_MODEL)],
    sessions: [],
    questions: [],
  };
});

describe("D115b POST /api/tasks instantiable TM + tenancy", () => {
  it("refuses a draft (not instantiable) Task Model", async () => {
    dbState.current.taskModels[0] = { ...TASK_MODEL, status: "draft", locked: false };
    const app = await tasksApp();
    const res = await request(app)
      .post("/api/tasks/")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`)
      .send({ taskModelId: "tm1", itemId: "item1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only instantiate/i);
  });

  it("refuses an unlocked confirmed Task Model", async () => {
    dbState.current.taskModels[0] = { ...TASK_MODEL, status: "confirmed", locked: false };
    const app = await tasksApp();
    const res = await request(app)
      .post("/api/tasks/")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`)
      .send({ taskModelId: "tm1", itemId: "item1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unlocked/i);
  });

  it("refuses a task-model-only create (no itemId / questionId)", async () => {
    const app = await tasksApp();
    const res = await request(app)
      .post("/api/tasks/")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`)
      .send({ taskModelId: "tm1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/either itemId or questionId/);
  });

  it("stamps author districtId / schoolId / createdBy on insert", async () => {
    const app = await tasksApp();
    const res = await request(app)
      .post("/api/tasks/")
      .set(
        "Authorization",
        `Bearer ${tokenFor("district", { districtId: "tn-chennai", schoolId: "sch-1" })}`
      )
      .send({ taskModelId: "tm1", itemId: "item1" });

    expect(res.status).toBe(201);
    expect(res.body.itemId).toBe("item1");
    expect(res.body.districtId).toBe("tn-chennai");
    expect(res.body.schoolId).toBe("sch-1");
    expect(res.body.createdBy).toBe("district1");
    expect(res.body.status).toBeUndefined();
  });

  it("PUT cannot retarget tenancy or invent a CAF status", async () => {
    const app = await tasksApp();
    const created = await request(app)
      .post("/api/tasks/")
      .set(
        "Authorization",
        `Bearer ${tokenFor("district", { districtId: "tn-chennai" })}`
      )
      .send({ taskModelId: "tm1", itemId: "item1" });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/tasks/${created.body.id}`)
      .set(
        "Authorization",
        `Bearer ${tokenFor("district", { districtId: "tn-madurai" })}`
      )
      .send({ districtId: "tn-madurai", status: "operational", generatedObservationIds: ["o1"] });

    expect(res.status).toBe(200);
    expect(res.body.districtId).toBe("tn-chennai");
    expect(res.body.status).toBeUndefined();
    expect(res.body.generatedObservationIds).toEqual(["o1"]);
  });
});

describe("D115b DELETE /api/tasks cascades sessions that roster the task", () => {
  it("removes sessions whose taskIds include the deleted task", async () => {
    const app = await tasksApp();
    const created = await request(app)
      .post("/api/tasks/")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send({ taskModelId: "tm1", itemId: "item1" });
    expect(created.status).toBe(201);

    dbState.current.sessions = [
      { id: "s-keep", taskIds: ["t-other"] },
      { id: "s-drop", taskIds: [created.body.id] },
    ];

    const res = await request(app)
      .delete(`/api/tasks/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("district")}`);

    expect(res.status).toBe(200);
    expect(dbState.current.tasks.find((t) => t.id === created.body.id)).toBeUndefined();
    expect(dbState.current.sessions.map((s) => s.id)).toEqual(["s-keep"]);
  });
});
