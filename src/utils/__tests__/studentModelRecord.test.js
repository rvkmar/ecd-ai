import { describe, expect, it } from "vitest";
import { validateEntity } from "../schema.js";
import {
  commitFinishedSession,
  resolveStudentIdentity,
  seedSessionStudentModel,
} from "../studentModelRecord.js";

const NOW = "2026-01-02T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

function posterior(estimate, smvId = "smv1") {
  return {
    smvId,
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
    updatedAt: NOW,
  };
}

function chain(extra = {}) {
  return {
    students: [{ id: "stu99", name: "stud1", districtId: "tn-chennai", schoolId: "sch-1" }],
    users: [
      {
        id: "u1",
        username: "stud1",
        role: "student",
        profile: { districtId: "tn-chennai", schoolId: "sch-1", name: "Pat" },
      },
    ],
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
    tasks: [{ id: "t1", taskModelId: "tm1" }],
    taskModels: [{ id: "tm1", evidenceModelIds: ["em1"] }],
    deliveryModels: [],
    studentModelRecords: [],
    ...extra,
  };
}

function finishedSession(id, estimate, studentId = "stud1") {
  return {
    id,
    studentId,
    studentIds: [studentId],
    finishedAt: id === "s2" ? LATER : NOW,
    studentModel: { smvPosteriors: { smv1: posterior(estimate) } },
  };
}

describe("student identity for the scoring record", () => {
  it("treats a students-row id and a username as the same examinee", () => {
    const db = chain();
    const fromName = resolveStudentIdentity("stud1", db);
    const fromRow = resolveStudentIdentity("stu99", db);
    expect(fromName.canonicalStudentId).toBe("stu99");
    expect(fromRow.canonicalStudentId).toBe("stu99");
    expect(fromName.identityAliases).toEqual(expect.arrayContaining(["stud1", "stu99", "u1"]));
    expect(fromRow.identityAliases).toEqual(expect.arrayContaining(["stud1", "stu99", "u1"]));
    expect(fromName.districtId).toBe("tn-chennai");
  });
});

describe("commitFinishedSession", () => {
  it("creates a record on the first finish and updates it on the next", () => {
    const db = chain();
    const first = commitFinishedSession(db, finishedSession("s1", 0.2), { now: NOW });
    expect(first).toHaveLength(1);
    expect(first[0].studentId).toBe("stu99");
    expect(first[0].competencyModelId).toBe("cm1");
    expect(first[0].competencyModelName).toBe("Fractions");
    expect(first[0].parameterSetId).toBe("ps1");
    expect(first[0].statisticalModelIds).toEqual(["sm-stat"]);
    expect(first[0].smvPosteriors.smv1.estimate).toBe(0.2);
    expect(first[0].history).toHaveLength(1);
    expect(first[0].history[0].sessionId).toBe("s1");
    expect(first[0].provenance.source).toBe("session-finish");
    expect(first[0].provenance.sessionId).toBe("s1");
    expect(validateEntity("studentModelRecords", first[0], db).valid).toBe(true);

    const second = commitFinishedSession(db, finishedSession("s2", 1.1), { now: LATER });
    expect(second).toHaveLength(1);
    expect(db.studentModelRecords).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].smvPosteriors.smv1.estimate).toBe(1.1);
    expect(second[0].history.map((entry) => entry.sessionId)).toEqual(["s1", "s2"]);
    expect(second[0].history[0].posteriorSnapshot.smv1.estimate).toBe(0.2);
    expect(second[0].provenance.sessionId).toBe("s2");

    commitFinishedSession(db, finishedSession("s2", 1.1), { now: LATER });
    expect(db.studentModelRecords[0].history).toHaveLength(2);
  });

  it("does not create a record when the session has no posterior", () => {
    const db = chain();
    const updated = commitFinishedSession(db, { id: "s-empty", studentId: "stud1", studentModel: {} }, { now: NOW });
    expect(updated).toEqual([]);
    expect(db.studentModelRecords).toEqual([]);
  });

  it("finds the same row when the next session uses the students-row id", () => {
    const db = chain();
    commitFinishedSession(db, finishedSession("s1", 0.2, "stud1"), { now: NOW });
    commitFinishedSession(db, finishedSession("s2", 0.9, "stu99"), { now: LATER });
    expect(db.studentModelRecords).toHaveLength(1);
    expect(db.studentModelRecords[0].smvPosteriors.smv1.estimate).toBe(0.9);
  });
});

describe("seedSessionStudentModel", () => {
  it("stays empty unless carry-forward is requested", () => {
    const db = chain();
    commitFinishedSession(db, finishedSession("s1", 0.2), { now: NOW });
    const legacy = {
      id: "s-next",
      studentId: "stud1",
      taskIds: ["t1"],
      studentModel: {},
    };
    seedSessionStudentModel(legacy, db, { now: LATER });
    expect(legacy.carryForward).toBeUndefined();
    expect(legacy.studentModel).toEqual({});
  });

  it("seeds from the record when the delivery model says to carry estimates forward", () => {
    const db = chain({
      deliveryModels: [
        {
          id: "dm1",
          competencyModelId: "cm1",
          administration: { carryForward: true },
        },
      ],
    });
    commitFinishedSession(db, finishedSession("s1", 0.2), { now: NOW });
    const session = {
      id: "s-next",
      studentId: "stu99",
      deliveryModelId: "dm1",
      taskIds: ["t1"],
      studentModel: {},
    };
    seedSessionStudentModel(session, db, { now: LATER });
    expect(session.carryForward).toBe(true);
    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.2);
    expect(session.studentModel.carriedForward.recordIds).toEqual([db.studentModelRecords[0].id]);
    expect(session.studentModel.carriedForward.competencyModelIds).toEqual(["cm1"]);
    expect(validateEntity("sessions", { ...session, status: "ready" }, db).valid).toBe(true);
  });

  it("seeds from a session option when there is no delivery model", () => {
    const db = chain();
    commitFinishedSession(db, finishedSession("s1", 0.4), { now: NOW });
    const session = {
      id: "s-next",
      studentId: "stud1",
      taskIds: ["t1"],
      studentModel: {},
    };
    seedSessionStudentModel(session, db, { carryForward: true, now: LATER });
    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.4);
  });

  it("marks carry-forward without inventing estimates when no record exists yet", () => {
    const db = chain({
      deliveryModels: [{ id: "dm1", competencyModelId: "cm1", administration: { carryForward: true } }],
    });
    const session = {
      id: "s-first",
      studentId: "stud1",
      deliveryModelId: "dm1",
      taskIds: ["t1"],
      studentModel: {},
    };
    seedSessionStudentModel(session, db, { now: NOW });
    expect(session.carryForward).toBe(true);
    expect(session.studentModel.smvPosteriors).toBeUndefined();
    expect(session.studentModel.carriedForward).toBeUndefined();
  });
});
