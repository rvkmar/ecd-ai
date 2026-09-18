// server/routes/studentsRoutes.js
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { buildAssignableRoster } from "../../src/utils/sessionPlay.js";
import { dbAdapter } from "../utils/dbAdapter.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// Every write route also needs a role gate: this file had none, and
// src/config/rolePermissions.js had no "students" entity at all -- the
// same absent-on-both-sides gap items/student once had. Admin-only is
// the conservative default until a real district/teacher enrollment
// workflow is designed; see the matching addition to rolePermissions.js.
const canAuthor = authorizeRole(["admin"]);

// GET /api/students
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.students || []);
});

// GET /api/students/assignable
// Teacher/district session create: the `students` collection is often empty
// (admin-only writes, never seeded) while examinees live in `users` (stud1).
// Must be registered before /:id so "assignable" is not "Student not found".
router.get("/assignable", async (req, res) => {
  try {
    const db = loadDB();
    let users = db.users || [];
    try {
      const fromAdapter = await dbAdapter.list("users");
      if (Array.isArray(fromAdapter) && fromAdapter.length) users = fromAdapter;
    } catch {
      // JSON-only / test environments may not have the users adapter.
    }
    res.json(buildAssignableRoster(db.students || [], users));
  } catch (err) {
    console.error("GET /api/students/assignable failed:", err);
    res.json({ students: [], cohorts: [] });
  }
});

// GET /api/students/:id
router.get("/:id", (req, res) => {
  if (req.params.id === "assignable") {
    return res.json({ students: [], cohorts: [] });
  }
  const db = loadDB();
  const student = (db.students || []).find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json(student);
});

// POST /api/students
router.post("/", canAuthor, (req, res) => {
  const { name, classId, districtId } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const db = loadDB();
  const newStudent = {
    id: `stu${Date.now()}`,
    name,
    classId: classId || null,
    districtId: districtId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { valid, errors } = validateEntity("students", newStudent, db);
  if (!valid) return res.status(400).json({ error: "Schema validation failed", details: errors });

  db.students = db.students || [];
  db.students.push(newStudent);
  saveDB(db);

  res.status(201).json(newStudent);
});


// DELETE /api/students/:id
router.delete("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const before = db.students.length;
  db.students = db.students.filter((s) => s.id !== req.params.id);
  if (db.students.length === before) {
    return res.status(404).json({ error: "Student not found" });
  }
  saveDB(db);
  res.json({ success: true });
});

export default router;
