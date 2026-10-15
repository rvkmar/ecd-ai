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
  const { default: router } = await import("../domainAnalysesRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/domainAnalyses", router);
  return expressApp;
}

const sections = {
  valuedWork: [{ label: "Explain a labelled diagram" }],
  taskFeatures: [{ label: "A figure with named parts" }],
  representationalForms: [{ label: "Diagram plus a written caption" }],
  performanceOutcomes: [{ label: "A causal explanation" }],
  valuedKnowledge: [{ label: "How the parts of a system relate" }],
  knowledgeStructure: [{ label: "Parts, relations, and the whole" }],
  knowledgeTaskRelationships: [{ label: "The task asks for the relation, not the labels" }],
  psychologicalPerspective: "information_processing",
};

beforeEach(() => {
  dbState.current = {
    domainAnalyses: [],
    competencyModels: [
      { id: "cm1", name: "Existing", psychologicalPerspective: "trait", status: "confirmed" },
    ],
    curricularPolicies: [{ id: "cp1", name: "NCF" }],
    qMatrixModels: [{ id: "qm1", name: "Grid" }],
  };
});

describe("D141 /api/domainAnalyses", () => {
  it("lets an admin save a draft and confirm a complete analysis", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/domainAnalyses/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Diagrams in science", ...sections });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.id).toMatch(/^da/);
    expect(created.body.valuedWork[0].label).toBe("Explain a labelled diagram");

    const confirmed = await request(expressApp)
      .post(`/api/domainAnalyses/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");

    const fetched = await request(expressApp)
      .get(`/api/domainAnalyses/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.knowledgeTaskRelationships[0].label).toMatch(/relation/);
    expect(fetched.body.psychologicalPerspective).toBe("information_processing");

    expect(dbState.current.competencyModels).toEqual([
      { id: "cm1", name: "Existing", psychologicalPerspective: "trait", status: "confirmed" },
    ]);
    expect(dbState.current.curricularPolicies).toEqual([{ id: "cp1", name: "NCF" }]);
    expect(dbState.current.qMatrixModels).toEqual([{ id: "qm1", name: "Grid" }]);
  });

  it("refuses confirm while a section is empty and leaves the draft stored", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/domainAnalyses/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ name: "Thin analysis" });
    expect(created.status).toBe(201);

    const confirmed = await request(expressApp)
      .post(`/api/domainAnalyses/${created.body.id}/confirm`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(confirmed.status).toBe(400);
    expect(confirmed.body.details?.some((e) => /valuedWork/.test(e))).toBe(true);
    expect(dbState.current.domainAnalyses[0].status).toBe("draft");
  });

  it("lets district read and refuses district and teacher writes", async () => {
    const expressApp = await app();
    dbState.current.domainAnalyses = [
      { id: "da-seed", name: "Seed", status: "draft" },
    ];

    const list = await request(expressApp)
      .get("/api/domainAnalyses/")
      .set("Authorization", `Bearer ${tokenFor("district")}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const districtWrite = await request(expressApp)
      .post("/api/domainAnalyses/")
      .set("Authorization", `Bearer ${tokenFor("district")}`)
      .send({ name: "Nope" });
    expect(districtWrite.status).toBe(403);

    const teacherRead = await request(expressApp)
      .get("/api/domainAnalyses/")
      .set("Authorization", `Bearer ${tokenFor("teacher")}`);
    expect(teacherRead.status).toBe(403);
  });

  it("refuses a Q-matrix id stored as a knowledge-task relationship", async () => {
    const expressApp = await app();
    const created = await request(expressApp)
      .post("/api/domainAnalyses/")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({
        name: "Not a grid",
        knowledgeTaskRelationships: [{ label: "Cell", qMatrixId: "qm1" }],
      });
    expect(created.status).toBe(400);
    expect(created.body.details?.some((e) => /Q-matrix/.test(e))).toBe(true);
    expect(dbState.current.domainAnalyses).toEqual([]);
  });
});
