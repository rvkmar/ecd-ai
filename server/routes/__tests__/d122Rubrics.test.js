// server/routes/__tests__/d122Rubrics.test.js

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
  const { default: router } = await import("../rubricsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/rubrics", router);
  return expressApp;
}

const dims = [
  {
    id: "accuracy",
    name: "Accuracy",
    levels: [
      { value: 0, label: "Incorrect", exemplar: "2+2=5" },
      { value: 1, label: "Correct", exemplar: "2+2=4" },
    ],
    activatesAt: 1,
  },
];

beforeEach(() => {
  dbState.current = { rubrics: [], evidenceModels: [] };
});

describe("D122 /api/rubrics", () => {
  it("creates a draft and confirms with exemplars", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/rubrics/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Accuracy", dimensions: dims });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.id).toMatch(/^rub/);

    const confirmed = await request(expressApp)
      .post(`/api/rubrics/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");
  });

  it("refuses confirm without exemplars", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/rubrics/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Bare",
        dimensions: [{ id: "d1", levels: [0, 1], activatesAt: 1 }],
      });
    expect(created.status).toBe(201);

    const confirmed = await request(expressApp)
      .post(`/api/rubrics/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(400);
  });

  it("blocks delete when an Evidence Model cites the rubric", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/rubrics/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Accuracy", dimensions: dims });
    dbState.current.evidenceModels = [
      {
        id: "em1",
        evaluationProcedures: [{ id: "ep1", rubricId: created.body.id }],
      },
    ];
    const del = await request(expressApp)
      .delete(`/api/rubrics/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(del.status).toBe(409);
  });
});
