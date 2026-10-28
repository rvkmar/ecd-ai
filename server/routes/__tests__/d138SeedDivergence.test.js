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
  readRawDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

function noteFairness(evidenceId) {
  const stored = dbState.current.evidenceModels.find((row) => row.id === evidenceId);
  stored.fairnessNotes =
    "Seeded draft notes residual language load so review can be requested while the claim is still incomplete.";
}

async function app() {
  const { default: patterns } = await import("../designPatternsRoutes.js");
  const { default: evidence } = await import("../evidenceModels.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/designPatterns", patterns);
  expressApp.use("/api/evidenceModels", evidence);
  return expressApp;
}

function seed() {
  return {
    competencyModels: [
      { id: "cm1", name: "CM", status: "confirmed", locked: true, versionNumber: 1 },
    ],
    competencies: [{ id: "c1", name: "Explain", modelId: "cm1" }],
    evidenceModels: [],
    taskModels: [],
    taskModelVariables: [{ id: "tmv1", name: "Complexity" }],
    designPatterns: [
      {
        id: "dp1",
        name: "Explain a diagram",
        summary: "Explain a labelled diagram.",
        rationale: "Explanation is the construct.",
        status: "confirmed",
        focalKsas: [{ label: "Diagram explanation" }],
        potentialObservations: [
          { label: "Names the claim", observationId: "foreign-obs" },
          { label: "Traces the arrow" },
        ],
        potentialWorkProducts: [],
        potentialRubrics: [],
        characteristicFeatures: [{ label: "Diagram is labelled" }],
        variableFeatures: [{ label: "Complexity", taskModelVariableId: "tmv1" }],
      },
    ],
  };
}

beforeEach(() => {
  dbState.current = seed();
});

describe("D138 seed snapshot divergence", () => {
  it("lists descendants and names an edited statement without treating extras or declines as drift", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");

    const seeded = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        selections: { potentialObservations: [0], variableFeatures: [0] },
      });
    expect(seeded.status).toBe(201);

    const evidence = dbState.current.evidenceModels[0];
    const task = dbState.current.taskModels[0];
    evidence.observables[0].statement = "Names a different claim";
    evidence.observables.push({ id: "ob-added", statement: "Designer added this" });
    task.taskModelVariableIds = [];
    dbState.current.designPatterns[0].focalKsas = [{ label: "A rewritten focal KSA" }];
    dbState.current.designPatterns[0].potentialObservations = [{ label: "Pattern menu changed" }];

    const listed = await request(expressApp)
      .get("/api/designPatterns/dp1/descendants")
      .set("Authorization", `Bearer ${admin}`);
    expect(listed.status).toBe(200);
    expect(listed.body.advisory).toBe(true);
    expect(listed.body.descendants.map((row) => row.id).sort()).toEqual([evidence.id, task.id].sort());

    const evidenceRow = listed.body.descendants.find((row) => row.id === evidence.id);
    expect(evidenceRow.divergences).toEqual([
      {
        menu: "potentialObservations",
        label: "Names the claim",
        reason: "edited",
        detail: 'Accepted observation "Names the claim" now reads "Names a different claim".',
      },
    ]);
    expect(JSON.stringify(evidenceRow.divergences)).not.toMatch(/Traces the arrow|Designer added|Focal|foreign-obs/);

    const taskRow = listed.body.descendants.find((row) => row.id === task.id);
    expect(taskRow.divergences.map((flag) => flag.label)).toEqual(["Complexity"]);
    expect(taskRow.divergences[0].detail).toMatch(/no longer cited/);

    noteFairness(evidence.id);
    const reviewed = await request(expressApp)
      .patch(`/api/evidenceModels/${evidence.id}/lifecycle`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ nextStatus: "reviewed" });
    expect(reviewed.status).toBe(200);
    const confirmEvidence = await request(expressApp)
      .post(`/api/evidenceModels/${evidence.id}/confirm`)
      .set("Authorization", `Bearer ${admin}`);
    expect(confirmEvidence.status).toBe(400);
    expect((confirmEvidence.body.errors || []).join(" ")).toMatch(/claimStatement/i);
    expect((confirmEvidence.body.errors || []).join(" ")).not.toMatch(/diverg/i);
  });

  it("does not flag a removed observable that was declined, and does flag one that was accepted", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");
    const seeded = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        selections: { potentialObservations: [0], variableFeatures: [0] },
      });
    expect(seeded.status).toBe(201);
    dbState.current.evidenceModels[0].observables = [];

    const listed = await request(expressApp)
      .get("/api/designPatterns/dp1/descendants")
      .set("Authorization", `Bearer ${admin}`);
    const evidenceRow = listed.body.descendants.find((row) => row.kind === "evidenceModel");
    expect(evidenceRow.divergences).toHaveLength(1);
    expect(evidenceRow.divergences[0].reason).toBe("removed");
    expect(evidenceRow.divergences[0].label).toBe("Names the claim");
    expect(JSON.stringify(evidenceRow.divergences)).not.toMatch(/Traces the arrow/);
  });
});
