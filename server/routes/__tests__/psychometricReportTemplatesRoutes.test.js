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
  const { default: router } = await import("../psychometricReportTemplatesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/psychometricReportTemplates", router);
  return expressApp;
}

beforeEach(() => {
  dbState.current = { psychometricReportTemplates: [] };
});

describe("psychometricReportTemplates HTTP surface", () => {
  it("lets admin create a draft and refuses district create", async () => {
    const server = await app();
    const created = await request(server)
      .post("/api/psychometricReportTemplates")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Iteman classic", kind: "iteman-ctt", audience: "psychometrician" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.skinId).toBe("iteman-classic");
    expect(created.body.chapters).toContain("item-pages");

    const denied = await request(server)
      .post("/api/psychometricReportTemplates")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send({ name: "Nope", kind: "iteman-ctt" });
    expect(denied.status).toBe(403);
  });

  it("hides non-operational templates from district", async () => {
    const server = await app();
    const created = await request(server)
      .post("/api/psychometricReportTemplates")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Draft only", kind: "combined" });
    const list = await request(server)
      .get("/api/psychometricReportTemplates")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const missing = await request(server)
      .get(`/api/psychometricReportTemplates/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(missing.status).toBe(404);
  });

  it("walks draft → reviewed → confirmed → operational and then freezes content", async () => {
    const server = await app();
    const admin = tokenFor("admin");
    const created = await request(server)
      .post("/api/psychometricReportTemplates")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Xcalibre",
        kind: "xcalibre-irt",
        audience: "item-reviewer",
        skinId: "xcalibre-classic",
        flags: { tooHard: 0.25 },
      });
    const id = created.body.id;
    for (const status of ["reviewed", "confirmed", "operational"]) {
      const step = await request(server)
        .put(`/api/psychometricReportTemplates/${id}`)
        .set("Authorization", `Bearer ${admin}`)
        .send({ status });
      expect(step.status, status).toBe(200);
      expect(step.body.status).toBe(status);
    }
    const locked = await request(server)
      .put(`/api/psychometricReportTemplates/${id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "rewritten" });
    expect(locked.status).toBe(409);

    const district = await request(server)
      .get("/api/psychometricReportTemplates")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(district.body).toHaveLength(1);
    expect(district.body[0].id).toBe(id);
  });

  it("gates teacher and student out of the collection", async () => {
    const server = await app();
    for (const role of ["teacher", "student"]) {
      const res = await request(server)
        .get("/api/psychometricReportTemplates")
        .set("Authorization", `Bearer ${tokenFor(role)}`);
      expect(res.status).toBe(403);
    }
  });
});
