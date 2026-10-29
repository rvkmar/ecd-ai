  // server/utils/autoFinish.js
  // Utility to auto-finish sessions whose deadlines have passed.
  
  import { loadDB, saveDB } from "../../src/utils/db-server.js";
  import { querySessions, replaceStoredSession, sessionsUseExternalStore } from "../sessions/sessionRepository.js";
  import { SESSION_STATUS } from "../../src/utils/sessionStatus.js";
  import { commitFinishedStudentModel } from "../studentModelRecords/studentModelRecordRepository.js";
  import {
    closeSessionAtDeadline,
    deliveryClockStarted,
    isPastDeliveryDeadline,
  } from "../delivery/deliveryAdministration.js";
  
  /**
   * Sweep through sessions and auto-finish those past their deadlines.
   *
   * A session whose delivery clock has started uses that effective deadline
   * and does not also close on session.endTime or a task endTime. Pause
   * freezes the clock: a paused session is not in this sweep, and a running
   * session is not due while pauseStartedAt is still before the deadline.
   * Before the delivery clock starts, and for every session with no stamp,
   * the older rule is unchanged:
   *   1. Prefer session.endTime if defined.
   *   2. Else, use the latest (max) endTime among tasks in the session.
   *
   * When auto-finishing:
   *   - status = "submitted"
   *   - isCompleted = true
   *   - autoFinished = true
   *   - finishedAt = now
   *   - responses[].locked = true
   *
   * Returns array of session IDs changed.
   */
  export async function autoFinishDueSessions() {
    const db = loadDB();
    const now = new Date();
  
    const changed = [];
    const sessions = sessionsUseExternalStore()
      ? await querySessions(db, { unscoped: true })
      : db.sessions || [];
  
    for (let session of sessions) {
      if (!session) continue;
  
      const clock = deliveryClockStarted(session);
      const legacyLive =
        !session.status ||
        session.status === SESSION_STATUS.IN_PROGRESS ||
        session.status === SESSION_STATUS.REOPENED;
      const deliveryLive =
        clock &&
        (legacyLive || session.status === SESSION_STATUS.READY);
      if (clock ? !deliveryLive : !legacyLive) continue;

      if (clock) {
        if (isPastDeliveryDeadline(session, now)) {
          closeSessionAtDeadline(session, now);
          await commitFinishedStudentModel(db, session, { now: session.finishedAt });
          if (sessionsUseExternalStore()) await replaceStoredSession(db, session);
          changed.push(session.id);
        }
        continue;
      }

      // Determine deadline
      let sessionDeadline = session.endTime ? new Date(session.endTime) : null;
  
      if (!sessionDeadline) {
        // fallback: compute from tasks
        const taskEndTimes = (session.taskIds || [])
          .map((tid) => (db.tasks || []).find((t) => t.id === tid))
          .filter(Boolean)
          .map((t) => (t.endTime ? new Date(t.endTime) : null))
          .filter(Boolean);
  
        if (taskEndTimes.length > 0) {
          sessionDeadline = new Date(
            Math.max.apply(
              null,
              taskEndTimes.map((d) => d.getTime())
            )
          );
        }
      }
  
      if (!sessionDeadline) continue;
  
      if (sessionDeadline.getTime() <= now.getTime()) {
        session.status = SESSION_STATUS.SUBMITTED;
        session.isCompleted = true;
        session.autoFinished = true;
        session.finishedAt = now.toISOString();
        session.updatedAt = now.toISOString();
  
        session.responses = session.responses || [];
        for (const r of session.responses) {
          r.locked = true;
          if (!r.submittedAt) {
            r.submittedAt = now.toISOString();
          }
        }
  
        await commitFinishedStudentModel(db, session, { now: session.finishedAt });
        if (sessionsUseExternalStore()) await replaceStoredSession(db, session);
        changed.push(session.id);
      }
    }
  
    if (changed.length > 0) {
      saveDB(db);
    }
  
    return changed;
  }
