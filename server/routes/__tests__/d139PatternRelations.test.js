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

async function app() {
  const { default: patterns } = await import("../designPatternsRoutes.js");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api/designPatterns", patterns);
  return expressApp;
}

const narrative = {
  summary: "A family of situations.",
  rationale: "The argument is worth keeping.",
};

beforeEach(() => {
  dbState.current = {
    competencyModels: [
      { id: "cm1", name: "CM", status: "confirmed", locked: true, versionNumber: 1 },
    ],
    competencies: [{ id: "c1", name: "Explain", modelId: "cm1" }],
    evidenceModels: [],
    taskModels: [],
    taskModelVariables: [],
    designPatterns: [],
  };
});

describe("D139 pattern relations", () => {
  it("cites a parent without copying its menus, and seeding stays on the child's own rows", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");

    const parent = await request(expressApp)
      .post("/api/designPatterns/")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Problem solving",
        status: "confirmed",
        ...narrative,
        potentialObservations: [{ label: "Parent observation" }],
      });
    expect(parent.status).toBe(201);

    const child = await request(expressApp)
      .post("/api/designPatterns/")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Well-defined problems",
        status: "confirmed",
        ...narrative,
        potentialObservations: [{ label: "Child observation" }],
      });
    expect(child.status).toBe(201);

    const linked = await request(expressApp)
      .put(`/api/designPatterns/${child.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({
        relationships: [{ type: "kind-of", targetPatternId: parent.body.id }],
        references: [{ label: "PADI figures 9-11", url: "https://example.test/padi" }],
      });
    expect(linked.status).toBe(200);
    expect(linked.body.relationships).toEqual([
      { type: "kind-of", targetPatternId: parent.body.id },
    ]);
    expect(linked.body.references).toEqual([
      { label: "PADI figures 9-11", url: "https://example.test/padi" },
    ]);
    expect(linked.body.potentialObservations).toEqual([{ label: "Child observation" }]);

    const editedParent = await request(expressApp)
      .put(`/api/designPatterns/${parent.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ potentialObservations: [{ label: "Parent observation revised" }] });
    expect(editedParent.status).toBe(200);

    const childAfter = await request(expressApp)
      .get(`/api/designPatterns/${child.body.id}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(childAfter.body.potentialObservations).toEqual([{ label: "Child observation" }]);
    expect(childAfter.body.relationships[0].targetPatternId).toBe(parent.body.id);

    const seeded = await request(expressApp)
      .post(`/api/designPatterns/${child.body.id}/seed`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ competencyId: "c1", selections: { potentialObservations: [0] } });
    expect(seeded.status).toBe(201);
    expect(seeded.body.evidenceModel.observables.map((row) => row.statement)).toEqual([
      "Child observation",
    ]);
    expect(JSON.stringify(seeded.body)).not.toMatch(/Parent observation/);

    await request(expressApp)
      .put(`/api/designPatterns/${parent.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ potentialObservations: [{ label: "Parent changed again" }] });
    const evidence = dbState.current.evidenceModels.find(
      (row) => row.id === seeded.body.evidenceModel.id
    );
    expect(evidence.observables[0].statement).toBe("Child observation");
  });

  it("refuses a self-link and a cycle", async () => {
    const expressApp = await app();
    const admin = tokenFor("admin");
    const make = (name) =>
      request(expressApp)
        .post("/api/designPatterns/")
        .set("Authorization", `Bearer ${admin}`)
        .send({ name, status: "confirmed", ...narrative });

    const parent = await make("General");
    const child = await make("Narrow");
    expect(parent.status).toBe(201);

    const self = await request(expressApp)
      .put(`/api/designPatterns/${child.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ relationships: [{ type: "kind-of", targetPatternId: child.body.id }] });
    expect(self.status).toBe(400);
    expect(self.body.error).toMatch(/itself|cycle/i);

    const forward = await request(expressApp)
      .put(`/api/designPatterns/${child.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ relationships: [{ type: "kind-of", targetPatternId: parent.body.id }] });
    expect(forward.status).toBe(200);

    const back = await request(expressApp)
      .put(`/api/designPatterns/${parent.body.id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ relationships: [{ type: "part-of", targetPatternId: child.body.id }] });
    expect(back.status).toBe(400);
    expect(back.body.error).toMatch(/cycle/i);
  });
});
