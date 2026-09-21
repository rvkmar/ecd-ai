// server/routes/__tests__/d48CollectionSurface.test.js
//
// D48 behavioural tests. routeAuth.test.js already proves these three
// routers reject an unauthenticated caller; this file proves the gates
// admit the RIGHT roles and refuse the wrong ones, and that
// compositeLibrary's read-only posture is real rather than merely
// documented.
//
// "Gated" and "gated correctly" are different claims. rolePermissions.js
// and the server's authorizeRole() calls are two parallel systems that
// are not derived from each other and have drifted before (CLAUDE.md
// says so explicitly), so the intent declared on the client is asserted
// here against what the server actually enforces.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";

const tokenFor = (role) =>
  jwt.sign({ username: `${role}1`, role }, JWT_SECRET, { expiresIn: "1h" });

// The routers read and write through src/utils/db-server.js. Stubbing it
// keeps these tests about the auth/authz boundary and the read-only
// posture, not about the flat-file store's behaviour.
const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

async function appFor(mountPath, importer) {
  const { default: router } = await importer();
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

beforeEach(() => {
  dbState.current = {
    qMatrixModels: [],
    assemblyModels: [],
    presentationModels: [],
    compositeLibrary: [],
    taskModels: [],
    evidenceModels: [],
    items: [],
  };
});

describe("qMatrixModels + assemblyModels write gates", () => {
  const cases = [
    {
      name: "qMatrixModels",
      path: "/api/qMatrixModels",
      importer: () => import("../qMatrixModelsRoutes.js"),
    },
    {
      name: "assemblyModels",
      path: "/api/assemblyModels",
      importer: () => import("../assemblyModelsRoutes.js"),
    },
    {
      name: "presentationModels",
      path: "/api/presentationModels",
      importer: () => import("../presentationModelsRoutes.js"),
    },
  ];

  it.each(cases)("$name lets an authenticated non-admin READ", async ({ path, importer }) => {
    const app = await appFor(path, importer);
    const res = await request(app)
      .get(`${path}/`)
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it.each(cases)("$name refuses a WRITE from a non-admin (403)", async ({ path, importer }) => {
    const app = await appFor(path, importer);
    for (const role of ["district", "teacher", "student"]) {
      const res = await request(app)
        .post(`${path}/`)
        .set("Authorization", `Bearer ${tokenFor(role)}`)
        .send({ name: "attempted" });
      expect(res.status, `${role} should not be able to author a ${path} record`).toBe(403);
    }
  });

  it.each(cases)("$name refuses a DELETE from a non-admin (403)", async ({ path, importer }) => {
    const app = await appFor(path, importer);
    const res = await request(app)
      .delete(`${path}/anything`)
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(res.status).toBe(403);
  });
});

describe("compositeLibrary is read-only to callers", () => {
  const path = "/api/compositeLibrary";
  const importer = () => import("../compositeLibraryRoutes.js");

  it("has no generic create route — POST / is not a handler (404, not 201)", async () => {
    // The distinction matters: a 404 means no such route exists. A 201
    // would mean a human could hand-author a delivery package that no
    // Task Model compiles to, contradicting both schema.js's "build
    // artifact, not an authored entity" note and ADR 0003.
    const app = await appFor(path, importer);
    const res = await request(app)
      .post(`${path}/`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ taskModelId: "tm1", items: [{ itemId: "i1" }] });
    expect(res.status).toBe(404);
  });

  it("has no update route — PUT /:id is not a handler", async () => {
    const app = await appFor(path, importer);
    const res = await request(app)
      .put(`${path}/cl1`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ active: true });
    expect(res.status).toBe(404);
  });

  it("refuses a rebuild from a non-admin (403)", async () => {
    const app = await appFor(path, importer);
    const res = await request(app)
      .post(`${path}/rebuild/tm1`)
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(res.status).toBe(403);
  });

  it("404s a rebuild for a task model that does not exist", async () => {
    const app = await appFor(path, importer);
    const res = await request(app)
      .post(`${path}/rebuild/nope`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(404);
  });

  it("REFUSES to activate an empty package, and says why", async () => {
    // The builder degrades rather than throwing: a Task Model that is not
    // yet instantiable compiles to an empty package plus a warning. Storing
    // that as `active` would make a Task Model look delivery-ready while
    // resolving to nothing at request time — a quiet failure. The router
    // refuses and returns the builder's warnings.
    dbState.current.taskModels = [
      { id: "tm1", name: "Draft TM", status: "draft", locked: false, versionNumber: 1 },
    ];
    const app = await appFor(path, importer);
    const res = await request(app)
      .post(`${path}/rebuild/tm1`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/empty composite library/i);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.join(" ")).toMatch(/not locked and/i);
    // Nothing was stored.
    expect(dbState.current.compositeLibrary).toHaveLength(0);
  });

  it("serves the active package for a task model, and 404s when there is none", async () => {
    dbState.current.compositeLibrary = [
      { id: "cl1", taskModelId: "tm1", active: false, items: [] },
      { id: "cl2", taskModelId: "tm1", active: true, items: [] },
    ];
    const app = await appFor(path, importer);

    const hit = await request(app)
      .get(`${path}/active/tm1`)
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(hit.status).toBe(200);
    expect(hit.body.id).toBe("cl2");

    const miss = await request(app)
      .get(`${path}/active/tm-none`)
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(miss.status).toBe(404);
  });
});
