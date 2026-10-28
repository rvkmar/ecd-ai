// The shipped plant sample must confirm. sm-plant-irt is 2PL on a
// continuous naming proficiency. The binary attributes stay on the
// Q-matrix. Every governed model in the zip is walked draft, then
// reviewed where that status exists, then confirmed.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import { importZipIntoDb } from "../../import/ecdZipImport.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "admin-1", username: "admin1", role: "admin" };
    next();
  },
  authorizeRole: () => (_req, _res, next) => next(),
}));

const dbHolder = { current: null };

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbHolder.current,
  saveDB: () => {},
  readRawDB: () => dbHolder.current,
}));

const { default: competencyRoutes } = await import("../competencyModels.js");
const { default: evidenceRoutes } = await import("../evidenceModels.js");
const { default: taskModelRoutes } = await import("../taskModelsRoutes.js");
const { default: itemRoutes } = await import("../itemsRoutes.js");
const { default: qMatrixRoutes } = await import("../qMatrixModelsRoutes.js");
const { default: assemblyRoutes } = await import("../assemblyModelsRoutes.js");
const { default: presentationRoutes } = await import("../presentationModelsRoutes.js");
const { default: domainRoutes } = await import("../domainAnalysesRoutes.js");
const { default: patternRoutes } = await import("../designPatternsRoutes.js");
const { default: templateRoutes } = await import("../templatesRoutes.js");
const { default: deliveryRoutes } = await import("../deliveryModelsRoutes.js");
const { default: rubricRoutes } = await import("../rubricsRoutes.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ZIP_PATH = path.join(ROOT, "samples/ecd-sample-complete.zip");

const AUTHORED_DOMAIN_NAMES = [
  "Explaining a labelled scientific diagram",
  "Plant structure",
  "Fractions",
];

function emptyDb() {
  return {
    items: [],
    evidenceModels: [],
    competencyModels: [],
    competencies: [],
    taskModels: [],
    taskModelVariables: [],
    workProducts: [],
    rubrics: [],
    templates: [],
    designPatterns: [],
    domainAnalyses: [],
    policies: [],
    curricularPolicies: [],
    qMatrixModels: [],
    assemblyModels: [],
    presentationModels: [],
    deliveryModels: [],
    sessions: [],
    compositeLibrary: [],
    auditLog: [],
    users: [],
    studentModelRecords: [],
  };
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/competencies", competencyRoutes);
  app.use("/api/evidenceModels", evidenceRoutes);
  app.use("/api/taskModels", taskModelRoutes);
  app.use("/api/items", itemRoutes);
  app.use("/api/qMatrixModels", qMatrixRoutes);
  app.use("/api/assemblyModels", assemblyRoutes);
  app.use("/api/presentationModels", presentationRoutes);
  app.use("/api/domainAnalyses", domainRoutes);
  app.use("/api/designPatterns", patternRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/deliveryModels", deliveryRoutes);
  app.use("/api/rubrics", rubricRoutes);
  return app;
}

function bodyText(res) {
  const body = res.body || {};
  const details = body.details || body.errors || body.checks;
  return `${res.status} ${body.error || ""} ${JSON.stringify(details || body)}`;
}

async function send(app, method, url, payload) {
  const res = await request(app)[method](url).send(payload || {});
  expect(res.status, `${method.toUpperCase()} ${url} ${bodyText(res)}`).toBeLessThan(400);
  return res;
}

async function reviewThenConfirm(app, reviewUrl, confirmUrl, reviewBody) {
  await send(app, "patch", reviewUrl, reviewBody || { nextStatus: "reviewed" });
  await send(app, "post", confirmUrl, {});
}

describe("ecd-sample-complete lifecycle", () => {
  let app;

  beforeEach(() => {
    app = makeApp();
  });

  it.each([
    ["original ids", true],
    ["new ids", false],
  ])("confirms every authored model with no validator errors (%s)", async (_label, keepOriginalIds) => {
    dbHolder.current = emptyDb();
    const report = importZipIntoDb(dbHolder.current, fs.readFileSync(ZIP_PATH), {
      keepOriginalIds,
      user: { username: "admin1", role: "admin" },
    });
    expect(report.totals.failed).toBe(0);
    const db = dbHolder.current;

    for (const row of db.domainAnalyses.filter((row) => AUTHORED_DOMAIN_NAMES.includes(row.name))) {
      await send(app, "post", `/api/domainAnalyses/${row.id}/confirm`);
    }

    for (const name of [
      "Explain a labelled diagram",
      "Name a plant part",
      "Explain a fraction",
    ]) {
      const row = db.designPatterns.find((pattern) => pattern.name === name);
      await send(app, "post", `/api/designPatterns/${row.id}/confirm`);
    }

    for (const row of db.rubrics) {
      if (row.status !== "confirmed") {
        await send(app, "post", `/api/rubrics/${row.id}/confirm`);
      }
    }

    for (const row of db.competencyModels) {
      await reviewThenConfirm(
        app,
        `/api/competencies/models/${row.id}/lifecycle`,
        `/api/competencies/models/${row.id}/confirm`
      );
    }

    for (const row of db.qMatrixModels) {
      await send(app, "put", `/api/qMatrixModels/${row.id}`, { status: "reviewed" });
      await send(app, "put", `/api/qMatrixModels/${row.id}`, { status: "confirmed" });
    }

    for (const name of ["Part naming evidence", "Part function evidence", "Fraction evidence"]) {
      const row = db.evidenceModels.find((model) => model.name === name);
      await reviewThenConfirm(
        app,
        `/api/evidenceModels/${row.id}/lifecycle`,
        `/api/evidenceModels/${row.id}/confirm`
      );
    }

    for (const row of db.taskModels) {
      await send(app, "put", `/api/taskModels/${row.id}`, { status: "reviewed" });
      await send(app, "post", `/api/taskModels/${row.id}/confirm`);
    }

    for (const row of db.items) {
      await send(app, "patch", `/api/items/${row.id}/lifecycle`, { nextStatus: "reviewed" });
      await send(app, "patch", `/api/items/${row.id}/lifecycle`, { nextStatus: "confirmed" });
    }

    for (const row of db.presentationModels) {
      await send(app, "put", `/api/presentationModels/${row.id}`, { status: "reviewed" });
      await send(app, "put", `/api/presentationModels/${row.id}`, { status: "confirmed" });
    }

    for (const row of db.assemblyModels) {
      await send(app, "put", `/api/assemblyModels/${row.id}`, { status: "reviewed" });
      await send(app, "put", `/api/assemblyModels/${row.id}`, { status: "confirmed" });
    }

    for (const row of db.deliveryModels) {
      await send(app, "post", `/api/deliveryModels/${row.id}/confirm`);
    }

    for (const row of db.templates) {
      await send(app, "post", `/api/templates/${row.id}/confirm`);
    }

    const confirmed = (rows) => rows.every((row) => row.status === "confirmed");
    expect(confirmed(db.competencyModels)).toBe(true);
    expect(confirmed(db.evidenceModels)).toBe(true);
    expect(confirmed(db.qMatrixModels)).toBe(true);
    expect(confirmed(db.taskModels)).toBe(true);
    expect(confirmed(db.items)).toBe(true);
    expect(confirmed(db.presentationModels)).toBe(true);
    expect(confirmed(db.assemblyModels)).toBe(true);
    expect(confirmed(db.deliveryModels)).toBe(true);
    expect(confirmed(db.templates)).toBe(true);
    expect(confirmed(db.designPatterns)).toBe(true);
    expect(confirmed(db.rubrics)).toBe(true);
    expect(
      confirmed(db.domainAnalyses.filter((row) => AUTHORED_DOMAIN_NAMES.includes(row.name)))
    ).toBe(true);

    const naming = db.evidenceModels.find((row) => row.name === "Part naming evidence");
    const proficiency = db.competencies.find((row) => row.name === "Plant-part naming proficiency");
    const binaryName = db.competencies.find((row) => row.name === "Names the part");
    expect(naming.competencyId).toBe(proficiency.id);
    expect(naming.statisticalModels.find((row) => row.active).subtype).toBe("2pl");
    expect(binaryName.variableType).toBe("binary");
    expect(db.qMatrixModels.find((row) => row.name === "Plant part Q-matrix").attributeIds).toContain(
      binaryName.id
    );
    expect(db.qMatrixModels.find((row) => row.name === "Plant part Q-matrix").attributeIds).not.toContain(
      proficiency.id
    );
    expect(db.competencyModels.every((row) => row.locked)).toBe(true);
    expect(db.evidenceModels.every((row) => row.locked)).toBe(true);
  });
});
