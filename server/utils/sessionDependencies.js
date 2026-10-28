// server/utils/sessionDependencies.js
// ------------------------------------------------------------
// Which sessions depend on a Task Model, and what it means to close one.
// ------------------------------------------------------------
// Used by the Task Model deactivation gate: a Task Model in delivery
// cannot be pulled out from under a session that is still running, and
// the Force Deactivate path needs one definition of "close" shared with
// the existing auto-finish sweep.
// ------------------------------------------------------------

import { SESSION_STATUS, LIVE_SESSION_STATUSES } from "../../src/utils/sessionStatus.js";
import { sessionsForDependencyCheck } from "../sessions/sessionRepository.js";

export { LIVE_SESSION_STATUSES };

/* A paused session counts as LIVE. Pausing is a break, not an ending --
   POST /api/sessions/:id/resume puts it straight back into delivery, so
   a Task Model pulled while a session is paused would break that session
   the moment the student came back. */
export function isLiveSession(session) {
  if (!session) return false;
  if (session.isCompleted) return false;

  const status = session.status || SESSION_STATUS.IN_PROGRESS;
  return LIVE_SESSION_STATUSES.includes(status);
}

/* ------------------------------------------------------------
 DEPENDENCY

 A session reaches a Task Model through its tasks:
   session.taskIds[] -> tasks[] -> task.taskModelId

 Responses are checked as a second path. A session whose task row has
 been deleted, or which recorded a response against an item bound to this
 Task Model, still depends on it -- and a dangling task reference is
 exactly the situation where the first path silently reports "no
 dependants" and lets the model be pulled.
------------------------------------------------------------ */
export function sessionsDependingOnTaskModel(taskModelId, db) {
  const tasks = db?.tasks || [];
  const items = db?.items || [];

  const taskIdsForModel = new Set(
    tasks.filter((t) => t?.taskModelId === taskModelId).map((t) => t.id)
  );

  const itemIdsForModel = new Set(
    items.filter((i) => i?.taskModelId === taskModelId).map((i) => i.id)
  );

  return sessionsForDependencyCheck(db).filter((session) => {
    if (!session) return false;

    const viaTasks = (session.taskIds || []).some((id) => taskIdsForModel.has(id));
    if (viaTasks) return true;

    return (session.responses || []).some(
      (r) => r && (itemIdsForModel.has(r.itemId) || taskIdsForModel.has(r.taskId))
    );
  });
}

export function liveSessionsForTaskModel(taskModelId, db) {
  return sessionsDependingOnTaskModel(taskModelId, db).filter(isLiveSession);
}

/* ------------------------------------------------------------
 DEPENDENCY -- ITEM

 The item-level equivalent, needed because an Item can now be suspended
 and archived from the UI. Suspending an item that a live session has
 already selected removes something the student is part-way through, so
 the same gate the Task Model has applies here, with the same escape
 hatch (POST /api/items/:id/lifecycle with { force: true }, admin only).

 A session reaches an item two ways:
   - it recorded a response against it (response.itemId)
   - the session's tasks instantiate the item's Task Model AND the item
     is currently deliverable, so the adaptive selector could still pick
     it on the next step

 The second path matters: an item not yet answered is still a candidate,
 and pulling it mid-session changes the form under the student.
------------------------------------------------------------ */
export function sessionsDependingOnItem(itemId, db) {
  const item = (db?.items || []).find((i) => i?.id === itemId);
  if (!item) return [];

  const tasks = db?.tasks || [];

  const taskIdsForModel = new Set(
    tasks.filter((t) => t?.taskModelId === item.taskModelId).map((t) => t.id)
  );

  return sessionsForDependencyCheck(db).filter((session) => {
    if (!session) return false;

    const answered = (session.responses || []).some((r) => r && r.itemId === itemId);
    if (answered) return true;

    return (session.taskIds || []).some((id) => taskIdsForModel.has(id));
  });
}

export function liveSessionsForItem(itemId, db) {
  return sessionsDependingOnItem(itemId, db).filter(isLiveSession);
}

/* ------------------------------------------------------------
 CLOSING A SESSION BY FORCE

 Same shape as the auto-finish sweep in server/utils/autoFinish.js, which
 is the other place a session is ended without the student submitting it:
 status "submitted", isCompleted, autoFinished, finishedAt, and every
 response locked.

 "submitted" rather than "completed" deliberately. src/utils/schema.js
 treats submitted | reviewed as the terminal states for its evidence
 integrity checks, so a force-closed session still validates and still
 reports. Responses are LOCKED, never deleted -- the student did the work,
 and whatever evidence was collected before the closure remains scorable.
------------------------------------------------------------ */
export function forceCloseSession(session, now, reason) {
  session.status = "submitted";
  session.isCompleted = true;
  session.autoFinished = true;
  session.finishedAt = now;
  session.updatedAt = now;

  session.closure = {
    closedAt: now,
    closedBy: "task-model-force-deactivate",
    reason: reason || "Task Model force-deactivated while this session was live.",
  };

  session.responses = (session.responses || []).map((r) => ({ ...r, locked: true }));

  return session;
}

/* Message shared by the refusal and the confirmation dialog, so the two
   cannot describe the same situation differently. */
export function liveSessionsBlockMessage(action, live) {
  return (
    `${action} is blocked: ${live.length} session${live.length === 1 ? " is" : "s are"} still live against this Task Model. ` +
    `Finish or archive ${live.length === 1 ? "it" : "them"} first, or use Force Deactivate to close ` +
    `${live.length === 1 ? "it" : "them all"} and deactivate in one step.`
  );
}
