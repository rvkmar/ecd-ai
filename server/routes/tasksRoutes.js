// server/routes/api/tasksRoutes.js
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB, readRawDB } from "../../src/utils/db-server.js";
import { bindSessions, commitSessions, listSessions, sessionsUseExternalStore } from "../sessions/sessionRepository.js";
import { sessionAssignedToStudent } from "../../src/utils/sessionPlay.js";
import { validateEntity } from "../../src/utils/schema.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// Every write route also needs a role gate: this file had none at all.
// src/config/rolePermissions.js declares tasks editing/creation as
// admin+district+teacher (canEdit/canCreate), but deletion only as
// admin+district -- a teacher can create local tasks but not delete them.
const canAuthor = authorizeRole(["admin", "district", "teacher"]);
const canDelete = authorizeRole(["admin", "district"]);

const TASK_WRITE_KEYS = [
  "taskModelId",
  "itemId",
  "questionId",
  "generatedEvidenceIds",
  "generatedObservationIds",
  "startTime",
  "endTime",
];

function presentPointer(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function authorTenancy(req) {
  return {
    districtId: req.user?.districtId || null,
    schoolId: req.user?.schoolId || null,
    createdBy: req.user?.username || req.user?.id || null,
  };
}

function rejectIfInvalid(res, record, db) {
  const { valid, errors } = validateEntity("tasks", record, db);
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Task validation failed",
    details: errors,
  });
}

/**
 * Authored tasks often have no districtId. Tenant-scoped loadDB then hides
 * them from students even when the task sits on their session roster —
 * /next-task still returns taskId, but GET /api/tasks/:id 404s and the
 * player never mounts ItemPresenter (D115 live walk). Allow the raw row
 * when the caller is assigned a session that includes this taskId.
 */
async function taskOnAssigneeSession(taskId, user, rawDb) {
  if (!user || user.role !== "student") return false;
  const students = rawDb.students || [];
  const users = rawDb.users || [];
  const sessions = sessionsUseExternalStore()
    ? await listSessions(rawDb)
    : rawDb.sessions || [];
  return sessions.some(
    (s) =>
      (s.taskIds || []).includes(taskId) &&
      sessionAssignedToStudent(s, user, students, users)
  );
}

// ------------------------------
// GET /api/tasks
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.tasks || []);
});

// ------------------------------
// GET /api/tasks/:id
// ------------------------------
router.get("/:id", async (req, res) => {
  const db = loadDB();
  let task = (db.tasks || []).find((t) => t.id === req.params.id);
  if (!task) {
    const raw = readRawDB();
    const candidate = (raw.tasks || []).find((t) => t.id === req.params.id);
    if (
      candidate &&
      (req.user?.role === "admin" ||
        (await taskOnAssigneeSession(candidate.id, req.user, raw)))
    ) {
      task = candidate;
    }
  }
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

// ------------------------------
// POST /api/tasks
// ------------------------------
// body: { taskModelId, questionId? | itemId? }
// D115b: validateEntity("tasks") is the authoring gate (instantiable TM,
// itemId XOR questionId, coherent item). D47 removed the call because the
// collection was undeclared and always failed; the schema block now exists
// and must actually pass.
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const { taskModelId, questionId, itemId } = req.body;
  const now = new Date().toISOString();
  const tenancy = authorTenancy(req);

  const newTask = {
    id: `t${Date.now()}`,
    taskModelId: presentPointer(taskModelId),
    questionId: presentPointer(questionId),
    itemId: presentPointer(itemId),
    generatedEvidenceIds: [],
    generatedObservationIds: [],
    ...tenancy,
    createdAt: now,
    updatedAt: now,
  };

  if (rejectIfInvalid(res, newTask, db)) return;

  if (!db.tasks) db.tasks = [];
  db.tasks.push(newTask);
  saveDB(db);

  res.status(201).json(newTask);
});

// ------------------------------
// PUT /api/tasks/:id
// ------------------------------
router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = (db.tasks || []).findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });

  const existing = db.tasks[idx];
  const patch = {};
  for (const key of TASK_WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      if (key === "itemId" || key === "questionId" || key === "taskModelId") {
        patch[key] = presentPointer(req.body[key]);
      } else {
        patch[key] = req.body[key];
      }
    }
  }

  const updatedTask = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    districtId: existing.districtId ?? null,
    schoolId: existing.schoolId ?? null,
    createdBy: existing.createdBy ?? null,
    updatedAt: new Date().toISOString(),
  };

  if (!Array.isArray(updatedTask.generatedEvidenceIds)) {
    updatedTask.generatedEvidenceIds = [];
  }
  if (!Array.isArray(updatedTask.generatedObservationIds)) {
    updatedTask.generatedObservationIds = [];
  }

  if (rejectIfInvalid(res, updatedTask, db)) return;

  db.tasks[idx] = updatedTask;
  saveDB(db);
  res.json(updatedTask);
});

// ------------------------------
// DELETE /api/tasks/:id
// ------------------------------
// D115b reviewed the sessions cascade: a session's taskIds are the roster
// the player walks. Leaving a deleted taskId on a session 404s GET
// /api/tasks/:id and breaks /next-task. Keep the existing filter — sessions
// that listed this task are removed with it. Not a CAF archive.
router.delete("/:id", canDelete, async (req, res) => {
  const db = loadDB();
  const before = (db.tasks || []).length;
  db.tasks = (db.tasks || []).filter((t) => t.id !== req.params.id);
  if (db.tasks.length === before) {
    return res.status(404).json({ error: "Task not found" });
  }

  await bindSessions(db);
  db.sessions = (db.sessions || []).filter(
    (s) => !(s.taskIds || []).includes(req.params.id)
  );
  await commitSessions(db);

  saveDB(db);
  res.json({ success: true });
});

export default router;
