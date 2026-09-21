// server/routes/__tests__/presentationModelsLifecycle.test.js
//
// D113: HTTP surface + lifecycle for presentationModels. Create as draft,
// promote reviewed → confirmed (locks), refuse illegal transitions and
// non-admin writes. Student/teacher cannot author.

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
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function app() {
  const { default: router } = await import("../presentationModelsRoutes.js");
  const a = express();
  a.use(express.json());
  a.use("/api/presentationModels", router);
  return a;
}

const taskModel = {
  id: "tm1",
  name: "Equivalent Fractions Task Model",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
};

function reviewedShape(overrides = {}) {
  return {
    name: "Fractions linear presentation",
    taskModelId: "tm1",
    taskModelVersion: 1,
    layout: { itemOrder: "authored", grouping: "single_item", navigation: "linear" },
    ...overrides,
  };
}

function confirmedShape(overrides = {}) {
  return reviewedShape({
    conditionalDisplay: { showFeedback: "none", allowSkip: false, allowReview: false },
    accessibility: { profile: "default", fontScale: 1, timeMultiplier: 1 },
    ...overrides,
  });
}

beforeEach(() => {
  dbState.current = {
    taskModels: [taskModel],
    presentationModels: [],
  };
});

describe("POST /api/presentationModels", () => {
  it("creates a draft and ignores a caller-supplied confirmed status", async () => {
    const res = await request(await app())
      .post("/api/presentationModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ ...confirmedShape(), status: "confirmed", locked: true });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.locked).toBe(false);
    expect(res.body.id).toMatch(/^pm/);
    expect(dbState.current.presentationModels).toHaveLength(1);
  });

  it("refuses a dangling taskModelId", async () => {
    const res = await request(await app())
      .post("/api/presentationModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(reviewedShape({ taskModelId: "tm-missing" }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Invalid taskModelId/);
  });
});

describe("PUT lifecycle", () => {
  async function createDraft() {
    const created = await request(await app())
      .post("/api/presentationModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send(confirmedShape());
    expect(created.status).toBe(201);
    return created.body;
  }

  it("promotes draft → reviewed → confirmed and locks on confirm", async () => {
    const draft = await createDraft();
    const a = await app();

    const reviewed = await request(a)
      .put(`/api/presentationModels/${draft.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ status: "reviewed" });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.status).toBe("reviewed");
    expect(reviewed.body.locked).toBe(false);

    const confirmed = await request(a)
      .put(`/api/presentationModels/${draft.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ status: "confirmed" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
    expect(confirmed.body.locked).toBe(true);
  });

  it("refuses an illegal transition (draft → operational)", async () => {
    const draft = await createDraft();
    const res = await request(await app())
      .put(`/api/presentationModels/${draft.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ status: "operational" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Illegal presentation model status transition/);
  });

  it("refuses content edits on a locked record (409)", async () => {
    const draft = await createDraft();
    const a = await app();
    await request(a)
      .put(`/api/presentationModels/${draft.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ status: "reviewed" });
    await request(a)
      .put(`/api/presentationModels/${draft.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ status: "confirmed" });

    const res = await request(a)
      .put(`/api/presentationModels/${draft.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "tampered" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked/);
  });

  it("refuses reviewed without layout.itemOrder", async () => {
    const created = await request(await app())
      .post("/api/presentationModels")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Incomplete", taskModelId: "tm1" });
    expect(created.status).toBe(201);

    const res = await request(await app())
      .put(`/api/presentationModels/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ status: "reviewed" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/layout\.itemOrder/);
  });
});

describe("RBAC", () => {
  it("lets district read and refuses district/teacher/student writes", async () => {
    const a = await app();
    const read = await request(a)
      .get("/api/presentationModels")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(read.status).toBe(200);
    expect(Array.isArray(read.body)).toBe(true);

    for (const role of ["district", "teacher", "student"]) {
      const res = await request(a)
        .post("/api/presentationModels")
        .set("Authorization", `Bearer ${tokenFor(role)}`)
        .send(reviewedShape());
      expect(res.status, `${role} must not author`).toBe(403);
    }
  });
});
