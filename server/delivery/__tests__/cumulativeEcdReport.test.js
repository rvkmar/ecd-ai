import { describe, it, expect } from "vitest";
import {
  buildStudentCumulativeReport,
  buildTeacherCumulativeReport,
  buildDistrictCumulativeReport,
  scopedStudentsFor,
} from "../cumulativeEcdReport.js";
import { MIN_CELL_SIZE } from "../../utils/aggregatePrivacy.js";

function plantDb(students, sessions) {
  return {
    students,
    users: [],
    competencies: [{
      id: "c-name",
      name: "Plant part naming",
      domain: "Science",
      modelId: "cm-plant",
      scale: { interpretationGuide: "Higher values mean more reliable naming." },
    }, {
      id: "c-photo",
      name: "Photosynthesis",
      domain: "Science",
      modelId: "cm-plant",
    }],
    competencyModels: [{ id: "cm-plant", name: "Plant morphology" }],
    evidenceModels: [{
      id: "em-plant",
      name: "Part naming evidence",
      competencyId: "c-name",
      claimStatement: "The student can name the called-out plant part.",
    }, {
      id: "em-photo",
      name: "Photosynthesis evidence",
      competencyId: "c-photo",
    }],
    taskModels: [{
      id: "tm-plant",
      name: "Name the plant part",
      evidenceModelIds: ["em-plant"],
      primaryEvidenceModelId: "em-plant",
    }, {
      id: "tm-photo",
      name: "Explain photosynthesis",
      evidenceModelIds: ["em-photo"],
      primaryEvidenceModelId: "em-photo",
    }],
    tasks: [
      { id: "t-leaf", name: "Leaf diagram", taskModelId: "tm-plant" },
      { id: "t-sun", name: "Sunlight story", taskModelId: "tm-photo" },
    ],
    items: [
      { id: "it-leaf", name: "Leaf", taskModelId: "tm-plant", evidenceModelId: "em-plant", observationId: "obs-name" },
      { id: "it-root", name: "Root", taskModelId: "tm-plant", evidenceModelId: "em-plant", observationId: "obs-name" },
      { id: "it-sun", name: "Sunlight", taskModelId: "tm-photo", evidenceModelId: "em-photo", observationId: "obs-photo" },
    ],
    sessions,
  };
}

function closedSession(id, studentId, responses, finishedAt) {
  return {
    id,
    studentId,
    status: "submitted",
    isCompleted: true,
    finishedAt,
    responses,
  };
}

describe("buildStudentCumulativeReport", () => {
  it("joins sessions onto competencies and reports a rising trend without leaking keys", () => {
    const student = { id: "stu1", name: "Pat", username: "stud1", classId: "6A", districtId: "d1" };
    const db = plantDb([student], []);
    const sessions = [
      closedSession("s1", "stu1", [
        { taskId: "t-leaf", itemId: "it-leaf", scoredValue: 0, rawAnswer: "opt_wrong" },
        { taskId: "t-sun", itemId: "it-sun", scoredValue: 0 },
      ], "2026-10-01T00:00:00.000Z"),
      closedSession("s2", "stu1", [
        { taskId: "t-leaf", itemId: "it-leaf", scoredValue: 1, rawAnswer: "opt_a" },
        { taskId: "t-leaf", itemId: "it-root", scoredValue: 1 },
        { taskId: "t-sun", itemId: "it-sun", scoredValue: 0 },
      ], "2026-10-20T00:00:00.000Z"),
    ];
    const report = buildStudentCumulativeReport(db, { student, sessions });
    expect(report.kind).toBe("student");
    expect(report.overview.nSessions).toBe(2);
    expect(report.competencies.map((c) => c.id).sort()).toEqual(["c-name", "c-photo"]);
    const naming = report.competencies.find((c) => c.id === "c-name");
    expect(naming.nSessions).toBe(2);
    expect(naming.delta).toBeGreaterThan(0);
    expect(naming.interpretation).toMatch(/rose/);
    expect(report.focus).toContain("Photosynthesis");
    expect(report.sessions).toHaveLength(2);
    const blob = JSON.stringify(report);
    expect(blob).not.toMatch(/isCorrect/);
    expect(blob).not.toMatch(/keyedOptionId/);
  });

  it("skips archived sessions", () => {
    const student = { id: "stu1", name: "Pat" };
    const db = plantDb([student], []);
    const sessions = [
      { id: "s-arch", studentId: "stu1", status: "archived", responses: [{ itemId: "it-leaf", scoredValue: 1 }] },
    ];
    const report = buildStudentCumulativeReport(db, { student, sessions });
    expect(report.overview.nSessions).toBe(0);
    expect(report.overview.nScored).toBe(0);
  });

  it("ranks the student against classmates without naming them, and suppresses n < 5", () => {
    const classmates = Array.from({ length: 5 }, (_, i) => ({
      id: `stu${i + 1}`,
      name: `Peer ${i + 1}`,
      username: `peer${i + 1}`,
      classId: "6A",
      districtId: "d1",
    }));
    const db = plantDb(classmates, []);
    const scores = [0, 0.25, 0.5, 0.75, 1];
    const sessions = classmates.map((s, i) =>
      closedSession(`s${i}`, s.id, [{ taskId: "t-leaf", itemId: "it-leaf", scoredValue: scores[i] }], "2026-10-06T00:00:00.000Z")
    );
    const student = classmates[2];
    const report = buildStudentCumulativeReport(db, {
      student,
      sessions: sessions.filter((s) => s.studentId === student.id),
      comparisonStudents: classmates,
      comparisonSessions: sessions,
    });
    expect(report.norms.n).toBe(5);
    expect(report.norms.suppressed).toBe(false);
    expect(report.norms.percentileRank).toBe(50);
    expect(report.overview.percentileRank).toBe(50);
    expect(report.norms.quartile).toBe("q2");
    const naming = report.competencies.find((c) => c.id === "c-name");
    expect(naming.percentileRank).toBe(50);
    const blob = JSON.stringify(report);
    expect(blob).not.toMatch(/Peer 1/);
    expect(blob).not.toMatch(/Peer 4/);
    expect(report.students).toBeUndefined();

    const small = buildStudentCumulativeReport(db, {
      student,
      sessions: sessions.filter((s) => s.studentId === student.id),
      comparisonStudents: classmates.slice(0, 3),
      comparisonSessions: sessions,
    });
    expect(small.norms.suppressed).toBe(true);
    expect(small.norms.percentileRank).toBeNull();
    expect(small.overview.percentileRank).toBeNull();
  });
});

describe("buildTeacherCumulativeReport", () => {
  it("names students and ranks classroom focus by how many are below mostly-secure", () => {
    const students = [
      { id: "stu1", name: "Pat", classId: "6A", districtId: "d1", schoolId: "sch-1" },
      { id: "stu2", name: "Sam", classId: "6A", districtId: "d1", schoolId: "sch-1" },
    ];
    const db = plantDb(students, []);
    const sessions = [
      closedSession("s1", "stu1", [
        { taskId: "t-leaf", itemId: "it-leaf", scoredValue: 1 },
        { taskId: "t-sun", itemId: "it-sun", scoredValue: 0 },
      ], "2026-10-02T00:00:00.000Z"),
      closedSession("s2", "stu2", [
        { taskId: "t-leaf", itemId: "it-leaf", scoredValue: 1 },
        { taskId: "t-sun", itemId: "it-sun", scoredValue: 0 },
      ], "2026-10-03T00:00:00.000Z"),
    ];
    const report = buildTeacherCumulativeReport(db, {
      teacher: { username: "teach1", schoolId: "sch-1", districtId: "d1" },
      students,
      sessions,
    });
    expect(report.kind).toBe("teacher");
    expect(report.students.map((s) => s.name).sort()).toEqual(["Pat", "Sam"]);
    const photo = report.competencies.find((c) => c.id === "c-photo");
    expect(photo.nStudents).toBe(2);
    expect(photo.nFocus).toBe(2);
    expect(photo.interpretation).toMatch(/classroom-wide focus|below mostly-secure/i);
    expect(report.nextSteps.join(" ")).toMatch(/Photosynthesis/);
    expect(JSON.stringify(report)).not.toMatch(/isCorrect/);
    expect(report.students.every((s) => Number.isFinite(s.percentileRank))).toBe(true);
    expect(report.overview.percentiles.p50).toBeGreaterThan(0);
    expect(photo.percentiles.p50).toBeDefined();
  });

  it("includes unstamped students and excludes a foreign district", () => {
    const teacher = { role: "teacher", username: "teach1", districtId: "d1", schoolId: "sch-1" };
    const db = {
      students: [
        { id: "stu1", name: "Pat", classId: "6A" },
        { id: "stu-m", name: "Other", classId: "7B", districtId: "d-other", schoolId: "sch-m" },
      ],
    };
    const scoped = scopedStudentsFor(teacher, db);
    expect(scoped.map((s) => s.id)).toEqual(["stu1"]);
  });
});

describe("buildDistrictCumulativeReport", () => {
  it("omits names and suppresses cells below MIN_CELL_SIZE", () => {
    const students = Array.from({ length: 3 }, (_, i) => ({
      id: `stu${i}`,
      name: `Student ${i}`,
      classId: "6A",
      districtId: "d1",
      schoolId: "sch-1",
    }));
    const db = plantDb(students, []);
    const sessions = students.map((s, i) =>
      closedSession(`s${i}`, s.id, [
        { taskId: "t-leaf", itemId: "it-leaf", scoredValue: 0 },
      ], "2026-10-04T00:00:00.000Z")
    );
    const report = buildDistrictCumulativeReport(db, { districtId: "d1", students, sessions });
    expect(report.kind).toBe("district");
    expect(report.students).toBeUndefined();
    expect(JSON.stringify(report)).not.toMatch(/Student 0/);
    expect(report.minCellSize).toBe(MIN_CELL_SIZE);
    expect(report.overview.suppressed).toBe(true);
    expect(report.overview.nStudents).toBeNull();
    expect(report.competencies.every((c) => c.suppressed)).toBe(true);
    expect(report.classes[0].suppressed).toBe(true);
    expect(report.overview.percentiles.p50).toBeNull();
    expect(report.classes[0].percentiles.p50).toBeNull();
  });

  it("reports student counts and curriculum focus when n is large enough", () => {
    const students = Array.from({ length: MIN_CELL_SIZE }, (_, i) => ({
      id: `stu${i}`,
      name: `Student ${i}`,
      classId: "6A",
      districtId: "d1",
      schoolId: "sch-1",
    }));
    const db = plantDb(students, []);
    const sessions = students.map((s, i) =>
      closedSession(`s${i}`, s.id, [
        { taskId: "t-leaf", itemId: "it-leaf", scoredValue: 0.2 },
        { taskId: "t-sun", itemId: "it-sun", scoredValue: 0.9 },
      ], "2026-10-05T00:00:00.000Z")
    );
    const report = buildDistrictCumulativeReport(db, { districtId: "d1", students, sessions });
    expect(report.overview.nStudents).toBe(MIN_CELL_SIZE);
    expect(report.overview.suppressed).toBe(false);
    const naming = report.competencies.find((c) => c.id === "c-name");
    expect(naming.suppressed).toBe(false);
    expect(naming.nStudents).toBe(MIN_CELL_SIZE);
    expect(naming.nEmerging + naming.nDeveloping).toBeGreaterThan(0);
    expect(report.nextSteps.join(" ")).toMatch(/Plant part naming/);
    expect(report.classes[0].nStudents).toBe(MIN_CELL_SIZE);
    expect(JSON.stringify(report)).not.toMatch(/Student 0/);
    expect(report.overview.percentiles.p50).toBeGreaterThan(0);
    expect(naming.percentiles.p25).toBeLessThanOrEqual(naming.percentiles.p75);
    expect(report.classes[0].percentiles.p50).toBeGreaterThan(0);
  });
});
