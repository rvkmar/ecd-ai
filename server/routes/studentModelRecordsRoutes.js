// Read-only scoring records. Rows are written when a session finishes.
// There is no authoring POST. Students see their own row. Staff see rows
// inside their district (and school, for a teacher who has one).

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";
import {
  identityOverlaps,
  recordVisibleToUser,
  resolveStudentIdentity,
} from "../../src/utils/studentModelRecord.js";
import {
  getStudentModelRecordById,
  queryStudentModelRecords,
} from "../studentModelRecords/studentModelRecordRepository.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);
router.use(authorizeRole(["admin", "district", "teacher", "student"]));

function askedIdentityOverlapsSelf(studentId, user, db) {
  const self = resolveStudentIdentity(user.username || user.id, db);
  const asked = resolveStudentIdentity(studentId, db);
  return identityOverlaps(self, {
    studentId: asked.canonicalStudentId,
    identityAliases: asked.identityAliases,
  });
}

// GET /api/studentModelRecords?studentId=
router.get("/", async (req, res) => {
  const db = loadDB();
  const studentId = req.query.studentId ? String(req.query.studentId) : "";
  if (studentId && req.user?.role === "student" && !askedIdentityOverlapsSelf(studentId, req.user, db)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const filter = studentId ? { studentId } : {};
  let rows = await queryStudentModelRecords(db, filter);
  rows = rows.filter((row) => recordVisibleToUser(row, req.user, db));
  res.json(rows);
});

// GET /api/studentModelRecords/:id
router.get("/:id", async (req, res) => {
  const db = loadDB();
  const row = await getStudentModelRecordById(db, req.params.id);
  if (!row) return res.status(404).json({ error: "Student model record not found" });
  if (!recordVisibleToUser(row, req.user, db)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(row);
});

export default router;
