import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import { runWithTenancy } from "../../utils/tenancyContext.js";
import { forgetDbCache, saveDB } from "../../../src/utils/db-server.js";
import { migrateFileSessions } from "../../migrations/migrations/011-sessions-to-mongo.js";
import { assessLiveResponseMatrix } from "../../r/liveResponseMatrix.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { runFullBackup } from "../../backup/runFullBackup.js";
import { decryptBackupBlob } from "../../backup/cryptoArchive.js";
import zlib from "zlib";
import crypto from "crypto";
import {
  exportAllSessions,
  querySessions,
  getSessionById,
  replaceStoredSession,
  resetSessionStoreForTests,
  upsertSessions,
} from "../sessionRepository.js";
import { canonicalSession } from "../sessionCanonical.js";
import { sessionToPlain } from "../mongoSessionStore.js";
import mongoose from "mongoose";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = {
      id: req.headers["x-user-id"] || "u1",
      role: req.headers["x-role"] || "student",
      username: req.headers["x-user-id"] || "u1",
      districtId: req.headers["x-district"] || "tn-chennai",
      profile: { districtId: req.headers["x-district"] || "tn-chennai" },
    };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

const { default: sessionRouter } = await import("../../routes/sessionRoutes.js");
const { default: tasksRouter } = await import("../../routes/tasksRoutes.js");

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "x",
      },
    },
  ],
  statisticalModels: [
    {
      id: "sm1",
      type: "irt",
      active: true,
      structureConfig: {},
      parameterSets: [
        {
          parameterSetId: "ps1",
          parameters: { o1: { a: 1, b: 0 } },
          packageVersion: "pilot-1",
          converged: true,
          sampleSize: 1,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeParameterSetId: "ps1",
    },
  ],
};

const item = {
  id: "item1",
  taskModelId: "tm1",
  versionNumber: 1,
  taskModelVersion: 1,
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  locked: true,
  equivalenceGroupId: "grp1",
  stimulus: { layout: "single", blocks: [{ type: "text", content: "2/4 = ?" }] },
  interaction: {
    type: "mcq",
    responseComponents: [{ id: "opt_a" }, { id: "opt_b" }, { id: "opt_c" }],
  },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      {
        responsePattern: { selected: "opt_a" },
        activatesObservable: true,
        strengthOverride: 4,
        rationale: "Correct.",
      },
      {
        responsePattern: { selected: ["opt_b", "opt_c"] },
        activatesObservable: false,
        rationale: "Distractor.",
      },
    ],
  },
};

function submitDb() {
  const db = {
    sessions: [
      {
        id: "s1",
        studentId: "u1",
        taskIds: ["t1"],
        currentTaskIndex: 0,
        responses: [],
        studentModel: {},
        selectionStrategy: "fixed",
        status: "in_progress",
        isCompleted: false,
      },
      {
        id: "s-other",
        studentId: "other",
        taskIds: ["t1"],
        currentTaskIndex: 0,
        responses: [{ taskId: "t9", rawAnswer: "kept" }],
        status: "completed",
        isCompleted: true,
      },
    ],
    tasks: [
      {
        id: "t1",
        taskModelId: "tm1",
        generatedObservationIds: [],
        generatedEvidenceIds: [],
      },
    ],
    taskModels: [
      {
        id: "tm1",
        versionNumber: 1,
        status: "operational",
        locked: true,
        evidenceModelIds: ["em1"],
        expectedObservations: [
          { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
        ],
      },
    ],
    evidenceModels: [evidenceModel],
    items: [item],
    students: [{ id: "u1", districtId: "tn-chennai" }],
    users: [],
    auditLog: [],
  };
  seedActivePackages(db);
  return db;
}

let tmp;
let prevBackend;
let prevFile;
let prevBackup;

function readFile() {
  return JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-sessions-"));
  prevBackend = process.env.SESSIONS_BACKEND;
  prevFile = process.env.ECD_DB_FILE;
  prevBackup = process.env.ECD_BACKUP_DIR;
  process.env.SESSIONS_BACKEND = "memory";
  process.env.ECD_DB_FILE = path.join(tmp, "db.json");
  process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
  resetSessionStoreForTests();
  forgetDbCache();
});

afterEach(() => {
  resetSessionStoreForTests();
  forgetDbCache();
  if (prevBackend === undefined) delete process.env.SESSIONS_BACKEND;
  else process.env.SESSIONS_BACKEND = prevBackend;
  if (prevFile === undefined) delete process.env.ECD_DB_FILE;
  else process.env.ECD_DB_FILE = prevFile;
  if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
  else process.env.ECD_BACKUP_DIR = prevBackup;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("011 session migration", () => {
  function writeSessions(rows) {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], sessions: rows, auditLog: [] })
    );
    forgetDbCache();
  }

  it("copies a fresh file, verifies ids, then removes sessions", async () => {
    writeSessions([
      { id: "s1", status: "ready" },
      { id: "s2", status: "completed" },
    ]);
    const result = await migrateFileSessions({ dryRun: false });
    expect(result.changed).toEqual(["s1", "s2"]);
    expect(readFile().sessions).toBeUndefined();
    expect(readFile().items).toEqual([{ id: "i1" }]);
    const stored = await exportAllSessions();
    expect(stored.map((row) => row.id).sort()).toEqual(["s1", "s2"]);
    expect(fs.existsSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-sessions-mongo"))).toBe(
      true
    );
    const copy = JSON.parse(
      fs.readFileSync(path.join(process.env.ECD_BACKUP_DIR, "db.json.pre-sessions-mongo"), "utf8")
    );
    expect(copy.sessions).toHaveLength(2);
  });

  it("re-run leaves the store in place when the file has no sessions", async () => {
    writeSessions([{ id: "s1", status: "ready" }]);
    await migrateFileSessions({ dryRun: false });
    const again = await migrateFileSessions({ dryRun: false });
    expect(again.changed).toEqual([]);
    expect(again.summary).toMatch(/Nothing to copy/);
    const stored = await exportAllSessions();
    expect(stored.map((row) => row.id)).toEqual(["s1"]);
  });

  it("upserts when the store already has some of the ids", async () => {
    await upsertSessions([{ id: "s1", status: "stale" }]);
    writeSessions([
      { id: "s1", status: "ready" },
      { id: "s2", status: "completed" },
    ]);
    const result = await migrateFileSessions({ dryRun: false });
    expect(result.changed).toEqual(["s1", "s2"]);
    const stored = await exportAllSessions();
    const byId = Object.fromEntries(stored.map((row) => [row.id, row.status]));
    expect(byId).toEqual({ s1: "ready", s2: "completed" });
    expect(readFile().sessions).toBeUndefined();
  });

  it("does not strip the file when verification fails", async () => {
    writeSessions([{ id: "s1", status: "ready" }]);
    await expect(
      migrateFileSessions({
        dryRun: false,
        upsert: async () => ["s1"],
        loadStored: async () => [{ id: "s1", status: "ready", studentModel: {} }],
      })
    ).rejects.toThrow(/do not match/);
    expect(readFile().sessions).toEqual([{ id: "s1", status: "ready" }]);
  });

  it("leaves the JSON harness file alone", async () => {
    writeSessions([{ id: "s1", status: "ready" }]);
    const result = await migrateFileSessions({ dryRun: false, backend: "json" });
    expect(result.summary).toMatch(/JSON harness/);
    expect(readFile().sessions).toEqual([{ id: "s1", status: "ready" }]);
  });
});

describe("empty nested objects", () => {
  it("keeps studentModel.smvPosteriors through the session schema", () => {
    const schema = new mongoose.Schema(
      { id: { type: String, required: true } },
      { strict: false, versionKey: false, minimize: false }
    );
    schema.set("minimize", false);
    schema.set("toObject", { minimize: false, versionKey: false });
    const Model =
      mongoose.models.SessionEmptyRoundTrip ||
      mongoose.model("SessionEmptyRoundTrip", schema);
    const source = {
      id: "s-empty",
      status: "in_progress",
      studentModel: { smvPosteriors: {} },
      responses: [],
    };
    const plain = sessionToPlain(new Model(source));
    expect(plain.studentModel).toEqual({ smvPosteriors: {} });
    expect(canonicalSession(plain)).toBe(canonicalSession(source));
  });

  it("refuses to delete db.json sessions when the stored doc dropped an empty object", async () => {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        items: [],
        sessions: [
          {
            id: "s-empty",
            status: "in_progress",
            studentModel: { smvPosteriors: {} },
          },
        ],
        auditLog: [],
      })
    );
    forgetDbCache();
    await expect(
      migrateFileSessions({
        dryRun: false,
        upsert: async () => {},
        loadStored: async () => [
          { id: "s-empty", status: "in_progress", studentModel: {} },
        ],
      })
    ).rejects.toThrow(/do not match/);
    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(onDisk.sessions[0].studentModel.smvPosteriors).toEqual({});
  });
});

describe("single-document session writes", () => {
  it("submit replaces one session and leaves the other document unchanged", async () => {
    const seeded = submitDb();
    const sessions = seeded.sessions;
    delete seeded.sessions;
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify(seeded));
    forgetDbCache();
    await upsertSessions(sessions);

    const app = express();
    app.use(express.json());
    app.use("/api/sessions", sessionRouter);
    const res = await request(app)
      .post("/api/sessions/s1/submit")
      .set("x-user-id", "u1")
      .set("x-role", "student")
      .send({ taskId: "t1", itemId: "item1", rawAnswer: "opt_a" });

    expect(res.status).toBe(200);
    const updated = await getSessionById({ students: seeded.students, users: [] }, "s1");
    const other = await getSessionById({ students: seeded.students, users: [] }, "s-other");
    expect(updated.responses).toHaveLength(1);
    expect(updated.responses[0].itemId).toBe("item1");
    expect(other.responses).toEqual([{ taskId: "t9", rawAnswer: "kept" }]);
    const onDisk = readFile();
    expect(onDisk.sessions).toBeUndefined();
    expect(onDisk.tasks[0].generatedObservationIds).toContain("o1");
  });

  it("human rating replaces one session and records human_rating.complete", async () => {
    const kept = {
      id: "s-keep",
      studentId: "other",
      responses: [{ taskId: "t9", humanRatedAt: null }],
      status: "completed",
    };
    const target = {
      id: "s-rate",
      studentId: "u1",
      responses: [
        {
          taskId: "t1",
          itemId: "item1",
          humanRatedAt: null,
          evaluationStatus: "pending_human",
        },
      ],
      status: "in_progress",
    };
    await upsertSessions([kept, target]);
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], auditLog: [] })
    );
    forgetDbCache();
    const { loadDB } = await import("../../../src/utils/db-server.js");
    const db = loadDB();
    const session = await getSessionById(db, "s-rate");
    session.responses[0] = {
      ...session.responses[0],
      humanRatedAt: "2026-10-28T12:00:00.000Z",
      humanRatedBy: "rater1",
      evaluationStatus: "complete",
      activated: true,
    };
    await replaceStoredSession(db, session);
    saveDB(db);

    const other = await getSessionById(db, "s-keep");
    expect(other.responses[0].humanRatedAt).toBeNull();
    const rated = await getSessionById(db, "s-rate");
    expect(rated.responses[0].humanRatedAt).toBe("2026-10-28T12:00:00.000Z");
    const onDisk = readFile();
    expect(onDisk.sessions).toBeUndefined();
    expect(onDisk.auditLog.map((row) => row.action)).toContain("human_rating.complete");
    expect(onDisk.auditLog.find((row) => row.action === "human_rating.complete").entity.id).toBe(
      "s-rate"
    );
  });
});

describe("tenancy and cascades", () => {
  const peer = {
    students: [
      { id: "stu-c", districtId: "tn-chennai" },
      { id: "stu-m", districtId: "tn-madurai" },
    ],
    users: [],
  };

  it("hides another district's sessions", async () => {
    await upsertSessions([
      { id: "s-c", studentId: "stu-c", status: "in_progress" },
      { id: "s-m", studentId: "stu-m", status: "in_progress" },
    ]);
    const visible = await runWithTenancy(
      {
        role: "district",
        username: "dist1",
        viewScope: "district",
        districtId: "tn-chennai",
        schoolId: null,
      },
      () => querySessions(peer)
    );
    expect(visible.map((row) => row.id)).toEqual(["s-c"]);
    const hidden = await runWithTenancy(
      {
        role: "district",
        username: "dist1",
        viewScope: "district",
        districtId: "tn-chennai",
        schoolId: null,
      },
      () => getSessionById(peer, "s-m")
    );
    expect(hidden).toBeNull();
  });

  it("task delete removes only sessions that listed that task", async () => {
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        tasks: [
          { id: "t-del", taskModelId: "tm1" },
          { id: "t-keep", taskModelId: "tm1" },
        ],
        auditLog: [],
      })
    );
    forgetDbCache();
    await upsertSessions([
      { id: "s-drop", studentId: "u1", taskIds: ["t-del"], status: "ready" },
      { id: "s-keep", studentId: "u1", taskIds: ["t-keep"], status: "ready" },
    ]);
    const app = express();
    app.use(express.json());
    app.use("/api/tasks", tasksRouter);
    const res = await request(app).delete("/api/tasks/t-del").set("x-role", "admin").set("x-user-id", "admin1");
    expect(res.status).toBe(200);
    const left = await exportAllSessions();
    expect(left.map((row) => row.id)).toEqual(["s-keep"]);
    expect(readFile().sessions).toBeUndefined();
    expect(readFile().tasks.map((row) => row.id)).toEqual(["t-keep"]);
  });
});

describe("calibration matrix and backup", () => {
  it("builds the matrix from store sessions, not from db.json", async () => {
    const finished = [0, 1].map((i) => ({
      id: `s${i}`,
      studentId: `stud-${i}`,
      status: "completed",
      isCompleted: true,
      responses: ["item-a", "item-b", "item-c"].map((itemId) => ({
        itemId,
        evidenceModelId: "em1",
        activated: i === 0,
        timestamp: "2026-10-16T12:00:00.000Z",
      })),
    }));
    await upsertSessions(finished);
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        evidenceModels: [
          {
            id: "em1",
            statisticalModels: [
              { id: "sm1", type: "irt", subtype: "2pl", active: true, parameterSets: [] },
            ],
          },
        ],
        auditLog: [],
      })
    );
    forgetDbCache();
    const { loadDB } = await import("../../../src/utils/db-server.js");
    const db = loadDB();
    expect(db.sessions).toEqual([]);
    db.sessions = await querySessions(db);
    const assessed = assessLiveResponseMatrix(db, {
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      kind: "irt-parameters",
    });
    expect(assessed.ok).toBe(true);
    expect(assessed.sourceSessionCount).toBe(2);
    expect(readFile().sessions).toBeUndefined();
  });

  it("puts store sessions in the encrypted backup", async () => {
    await upsertSessions([{ id: "s-bak", studentId: "u1", status: "completed", responses: [{ taskId: "t1" }] }]);
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ items: [{ id: "i1" }], auditLog: [] })
    );
    forgetDbCache();
    const key = crypto.randomBytes(32);
    const result = await runFullBackup({
      key,
      listCollection: async () => [],
      listSessions: async () => exportAllSessions(),
    });
    expect(result.ok).toBe(true);
    const compressed = decryptBackupBlob(fs.readFileSync(result.path), key);
    const payload = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
    const sessions = JSON.parse(Buffer.from(payload.files["mongo/sessions.json"], "base64").toString("utf8"));
    expect(sessions.map((row) => row.id)).toEqual(["s-bak"]);
    const ecd = JSON.parse(Buffer.from(payload.files["ecd/db.json"], "base64").toString("utf8"));
    expect(ecd.sessions).toBeUndefined();
  });
});

describe("mongo session store", () => {
  const uri = process.env.MONGO_URI;
  const run = uri ? it : it.skip;

  run("round-trips one document and builds the id index", async () => {
    const previous = process.env.SESSIONS_BACKEND;
    process.env.SESSIONS_BACKEND = "mongo";
    resetSessionStoreForTests();
    try {
      const { ensureSessionIndexes, mongoRemove } = await import("../mongoSessionStore.js");
      const names = await ensureSessionIndexes();
      expect(names.some((name) => name === "id_1" || name.includes("id"))).toBe(true);
      const source = {
        id: "mongo-s",
        studentId: "a",
        status: "ready",
        studentModel: { smvPosteriors: {} },
      };
      await upsertSessions([source]);
      const got = await getSessionById({ students: [], users: [] }, "mongo-s");
      expect(got.studentModel).toEqual({ smvPosteriors: {} });
      expect(canonicalSession(got)).toBe(canonicalSession(source));
      await replaceStoredSession(
        { auditLog: [], students: [], users: [] },
        { ...source, status: "in_progress" }
      );
      await mongoRemove("mongo-s");
    } finally {
      resetSessionStoreForTests();
      if (previous === undefined) delete process.env.SESSIONS_BACKEND;
      else process.env.SESSIONS_BACKEND = previous;
    }
  });
});
