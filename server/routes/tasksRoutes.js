// server/routes/api/tasksRoutes.js
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";

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
router.get("/:id", (req, res) => {
  const db = loadDB();
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

// ------------------------------
// Validate a task's itemId binding (D47).
// ------------------------------
// A task names EITHER a legacy questionId or an itemId, never both. The
// delivery path has to know unambiguously what it is presenting; a task
// carrying both would let the player and the scorer disagree about which
// record was answered, which is precisely the kind of quiet failure the
// item cutover exists to remove.
//
// The checks below deliberately mirror the ones sessionRoutes.js already
// applies at /submit time, so a task cannot be authored that the delivery
// path would later refuse:
//   - the item exists;
//   - its taskModelId matches the task's (Day 30's adversarial-review
//     finding: otherwise an item's evidence is attributed to the wrong
//     Task Model instance with no error at all);
//   - it is not suspended/archived, i.e. deliberately pulled from service.
// A draft/reviewed/confirmed item is still bindable, matching Day 29's
// preview/test-delivery design: it scores correctly, it just accrues no
// exposure.
function validateItemBinding({ itemId, questionId, taskModelId }, db) {
  if (!itemId) return null;

  if (questionId) {
    return "A task may name either questionId or itemId, not both.";
  }

  const item = (db.items || []).find((it) => it.id === itemId);
  if (!item) return `Invalid itemId: ${itemId}`;

  if (item.taskModelId !== taskModelId) {
    return `Item '${itemId}' belongs to Task Model '${item.taskModelId}', not '${taskModelId}'.`;
  }

  if (["suspended", "archived"].includes(item.status)) {
    return `Item '${itemId}' is '${item.status}' and cannot be delivered.`;
  }

  return null;
}

// ------------------------------
// POST /api/tasks
// ------------------------------
// body: { taskModelId, questionId? | itemId? }
router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const { taskModelId, questionId, itemId } = req.body;

  if (!taskModelId) {
    return res.status(400).json({ error: "taskModelId is required" });
  }

  // ensure taskModel exists
  if (!db.taskModels.find(tm => tm.id === taskModelId)) {
    return res.status(400).json({ error: `Invalid taskModelId: ${taskModelId}` });
  }

  // D47: the item pointer is validated HERE rather than by validateEntity,
  // because `tasks` has no schema block -- validateEntity("tasks", ...) is
  // called below but is a no-op for an undeclared collection. Giving tasks
  // a real schema block is its own unit; this route enforces the binding
  // it actually depends on rather than assuming validation it does not get.
  const bindingError = validateItemBinding({ itemId, questionId, taskModelId }, db);
  if (bindingError) {
    return res.status(400).json({ error: bindingError });
  }

  const newTask = {
    id: `t${Date.now()}`,
    taskModelId,
    questionId: questionId || null,
    // D47: a task names the ITEM it presents, exactly as it has always
    // named a question. One pointer, validated on both sides (Part 1.3's
    // second invariant) -- rather than re-deriving the item at delivery
    // time from taskModel.itemMappings, which the project itself treats as
    // best-effort until D154 makes it authoritative.
    itemId: itemId || null,

    // 🔹 Strict ECD: always initialize as empty arrays
    generatedEvidenceIds: [],
    generatedObservationIds: [],

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // D47 (finding F6): this used to call validateEntity("tasks", ...) --
  // which returns {valid:false, errors:["Unknown collection"]} UNCONDITIONALLY,
  // because `tasks` has never had a schema block in src/utils/schema.js.
  // The call arrived with the repository's first commit, so POST /api/tasks
  // has returned 400 for every request in the project's history: task
  // authoring through the API has never worked, and every task in the system
  // was seeded directly into the store. TasksManager's create action is a
  // button that cannot succeed.
  //
  // Removed rather than satisfied: giving `tasks` a real schema block is a
  // schema-design unit in its own right (Part 8, "one entity per session")
  // and bundling it into this cutover would break the same rule. What the
  // route actually depends on -- taskModelId resolves, and the item binding
  // is coherent -- is enforced above, explicitly. The absence of a tasks
  // schema block is recorded as an open gap, not silently accepted.
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
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });

  const updates = req.body;
  const updatedTask = {
    ...db.tasks[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Ensure arrays exist
  if (!Array.isArray(updatedTask.generatedEvidenceIds)) {
    updatedTask.generatedEvidenceIds = [];
  }
  if (!Array.isArray(updatedTask.generatedObservationIds)) {
    updatedTask.generatedObservationIds = [];
  }

  // D47: the same binding rules as POST. An update is how a task would most
  // plausibly acquire a bad itemId -- pointing an existing task at an item
  // belonging to a different Task Model, or at one already pulled from
  // service -- so it is checked against the MERGED record, not the payload.
  const bindingError = validateItemBinding(
    {
      itemId: updatedTask.itemId,
      // A task that already has a questionId and is being given an itemId
      // must be rejected as ambiguous, so the merged value is what counts.
      questionId: updatedTask.questionId,
      taskModelId: updatedTask.taskModelId,
    },
    db
  );
  if (bindingError) {
    return res.status(400).json({ error: bindingError });
  }

  // Same as POST above: validateEntity("tasks", ...) can only ever fail,
  // so PUT /api/tasks/:id has never succeeded either. See finding F6.
  db.tasks[idx] = updatedTask;
  saveDB(db);
  res.json(updatedTask);
});

// ------------------------------
// DELETE /api/tasks/:id
// ------------------------------
router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const before = db.tasks.length;
  db.tasks = db.tasks.filter(t => t.id !== req.params.id);
  if (db.tasks.length === before) {
    return res.status(404).json({ error: "Task not found" });
  }

  // Cascade: remove linked sessions
  db.sessions = db.sessions.filter(s => !(s.taskIds || []).includes(req.params.id));

  saveDB(db);
  res.json({ success: true });
});

export default router;
