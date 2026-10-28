import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs, submitRateLimiter } from "../utils/requestValidation.js";
import { loadDB, saveDB, finishSession, readRawDB } from "../../src/utils/db-server.js";
import {
  deleteStoredSession,
  getSessionById,
  insertStoredSessions,
  querySessions,
  replaceStoredSession,
} from "../sessions/sessionRepository.js";
import { canonicalSession } from "../sessions/sessionCanonical.js";
import {
  CATALOG_LIST_PROJECTION,
  RATING_QUEUE_PROJECTION,
} from "../sessions/sessionListProjection.js";
import { validateEntity } from "../../src/utils/schema.js";
import { SESSION_STATUS } from "../../src/utils/sessionStatus.js";
import {
  attendableSessionsForStudent,
  closedSessionsForStudent,
  buildAssignableRoster,
  isReservedSessionCollectionId,
  isSessionClosedForStudent,
  resolveSessionAssignees,
  sessionsVisibleToUser,
  studentForbiddenFromSession,
} from "../../src/utils/sessionPlay.js";
import { applyWizardTimingToSession } from "../../src/utils/sessionWizardTiming.js";
import { identifyEvidence, rescoreStoredItemResponses } from "../delivery/evidenceIdentification.js";
import {
  completeHumanEvaluation,
  pendingHumanRatingsFromSession,
  EVALUATION_STATUS,
} from "../delivery/evaluationPhases.js";
import {
  blindedRatingQueueFromSessions,
  blindedQueueRow,
  rubricForPendingPhase,
} from "../delivery/raterQueue.js";
import {
  accumulateEvidence,
  applyPosteriorsToSession,
  refreshBayesianNetworkPosteriors,
} from "../delivery/evidenceAccumulation.js";
import { bayesianObservableError, BAYESIAN_NETWORK_FAMILY } from "../delivery/bayesianNetwork.js";
import {
  chooseSubmitParameterBinding,
  frozenScoringContext,
} from "../delivery/parameterSourceResolution.js";
import { resolveAssemblyProgress } from "../delivery/assemblyProgress.js";
import { logger } from "../utils/logger.js";
import { recordSubmitOutcome } from "../utils/submitStats.js";
// D56: Activity Selection. /next-task's whole strategy block used to live
// inline below; it now lives in one module that reads the composite library
// and the live posteriors instead of db.questions. See that file's header.
import { selectNextActivity, resolveAssemblyModelForSession, selectionPolicyForDelivery, taskIsInSessionDelivery, noteDeliveredTask } from "../delivery/activitySelection.js";
import { persistableAssemblyProgress } from "../delivery/assemblyConstraints.js";
import {
  commitFinishedSession,
  seedSessionStudentModel,
} from "../../src/utils/studentModelRecord.js";
import {
  selectPresentationModelIdForTaskModel,
  resolvePresentationModel,
} from "../delivery/presentationModelResolution.js";
import * as presentationResolution from "../delivery/presentationModelResolution.js";
import {
  beginPause,
  closeSessionAtDeadline,
  computeEffectiveDeadline,
  deliveryTimingView,
  endPause,
  ensureClockStarted,
  evaluateAttempt,
  isPastDeliveryDeadline,
  placeAttempt,
  presentSession,
  stampDeliveryAdministration,
} from "../delivery/deliveryAdministration.js";
import { activePackageFor } from "../compositeLibrary/activePackage.js";
import { recordItemUsage } from "../utils/itemExposure.js";
// D49b: `import { log2 } from "mathjs"` stood here and was NEVER CALLED --
// entropy() below has always used the native Math.log2. It was mathjs's only
// reference anywhere in src/ or server/, so the whole dependency was dead
// weight, and two test files carried widened timeouts specifically to absorb
// its cold-import cost (sessionRoutes.test.js, routeAuth.test.js). An unused
// import was buying real test flakiness. Removed.

// Day 28 (Week 6): a session scores through an authored Evidence Model,
// via server/delivery/evidenceIdentification.js, when the client opts in
// by sending `itemId` instead of `questionId` on /submit. The legacy
// db.questions path below this flag is completely UNCHANGED -- this is a
// rollback lever, not a migration switch: SessionPlayer.jsx does not send
// `itemId` yet (a separate, later task), so this defaults to true with
// zero effect on real traffic today, and can be forced off in production
// if the new path misbehaves, for one release, per the plan.
const ITEM_DELIVERY_ENABLED = process.env.ITEM_DELIVERY_ENABLED !== "false";

// D56: `entropy()` stood here and served only the BayesianNetwork branch of
// /next-task. That branch now lives in delivery/activitySelection.js, and
// the helper moved with it rather than being left behind as a second
// definition nothing calls.

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// Most routes below are open to any authenticated role for their own
// work. A student may not read or mutate another examinee's session
// (D72). DELETE remains admin-only.
const adminOnly = authorizeRole(["admin"]);

function rejectUnassignedStudent(req, res, session, db) {
  if (
    studentForbiddenFromSession(
      session,
      req.user,
      db.students || [],
      db.users || []
    )
  ) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

function storeAssemblyProgress(session, db, smvProgress) {
  const resolution = resolveAssemblyModelForSession(session, db);
  if (!resolution?.assemblyModel) return;
  session.assemblyProgress = persistableAssemblyProgress(
    session,
    resolution.assemblyModel,
    db,
    smvProgress
  );
}

async function persistSession(db, session) {
  await replaceStoredSession(db, session);
  saveDB(db);
}

function sessionView(session, user) {
  return presentSession(session, user);
}

function timeLimitBody(session) {
  return {
    error: "Time limit reached.",
    code: "time_limit",
    autoFinished: true,
    status: session.status,
    deliveryTiming: deliveryTimingView(session),
  };
}

async function closeForTimeLimit(db, session, now = new Date()) {
  if (!session || !isPastDeliveryDeadline(session, now)) return false;
  closeSessionAtDeadline(session, now);
  commitFinishedSession(db, session, { now: session.finishedAt });
  await persistSession(db, session);
  return true;
}

function beginDeliveryClock(session, now = new Date()) {
  const started = ensureClockStarted(session, now);
  if (started && session.status === SESSION_STATUS.READY) {
    session.status = SESSION_STATUS.IN_PROGRESS;
  }
  return started;
}

/**
 * Same contract as presentationTimeMultiplier on the R3 branch. That export
 * is not on main yet. When it is, this calls it. Until then the body below
 * is the same rule: a factor in [1, 3], or 1 when the model or the field
 * is missing. The deadline helper multiplies by this factor once.
 */
function presentationTimeMultiplier(source) {
  const exported = presentationResolution.presentationTimeMultiplier;
  if (typeof exported === "function") return exported(source);
  const raw =
    source?.timeMultiplier ??
    source?.accessibility?.timeMultiplier ??
    source?.overlay?.timeMultiplier ??
    source?.overlay?.accessibility?.timeMultiplier;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 3) return raw;
  return 1;
}

/**
 * Presentation inputs for the create-time stamp.
 * A delivery-model presentationModelId that still resolves is the only
 * input. Otherwise each task's linkable presentation model is included.
 * The stamp takes the largest timeMultiplier and the stricter allowReview.
 */
function presentationInputsForSession(db, deliveryModel, taskIds) {
  const inputs = [];
  const overrideId = typeof deliveryModel?.presentationModelId === "string"
    ? deliveryModel.presentationModelId
    : "";
  if (overrideId) {
    const resolved = resolvePresentationModel(db, { presentationModelId: overrideId });
    if (resolved.ok) {
      inputs.push({
        source: "override",
        id: resolved.presentationModelId,
        timeMultiplier: presentationTimeMultiplier(resolved.overlay),
        allowReview: resolved.overlay?.conditionalDisplay?.allowReview,
      });
      return inputs;
    }
  }
  for (const taskId of taskIds || []) {
    const task = (db?.tasks || []).find((row) => row && row.id === taskId);
    if (!task?.taskModelId) continue;
    const taskModel = (db?.taskModels || []).find((row) => row && row.id === task.taskModelId);
    const taskModelVersion = typeof taskModel?.versionNumber === "number" ? taskModel.versionNumber : null;
    const pkg = activePackageFor(task.taskModelId, db);
    const liveId = taskModelVersion != null
      ? selectPresentationModelIdForTaskModel(db, task.taskModelId, taskModelVersion)
      : null;
    const resolved = resolvePresentationModel(db, {
      presentationModelId: liveId || pkg?.presentationModelId || null,
      taskModelId: task.taskModelId,
      taskModelVersion: taskModelVersion ?? pkg?.taskModelVersion ?? null,
    });
    if (!resolved.ok) continue;
    inputs.push({
      source: "task",
      id: resolved.presentationModelId,
      timeMultiplier: presentationTimeMultiplier(resolved.overlay),
      allowReview: resolved.overlay?.conditionalDisplay?.allowReview,
    });
  }
  return inputs;
}

function stampSessionAdministration(db, session, deliveryModel, taskIds) {
  if (!deliveryModel) return;
  let contentDb = db;
  try {
    contentDb = readRawDB() || db;
  } catch {
    contentDb = db;
  }
  const stamped = stampDeliveryAdministration({
    administration: deliveryModel.administration,
    presentations: presentationInputsForSession(contentDb, deliveryModel, taskIds),
  });
  if (!stamped) return;
  session.deliveryAdministration = stamped;
  const ceiling = {};
  if (typeof stamped.reviewAllowed === "boolean") ceiling.allowedReview = stamped.reviewAllowed;
  if (stamped.feedbackMode) ceiling.feedbackMode = stamped.feedbackMode;
  if (Object.keys(ceiling).length) session.administration = ceiling;
  // Fold the presentation factor in once, from the create timestamp.
  // endTime is that deadline. The player reads endTime and does not scale it.
  if (stamped.timeLimitMinutes) {
    stamped.clockStartedAt = session.startedAt;
    const computed = computeEffectiveDeadline(stamped);
    stamped.effectiveDeadline = computed.effectiveDeadline;
    if (computed.effectiveDeadline) session.endTime = computed.effectiveDeadline;
  }
}

// ------------------------------
// POST /api/sessions
// ------------------------------
// body: { taskIds, studentId?, studentIds?, cohortId?, selectionStrategy?, nextTaskPolicy?, deliveryModelId? }
// One session per assignee so each examinee has their own responses.
// Status starts as `ready`. Staff Play persists `in_progress`.
// deliveryModelId, when set, reaches an assembly model. If that assembly
// model declares a selection policy, that policy is stored. An explicit
// selectionStrategy or nextTaskPolicy.policyId that disagrees is rejected.
// If the assembly model does not declare a usable policy, the delivery
// model's own policy is stored and the body is not consulted.
router.post("/", async (req, res) => {
  const { taskIds, studentId, studentIds, cohortId, selectionStrategy, nextTaskPolicy, deliveryModelId } = req.body;
  const db = loadDB();
  // A brand-new store has no collections yet. Reading them as arrays is
  // what lets the first session save instead of throwing on `.find`.
  for (const key of ["tasks", "sessions", "policies", "students", "users"]) {
    if (!Array.isArray(db[key])) db[key] = [];
  }

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ error: "taskIds must be a non-empty array" });
  }

  // Ensure tasks exist
  for (const tid of taskIds) {
    if (!db.tasks.find(t => t.id === tid)) {
      return res.status(400).json({ error: `Invalid taskId: ${tid}` });
    }
  }

  const roster = buildAssignableRoster(db.students || [], db.users || []);
  const assignees = resolveSessionAssignees(
    { studentId, studentIds, cohortId },
    roster
  );
  if (assignees.length === 0) {
    return res.status(400).json({
      error: "Select a student, enter a student ID, or choose a cohort",
    });
  }

  // Fixed Order is a selection policy (type "fixed"), the same record
  // authored under Home, Selection policies. When several policies
  // share the strategy, the session must name one. A single match is
  // the bootstrap for a store that has not been asked to choose yet.
  // A delivery model replaces that choice when its assembly model
  // declares a policy. Otherwise the delivery model's own policy is used.
  let strategy = selectionStrategy || "fixed";
  let policyConfig = nextTaskPolicy || {};
  let boundDeliveryModelId = null;
  const availablePolicies = db.policies || [];

  if (deliveryModelId) {
    const deliveryModel = (db.deliveryModels || []).find((row) => row && row.id === deliveryModelId);
    if (!deliveryModel) {
      return res.status(400).json({
        error: `Invalid deliveryModelId: ${deliveryModelId}`,
      });
    }
    const resolved = selectionPolicyForDelivery(deliveryModel, db);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }
    if (resolved.source === "assemblyModel") {
      const explicitStrategy =
        typeof selectionStrategy === "string" && selectionStrategy !== "" ? selectionStrategy : null;
      const explicitPolicyId =
        nextTaskPolicy && typeof nextTaskPolicy.policyId === "string" && nextTaskPolicy.policyId !== ""
          ? nextTaskPolicy.policyId
          : null;
      if (explicitStrategy && explicitStrategy !== resolved.policy.type) {
        return res.status(400).json({
          error: `Session selectionStrategy '${explicitStrategy}' does not match Assembly Model '${resolved.assemblyModel.id}' policy '${resolved.policy.id}' (type '${resolved.policy.type}'). That assembly model policy is the selection policy for delivery model '${deliveryModel.id}'. Omit selectionStrategy, or send '${resolved.policy.type}'.`,
        });
      }
      if (explicitPolicyId && explicitPolicyId !== resolved.policy.id) {
        return res.status(400).json({
          error: `nextTaskPolicy.policyId '${explicitPolicyId}' does not match Assembly Model '${resolved.assemblyModel.id}' policy '${resolved.policy.id}'. That assembly model policy is the selection policy for delivery model '${deliveryModel.id}'.`,
        });
      }
    }
    strategy = resolved.policy.type;
    policyConfig = { policyId: resolved.policy.id };
    boundDeliveryModelId = deliveryModel.id;
  } else {
    const ofType = availablePolicies.filter((p) => p.type === strategy);

    if (policyConfig.policyId) {
      const chosen = availablePolicies.find((p) => p.id === policyConfig.policyId);
      if (!chosen) {
        return res.status(400).json({
          error: `Invalid nextTaskPolicy.policyId: ${policyConfig.policyId}. Not found in /api/policies`,
        });
      }
      if (chosen.type !== strategy) {
        return res.status(400).json({
          error: `Policy '${chosen.id}' is type '${chosen.type}', which does not match selectionStrategy '${strategy}'.`,
        });
      }
      policyConfig = { policyId: chosen.id };
    } else if (ofType.length === 1) {
      policyConfig = { policyId: ofType[0].id };
    } else if (ofType.length === 0) {
      return res.status(400).json({
        error: `Invalid selectionStrategy: ${strategy}. No matching policy found in /api/policies`,
      });
    } else {
      return res.status(400).json({
        error: `Choose a ${strategy} policy. More than one is available.`,
      });
    }
  }

  const now = new Date().toISOString();
  const base = Date.now();
  const assignmentGroupId = assignees.length > 1 ? `ag${base}` : null;
  const created = [];

  for (let i = 0; i < assignees.length; i++) {
    const assignee = assignees[i];
    const newSession = {
      id: `s${base}${i === 0 ? "" : `-${i}`}`,
      studentId: assignee,
      studentIds: [assignee],
      assignmentGroupId,
      cohortId: cohortId || null,
      taskIds,
      currentTaskIndex: 0,
      responses: [],

      // Adaptive state
      studentModel: {},
      selectionStrategy: strategy,
      nextTaskPolicy: policyConfig,
      ...(boundDeliveryModelId ? { deliveryModelId: boundDeliveryModelId } : {}),

      // Lifecycle — ready until staff Play. Creating as in_progress made
      // the list show Play and Pause together and sent Play into the
      // finish/player surface.
      status: SESSION_STATUS.READY,
      isCompleted: false,
      startedAt: now,
      updatedAt: now,
    };

    // Carry-forward is off unless the delivery model's administration
    // says so, or the request sets carryForward. Legacy creates stay empty.
    seedSessionStudentModel(newSession, db, {
      carryForward: req.body.carryForward === true,
      now,
    });

    if (boundDeliveryModelId) {
      const cited = (db.deliveryModels || []).find((row) => row && row.id === boundDeliveryModelId);
      stampSessionAdministration(db, newSession, cited, taskIds);
    }

    const { valid, errors } = validateEntity("sessions", newSession, db);
    if (!valid) {
      return res.status(400).json({ error: "Schema validation failed", details: errors });
    }
    created.push(newSession);
  }

  await insertStoredSessions(db, created);
  saveDB(db);

  if (created.length === 1) {
    return res.status(201).json(sessionView(created[0], req.user));
  }
  res.status(201).json({
    assignmentGroupId,
    sessions: created.map((row) => sessionView(row, req.user)),
  });
});


// ------------------------------
// GET /api/sessions
// ------------------------------
router.get("/", async (req, res) => {
  const db = loadDB();
  const sessions = await querySessions(db, {}, { projection: CATALOG_LIST_PROJECTION });
  const visible = sessionsVisibleToUser(sessions, req.user, db.students || [], db.users || []);
  res.json(visible.map((row) => sessionView(row, req.user)));
});

// ------------------------------
// GET /api/sessions/active
// ------------------------------
router.get("/active", async (req, res) => {
  const db = loadDB();
  const active = await querySessions(db, { statusNe: "archived" }, { projection: CATALOG_LIST_PROJECTION });
  const visible = sessionsVisibleToUser(active, req.user, db.students || [], db.users || []);
  res.json(visible.map((row) => sessionView(row, req.user)));
});

// ------------------------------
// GET /api/sessions/archived
// ------------------------------
router.get("/archived", async (req, res) => {
  const db = loadDB();
  const archived = await querySessions(db, { status: "archived" }, { projection: CATALOG_LIST_PROJECTION });
  const visible = sessionsVisibleToUser(archived, req.user, db.students || [], db.users || []);
  res.json(visible.map((row) => sessionView(row, req.user)));
});

// ------------------------------
// GET /api/sessions/mine
// ------------------------------
// Student discovery. Staff already have /active; students had no UI and
// no filtered list. Must be registered before /:id so "mine" is not
// treated as a session id.
router.get("/mine", async (req, res) => {
  try {
    const db = loadDB();
    const sessions = await querySessions(db, {}, { projection: CATALOG_LIST_PROJECTION });
    const students = db.students || [];
    const users = db.users || [];
    const user = req.user || {};
    if (user.role === "student") {
      if (String(req.query.scope || "") === "history") {
        return res.json(
          closedSessionsForStudent(sessions, user, students, users).map((row) => sessionView(row, user))
        );
      }
      return res.json(
        attendableSessionsForStudent(sessions, user, students, users).map((row) => sessionView(row, user))
      );
    }
    const live = sessions.filter((s) => s.status !== "archived");
    return res.json(live.map((row) => sessionView(row, user)));
  } catch (err) {
    // A thrown /mine must not become GET /:id's 404. Empty list is honest.
    console.error("GET /api/sessions/mine failed:", err);
    return res.json([]);
  }
});

// ------------------------------
// GET /api/sessions/rating-queue
// ------------------------------
// D124: blinded pending-human / adjudication queue for staff raters.
// Must be registered before /:id. Tenant scope comes from loadDB.
const staffRater = authorizeRole(["admin", "district", "teacher"]);
router.get("/rating-queue", staffRater, async (req, res) => {
  const db = loadDB();
  const sessions = await querySessions(db, { pendingRating: true }, { projection: RATING_QUEUE_PROJECTION });
  const queue = blindedRatingQueueFromSessions(sessions);
  return res.json({ items: queue });
});

// ------------------------------
// GET /api/sessions/:id
// ------------------------------
// Re-apply identification to stored responses that were saved unscored.
// Admin only. Does not accept new answers.
router.post("/rescore-responses", authorizeRole(["admin"]), async (req, res) => {
  const db = loadDB();
  const sessions = await querySessions(db, { unscoped: true });
  const before = new Map(sessions.map((row) => [row.id, canonicalSession(row)]));
  db.sessions = sessions;
  const updated = rescoreStoredItemResponses(db);
  if (updated > 0) {
    for (const session of db.sessions) {
      if (canonicalSession(session) !== before.get(session.id)) {
        await replaceStoredSession(db, session);
      }
    }
    saveDB(db);
  }
  res.json({ updated });
});

router.get("/:id", async (req, res) => {
  // Belt-and-suspenders: if /mine (or /active, /archived) is not registered
  // — native ESM miss, stale process — do not treat the collection name as
  // a session id. "Session not found" is what My Sessions displayed.
  if (isReservedSessionCollectionId(req.params.id)) {
    return res.json([]);
  }
  const db = loadDB();
  const session = await getSessionById(db, req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;
  const closed = session.isCompleted === true || ["completed", "submitted", "reviewed", "archived"].includes(session.status);
  if (!closed) await closeForTimeLimit(db, session);
  // D123: honest pending-human reporting — never present provisional as final.
  const pendingHumanRatings = pendingHumanRatingsFromSession(session);
  const payload = pendingHumanRatings.length > 0
    ? { ...session, pendingHumanRatings }
    : session;
  res.json(sessionView(payload, req.user));
});

// ------------------------------
// POST /api/sessions/:id/submit
// ------------------------------
// body: { taskId, questionId?, itemId?, rawAnswer, observationId?, scoredValue?, evidenceId?, rubricLevel? }
router.post("/:id/submit", submitRateLimiter, async (req, res) => {
  const { id } = req.params;
  const { taskId, questionId, itemId, rawAnswer, observationId, scoredValue, evidenceId, rubricLevel } = req.body;

  logger.info("session.submit.start", {
    sessionId: id,
    taskId: taskId || null,
    itemId: itemId || null,
    questionId: questionId || null,
  });

  res.on("finish", () => {
    recordSubmitOutcome(res.statusCode < 400);
  });

  const db = loadDB();
  const loadedSession = await getSessionById(db, id);
  const session = loadedSession && !loadedSession.isCompleted ? loadedSession : null;
  if (!session) return res.status(404).json({ error: "Session not found or already completed" });
  if (rejectUnassignedStudent(req, res, session, db)) return;

  if (await closeForTimeLimit(db, session)) {
    return res.status(409).json(timeLimitBody(session));
  }
  if (
    session.deliveryAdministration?.timeLimitMinutes > 0 &&
    (session.status === SESSION_STATUS.PAUSED || session.deliveryAdministration.pauseStartedAt)
  ) {
    return res.status(409).json({ error: "Session is paused.", code: "session_paused" });
  }

  // D60: a persisted stop is the authority that nothing more will be
  // presented. Accepting another response after that would keep updating
  // posteriors (and the report classification) while next-task still
  // returns the frozen stop record -- two sources of truth.
  if (session.stopped && typeof session.stopped === "object" && !Array.isArray(session.stopped)) {
    return res.status(409).json({
      error: "Session has already met a stopping rule; no further responses are accepted.",
      stopped: session.stopped,
    });
  }

  if (!taskIsInSessionDelivery(session, db, taskId)) {
    return res.status(400).json({ error: `Task ${taskId} not part of this session` });
  }

  const task = db.tasks.find(t => t.id === taskId);

  // 🔹 Day 28: item-based delivery, scoring through an authored Evidence
  // Model via identifyEvidence() -- an Observable Variable value, not a
  // score. Opt in per-request with `itemId` instead of `questionId`;
  // everything below this block (the legacy db.questions path) is
  // untouched and still runs exactly as before for a `questionId` request.
  // Deliberately narrow: only /submit is wired today (the exit check is
  // about scoring). /next-task's item-based selection is a separate,
  // larger Activity Selection undertaking, not attempted here.
  if (ITEM_DELIVERY_ENABLED && itemId) {
    const item = db.items?.find(it => it.id === itemId);
    if (!item) {
      return res.status(400).json({ error: `Invalid itemId: ${itemId}` });
    }

    // Day 30 (adversarial review finding): the legacy path below validates
    // that a submitted observation/evidence belongs to the task's own
    // Task Model; this block had dropped that check entirely -- any item
    // could be submitted against any task in the session, attributing its
    // evidence to the wrong Task Model instance with no error at all.
    if (!task) {
      return res.status(400).json({ error: `Task ${taskId} has no task instance record.` });
    }
    if (item.taskModelId !== task.taskModelId) {
      return res.status(400).json({
        error: `Item '${itemId}' belongs to Task Model '${item.taskModelId}', not this task's '${task.taskModelId}'.`,
      });
    }

    // Day 30 (adversarial review finding): an item already suspended
    // (auto-retired for exceeding its exposure ceiling) or archived kept
    // being delivered and scored through this path with no check at all --
    // defeating the entire point of the ceiling recordItemUsage() enforces.
    // A draft/reviewed/confirmed item is still deliberately deliverable
    // here (Day 29's own preview/test-delivery design: it scores correctly,
    // it just accrues no exposure) -- only a status that means "this item
    // has been deliberately pulled from service" is refused.
    if (["suspended", "archived"].includes(item.status)) {
      return res.status(409).json({ error: `Item '${itemId}' is '${item.status}' and cannot be delivered.` });
    }

    // Day 30 (adversarial review finding): resubmitting the same taskId
    // (a client retry, a double-click) used to silently duplicate the
    // response, double-count exposure, and over-advance currentTaskIndex
    // past a task that was never actually reached -- a session-ending bug
    // for the `fixed` strategy, which is purely index-driven. Refused
    // outright rather than silently accepted twice.
    // A stamped delivery administration can allow a later attempt when
    // review is on and the attempt cap is not used up. That replaces the
    // stored response. With no stamp, the refusal below is unchanged.
    const decision = evaluateAttempt(session, taskId);
    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.error, code: decision.code });
    }
    if (decision.action === "legacy") {
      return res.status(409).json({ error: `Task ${taskId} already has a recorded response for this session.` });
    }

    // src/utils/schema.js's `collection === "sessions"` validation (a
    // pre-existing contract this route never previously had a caller for)
    // requires every response, once a session is live, to carry calibration
    // provenance: which Evidence Model + version, and -- for a CALIBRATED
    // response -- which calibrated parameterSet was active when the
    // response was scored -- a pointer, never a cached parameter value,
    // matching ADR 0003's "resolve live" boundary.
    //
    // Day 38 (Week 8): before this day, an Evidence Model with no active
    // calibrated parameterSet yet genuinely could not deliver, full stop --
    // which made the build reference's own dependency chain (Part 0.2)
    // circular: R calibration needs a real item-level response matrix,
    // that matrix needs items to be deliverable, and items could not be
    // delivered until calibration had already happened. The fix is the
    // PILOT-VS-CALIBRATED split the build reference names as the way out:
    // a continuous (IRT/Rasch) item falls back to the Item Wizard's own
    // pilot `psychometrics.irtParams` (Step 7) when no calibrated set
    // exists, and a raw-score item (CTT/sum/threshold) never needed
    // calibrated numbers to begin with -- `accumulateRawScoreFamily` in
    // evidenceAccumulation.js has never read a parameterSet, only Task
    // Model weights. D53b gave 'dina' the same fallback via a new
    // `psychometrics.dinaParams` field (slip/guess, the DINA analogue of
    // `irtParams`) -- see the branch below. 'gdina' still has none: a
    // saturated probability table sized to each item's own required-
    // attribute count is real new authoring surface D53b did not build,
    // so a 'gdina' item with no calibrated parameter set is still refused
    // outright rather than given an invented fallback.
    // `CONTINUOUS_MODEL_FAMILIES` / `RAW_SCORE_MODEL_FAMILIES` are
    // imported from evidenceAccumulation.js rather than re-listed here, so
    // this gate and that file's own dispatch can never drift apart.
    const evidenceModelRecord = db.evidenceModels?.find(em => em.id === item.evidenceModelId);

    if (!evidenceModelRecord) {
      return res.status(400).json({ error: `Item '${itemId}' references unknown evidenceModelId '${item.evidenceModelId}'.` });
    }

    const activeStatModel = evidenceModelRecord.statisticalModels?.find(sm => sm.active);

    if (!activeStatModel) {
      return res.status(400).json({
        error: `Evidence model '${item.evidenceModelId}' has no active statistical model; item '${itemId}' cannot be scored through it.`,
      });
    }

    const family = activeStatModel.type;
    const calibratedParameterSetId = activeStatModel.activeParameterSetId || null;

    // D68: freeze to the opening source for this Evidence Model on THIS
    // session. A live calibrated set must not retag an in-flight pilot
    // session (that mixed-source group is refused by accumulation). A
    // later activeParameterSetId must not retag an in-flight calibrated
    // session onto a second set (same refusal, mixed parameterSetIds).
    // New sessions still prefer calibrated over Step 7 / dinaParams pilot.
    // Day 39 (P0-3) still applies: pilot numbers are snapshotted onto the
    // response; calibrated numbers are a pointer to the frozen set.
    const freeze = frozenScoringContext(session, item.evidenceModelId);
    const binding = chooseSubmitParameterBinding({
      family,
      calibratedParameterSetId,
      item,
      freeze,
      statisticalModel: activeStatModel,
      evidenceModel: evidenceModelRecord,
      db,
    });

    if (binding.error) {
      const status = freeze.error ? 409 : 400;
      return res.status(status).json({ error: binding.error });
    }

    const { parameterSource, parameterSetId, pilotParams } = binding;

    // Day 30 (adversarial review finding): observationId is only required
    // under strict/confirm-time validation (src/utils/schema.js), so a
    // draft item with none would reach identifyEvidence() and hit its
    // "requires an item with an observationId" throw -- a data-quality
    // problem surfacing as an uncaught 500, not the clear 4xx every other
    // malformed-reference case in this block gets.
    if (!item.observationId) {
      return res.status(400).json({ error: `Item '${itemId}' has no observationId; it cannot be scored.` });
    }

    // A structured work product is passed through as-is; a bare scalar
    // (the common case -- an option id, a numeric value) is wrapped into
    // the `{ selected: ... }` shape identifyEvidence's matching expects,
    // matching the repo's own worked example (samples/sample-items.json).
    // An ARRAY is also "not yet structured" for this purpose (Day 30
    // finding): `typeof [] === "object"` made a multi-select rawAnswer like
    // `["opt_a","opt_b"]` pass through unwrapped, so identifyEvidence tried
    // to match pattern keys against numeric array indices and never
    // matched anything real.
    const workProduct =
      rawAnswer && typeof rawAnswer === "object" && !Array.isArray(rawAnswer)
        ? rawAnswer
        : { selected: rawAnswer };

    // D49c: Identification reads structural facts from the active
    // compositeLibrary package (ADR 0003a). A missing / inactive / stale
    // package is a 409, not a recorded null identification -- that would
    // look like "matched no pattern" and quietly drop the response.
    const evidence = identifyEvidence(workProduct, item, db, { taskModelId: task.taskModelId });
    if (evidence.refused) {
      return res.status(409).json({ error: evidence.error });
    }

    if (family === BAYESIAN_NETWORK_FAMILY) {
      const networkError = bayesianObservableError({
        statisticalModel: activeStatModel,
        observableId: evidence.observableId,
        parameterSource,
        parameterSetId,
        pilotParams,
      });
      if (networkError) return res.status(400).json({ error: networkError });
    }

    const response = {
      taskId,
      itemId,
      itemVersion: item.versionNumber,
      taskModelVersion: item.taskModelVersion,
      evidenceModelId: item.evidenceModelId,
      evidenceModelVersion: evidenceModelRecord.versionNumber,
      parameterSetId,
      parameterSource,
      // Only present for parameterSource "pilot" -- the snapshot pin, see
      // the comment above this block.
      ...(pilotParams ? { pilotParams } : {}),
      rawAnswer: rawAnswer ?? null,
      observationId: evidence.observationId,
      observableId: evidence.observableId,
      // D123: when phases need human, activated stays null until rating;
      // provisionalActivated is never the final OV.
      activated: evidence.activated,
      direction: evidence.direction,
      strength: evidence.strength,
      rationale: evidence.rationale,
      evaluationStatus: evidence.evaluationStatus ?? EVALUATION_STATUS.COMPLETE,
      timestamp: new Date().toISOString(),
    };
    if (evidence.warning) response.warning = evidence.warning;
    if (evidence.evaluationStatus === EVALUATION_STATUS.PENDING_HUMAN) {
      response.provisionalActivated = evidence.provisionalActivated ?? null;
      response.provisionalStrength = evidence.provisionalStrength ?? null;
      response.pendingPhase = evidence.pendingPhase ?? null;
      response.automatedPhaseResult = evidence.automatedPhaseResult ?? null;
      response.evaluationProcedureId = evidence.evaluationProcedureId ?? null;
    }

    logger.info("session.submit.scored", {
      sessionId: id,
      taskId,
      itemId,
      observationId: evidence.observationId,
      observableId: evidence.observableId,
      parameterSource,
    });

    beginDeliveryClock(session);
    const placed = placeAttempt(session, taskId, response, decision);
    if (placed === "append") {
      session.currentTaskIndex = Math.min(session.currentTaskIndex + 1, session.taskIds.length);
      noteDeliveredTask(session, taskId);
    }
    session.updatedAt = new Date().toISOString();

    // Day 30: defensive -- a task instance record predating this field, or
    // authored by hand, should not crash delivery over a missing array.
    if (!Array.isArray(task.generatedObservationIds)) {
      task.generatedObservationIds = [];
    }
    if (evidence.observationId && !task.generatedObservationIds.includes(evidence.observationId)) {
      task.generatedObservationIds.push(evidence.observationId);
    }
    task.updatedAt = new Date().toISOString();

    // Day 29: this is the seam server/utils/itemExposure.js's own header
    // comment names -- the moment an item is actually delivered to a
    // student, not the record-usage HTTP route (author-gated, and until
    // today had no caller at all). A no-op for a non-operational item
    // (e.g. delivered in a preview/test context) is not an error here;
    // only a truly operational item accrues real exposure. Day 30
    // (adversarial review finding): the failure case used to be silently
    // swallowed with no `else` branch at all, so an operational item that
    // merely failed strict re-validation (e.g. missing a field required
    // only once `status` reaches "operational") accrued no exposure with
    // zero indication anywhere in the response -- undermining the very
    // "real measurements, not permanent zeros" claim this day exists to
    // make. Surfaced as a response field; never blocks the score itself,
    // since a scoring failure and an exposure-bookkeeping failure are
    // different severities and the student's response is valid either way.
    if (placed !== "replace") {
      const itemIndex = db.items.findIndex(it => it.id === itemId);
      const usageResult = recordItemUsage(item, db, {});
      if (usageResult.ok) {
        db.items[itemIndex] = usageResult.item;
      } else {
        response.exposureNote = usageResult.error;
      }
    }

    // Day 34 (Week 7): Evidence Accumulation, run immediately after the
    // response above is scored and pushed. accumulateEvidence() re-derives
    // its posterior from session.responses (already updated) on every
    // call -- there is no incremental state to corrupt, so re-running it
    // over the whole history each submit is the same amount of work as
    // "just this response" would be, and is simpler and more obviously
    // correct than trying to update a posterior in place.
    //
    // Wrapped defensively: by this point the student's response has
    // already been validly scored and exposure-recorded above. A defect
    // in accumulation -- a module explicitly built to REFUSE rather than
    // guess, so a thrown error here should mean a genuine bug, not a
    // plausible data situation -- must never roll back or block a response
    // that already happened. Mirrors recordItemUsage's exposureNote
    // pattern immediately above: a bookkeeping failure is surfaced, not
    // allowed to fail the request.
    let assemblyProgress = [];
    // Day 39 (adversarial review, P1-5): accumulateEvidence() returns
    // `{ posteriors, warnings }` -- `warnings` is how the module reports
    // every response it had to EXCLUDE from a posterior it otherwise
    // computed (an uncalibrated observable, unusable IRT parameters, an
    // unrecognised evidence-rule direction, a missing pilot snapshot...).
    // Those are exactly the "silent data problem" cases the module's own
    // design doc calls out as unacceptable to hide. Before this fix,
    // `accumulation.warnings` was read nowhere -- computed on every submit
    // and then discarded, so a caller (and the UI) had no way to learn a
    // posterior was quietly computed from fewer responses than it looked
    // like. Surfaced here the same way `accumulationNote` already reports a
    // thrown accumulation error, so both the "crashed" and the "ran but
    // excluded something" cases are visible on the response.
    let accumulationWarnings = [];
    try {
      const accumulation = accumulateEvidence(session, db);
      applyPosteriorsToSession(session, accumulation);
      assemblyProgress = resolveAssemblyProgress(accumulation.posteriors, db);
      accumulationWarnings = accumulation.warnings || [];
    } catch (err) {
      response.accumulationNote = `Evidence accumulation failed: ${err.message}`;
    }

    storeAssemblyProgress(session, db, assemblyProgress);

    const { valid, errors } = validateEntity("sessions", session, db);
    if (!valid) {
      return res.status(400).json({ error: "Schema validation failed", details: errors });
    }

    await replaceStoredSession(db, session);
    saveDB(db);
    logger.info("session.submit.persisted", {
      sessionId: id,
      taskId,
      itemId,
      responseCount: (session.responses || []).length,
    });
    // The response key `assemblyProgress` stays the SMV-row array callers
    // already read. The stored session.assemblyProgress is the snapshot
    // written by storeAssemblyProgress, and the spread above is overwritten
    // here on purpose. accumulationWarnings stay response-only.
    const pendingHumanRatings = pendingHumanRatingsFromSession(session);
    return res.json(sessionView({
      ...session,
      assemblyProgress,
      accumulationWarnings,
      ...(pendingHumanRatings.length > 0 ? { pendingHumanRatings } : {}),
    }, req.user));
  }

  // 🔹 Validation: observationId & evidenceId
  const taskModel = db.taskModels.find(tm => tm.id === task.taskModelId);

  let validObs = new Map();
  let validEvidenceIds = new Set();

  for (const emId of taskModel.evidenceModelIds || []) {
    const em = db.evidenceModels.find(m => m.id === emId);
    if (em) {
      for (const obs of em.observations || []) validObs.set(obs.id, obs);
      for (const ev of em.evidences || []) validEvidenceIds.add(ev.id);
    }
  }

  if (observationId && !validObs.has(observationId)) {
    return res.status(400).json({ error: `Invalid observationId: ${observationId}` });
  }
  if (evidenceId && !validEvidenceIds.has(evidenceId)) {
    return res.status(400).json({ error: `Invalid evidenceId: ${evidenceId}` });
  }
  // Enhanced rubricLevel validation for both legacy and criteria-based rubrics
    if (rubricLevel && observationId) {
    const obs = validObs.get(observationId);
    if (!obs || !obs.rubric) {
      return res.status(400).json({ error: `Invalid rubricLevel ${rubricLevel} for observation ${observationId}` });
    }
  
    // Check plain levels (legacy rubrics)
    const hasLegacy = Array.isArray(obs.rubric.levels) && obs.rubric.levels.includes(rubricLevel);
  
    // Check criteria-based rubrics (new format)
    const hasCriteria = Array.isArray(obs.rubric.criteria) &&
      obs.rubric.criteria.some(c =>
        Array.isArray(c.levels) && c.levels.some(l => l.name === rubricLevel)
      );
    
    if (!hasLegacy && !hasCriteria) {
      return res.status(400).json({ error: `Invalid rubricLevel ${rubricLevel} for observation ${observationId}` });
    }
  }

  // Same attempt and review decision as the item path. With no stamp,
  // action "legacy" still appends, which is what this path did before.
  const legacyDecision = evaluateAttempt(session, taskId);
  if (!legacyDecision.ok) {
    return res.status(legacyDecision.status).json({ error: legacyDecision.error, code: legacyDecision.code });
  }

  // 🔹 Save response in session
  const response = {
    taskId,
    questionId: questionId || null,
    rawAnswer: rawAnswer || null,
    observationId: observationId || null,
    scoredValue: scoredValue !== undefined ? scoredValue : null,
    evidenceId: evidenceId || null,
    rubricLevel: rubricLevel || null,
    timestamp: new Date().toISOString(),
  };

  beginDeliveryClock(session);
  const legacyPlaced = placeAttempt(session, taskId, response, legacyDecision);
  if (legacyPlaced === "append") {
    session.currentTaskIndex = Math.min(session.currentTaskIndex + 1, session.taskIds.length);
    noteDeliveredTask(session, taskId);
  }
  session.updatedAt = new Date().toISOString();

  // 🔹 Update Task Instance: record generated evidence/observations
  if (observationId && !task.generatedObservationIds.includes(observationId)) {
    task.generatedObservationIds.push(observationId);
  }
  if (evidenceId && !task.generatedEvidenceIds.includes(evidenceId)) {
    task.generatedEvidenceIds.push(evidenceId);
  }
  task.updatedAt = new Date().toISOString();

  // IRT ability updates stay in JavaScript (evidenceAccumulation on the
  // itemId path). Calling R from /submit would put R on a session request
  // path -- ADR 0001 forbids that. /irt/estimate is not mounted.

  storeAssemblyProgress(session, db, []);

  const { valid, errors } = validateEntity("sessions", session, db);
  if (!valid) {
    return res.status(400).json({ error: "Schema validation failed", details: errors });
  }

  await replaceStoredSession(db, session);
  saveDB(db);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// POST /api/sessions/:id/human-rating
// ------------------------------
// D123/D124: complete a pending_human Identification. Body:
//   { responseIndex?: number, taskId?: string, activated: boolean,
//     strength?: number, rationale?: string, adjudicationRule?: string }
// Staff only — students must not finalize their own OV.
// Tenant scope: loadDB hides other districts; missing session → 404.
router.post("/:id/human-rating", staffRater, async (req, res) => {
  const db = loadDB();
  const session = await getSessionById(db, req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const { responseIndex, taskId, activated, strength, rationale, adjudicationRule } =
    req.body || {};

  let index = typeof responseIndex === "number" ? responseIndex : -1;
  if (index < 0 && taskId) {
    index = (session.responses || []).findIndex(
      (r) =>
        r?.taskId === taskId &&
        (r?.evaluationStatus === EVALUATION_STATUS.PENDING_HUMAN ||
          r?.evaluationStatus === EVALUATION_STATUS.PENDING_ADJUDICATION)
    );
  }
  if (index < 0 || !session.responses?.[index]) {
    return res.status(404).json({
      error: "No pending response matched responseIndex or taskId.",
    });
  }

  let completed;
  try {
    completed = completeHumanEvaluation(session.responses[index], {
      activated,
      strength,
      rationale,
      adjudicationRule,
      ratedBy: req.user?.id ?? null,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  session.responses[index] = completed;
  session.updatedAt = new Date().toISOString();

  let assemblyProgress = [];
  let accumulationWarnings = [];
  try {
    const accumulation = accumulateEvidence(session, db);
    applyPosteriorsToSession(session, accumulation);
    assemblyProgress = resolveAssemblyProgress(accumulation.posteriors, db);
    accumulationWarnings = accumulation.warnings || [];
  } catch (err) {
    completed.accumulationNote = `Evidence accumulation failed: ${err.message}`;
  }

  storeAssemblyProgress(session, db, assemblyProgress);

  const { valid, errors } = validateEntity("sessions", session, db);
  if (!valid) {
    return res.status(400).json({ error: "Schema validation failed", details: errors });
  }

  // JSON harness: saveDB diffs humanRatedAt. External store: replaceStoredSession
  // appends the same human_rating.complete row onto auditLog, then saveDB
  // writes that log without the session body.
  await replaceStoredSession(db, session);
  saveDB(db);
  const queueSessions = await querySessions(db, { pendingRating: true });
  const pendingHumanRatings = pendingHumanRatingsFromSession(session);
  return res.json({
    sessionId: session.id,
    responseIndex: index,
    evaluationStatus: completed.evaluationStatus,
    activated: completed.activated,
    adjudicationApplied: completed.adjudicationApplied ?? null,
    humanRatedBy: completed.humanRatedBy ?? null,
    humanRatedAt: completed.humanRatedAt ?? null,
    assemblyProgress,
    accumulationWarnings,
    pendingHumanRatings,
    ratingQueue: blindedRatingQueueFromSessions(queueSessions),
  });
});

// ------------------------------
// GET /api/sessions/:id/rating/:responseIndex
// ------------------------------
// Blinded single-item card for the rater UI (work product + rubric).
router.get("/:id/rating/:responseIndex", staffRater, async (req, res) => {
  const db = loadDB();
  const session = await getSessionById(db, req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const index = Number(req.params.responseIndex);
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ error: "responseIndex must be a non-negative integer." });
  }
  const response = session.responses?.[index];
  const row = blindedQueueRow(session, response, index);
  if (!row) {
    return res.status(404).json({ error: "No pending rating at that index." });
  }
  return res.json({
    ...row,
    rubric: rubricForPendingPhase(db, row.pendingPhase),
  });
});

// ------------------------------
// GET /api/sessions/:id/next-task
// ------------------------------
router.get("/:id/next-task", async (req, res) => {
  const db = loadDB();
  const loaded = await getSessionById(db, req.params.id);
  const session = loaded && !loaded.isCompleted ? loaded : null;
  if (!session) return res.json({});
  if (rejectUnassignedStudent(req, res, session, db)) return;

  if (await closeForTimeLimit(db, session)) {
    return res.json({
      timeLimitReached: true,
      autoFinished: true,
      status: session.status,
      deliveryTiming: deliveryTimingView(session),
    });
  }

  const timing = deliveryTimingView(session);
  const withTiming = (body) => (timing ? { ...body, deliveryTiming: timing } : body);

  // D58: once a stopping rule has fired, the persisted record is the
  // authority -- not a fresh re-evaluation that could disagree if the
  // Assembly Model was later archived or a second matching model appeared.
  // Status stays in_progress until the examinee (or /finish) closes it;
  // this only stores *why* nothing more will be presented.
  if (session.stopped && typeof session.stopped === "object") {
    return res.json(withTiming({
      stopped: session.stopped,
      strategy: session.selectionStrategy,
    }));
  }

  // D56: the three strategies (fixed / IRT / BayesianNetwork), the
  // composite-library and live-posterior reads they now do, and Assembly
  // Model stopping rules all live in delivery/activitySelection.js. This
  // route's remaining job is to resolve the session, persist a stop when
  // that module decides one, and hand the decision back.
  const decision = selectNextActivity(session, db);
  if (decision.stopped) {
    const stoppedAt = new Date().toISOString();
    session.stopped = { ...decision.stopped, stoppedAt };
    session.updatedAt = stoppedAt;
    await persistSession(db, session);
    return res.json(withTiming({ ...decision, stopped: session.stopped }));
  }

  // Review off, or the attempt cap used up: do not hand back a task that
  // already has a response. An unanswered task is action "append" and is
  // unchanged. With no stamp, evaluateAttempt does not refuse.
  if (decision.taskId) {
    const revisit = evaluateAttempt(session, decision.taskId);
    if (!revisit.ok) {
      return res.status(revisit.status).json({
        error: revisit.error,
        code: revisit.code,
        ...(timing ? { deliveryTiming: timing } : {}),
      });
    }
  }

  // D114: attach the live Presentation Model overlay (pointer → live
  // read). SessionPlayer does not yet obey these fields (D115); exposing
  // them here is the delivery seam that unit will consume.
  const presentation = attachPresentationOverlay(decision, session, db);
  return res.json(withTiming(presentation ? { ...decision, presentation } : decision));
});

/**
 * Resolve the Presentation Model overlay for a next-task decision.
 * Live-select prefers operational > confirmed (so changing which PM is
 * operational changes what the examinee sees without touching item
 * content — D115 exit check). Package presentationModelId is a fallback
 * when nothing linkable is live yet.
 *
 * Uses readRawDB (not the request-scoped `db`) because Presentation Models
 * are system-level delivery chrome, while `tasks` are tenant-scoped: a
 * student whose district claim hides authored tasks without districtId
 * would otherwise get taskId from selection but never a presentation
 * overlay (live dual-PM walk / D115).
 */
function presentationOverrideFromDeliveryModel(session, db) {
  const id = session?.deliveryModelId;
  if (typeof id !== "string" || id === "") return null;
  const deliveryModel = (db.deliveryModels || []).find((row) => row && row.id === id);
  const pmId = deliveryModel?.presentationModelId;
  return typeof pmId === "string" && pmId ? pmId : null;
}

function attachPresentationOverlay(decision, session, _db) {
  if (!decision?.taskId) return null;
  const contentDb = readRawDB();
  const task = (contentDb.tasks || []).find((t) => t.id === decision.taskId);
  const taskModelId = task?.taskModelId;
  if (!taskModelId) return null;

  const taskModel = (contentDb.taskModels || []).find((tm) => tm.id === taskModelId);
  const taskModelVersion =
    typeof taskModel?.versionNumber === "number"
      ? taskModel.versionNumber
      : null;
  const pkg = activePackageFor(taskModelId, contentDb);
  const liveId =
    typeof taskModelVersion === "number"
      ? selectPresentationModelIdForTaskModel(contentDb, taskModelId, taskModelVersion)
      : null;
  const deliveryOverride = presentationOverrideFromDeliveryModel(session, contentDb);

  const resolved = resolvePresentationModel(contentDb, {
    presentationModelId: deliveryOverride || liveId || pkg?.presentationModelId || null,
    taskModelId,
    taskModelVersion: taskModelVersion ?? pkg?.taskModelVersion ?? null,
  });

  if (!resolved.ok) return null;
  return {
    presentationModelId: resolved.presentationModelId,
    ...resolved.overlay,
  };
}

// ------------------------------
// POST /api/sessions/:id/play
// ------------------------------
// List-level start/resume. Ready or paused become in_progress; already
// in_progress persists the same status. A delivery clock that has already
// run out closes the session instead of starting it.
router.post("/:id/play", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;
  if (session.isCompleted || ["completed", "archived", "submitted", "reviewed"].includes(session.status)) {
    return res.status(400).json({ error: "Session cannot be played" });
  }

  const now = new Date();
  if (await closeForTimeLimit(db, session, now)) {
    return res.status(409).json(timeLimitBody(session));
  }
  if (session.deliveryAdministration) {
    endPause(session, now);
    ensureClockStarted(session, now);
  }
  session.status = SESSION_STATUS.IN_PROGRESS;
  session.updatedAt = now.toISOString();
  if (!session.startedAt) session.startedAt = session.updatedAt;
  await persistSession(db, session);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// POST /api/sessions/:id/pause
// ------------------------------
router.post("/:id/pause", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;

  const now = new Date();
  if (await closeForTimeLimit(db, session, now)) {
    return res.status(409).json(timeLimitBody(session));
  }
  if (session.deliveryAdministration) beginPause(session, now);
  session.status = "paused";
  session.updatedAt = now.toISOString();
  await persistSession(db, session);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// POST /api/sessions/:id/resume
// ------------------------------
router.post("/:id/resume", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;

  if (session.status !== SESSION_STATUS.PAUSED) {
    return res.status(400).json({ error: "Session is not paused" });
  }

  const now = new Date();
  if (await closeForTimeLimit(db, session, now)) {
    return res.status(409).json(timeLimitBody(session));
  }
  if (session.deliveryAdministration) {
    endPause(session, now);
    ensureClockStarted(session, now);
  }

  const draft = structuredClone(session);
  draft.status = SESSION_STATUS.IN_PROGRESS;
  draft.updatedAt = new Date().toISOString();
  let stored = session;
  try {
    refreshBayesianNetworkPosteriors(draft, db);
  } catch {
    // A refresh failure must not block the status flip.
  }
  const check = validateEntity("sessions", draft, db);
  if (check.valid) {
    stored = draft;
  } else {
    session.status = SESSION_STATUS.IN_PROGRESS;
    session.updatedAt = draft.updatedAt;
    stored = session;
  }
  await persistSession(db, stored);
  res.json(sessionView(stored, req.user));
});


// ------------------------------
// POST /api/sessions/:id/wizard-timing
// Persist Draft → Review → Completed → Submit phase clocks for the examinee.
// Body: { phase: "draft"|"review"|"completed"|"submitted", close?: boolean }
// ------------------------------
router.post("/:id/wizard-timing", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;

  const phase = String(req.body?.phase || "").trim();
  const close = Boolean(req.body?.close);
  if (!["draft", "review", "completed", "submitted"].includes(phase)) {
    return res.status(400).json({ error: "Invalid wizard phase" });
  }

  if (isSessionClosedForStudent(session)) {
    // Idempotent: already finished with submit clock closed.
    if (session.wizardPhaseTimings?.submitted?.endedAt) {
      return res.json(sessionView(session, req.user));
    }
    if (!(close && phase === "submitted")) {
      return res.status(400).json({ error: "Session is closed" });
    }
  }

  const now = new Date().toISOString();
  applyWizardTimingToSession(session, { phase, close, atIso: now });
  session.updatedAt = now;
  await persistSession(db, session);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// POST /api/sessions/:id/finish
// ------------------------------
router.post("/:id/finish", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;
  if (await closeForTimeLimit(db, session)) {
    return res.json(sessionView(session, req.user));
  }
  const now = new Date().toISOString();
  session.status = "completed"; // ✅ mark completed
  session.isCompleted = true; // keep legacy flag if used
  session.finishedAt = session.finishedAt || now;
  session.updatedAt = now;
  applyWizardTimingToSession(session, {
    phase: "submitted",
    close: true,
    atIso: now,
  });

  // The occasion is finished, so the persistent scoring record takes
  // this session's estimates. A session with no posterior does not
  // erase an earlier record.
  commitFinishedSession(db, session, { now });

  await persistSession(db, session);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// POST /api/sessions/:id/review
// ------------------------------
router.post("/:id/review", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (rejectUnassignedStudent(req, res, session, db)) return;
  session.status = "reviewed";
  session.isCompleted = true;
  session.reviewedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();

  await persistSession(db, session);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// POST /api/sessions/:id/archive
// ------------------------------
router.post("/:id/archive", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  session.status = "archived";
  session.updatedAt = new Date().toISOString();
  await persistSession(db, session);
  res.json(sessionView(session, req.user));
});

// ------------------------------
// DELETE /api/sessions/:id
// ------------------------------
// For admin use only
router.delete("/:id", adminOnly, async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const deleted = await deleteStoredSession(db, id);
  if (!deleted) return res.status(404).json({ error: "Session not found" });
  saveDB(db);
  res.json({ success: true, deleted });
});

export default router;
