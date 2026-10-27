import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const authState = vi.hoisted(() => ({
  user: { username: "admin1", role: "admin", id: "admin1" },
}));

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { ...authState.user };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => {
  const loadDB = vi.fn();
  return {
    loadDB,
    saveDB: vi.fn(),
    finishSession: vi.fn(),
    readRawDB: (...args) => loadDB(...args),
  };
});

const { loadDB } = await import("../../../src/utils/db-server.js");
const { default: recordsRouter } = await import("../studentModelRecordsRoutes.js");
const { default: sessionRouter } = await import("../sessionRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/studentModelRecords", recordsRouter);
app.use("/api/sessions", sessionRouter);

function posterior(estimate) {
  return {
    smvId: "smv1",
    smvType: "continuous",
    evidenceModelId: "em1",
    parameterSetId: "ps1",
    parameterSource: "calibrated",
    modelFamily: "irt",
    method: "eap",
    estimate,
    precision: 0.8,
    sem: 0.8,
    responsesUsed: 1,
    responsesExcluded: 0,
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function baseDb(extra = {}) {
  return {
    sessions: [],
    students: [{ id: "stu99", name: "stud1", districtId: "tn-chennai", schoolId: "sch-1" }],
    users: [
      {
        id: "u1",
        username: "stud1",
        role: "student",
        profile: { districtId: "tn-chennai", schoolId: "sch-1" },
      },
    ],
    tasks: [{ id: "t1", taskModelId: "tm1" }],
    taskModels: [{ id: "tm1", evidenceModelIds: ["em1"] }],
    policies: [{ id: "p-fixed", type: "fixed", name: "Fixed" }],
    competencyModels: [{ id: "cm1", name: "Fractions" }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        statisticalModels: [
          { id: "sm-stat", active: true, parameterSets: [{ parameterSetId: "ps1" }] },
        ],
      },
    ],
    deliveryModels: [
      {
        id: "dm1",
        competencyModelId: "cm1",
        policyId: "p-fixed",
        administration: { carryForward: true },
      },
    ],
    studentModelRecords: [],
    ...extra,
  };
}

describe("student model record routes", () => {
  beforeEach(() => {
    authState.user = { username: "admin1", role: "admin", id: "admin1" };
    vi.clearAllMocks();
  });

  it("creates the record on finish and seeds the next session when carry-forward is on", async () => {
    const db = baseDb();
    loadDB.mockReturnValue(db);

    const created = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", deliveryModelId: "dm1" });
    expect(created.status).toBe(201);
    expect(created.body.carryForward).toBe(true);
    expect(created.body.studentModel.smvPosteriors).toBeUndefined();

    created.body.studentModel = { smvPosteriors: { smv1: posterior(0.3) } };
    created.body.status = "in_progress";
    db.sessions = [created.body];

    const finished = await request(app).post(`/api/sessions/${created.body.id}/finish`);
    expect(finished.status).toBe(200);
    expect(db.studentModelRecords).toHaveLength(1);
    expect(db.studentModelRecords[0].smvPosteriors.smv1.estimate).toBe(0.3);
    expect(db.studentModelRecords[0].studentId).toBe("stu99");

    const second = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", deliveryModelId: "dm1" });
    expect(second.status).toBe(201);
    expect(second.body.studentModel.smvPosteriors.smv1.estimate).toBe(0.3);
    expect(second.body.studentModel.carriedForward.competencyModelIds).toEqual(["cm1"]);
  });

  it("leaves a legacy session empty when carry-forward is off", async () => {
    const db = baseDb();
    db.studentModelRecords = [
      {
        id: "smr-existing",
        studentId: "stu99",
        identityAliases: ["stu99", "stud1", "u1"],
        competencyModelId: "cm1",
        smvPosteriors: { smv1: posterior(0.7) },
        history: [],
        provenance: { source: "session-finish" },
        districtId: "tn-chennai",
      },
    ];
    db.deliveryModels = [
      {
        id: "dm-off",
        competencyModelId: "cm1",
        policyId: "p-fixed",
        administration: { carryForward: false },
      },
    ];
    loadDB.mockReturnValue(db);

    const legacy = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", selectionStrategy: "fixed" });
    expect(legacy.status).toBe(201);
    expect(legacy.body.carryForward).toBeUndefined();
    expect(legacy.body.studentModel).toEqual({});

    const explicitOff = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", deliveryModelId: "dm-off" });
    expect(explicitOff.status).toBe(201);
    expect(explicitOff.body.studentModel).toEqual({});
  });

  it("lets the student read their own record and refuses another student", async () => {
    const db = baseDb({
      studentModelRecords: [
        {
          id: "smr1",
          studentId: "stu99",
          displayName: "stud1",
          identityAliases: ["stu99", "stud1", "u1"],
          competencyModelId: "cm1",
          competencyModelName: "Fractions",
          smvPosteriors: { smv1: posterior(0.3) },
          history: [{ sessionId: "s1", timestamp: "2026-01-02T00:00:00.000Z", posteriorSnapshot: {} }],
          provenance: { source: "session-finish" },
          districtId: "tn-chennai",
          schoolId: "sch-1",
        },
      ],
    });
    loadDB.mockReturnValue(db);

    authState.user = { username: "stud1", role: "student", id: "u1", districtId: "tn-chennai" };
    const own = await request(app).get("/api/studentModelRecords?studentId=stud1");
    expect(own.status).toBe(200);
    expect(own.body.map((row) => row.id)).toEqual(["smr1"]);

    const byRow = await request(app).get("/api/studentModelRecords/smr1");
    expect(byRow.status).toBe(200);
    expect(byRow.body.smvPosteriors.smv1.estimate).toBe(0.3);

    authState.user = { username: "stud-other", role: "student", id: "u-other", districtId: "tn-chennai" };
    const deniedList = await request(app).get("/api/studentModelRecords?studentId=stud1");
    expect(deniedList.status).toBe(403);
    const deniedOne = await request(app).get("/api/studentModelRecords/smr1");
    expect(deniedOne.status).toBe(403);
    const empty = await request(app).get("/api/studentModelRecords");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);
  });

  it("scopes teacher and district reads and lets admin read", async () => {
    const db = baseDb({
      studentModelRecords: [
        {
          id: "smr-c",
          studentId: "stu99",
          identityAliases: ["stu99", "stud1"],
          competencyModelId: "cm1",
          smvPosteriors: { smv1: posterior(0.2) },
          history: [],
          provenance: {},
          districtId: "tn-chennai",
          schoolId: "sch-1",
        },
        {
          id: "smr-m",
          studentId: "stu-m",
          identityAliases: ["stu-m"],
          competencyModelId: "cm1",
          smvPosteriors: { smv1: posterior(0.9) },
          history: [],
          provenance: {},
          districtId: "tn-madurai",
          schoolId: "sch-m",
        },
      ],
    });
    loadDB.mockReturnValue(db);

    authState.user = {
      username: "teach1",
      role: "teacher",
      districtId: "tn-chennai",
      schoolId: "sch-1",
    };
    const teacher = await request(app).get("/api/studentModelRecords");
    expect(teacher.status).toBe(200);
    expect(teacher.body.map((row) => row.id)).toEqual(["smr-c"]);

    authState.user = { username: "dist1", role: "district", districtId: "tn-chennai" };
    const district = await request(app).get("/api/studentModelRecords");
    expect(district.status).toBe(200);
    expect(district.body.map((row) => row.id)).toEqual(["smr-c"]);

    authState.user = { username: "admin1", role: "admin" };
    const admin = await request(app).get("/api/studentModelRecords");
    expect(admin.status).toBe(200);
    expect(admin.body.map((row) => row.id).sort()).toEqual(["smr-c", "smr-m"]);

    const missing = await request(app).get("/api/studentModelRecords/missing");
    expect(missing.status).toBe(404);
  });
});
