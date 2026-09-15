import { describe, it, expect } from "vitest";
import {
  sessionPlayerPath,
  sessionListPath,
  sessionReviewPath,
  studentIdentityKeys,
  sessionAssignedToStudent,
  attendableSessionsForStudent,
  closedSessionsForStudent,
  studentForbiddenFromSession,
  sessionsVisibleToUser,
  canPauseSession,
  canPlaySession,
  canStartSession,
  canOperateSession,
  canReviewSession,
  canViewCompletedSession,
  canViewSessionReport,
  isAttendableStatus,
  isSessionClosedForStudent,
  buildAssignableRoster,
  resolveSessionAssignees,
} from "../sessionPlay.js";

describe("sessionPlayerPath", () => {
  it("builds a role-prefixed player URL for staff and students", () => {
    expect(sessionPlayerPath("teacher", "s1")).toBe("/teacher/sessions/s1/player");
    expect(sessionPlayerPath("district", "s1")).toBe("/district/sessions/s1/player");
    expect(sessionPlayerPath("student", "s1")).toBe("/student/sessions/s1/player");
  });

  it("refuses the unprefixed /sessions/:id/player shape that used to log staff out", () => {
    expect(sessionPlayerPath("teacher", "s1")).not.toBe("/sessions/s1/player");
    expect(sessionPlayerPath("admin", "s1")).toBeNull();
    expect(sessionPlayerPath("teacher", null)).toBeNull();
  });

  it("staff Review opens the /review surface, not the student /player wizard", () => {
    expect(sessionReviewPath("teacher", "s1")).toBe("/teacher/sessions/s1/review");
    expect(sessionReviewPath("district", "s1")).toBe("/district/sessions/s1/review");
    expect(sessionReviewPath("student", "s1")).toBe("/student/sessions/s1/player");
  });
});

describe("student session matching", () => {
  const user = { username: "stud1", role: "student" };
  const students = [{ id: "stu99", name: "stud1" }];

  it("links a users.username to a students row with the same name", () => {
    const keys = studentIdentityKeys(user, students);
    expect(keys.has("stud1")).toBe(true);
    expect(keys.has("stu99")).toBe(true);
  });

  it("treats a session assigned to that student row as theirs", () => {
    expect(
      sessionAssignedToStudent({ studentId: "stu99" }, user, students)
    ).toBe(true);
    expect(
      sessionAssignedToStudent({ studentId: "someone-else" }, user, students)
    ).toBe(false);
  });

  it("when anything is assigned to this student, hides other live sessions", () => {
    const sessions = [
      { id: "mine", studentId: "stu99", status: "in_progress" },
      { id: "other", studentId: "stu-other", status: "in_progress" },
    ];
    const mine = attendableSessionsForStudent(sessions, user, students);
    expect(mine.map((s) => s.id)).toEqual(["mine"]);
  });

  it("returns no sessions when this student is assigned to none of them", () => {
    const sessions = [
      { id: "live", studentId: "stu-other", status: "in_progress" },
      { id: "done", studentId: "stu-other", status: "completed" },
    ];
    const mine = attendableSessionsForStudent(sessions, user, []);
    expect(mine.map((s) => s.id)).toEqual([]);
  });

  it("forbids a student from a session assigned to someone else", () => {
    expect(
      studentForbiddenFromSession({ studentId: "stu-other" }, user, students)
    ).toBe(true);
    expect(
      studentForbiddenFromSession({ studentId: "stu99" }, user, students)
    ).toBe(false);
    expect(
      studentForbiddenFromSession({ studentId: "stu-other" }, { role: "teacher" }, students)
    ).toBe(false);
  });

  it("hides other examinees from a student list without dropping staff lists", () => {
    const sessions = [
      { id: "mine", studentId: "stu99" },
      { id: "other", studentId: "stu-other" },
    ];
    expect(sessionsVisibleToUser(sessions, user, students).map((s) => s.id)).toEqual(["mine"]);
    expect(sessionsVisibleToUser(sessions, { role: "teacher" }, students)).toHaveLength(2);
  });

  it("treats the legacy hyphenated in-progress spelling as attendable", () => {
    expect(isAttendableStatus("in-progress")).toBe(true);
    expect(canPauseSession({ status: "in-progress" })).toBe(true);
    expect(canPauseSession({ status: "in_progress" })).toBe(true);
    expect(canPauseSession({ status: "in_progress" }, { reviewMode: true })).toBe(false);
    expect(canPauseSession({ status: "paused" })).toBe(false);
  });

  it("matches studentIds[] so a typed username is discoverable via /mine", () => {
    expect(
      sessionAssignedToStudent(
        { studentId: "stu99", studentIds: ["stu99", "stud1"] },
        user,
        []
      )
    ).toBe(true);
  });
});

describe("staff Play / Pause / Operate exclusivity", () => {
  it("shows Play xor Pause, never both", () => {
    const ready = { status: "ready" };
    const live = { status: "in_progress" };
    const paused = { status: "paused" };
    expect(canPlaySession(ready)).toBe(true);
    expect(canPauseSession(ready)).toBe(false);
    expect(canOperateSession(ready)).toBe(false);

    expect(canPlaySession(live)).toBe(false);
    expect(canPauseSession(live)).toBe(true);
    expect(canOperateSession(live)).toBe(true);

    expect(canPlaySession(paused)).toBe(true);
    expect(canPauseSession(paused)).toBe(false);
    expect(canOperateSession(paused)).toBe(false);
  });

  it("never offers Play and Pause on the same session", () => {
    for (const status of ["ready", "in_progress", "paused", "reopened", "completed"]) {
      const session = { status };
      expect(canPlaySession(session) && canPauseSession(session)).toBe(false);
    }
  });

  it("student Start is available until the session is closed", () => {
    expect(canStartSession({ status: "ready" })).toBe(true);
    expect(canStartSession({ status: "in_progress" })).toBe(true);
    expect(canStartSession({ status: "paused" })).toBe(true);
    expect(canStartSession({ status: "completed" })).toBe(false);
    expect(canStartSession({ status: "submitted" })).toBe(false);
    expect(isSessionClosedForStudent({ status: "completed", isCompleted: true })).toBe(true);
  });

  it("Review is for live sessions; View/Report are for completed ones", () => {
    expect(canReviewSession({ status: "in_progress" })).toBe(true);
    expect(canOperateSession({ status: "in_progress" })).toBe(true);
    expect(canViewCompletedSession({ status: "in_progress" })).toBe(false);
    expect(canViewCompletedSession({ status: "completed", isCompleted: true })).toBe(true);
    expect(canViewSessionReport({ status: "reviewed" })).toBe(true);
    expect(canReviewSession({ status: "completed", isCompleted: true })).toBe(false);
  });

  it("closedSessionsForStudent returns only this student's closed work", () => {
    const user = { username: "stud1", role: "student" };
    const students = [{ id: "stu99", name: "stud1" }];
    const sessions = [
      { id: "live", studentId: "stu99", status: "in_progress" },
      { id: "done", studentId: "stu99", status: "completed", isCompleted: true },
      { id: "other", studentId: "stu-other", status: "completed", isCompleted: true },
    ];
    expect(closedSessionsForStudent(sessions, user, students).map((s) => s.id)).toEqual(["done"]);
  });
});

describe("sessionListPath", () => {
  it("returns the role dashboard sessions tab, not the player", () => {
    expect(sessionListPath("teacher")).toBe("/teacher?tab=sessions");
    expect(sessionListPath("district")).toBe("/district?tab=sessions");
    expect(sessionListPath("student")).toBe("/student?tab=mysessions");
  });
});

describe("assignable roster and cohort resolution", () => {
  it("merges students collection rows with student-role users (stud1)", () => {
    const roster = buildAssignableRoster(
      [{ id: "stu1", name: "Pat", classId: "6A" }],
      [
        { username: "stud1", role: "student", profile: { grade: "6A" } },
        { username: "teach1", role: "teacher" },
      ]
    );
    expect(roster.students.map((s) => s.id).sort()).toEqual(["stu1", "stud1"]);
    expect(roster.cohorts).toEqual([
      { id: "6A", name: "Class 6A", studentIds: ["stu1", "stud1"] },
    ]);
  });

  it("resolves a typed student ID even when the roster is empty", () => {
    expect(resolveSessionAssignees({ studentId: "stud1" }, { students: [], cohorts: [] })).toEqual([
      "stud1",
    ]);
    expect(
      resolveSessionAssignees(
        { studentIds: ["stud1", "stu2"], cohortId: "6A" },
        {
          students: [{ id: "stu3", classId: "6A" }],
          cohorts: [{ id: "6A", studentIds: ["stu3"] }],
        }
      )
    ).toEqual(["stud1", "stu2", "stu3"]);
  });
});
