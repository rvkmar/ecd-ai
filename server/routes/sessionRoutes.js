import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { loadDB, saveDB, finishSession } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { SESSION_STATUS } from "../../src/utils/sessionStatus.js";
import {
  attendableSessionsForStudent,
  buildAssignableRoster,
  isReservedSessionCollectionId,
  resolveSessionAssignees,
} from "../../src/utils/sessionPlay.js";
import { identifyEvidence } from "../delivery/evidenceIdentification.js";
import {
  accumulateEvidence,
  applyPosteriorsToSession,
  CONTINUOUS_MODEL_FAMILIES,
  RAW_SCORE_MODEL_FAMILIES,
  itemParametersAreUsable,
} from "../delivery/evidenceAccumulation.js";
import { dinaParametersAreUsable } from "../delivery/attributeAccumulation.js";
import { resolveAssemblyProgress } from "../delivery/assemblyProgress.js";
// D56: Activity Selection. /next-task's whole strategy block used to live
// inline below; it now lives in one module that reads the composite library
// and the live posteriors instead of db.questions. See that file's header.
import { selectNextActivity } from "../delivery/activitySelection.js";
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

// Most routes below are deliberately left open to any authenticated
// role: creating, submitting, pausing and finishing a session is a
// student's own self-service flow, not a privileged action, and
// rolePermissions.js has no per-role session ownership model to gate
// against yet (that's a real gap, but a scope-based one, not a role-list
// one -- see the RBAC sweep notes). DELETE is the one exception: it was
// already commented "For admin use only" but never enforced.
const adminOnly = authorizeRole(["admin"]);

const R_BACKEND = process.env.R_BACKEND_URL || "http://localhost:4000";

// ------------------------------
// POST /api/sessions
// ------------------------------
// body: { taskIds, studentId?, studentIds?, cohortId?, selectionStrategy?, nextTaskPolicy? }
// One session per assignee so each examinee has their own responses.
// Status starts as `ready` — staff Play persists `in_progress`.
router.post("/", (req, res) => {
  const { taskIds, studentId, studentIds, cohortId, selectionStrategy, nextTaskPolicy } = req.body;
  const db = loadDB();

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

  // ✅ Policy validation
  let strategy = selectionStrategy || "fixed";
  let policyConfig = nextTaskPolicy || {};

  // Check against /api/policies
  const availablePolicies = db.policies || [];
  const foundPolicy = availablePolicies.find((p) => p.type === strategy);

  if (!foundPolicy) {
    return res.status(400).json({
      error: `Invalid selectionStrategy: ${strategy}. No matching policy found in /api/policies`,
    });
  }

  // If caller passed explicit policyId in nextTaskPolicy, check it
  if (policyConfig.policyId) {
    const exists = availablePolicies.some((p) => p.id === policyConfig.policyId);
    if (!exists) {
      return res.status(400).json({
        error: `Invalid nextTaskPolicy.policyId: ${policyConfig.policyId}. Not found in /api/policies`,
      });
    }
  } else {
    // If no explicit policyId, default to matched strategy policy
    policyConfig = { policyId: foundPolicy.id, ...policyConfig };
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

      // Lifecycle — ready until staff Play. Creating as in_progress made
      // the list show Play and Pause together and sent Play into the
      // finish/player surface.
      status: SESSION_STATUS.READY,
      isCompleted: false,
      startedAt: now,
      updatedAt: now,
    };

    const { valid, errors } = validateEntity("sessions", newSession, db);
    if (!valid) {
      return res.status(400).json({ error: "Schema validation failed", details: errors });
    }
    created.push(newSession);
  }

  if (!db.sessions) db.sessions = [];
  db.sessions.push(...created);
  saveDB(db);

  if (created.length === 1) {
    return res.status(201).json(created[0]);
  }
  res.status(201).json({ assignmentGroupId, sessions: created });
});


// ------------------------------
// GET /api/sessions
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.sessions || []);
});

// ------------------------------
// GET /api/sessions/active
// ------------------------------
router.get("/active", (req, res) => {
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const active = db.sessions.filter((s) => s.status !== "archived");
  res.json(active);
});

// ------------------------------
// GET /api/sessions/archived
// ------------------------------
router.get("/archived", (req, res) => {
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const archived = db.sessions.filter((s) => s.status === "archived");
  res.json(archived);
});

// ------------------------------
// GET /api/sessions/mine
// ------------------------------
// Student discovery. Staff already have /active; students had no UI and
// no filtered list. Must be registered before /:id so "mine" is not
// treated as a session id.
router.get("/mine", (req, res) => {
  try {
    const db = loadDB();
    const sessions = db.sessions || [];
    const students = db.students || [];
    const users = db.users || [];
    const user = req.user || {};
    if (user.role === "student") {
      return res.json(attendableSessionsForStudent(sessions, user, students, users));
    }
    const live = sessions.filter((s) => s.status !== "archived");
    return res.json(live);
  } catch (err) {
    // A thrown /mine must not become GET /:id's 404. Empty list is honest.
    console.error("GET /api/sessions/mine failed:", err);
    return res.json([]);
  }
});

// ------------------------------
// GET /api/sessions/:id
// ------------------------------
router.get("/:id", (req, res) => {
  // Belt-and-suspenders: if /mine (or /active, /archived) is not registered
  // — native ESM miss, stale process — do not treat the collection name as
  // a session id. "Session not found" is what My Sessions displayed.
  if (isReservedSessionCollectionId(req.params.id)) {
    return res.json([]);
  }
  const db = loadDB();
  const session = (db.sessions || []).find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// ------------------------------
// POST /api/sessions/:id/submit
// ------------------------------
// body: { taskId, questionId?, itemId?, rawAnswer, observationId?, scoredValue?, evidenceId?, rubricLevel? }
router.post("/:id/submit", async (req, res) => {
  const { id } = req.params;
  const { taskId, questionId, itemId, rawAnswer, observationId, scoredValue, evidenceId, rubricLevel } = req.body;

  const db = loadDB();
  const session = db.sessions.find(s => s.id === id && !s.isCompleted);
  if (!session) return res.status(404).json({ error: "Session not found or already completed" });

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

  if (!session.taskIds.includes(taskId)) {
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
    if (session.responses.some(r => r.taskId === taskId)) {
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

    let parameterSetId = null;
    let parameterSource = null;
    // Day 39 (adversarial review, P0-3): a SNAPSHOT of the pilot IRT
    // parameters actually used to score THIS response, not a live pointer.
    // The calibrated path is reproducible-by-design -- `parameterSetId`
    // pins an immutable, versioned parameterSet, so re-resolving it later
    // always returns the same numbers (Decision 1 in
    // evidenceAccumulation.js's header). `item.psychometrics.irtParams` has
    // no such immutability: it is ordinary, editable Item Wizard Step 7
    // data, and an author can change it at any time. Without pinning it
    // here, evidenceAccumulation.js re-reads the item's CURRENT pilot
    // values on every accumulation pass (it recomputes from
    // session.responses on every call) -- so editing an item's pilot a/b
    // silently rewrites every past session's historical posterior, with no
    // record it moved. Persisting the actual numbers used keeps the pilot
    // path reproducible from the stored response alone, exactly like the
    // calibrated path already is.
    let pilotParams = null;

    if (RAW_SCORE_MODEL_FAMILIES.includes(family)) {
      // Never needed a calibrated parameterSet; a weighted proportion over
      // Task Model weights, nothing more.
      parameterSource = "not-applicable";
    } else if (calibratedParameterSetId) {
      parameterSetId = calibratedParameterSetId;
      parameterSource = "calibrated";
    } else if (CONTINUOUS_MODEL_FAMILIES.includes(family)) {
      const currentPilotParams = item.psychometrics?.irtParams;

      if (!itemParametersAreUsable(currentPilotParams)) {
        return res.status(400).json({
          error: `Evidence model '${item.evidenceModelId}' has no active calibrated parameter set, and item '${itemId}' carries no usable pilot IRT parameters (psychometrics.irtParams needs at least a > 0 and a finite b) for a '${family}' model to fall back on.`,
        });
      }

      parameterSource = "pilot";
      pilotParams = {
        a: currentPilotParams.a,
        b: currentPilotParams.b,
        ...(Number.isFinite(currentPilotParams.c) ? { c: currentPilotParams.c } : {}),
      };
    } else if (family === "dina") {
      // D53b: the 'dina' analogue of the CONTINUOUS_MODEL_FAMILIES branch
      // just above -- same fallback, same snapshot-pinning discipline, new
      // field. 'gdina' deliberately has NO branch here: a saturated
      // probability table sized to each item's own required-attribute
      // count is real new authoring surface this unit did not build, so a
      // 'gdina' item with no calibrated parameter set still falls through
      // to the honest refusal below, exactly as before D53b.
      const currentPilotParams = item.psychometrics?.dinaParams;

      if (!dinaParametersAreUsable(currentPilotParams)) {
        return res.status(400).json({
          error: `Evidence model '${item.evidenceModelId}' has no active calibrated parameter set, and item '${itemId}' carries no usable pilot DINA parameters (psychometrics.dinaParams needs slip and guess each in [0,1), with guess < 1 - slip) for a '${family}' model to fall back on.`,
        });
      }

      parameterSource = "pilot";
      pilotParams = {
        slip: currentPilotParams.slip,
        guess: currentPilotParams.guess,
      };
    } else {
      return res.status(400).json({
        error: `Evidence model '${item.evidenceModelId}' has no active calibrated parameter set yet; item '${itemId}' cannot be scored through it. Pilot parameters are not yet supported for the '${family}' family.`,
      });
    }

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
      activated: evidence.activated,
      direction: evidence.direction,
      strength: evidence.strength,
      rationale: evidence.rationale,
      timestamp: new Date().toISOString(),
    };
    if (evidence.warning) response.warning = evidence.warning;

    session.responses.push(response);
    session.currentTaskIndex = Math.min(session.currentTaskIndex + 1, session.taskIds.length);
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
    const itemIndex = db.items.findIndex(it => it.id === itemId);
    const usageResult = recordItemUsage(item, db, {});
    if (usageResult.ok) {
      db.items[itemIndex] = usageResult.item;
    } else {
      response.exposureNote = usageResult.error;
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

    const { valid, errors } = validateEntity("sessions", session, db);
    if (!valid) {
      return res.status(400).json({ error: "Schema validation failed", details: errors });
    }

    saveDB(db);
    // `assemblyProgress` and `accumulationWarnings` are surfaced in the
    // response only -- see assemblyProgress.js's own module header for why
    // neither is ever persisted or acted on here.
    return res.json({ ...session, assemblyProgress, accumulationWarnings });
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

  session.responses.push(response);
  session.currentTaskIndex = Math.min(session.currentTaskIndex + 1, session.taskIds.length);
  session.updatedAt = new Date().toISOString();

  // 🔹 Update Task Instance: record generated evidence/observations
  if (observationId && !task.generatedObservationIds.includes(observationId)) {
    task.generatedObservationIds.push(observationId);
  }
  if (evidenceId && !task.generatedEvidenceIds.includes(evidenceId)) {
    task.generatedEvidenceIds.push(evidenceId);
  }
  task.updatedAt = new Date().toISOString();

  // 🔹 IRT theta update via R backend (using global fetch)
  if (session.selectionStrategy === "IRT") {
    try {
      const R_BACKEND_URL = process.env.R_BACKEND_URL || "http://r-backend:4000"; // ✅ fix default port

      const response = await fetch(`${R_BACKEND_URL}/irt/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: session.responses,
          itemBank: (db.questions || []).map(q => ({
            id: q.id,
            a: q.metadata?.a ?? 1,
            b: q.metadata?.b ?? 0,
            c: q.metadata?.c ?? 0
          }))
        })
      });

      const result = await response.json();

      if (!session.studentModel) session.studentModel = {};
      if (result.theta !== undefined) {
        session.studentModel.irtTheta = result.theta;
        session.studentModel.stderr = result.stderr;
      } else {
        console.warn("IRT backend did not return theta:", result);
      }
    } catch (err) {
      console.error("IRT estimation failed:", err);
    }
  }


  const { valid, errors } = validateEntity("sessions", session, db);
  if (!valid) {
    return res.status(400).json({ error: "Schema validation failed", details: errors });
  }

  saveDB(db);
  res.json(session);
});


// ------------------------------
// GET /api/sessions/:id/next-task
// ------------------------------
router.get("/:id/next-task", (req, res) => {
  const db = loadDB();
  const session = db.sessions.find(s => s.id === req.params.id && !s.isCompleted);
  if (!session) return res.json({});

  // D58: once a stopping rule has fired, the persisted record is the
  // authority -- not a fresh re-evaluation that could disagree if the
  // Assembly Model was later archived or a second matching model appeared.
  // Status stays in_progress until the examinee (or /finish) closes it;
  // this only stores *why* nothing more will be presented.
  if (session.stopped && typeof session.stopped === "object") {
    return res.json({
      stopped: session.stopped,
      strategy: session.selectionStrategy,
    });
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
    saveDB(db);
    return res.json({ ...decision, stopped: session.stopped });
  }
  return res.json(decision);
});

// ------------------------------
// POST /api/sessions/:id/play
// ------------------------------
// List-level start/resume. Does not finish the session. Ready or paused
// become in_progress; already in_progress is a no-op persist.
router.post("/:id/play", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  const session = db.sessions[idx];
  if (session.isCompleted || ["completed", "archived", "submitted", "reviewed"].includes(session.status)) {
    return res.status(400).json({ error: "Session cannot be played" });
  }

  session.status = SESSION_STATUS.IN_PROGRESS;
  session.updatedAt = new Date().toISOString();
  if (!session.startedAt) session.startedAt = session.updatedAt;
  saveDB(db);
  res.json(session);
});

// ------------------------------
// POST /api/sessions/:id/pause
// ------------------------------
router.post("/:id/pause", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  db.sessions[idx].status = "paused";
  db.sessions[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  res.json(db.sessions[idx]);
});

// ------------------------------
// POST /api/sessions/:id/resume
// ------------------------------
router.post("/:id/resume", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  if (db.sessions[idx].status !== SESSION_STATUS.PAUSED) {
    return res.status(400).json({ error: "Session is not paused" });
  }

  db.sessions[idx].status = SESSION_STATUS.IN_PROGRESS;
  db.sessions[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  res.json(db.sessions[idx]);
});


// ------------------------------
// POST /api/sessions/:id/finish
// ------------------------------
router.post("/:id/finish", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  db.sessions[idx].status = "completed";   // ✅ mark completed
  db.sessions[idx].isCompleted = true;     // keep legacy flag if used
  db.sessions[idx].updatedAt = new Date().toISOString();

  saveDB(db);
  res.json(db.sessions[idx]);
});

// ------------------------------
// POST /api/sessions/:id/review
// ------------------------------
router.post("/:id/review", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  const session = db.sessions[idx];
  session.status = "reviewed";
  session.isCompleted = true;
  session.reviewedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();

  saveDB(db);
  res.json(session);
});

// ------------------------------
// POST /api/sessions/:id/archive
// ------------------------------
router.post("/:id/archive", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  db.sessions[idx].status = "archived";
  db.sessions[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  res.json(db.sessions[idx]);
});

// ------------------------------
// DELETE /api/sessions/:id
// ------------------------------
// For admin use only
router.delete("/:id", adminOnly, (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  if (!db.sessions) db.sessions = [];
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Session not found" });

  const deleted = db.sessions.splice(idx, 1)[0];
  saveDB(db);
  res.json({ success: true, deleted });
});

export default router;
