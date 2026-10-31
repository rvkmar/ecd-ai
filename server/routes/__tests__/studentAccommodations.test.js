// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import {
  setCachedAuthEpoch,
  _resetTokenServiceForTests,
} from "../../utils/tokenService.js";
import { applyTenancyToDb } from "../../utils/tenancyScope.js";

const base = {
  students: [
    { id: "stu-6a", name: "Pat", districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
    { id: "stu-7b", name: "Sam", districtId: "tn-chennai", schoolId: "sch-1", classId: "7B" },
    { id: "stu-sch2", name: "Lee", districtId: "tn-chennai", schoolId: "sch-2", classId: "6A" },
    { id: "stu-m", name: "Other", districtId: "tn-madurai", schoolId: "sch-m", classId: "6A" },
    { id: "stud1", name: "Walk", username: "stud1", districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
  ],
  users: [
    { username: "admin1", role: "admin", authEpoch: 0, profile: { name: "Admin" } },
    { username: "dist1", role: "district", authEpoch: 0, profile: { districtId: "tn-chennai" } },
    { username: "dist-m", role: "district", authEpoch: 0, profile: { districtId: "tn-madurai" } },
    {
      username: "teach1",
      role: "teacher",
      authEpoch: 0,
      profile: { districtId: "tn-chennai", schoolId: "sch-1" },
    },
    {
      username: "teach-6a",
      role: "teacher",
      authEpoch: 0,
      profile: { districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
    },
    {
      username: "stud1",
      role: "student",
      authEpoch: 0,
      profile: { districtId: "tn-chennai", schoolId: "sch-1" },
    },
  ],
};

let db;

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(() => applyTenancyToDb(db)),
  saveDB: vi.fn(async () => {}),
  readRawDB: vi.fn(() => db),
  recordAuditEvent: vi.fn(async () => ({})),
}));

vi.mock("../../utils/dbAdapter.js", () => ({
  dbAdapter: {
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    insert: vi.fn(),
    update: vi.fn(),
    updateWhere: vi.fn(),
    remove: vi.fn(),
    removeWhere: vi.fn(),
  },
}));

const { recordAuditEvent } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../studentsRoutes.js");

function token(actor) {
  const payload = { username: actor.username, role: actor.role, ae: 0, typ: "access", jti: `tu7-${actor.username}` };
  if (actor.districtId) payload.districtId = actor.districtId;
  if (actor.schoolId) payload.schoolId = actor.schoolId;
  setCachedAuthEpoch(actor.username, 0);
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

function auth(actor) {
  return { Authorization: `Bearer ${token(actor)}` };
}

const actors = {
  admin: { username: "admin1", role: "admin" },
  district: { username: "dist1", role: "district", districtId: "tn-chennai" },
  otherDistrict: { username: "dist-m", role: "district", districtId: "tn-madurai" },
  teacher: { username: "teach1", role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" },
  classTeacher: { username: "teach-6a", role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" },
  student: { username: "stud1", role: "student", districtId: "tn-chennai", schoolId: "sch-1" },
};

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api/students", router);
  return server;
}

describe("student accommodations access", () => {
  beforeEach(() => {
    _resetTokenServiceForTests();
    db = structuredClone(base);
    recordAuditEvent.mockClear();
  });

  it("lets a same-school teacher read and save, and hides other schools and districts", async () => {
    const server = app();
    const seen = await request(server)
      .get("/api/students/stu-6a/accommodations")
      .set(auth(actors.teacher));
    expect(seen.status).toBe(200);
    expect(seen.body.accommodations).toBeNull();

    const otherSchool = await request(server)
      .get("/api/students/stu-sch2/accommodations")
      .set(auth(actors.teacher));
    expect(otherSchool.status).toBe(404);

    const otherDistrict = await request(server)
      .put("/api/students/stu-m/accommodations")
      .set(auth(actors.teacher))
      .send({ readAloud: true });
    expect(otherDistrict.status).toBe(404);
    expect(recordAuditEvent).not.toHaveBeenCalled();

    const saved = await request(server)
      .put("/api/students/stu-6a/accommodations")
      .set(auth(actors.teacher))
      .send({ extraTimeMinutes: 10, readAloud: true, fontScale: 1.5 });
    expect(saved.status).toBe(200);
    expect(saved.body.accommodations).toEqual({
      extraTimeMinutes: 10,
      readAloud: true,
      fontScale: 1.5,
    });
    expect(db.students.find((row) => row.id === "stu-6a").accommodations.readAloud).toBe(true);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent.mock.calls[0][0]).toMatchObject({
      action: "student.accommodations.update",
      entity: { collection: "students", id: "stu-6a" },
      detail: {
        before: null,
        after: { extraTimeMinutes: 10, readAloud: true, fontScale: 1.5 },
      },
    });
  });

  it("scopes a class claim to that class and a district claim to that district", async () => {
    const server = app();
    const own = await request(server)
      .put("/api/students/stu-6a/accommodations")
      .set(auth(actors.classTeacher))
      .send({ highContrast: true });
    expect(own.status).toBe(200);

    const otherClass = await request(server)
      .get("/api/students/stu-7b/accommodations")
      .set(auth(actors.classTeacher));
    expect(otherClass.status).toBe(404);

    const districtOk = await request(server)
      .get("/api/students/stu-sch2/accommodations")
      .set(auth(actors.district));
    expect(districtOk.status).toBe(200);

    const districtNo = await request(server)
      .put("/api/students/stu-m/accommodations")
      .set(auth(actors.district))
      .send({ readAloud: true });
    expect(districtNo.status).toBe(404);

    const madurai = await request(server)
      .get("/api/students/stu-m/accommodations")
      .set(auth(actors.otherDistrict));
    expect(madurai.status).toBe(200);
  });

  it("lets a student read their own profile and refuses the edit", async () => {
    const server = app();
    const own = await request(server)
      .get("/api/students/stud1/accommodations")
      .set(auth(actors.student));
    expect(own.status).toBe(200);

    const peer = await request(server)
      .get("/api/students/stu-6a/accommodations")
      .set(auth(actors.student));
    expect(peer.status).toBe(404);

    const edit = await request(server)
      .put("/api/students/stud1/accommodations")
      .set(auth(actors.student))
      .send({ readAloud: true });
    expect(edit.status).toBe(403);
  });

  it("refuses an illegal profile, clears with an empty object, and skips an unchanged audit", async () => {
    const server = app();
    const bad = await request(server)
      .put("/api/students/stu-m/accommodations")
      .set(auth(actors.admin))
      .send({ fontScale: 4 });
    expect(bad.status).toBe(400);

    const saved = await request(server)
      .put("/api/students/stu-m/accommodations")
      .set(auth(actors.admin))
      .send({ accommodations: { readAloud: true } });
    expect(saved.status).toBe(200);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);

    const again = await request(server)
      .put("/api/students/stu-m/accommodations")
      .set(auth(actors.admin))
      .send({ readAloud: true });
    expect(again.status).toBe(200);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);

    const cleared = await request(server)
      .put("/api/students/stu-m/accommodations")
      .set(auth(actors.admin))
      .send({});
    expect(cleared.body.accommodations).toBeNull();
    expect(db.students.find((row) => row.id === "stu-m").accommodations).toBeUndefined();
    expect(recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(recordAuditEvent.mock.calls[1][0].detail.after).toBeNull();
  });
});
