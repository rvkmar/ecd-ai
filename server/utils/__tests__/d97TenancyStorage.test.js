/**
 * D97 — storage-boundary tenancy (ADR 0006).
 * Proves applyTenancyToDb / mergeScopedDbSave / ALS default ctx.
 * Full cross-route matrix is D98.
 */
import { describe, it, expect } from "vitest";
import {
  runWithTenancy,
  getTenancyContext,
  TenancyError,
} from "../tenancyContext.js";
import {
  applyTenancyToDb,
  mergeScopedDbSave,
  filterRows,
  assertCallerMayAccessDistrict,
  TENANT_SCOPED_COLLECTIONS,
} from "../tenancyScope.js";

const districtCtx = {
  role: "district",
  username: "dist1",
  viewScope: "district",
  districtId: "tn-chennai",
  schoolId: null,
};

const studentCtx = {
  role: "student",
  username: "stud1",
  viewScope: "self",
  districtId: "tn-chennai",
  schoolId: null,
};

const teacherSchoolCtx = {
  role: "teacher",
  username: "teach1",
  viewScope: "school",
  districtId: "tn-chennai",
  schoolId: "sch-1",
};

const teacherDistrictFallbackCtx = {
  role: "teacher",
  username: "teach1",
  viewScope: "school",
  districtId: "tn-chennai",
  schoolId: null,
};

const noClaimCtx = {
  role: "district",
  username: "dist-broken",
  viewScope: "district",
  districtId: null,
  schoolId: null,
};

function sampleDb() {
  return {
    students: [
      { id: "stu-c", name: "C", districtId: "tn-chennai", schoolId: "sch-1" },
      { id: "stu-c2", name: "C2", districtId: "tn-chennai", schoolId: "sch-2" },
      { id: "stu-m", name: "M", districtId: "tn-madurai", schoolId: "sch-m" },
    ],
    users: [
      {
        id: "u1",
        username: "stud1",
        role: "student",
        profile: { districtId: "tn-chennai", schoolId: "sch-1" },
      },
      {
        id: "u2",
        username: "stud-madurai",
        role: "student",
        profile: { districtId: "tn-madurai" },
      },
    ],
    sessions: [
      { id: "sess-c", studentId: "stud1", studentIds: ["stud1"] },
      { id: "sess-m", studentId: "stud-madurai", studentIds: ["stud-madurai"] },
    ],
    analysisArtefacts: [
      { id: "art-c", scope: { districtId: "tn-chennai" } },
      { id: "art-m", scope: { districtId: "tn-madurai" } },
      { id: "art-global", scope: {} },
    ],
    items: [{ id: "item-1", stem: "shared bank" }],
    competencyModels: [{ id: "cm-1" }],
    tasks: [
      { id: "task-c", districtId: "tn-chennai" },
      { id: "task-m", districtId: "tn-madurai" },
    ],
    announcements: [
      { id: "ann-c", districtId: "tn-chennai" },
      { id: "ann-m", districtId: "tn-madurai" },
    ],
    calibrationJobs: [
      { id: "job-c", scope: { districtId: "tn-chennai" } },
      { id: "job-open", scope: {} },
    ],
  };
}

describe("D97 tenancyScope storage helpers", () => {
  it("names the ADR 0006 tenant-scoped collections", () => {
    expect(TENANT_SCOPED_COLLECTIONS).toEqual(
      expect.arrayContaining([
        "users",
        "students",
        "sessions",
        "tasks",
        "announcements",
        "analysisArtefacts",
        "calibrationJobs",
      ])
    );
  });

  it("district load view omits other districts and unscoped artefacts", () => {
    const db = sampleDb();
    const scoped = applyTenancyToDb(db, districtCtx);
    expect(scoped.students.map((s) => s.id).sort()).toEqual(["stu-c", "stu-c2"]);
    expect(scoped.analysisArtefacts.map((a) => a.id)).toEqual(["art-c"]);
    expect(scoped.calibrationJobs.map((j) => j.id)).toEqual(["job-c"]);
    expect(scoped.sessions.map((s) => s.id)).toEqual(["sess-c"]);
    expect(scoped.tasks.map((t) => t.id)).toEqual(["task-c"]);
    expect(scoped.announcements.map((a) => a.id)).toEqual(["ann-c"]);
    // Global content chain stays unscoped
    expect(scoped.items).toEqual(db.items);
    expect(scoped.competencyModels).toEqual(db.competencyModels);
  });

  it("a route that forgets to filter still cannot see foreign rows via applyTenancyToDb", () => {
    const scoped = applyTenancyToDb(sampleDb(), districtCtx);
    // Simulates GET /api/students returning db.students with no extra filter
    expect(scoped.students.every((s) => s.districtId === "tn-chennai")).toBe(true);
    expect(scoped.students.some((s) => s.districtId === "tn-madurai")).toBe(false);
  });

  it("student self-scope does not dump peer roster", () => {
    const scoped = applyTenancyToDb(sampleDb(), studentCtx);
    expect(scoped.users.map((u) => u.username)).toEqual(["stud1"]);
    expect(scoped.sessions.map((s) => s.id)).toEqual(["sess-c"]);
    expect(scoped.students).toEqual([]);
  });

  it("teacher with schoolId prefers school rows; without schoolId falls back to district", () => {
    const withSchool = applyTenancyToDb(sampleDb(), teacherSchoolCtx);
    expect(withSchool.students.map((s) => s.id)).toEqual(["stu-c"]);

    const fallback = applyTenancyToDb(sampleDb(), teacherDistrictFallbackCtx);
    expect(fallback.students.map((s) => s.id).sort()).toEqual(["stu-c", "stu-c2"]);
  });

  it("missing districtId on non-admin refuses tenant-scoped reads (403)", () => {
    expect(() => applyTenancyToDb(sampleDb(), noClaimCtx)).toThrow(TenancyError);
    expect(() =>
      filterRows("students", sampleDb().students, noClaimCtx)
    ).toThrow(TenancyError);
  });

  it("filterRows leaves global collections alone even without districtId", () => {
    const items = sampleDb().items;
    expect(filterRows("items", items, noClaimCtx)).toEqual(items);
  });

  it("admin and absent ALS are unscoped", () => {
    const db = sampleDb();
    expect(applyTenancyToDb(db, null)).toBe(db);
    const admin = applyTenancyToDb(db, {
      role: "admin",
      username: "admin1",
      viewScope: null,
      districtId: null,
      schoolId: null,
      unscoped: true,
    });
    expect(admin.students).toHaveLength(3);
    expect(admin.analysisArtefacts).toHaveLength(3);
  });

  it("assertCallerMayAccessDistrict refuses foreign path params", () => {
    expect(() =>
      assertCallerMayAccessDistrict("tn-madurai", districtCtx)
    ).toThrow(TenancyError);
    expect(() =>
      assertCallerMayAccessDistrict("tn-chennai", districtCtx)
    ).not.toThrow();
    expect(() =>
      assertCallerMayAccessDistrict("tn-madurai", {
        role: "admin",
        username: "admin1",
        viewScope: null,
        districtId: null,
        schoolId: null,
        unscoped: true,
      })
    ).not.toThrow();
  });

  it("mergeScopedDbSave keeps other tenants when a district writes", () => {
    const raw = sampleDb();
    const scoped = applyTenancyToDb(raw, districtCtx);
    scoped.students = [
      ...scoped.students,
      { id: "stu-new", name: "N", districtId: "tn-chennai", schoolId: "sch-1" },
    ];
    const merged = mergeScopedDbSave(raw, scoped, districtCtx);
    expect(merged.students.map((s) => s.id).sort()).toEqual([
      "stu-c",
      "stu-c2",
      "stu-m",
      "stu-new",
    ]);
    expect(merged.students.find((s) => s.id === "stu-m").districtId).toBe(
      "tn-madurai"
    );
    expect(merged.analysisArtefacts.map((a) => a.id).sort()).toEqual([
      "art-c",
      "art-global",
      "art-m",
    ]);
  });

  it("ALS default context is picked up by applyTenancyToDb (loadDB contract)", () => {
    const db = sampleDb();
    runWithTenancy(districtCtx, () => {
      expect(getTenancyContext()?.districtId).toBe("tn-chennai");
      const scoped = applyTenancyToDb(db);
      expect(scoped.students.map((s) => s.id).sort()).toEqual(["stu-c", "stu-c2"]);
    });
    expect(getTenancyContext()).toBeNull();
  });
});
