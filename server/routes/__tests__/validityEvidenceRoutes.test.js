import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import { setCachedAuthEpoch, _resetTokenServiceForTests } from "../../utils/tokenService.js";
import { forgetDbCache } from "../../../src/utils/db-server.js";
import validityEvidenceRoutes from "../validityEvidenceRoutes.js";

function token(actor) {
  setCachedAuthEpoch(actor.username, 0);
  const payload = {
    username: actor.username,
    role: actor.role,
    ae: 0,
    typ: "access",
    jti: `ve-${actor.username}`,
  };
  if (actor.districtId) payload.districtId = actor.districtId;
  if (actor.schoolId) payload.schoolId = actor.schoolId;
  return { Authorization: `Bearer ${jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" })}` };
}

const admin = { username: "admin1", role: "admin" };
const chennai = { username: "dist1", role: "district", districtId: "tn-chennai" };
const madurai = { username: "dist-m", role: "district", districtId: "tn-madurai" };
const teacher = { username: "teach1", role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" };
const student = { username: "stud1", role: "student", districtId: "tn-chennai", schoolId: "sch-1" };

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api/validityEvidence", validityEvidenceRoutes);
  return server;
}

describe("validity evidence routes", () => {
  let tmp;
  let previousFile;

  beforeEach(() => {
    _resetTokenServiceForTests();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-ve-route-"));
    previousFile = process.env.ECD_DB_FILE;
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    process.env.VALIDITY_EVIDENCE_BACKEND = "json";
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        evidenceModels: [
          {
            id: "em1",
            warrants: [{ id: "w1" }],
            alternativeExplanations: [{ text: "Speed", addressedBy: "obs1" }],
          },
        ],
        validityEvidence: [],
        auditLog: [],
      })
    );
    forgetDbCache();
  });

  afterEach(() => {
    forgetDbCache();
    delete process.env.VALIDITY_EVIDENCE_BACKEND;
    if (previousFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = previousFile;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates, lists, updates, and deletes a row, and audits the create", async () => {
    const created = await request(app())
      .post("/api/validityEvidence")
      .set(token(admin))
      .send({
        evidenceModelId: "em1",
        type: "response-process",
        summary: "Students named the diagram first.",
        body: "Three think-alouds.",
        source: "cognitive lab",
        warrantIds: ["w1"],
        alternativeExplanationIndexes: [0],
      });
    expect(created.status).toBe(201);
    expect(created.body.author).toBe("admin1");
    expect(created.body.districtId).toBeNull();
    expect(created.body.warrantIds).toEqual(["w1"]);

    const list = await request(app()).get("/api/validityEvidence?evidenceModelId=em1").set(token(admin));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const updated = await request(app())
      .put(`/api/validityEvidence/${created.body.id}`)
      .set(token(admin))
      .send({ summary: "Students named the diagram before answering." });
    expect(updated.status).toBe(200);
    expect(updated.body.summary).toMatch(/before answering/);
    expect(updated.body.author).toBe("admin1");

    const removed = await request(app())
      .delete(`/api/validityEvidence/${created.body.id}`)
      .set(token(admin));
    expect(removed.status).toBe(204);

    forgetDbCache();
    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(onDisk.validityEvidence).toEqual([]);
    expect(onDisk.auditLog.map((entry) => entry.action)).toEqual([
      "validity_evidence.create",
      "validity_evidence.update",
      "validity_evidence.delete",
    ]);
  });

  it("refuses a bad type and a warrant that is not on the model", async () => {
    const badType = await request(app())
      .post("/api/validityEvidence")
      .set(token(admin))
      .send({
        evidenceModelId: "em1",
        type: "face",
        summary: "Looks fine.",
        source: "review",
      });
    expect(badType.status).toBe(400);

    const dangling = await request(app())
      .post("/api/validityEvidence")
      .set(token(admin))
      .send({
        evidenceModelId: "em1",
        type: "consequences",
        summary: "Placement changed.",
        source: "follow-up",
        warrantIds: ["nope"],
      });
    expect(dangling.status).toBe(400);
    expect(dangling.body.error).toMatch(/nope/);
  });

  it("hides another district's row and lets a teacher read but not write", async () => {
    const created = await request(app())
      .post("/api/validityEvidence")
      .set(token(chennai))
      .send({
        evidenceModelId: "em1",
        type: "relations",
        summary: "Chennai criterion correlation.",
        source: "district study",
      });
    expect(created.status).toBe(201);
    expect(created.body.districtId).toBe("tn-chennai");

    const foreignList = await request(app())
      .get("/api/validityEvidence?evidenceModelId=em1")
      .set(token(madurai));
    expect(foreignList.status).toBe(200);
    expect(foreignList.body).toEqual([]);

    const foreignGet = await request(app())
      .get(`/api/validityEvidence/${created.body.id}`)
      .set(token(madurai));
    expect(foreignGet.status).toBe(404);

    const foreignPut = await request(app())
      .put(`/api/validityEvidence/${created.body.id}`)
      .set(token(madurai))
      .send({ summary: "Overwrite" });
    expect(foreignPut.status).toBe(404);

    const teacherList = await request(app())
      .get("/api/validityEvidence?evidenceModelId=em1")
      .set(token(teacher));
    expect(teacherList.status).toBe(200);
    expect(teacherList.body.map((row) => row.id)).toEqual([created.body.id]);

    const teacherPost = await request(app())
      .post("/api/validityEvidence")
      .set(token(teacher))
      .send({
        evidenceModelId: "em1",
        type: "consequences",
        summary: "Teacher note",
        source: "class",
      });
    expect(teacherPost.status).toBe(403);

    const studentGet = await request(app()).get("/api/validityEvidence").set(token(student));
    expect(studentGet.status).toBe(403);
  });

  it("keeps one row when the same analysis artefact is posted twice", async () => {
    const body = {
      evidenceModelId: "em1",
      type: "internal-structure",
      summary: "Fit from the first run.",
      source: "tu4-fit",
      analysisArtefactId: "aa-once",
    };
    const first = await request(app()).post("/api/validityEvidence").set(token(admin)).send(body);
    expect(first.status).toBe(201);
    const second = await request(app()).post("/api/validityEvidence").set(token(admin)).send(body);
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already linked/);
    const list = await request(app()).get("/api/validityEvidence?evidenceModelId=em1").set(token(admin));
    expect(list.body).toHaveLength(1);
  });
});
