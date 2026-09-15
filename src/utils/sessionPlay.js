// src/utils/sessionPlay.js
//
// Role-prefixed player URLs, staff Play/Pause/Operate rules, and
// "this session is for this student" matching.
//
// Staff Play used to navigate into SessionPlayer (finish UI). Play/Pause
// are now list-level persist actions; Operate opens the player. Student
// examinees still Play into the player.
//
// Student discovery has an identity gap: sessions store `studentId` from
// the students collection (`stu…`) or a typed username (`stud1`), while
// the logged-in user is a `users` row. Matching covers username / user id
// / student name / studentIds[] / optional student.username. Unmatched
// students see an empty list, not every live session.
//
// Node ESM (server/index.js, Docker CMD) will not resolve a bare
// "./sessionStatus" — Vite/Vitest will. Always import with .js.
import {
  LIVE_SESSION_STATUSES,
  SESSION_STATUS,
  normalizeSessionStatus,
  RESERVED_SESSION_COLLECTION_IDS,
} from "./sessionStatus.js";

export const PLAYABLE_ROLES = Object.freeze(["student", "teacher", "district"]);

export function sessionPlayerPath(role, sessionId) {
  if (!sessionId || !PLAYABLE_ROLES.includes(role)) return null;
  return `/${role}/sessions/${sessionId}/player`;
}

// Staff open the review surface (mode=teacher). Students stay on /player.
export function sessionReviewPath(role, sessionId) {
  if (!sessionId || !PLAYABLE_ROLES.includes(role)) return null;
  if (role === "student") return sessionPlayerPath(role, sessionId);
  return `/${role}/sessions/${sessionId}/review`;
}

// Dashboard that hosts the sessions list (tab), not the player.
export function sessionListPath(role) {
  if (!role) return "/";
  if (role === "admin") return "/admin";
  if (role === "student") return "/student?tab=mysessions";
  if (role === "teacher" || role === "district") return `/${role}?tab=sessions`;
  return `/${role}`;
}

export function isReservedSessionCollectionId(id) {
  return RESERVED_SESSION_COLLECTION_IDS.includes(String(id || ""));
}

export function studentIdentityKeys(user, students = [], users = []) {
  const keys = new Set();
  if (!user) return keys;
  if (user.username) keys.add(String(user.username));
  if (user.id) keys.add(String(user.id));
  for (const s of students || []) {
    if (!s) continue;
    const linked =
      (user.username &&
        (s.username === user.username ||
          s.name === user.username ||
          s.userId === user.username ||
          s.id === user.username)) ||
      (user.id && (s.id === user.id || s.userId === user.id));
    if (linked && s.id) keys.add(String(s.id));
  }
  for (const u of users || []) {
    if (!u || u.role !== "student") continue;
    const sameUser =
      (user.username && u.username === user.username) ||
      (user.id && (u.id === user.id || u.username === user.id));
    if (!sameUser) continue;
    if (u.username) keys.add(String(u.username));
    if (u.id) keys.add(String(u.id));
  }
  return keys;
}

export function sessionAssigneeIds(session) {
  const ids = [];
  if (session?.studentId) ids.push(String(session.studentId));
  for (const id of session?.studentIds || []) {
    if (id != null && id !== "") ids.push(String(id));
  }
  return [...new Set(ids)];
}

export function sessionAssignedToStudent(session, user, students = [], users = []) {
  if (!user || !session) return false;
  const assignees = sessionAssigneeIds(session);
  if (assignees.length === 0) return false;
  const keys = studentIdentityKeys(user, students, users);
  return assignees.some((id) => keys.has(id));
}

function isInProgressStatus(status) {
  return normalizeSessionStatus(status) === SESSION_STATUS.IN_PROGRESS;
}

function isReadyStatus(status) {
  return normalizeSessionStatus(status) === SESSION_STATUS.READY;
}

function isPausedStatus(status) {
  return normalizeSessionStatus(status) === SESSION_STATUS.PAUSED;
}

export function isAttendableStatus(status) {
  const normalized = normalizeSessionStatus(status);
  return LIVE_SESSION_STATUSES.includes(status) ||
    LIVE_SESSION_STATUSES.includes(normalized) ||
    isInProgressStatus(status);
}

export function attendableSessionsForStudent(sessions, user, students = [], users = []) {
  const live = (sessions || []).filter((s) => isAttendableStatus(s?.status));
  return live.filter((s) => sessionAssignedToStudent(s, user, students, users));
}

// Staff (and any non-student role) may list or operate any session.
// A student may only see sessions assigned to them — an empty match is
// empty, not "every live session" (that fallback leaked other examinees).
export function sessionsVisibleToUser(sessions, user, students = [], users = []) {
  if (!user || user.role !== "student") return sessions || [];
  return (sessions || []).filter((s) =>
    sessionAssignedToStudent(s, user, students, users)
  );
}

export function studentForbiddenFromSession(session, user, students = [], users = []) {
  if (!user || user.role !== "student") return false;
  return !sessionAssignedToStudent(session, user, students, users);
}

function isClosedSession(session) {
  if (!session) return true;
  if (session.autoFinished || session.isCompleted) return true;
  const status = normalizeSessionStatus(session.status);
  return ["completed", "archived", "submitted", "reviewed"].includes(status);
}

// List Play — start or resume. Mutually exclusive with Pause.
export function canPlaySession(session, { reviewMode = false } = {}) {
  if (reviewMode || !session || isClosedSession(session)) return false;
  return isReadyStatus(session.status) || isPausedStatus(session.status);
}

// Student My Sessions: Start / continue into the player. Ready, paused,
// in_progress and reopened are startable; closed sessions are not.
export function canStartSession(session, { reviewMode = false } = {}) {
  if (reviewMode || !session || isClosedSession(session)) return false;
  const status = normalizeSessionStatus(session.status);
  return (
    isReadyStatus(status) ||
    isPausedStatus(status) ||
    isInProgressStatus(status) ||
    status === SESSION_STATUS.REOPENED
  );
}

export function isSessionClosedForStudent(session) {
  return isClosedSession(session);
}

export function canPauseSession(session, { reviewMode = false } = {}) {
  if (reviewMode || !session || isClosedSession(session)) return false;
  return isInProgressStatus(session.status) || session.status === SESSION_STATUS.REOPENED;
}

// Review (formerly Operate) opens the staff review player. Live sessions only.
export function canOperateSession(session, { reviewMode = false } = {}) {
  if (reviewMode || !session || isClosedSession(session)) return false;
  return isInProgressStatus(session.status) || session.status === SESSION_STATUS.REOPENED;
}

export const canReviewSession = canOperateSession;

// View a completed / submitted student session (read-only). Not archived.
export function canViewCompletedSession(session) {
  if (!session) return false;
  const status = normalizeSessionStatus(session.status);
  if (status === "archived") return false;
  return isClosedSession(session);
}

export function canViewSessionReport(session) {
  return canViewCompletedSession(session);
}

// Closed sessions assigned to this student (for Delivery → Reports).
export function closedSessionsForStudent(sessions, user, students = [], users = []) {
  return (sessions || []).filter(
    (s) =>
      sessionAssignedToStudent(s, user, students, users) &&
      isClosedSession(s) &&
      normalizeSessionStatus(s.status) !== "archived"
  );
}

export function buildAssignableRoster(students = [], users = []) {
  const byId = new Map();
  for (const s of students || []) {
    if (!s?.id) continue;
    byId.set(String(s.id), {
      id: String(s.id),
      name: s.name || s.id,
      username: s.username || null,
      classId: s.classId || s.class || null,
      source: "student",
    });
  }
  for (const u of users || []) {
    if (!u || (u.role && u.role !== "student")) continue;
    const id = String(u.id || u.username || "");
    if (!id) continue;
    const username = u.username ? String(u.username) : null;
    const existing = [...byId.values()].find(
      (row) =>
        row.id === id ||
        (username && (row.username === username || row.name === username || row.id === username))
    );
    if (existing) {
      if (username && !existing.username) existing.username = username;
      continue;
    }
    byId.set(id, {
      id,
      name: u.profile?.name || username || id,
      username,
      classId: u.profile?.classId || u.profile?.grade || null,
      source: "user",
    });
  }
  const list = [...byId.values()];
  const cohortMap = new Map();
  for (const row of list) {
    if (!row.classId) continue;
    const key = String(row.classId);
    if (!cohortMap.has(key)) {
      cohortMap.set(key, { id: key, name: `Class ${key}`, studentIds: [] });
    }
    cohortMap.get(key).studentIds.push(row.id);
  }
  return { students: list, cohorts: [...cohortMap.values()] };
}

export function resolveSessionAssignees(
  { studentId, studentIds, cohortId } = {},
  roster = { students: [], cohorts: [] }
) {
  const ids = new Set();
  if (studentId != null && String(studentId).trim()) {
    ids.add(String(studentId).trim());
  }
  for (const id of studentIds || []) {
    if (id != null && String(id).trim()) ids.add(String(id).trim());
  }
  if (cohortId) {
    const fromCohort = (roster.cohorts || []).find((c) => String(c.id) === String(cohortId));
    for (const id of fromCohort?.studentIds || []) ids.add(String(id));
    for (const s of roster.students || []) {
      if (String(s.classId) === String(cohortId)) ids.add(String(s.id));
    }
  }
  return [...ids];
}
