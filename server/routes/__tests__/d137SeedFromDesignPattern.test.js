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
  const { default: taskModels } = await import("../taskModelsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/designPatterns", patterns);
  expressApp.use("/api/evidenceModels", evidence);
  expressApp.use("/api/taskModels", taskModels);
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
        potentialObservations: [
          { label: "Names the claim", observationId: "foreign-obs" },
          { label: "Traces the arrow" },
        ],
        potentialWorkProducts: [{ label: "Essay", workProductId: "wp1" }],
        potentialRubrics: [{ label: "Explanation rubric", rubricId: "rb1" }],
        characteristicFeatures: [{ label: "Diagram is labelled" }],
        variableFeatures: [{ label: "Complexity", taskModelVariableId: "tmv1" }],
      },
      {
        id: "dp-draft",
        name: "Unfinished",
        status: "draft",
        potentialObservations: [{ label: "Something" }],
      },
    ],
  };
}

beforeEach(() => {
  dbState.current = seed();
});

describe("D137 seed from a confirmed design pattern", () => {
  it("writes draft models with a back-link and refuses confirm without substance", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");

    const seeded = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        selections: {
          potentialObservations: [0],
          variableFeatures: [0],
        },
      });

    expect(seeded.status).toBe(201);
    const evidence = seeded.body.evidenceModel;
    const task = seeded.body.taskModel;
    expect(evidence.status).toBe("draft");
    expect(task.status).toBe("draft");
    expect(evidence.observables).toHaveLength(1);
    expect(evidence.observables[0].statement).toBe("Names the claim");
    expect(evidence.observables[0].id).not.toBe("foreign-obs");
    expect(evidence.observables[0].observationId).toBeUndefined();
    expect(evidence.evaluationProcedures).toEqual([]);
    expect(JSON.stringify(evidence.blueprintConstraints || {})).not.toContain("Diagram is labelled");
    expect(JSON.stringify(task.blueprintConstraints)).not.toContain("Diagram is labelled");
    expect(task.taskModelVariableIds).toEqual(["tmv1"]);
    expect(task.evidenceModelIds).toEqual([evidence.id]);
    expect(task.expectedObservations[0].observationId).toBe(evidence.observables[0].id);

    for (const record of [evidence, task]) {
      expect(record.seededFrom.designPatternId).toBe("dp1");
      expect(record.seededFrom.accepted.potentialObservations.map((row) => row.label)).toEqual([
        "Names the claim",
      ]);
      expect(record.seededFrom.declined.potentialObservations.map((row) => row.label)).toEqual([
        "Traces the arrow",
      ]);
      expect(record.seededFrom.declined.characteristicFeatures.map((row) => row.label)).toEqual([
        "Diagram is labelled",
      ]);
      expect(record.seededFrom.declined.potentialRubrics.map((row) => row.label)).toEqual([
        "Explanation rubric",
      ]);
      expect(record.seededFrom.accepted.potentialObservations[0].seededObservableId).toBe(
        evidence.observables[0].id
      );
    }

    expect(dbState.current.designPatterns.find((row) => row.id === "dp1").potentialObservations).toHaveLength(2);

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
    const evidenceErrors = (confirmEvidence.body.errors || []).join(" ");
    expect(evidenceErrors).toMatch(/claimStatement/i);
    expect(evidenceErrors).toMatch(/warrant|observable|evidenceRule/i);

    const promoteTask = await request(expressApp)
      .put(`/api/taskModels/${task.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "reviewed" });
    expect(promoteTask.status).toBe(400);
    expect((promoteTask.body.details || []).join(" ")).toMatch(/must be confirmed/i);
  });

  it("pre-fills the evidence competency and student model variable from the focal KSA", async () => {
    dbState.current.competencyModels[0].smVariables = [
      { id: "smv-explain", label: "Explains" },
    ];
    dbState.current.designPatterns[0].focalKsas = [
      {
        label: "Explain the claim",
        competencyId: "c1",
        competencyModelId: "cm1",
        smvId: "smv-explain",
      },
    ];
    const expressApp = await app();
    const admin = tokenFor("admin");

    const seeded = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({ selections: { potentialObservations: [0] } });

    expect(seeded.status).toBe(201);
    expect(seeded.body.evidenceModel.competencyId).toBe("c1");
    expect(seeded.body.evidenceModel.seededFrom.studentModel).toEqual({
      competencyId: "c1",
      competencyModelId: "cm1",
      smvId: "smv-explain",
    });
    expect(seeded.body.taskModel.seededFrom.studentModel.smvId).toBe("smv-explain");

    const overridden = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        competencyModelId: "",
        smvId: "",
        selections: { potentialObservations: [0] },
      });
    expect(overridden.status).toBe(201);
    expect(overridden.body.evidenceModel.competencyId).toBe("c1");
    expect(overridden.body.evidenceModel.seededFrom.studentModel).toEqual({ competencyId: "c1" });
  });

  it("copies characteristic features and real rubrics, and names rows it cannot map", async () => {
    dbState.current.rubrics = [{ id: "rb1", name: "Explanation rubric", status: "draft" }];
    const pattern = dbState.current.designPatterns[0];
    pattern.potentialObservations = [
      { label: "Names the claim" },
      { label: "Traces the arrow" },
    ];
    pattern.potentialRubrics = [
      { label: "Explanation rubric", rubricId: "rb1" },
      { label: "Missing rubric", rubricId: "rb-gone" },
      { label: "Label only" },
    ];
    pattern.characteristicFeatures = [
      { label: "Diagram is labelled" },
      { label: "   " },
      { label: "Uses a familiar plant" },
    ];
    pattern.variableFeatures = [
      { label: "Complexity", taskModelVariableId: "tmv1" },
      { label: "No variable" },
    ];

    const expressApp = await app();
    const admin = tokenFor("admin");
    const seeded = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        selections: {
          potentialObservations: [0, 1],
          potentialRubrics: [0, 1, 2],
          characteristicFeatures: [0, 1, 2],
          variableFeatures: [0],
        },
      });

    expect(seeded.status).toBe(201);
    const evidence = seeded.body.evidenceModel;
    const task = seeded.body.taskModel;
    expect(evidence.status).toBe("draft");
    expect(task.status).toBe("draft");
    expect(task.taskModelVariableIds).toEqual(["tmv1"]);
    expect(task.blueprintConstraints.characteristicFeatures).toEqual([
      { label: "Diagram is labelled" },
      { label: "Uses a familiar plant" },
    ]);
    expect(JSON.stringify(task.blueprintConstraints)).not.toContain("No variable");
    expect(evidence.evaluationProcedures).toHaveLength(2);
    expect(evidence.evaluationProcedures.map((proc) => proc.rubricId)).toEqual(["rb1", "rb1"]);
    expect(evidence.evaluationProcedures.map((proc) => proc.method)).toEqual(["rubric", "rubric"]);
    expect(evidence.evaluationProcedures.map((proc) => proc.observableId)).toEqual([
      evidence.observables[0].id,
      evidence.observables[1].id,
    ]);
    expect(evidence.evaluationProcedures[0].id).not.toBe(evidence.evaluationProcedures[1].id);
    const warnings = seeded.body.warnings.join(" ");
    expect(warnings).toMatch(/Characteristic feature 2 has no label/);
    expect(warnings).toMatch(/Missing rubric/);
    expect(warnings).toMatch(/no longer exists/);
    expect(warnings).toMatch(/Label only/);
    expect(warnings).toMatch(/no rubric id/);
    expect(warnings).not.toMatch(/Diagram is labelled/);
    expect(warnings).not.toMatch(/Complexity/);
    expect(evidence.seededFrom.declined.variableFeatures.map((row) => row.label)).toEqual([
      "No variable",
    ]);

    const saved = await request(expressApp)
      .put(`/api/evidenceModels/${evidence.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send(evidence);
    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe("draft");
    expect(saved.body.evaluationProcedures.map((proc) => proc.rubricId)).toEqual(["rb1", "rb1"]);

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
  });

  it("warns instead of inventing a procedure when no observation was selected", async () => {
    dbState.current.rubrics = [{ id: "rb1", name: "Explanation rubric", status: "draft" }];
    const expressApp = await app();
    const admin = tokenFor("admin");
    const seeded = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        selections: {
          potentialRubrics: [0],
          characteristicFeatures: [0],
        },
      });

    expect(seeded.status).toBe(201);
    expect(seeded.body.evidenceModel.evaluationProcedures).toEqual([]);
    expect(seeded.body.evidenceModel.status).toBe("draft");
    expect(seeded.body.taskModel.blueprintConstraints.characteristicFeatures).toEqual([
      { label: "Diagram is labelled" },
    ]);
    expect(seeded.body.taskModel.taskModelVariableIds).toEqual([]);
    expect(seeded.body.warnings.join(" ")).toMatch(/no observation was selected/);
  });

  it("still refuses a chosen variable feature that has no task model variable id", async () => {
    dbState.current.designPatterns[0].variableFeatures = [{ label: "No variable" }];
    const expressApp = await app();
    const admin = tokenFor("admin");
    const refused = await request(expressApp)
      .post("/api/designPatterns/dp1/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        competencyId: "c1",
        selections: { variableFeatures: [0], potentialObservations: [0] },
      });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/no taskModelVariableId/);
    expect(dbState.current.evidenceModels).toHaveLength(0);
    expect(dbState.current.taskModels).toHaveLength(0);
  });

  it("refuses a draft pattern", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");
    const refused = await request(expressApp)
      .post("/api/designPatterns/dp-draft/seed")
      .set("Authorization", `Bearer ${admin}`)
      .send({ competencyId: "c1", selections: { potentialObservations: [0] } });
    expect(refused.status).toBe(400);
    expect(dbState.current.evidenceModels).toHaveLength(0);
    expect(dbState.current.taskModels).toHaveLength(0);
  });
});
