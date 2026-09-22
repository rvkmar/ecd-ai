// server/routes/__tests__/d121WorkProducts.test.js
//
// D121: HTTP surface for workProducts + author tenancy.

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
  const { default: router } = await import("../workProductsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/workProducts", router);
  return expressApp;
}

beforeEach(() => {
  dbState.current = {
    workProducts: [],
    items: [],
    taskModels: [],
    evidenceModels: [],
  };
});

describe("D121 POST /api/workProducts", () => {
  it("stamps author tenancy and does not store a CAF status", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/workProducts/")
      .set(
        "Authorization",
        `Bearer ${tokenFor("district", { districtId: "tn-chennai", schoolId: "sch-1" })}`
      )
      .send({
        name: "Selected answer",
        type: "selected_response",
        status: "operational",
        locked: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^wp/);
    expect(res.body.districtId).toBe("tn-chennai");
    expect(res.body.schoolId).toBe("sch-1");
    expect(res.body.createdBy).toBe("district1");
    expect(res.body.status).toBeUndefined();
    expect(res.body.locked).toBeUndefined();
    expect(res.body.type).toBe("selected_response");
  });

  it("refuses a teacher write", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/workProducts/")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`)
      .send({ name: "Nope", type: "selected_response" });
    expect(res.status).toBe(403);
  });

  it("refuses an incomplete record", async () => {
    const expressApp = await app();
    const res = await request(expressApp)
      .post("/api/workProducts/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Missing type" });
    expect(res.status).toBe(400);
  });

  it("blocks delete when an item binds the Work Product", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/workProducts/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Selected answer", type: "selected_response" });
    expect(created.status).toBe(201);
    dbState.current.items = [
      { id: "item-bound", interaction: { workProductId: created.body.id } },
    ];

    const del = await request(expressApp)
      .delete(`/api/workProducts/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(del.status).toBe(409);
  });
});
