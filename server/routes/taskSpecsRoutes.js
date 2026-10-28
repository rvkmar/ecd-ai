// server/routes/taskSpecsRoutes.js
// ------------------------------------------------------------------
// Task specs (D151 / W31 G15). Derived from a template with TMVs fixed.
// Authored POST is refused. Insert is insertGeneratedTaskSpec only.
// Admin may list, read, and delete. District may list and read.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canDelete = authorizeRole(["admin"]);

const AUTHORED_CREATE_ERROR = "Task specs are generated, not authored.";

router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.taskSpecs || []);
});

router.get("/:id", (req, res) => {
  const db = loadDB();
  const row = (db.taskSpecs || []).find((spec) => spec.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Task spec not found" });
  res.json(row);
});

router.post("/", authorizeRole(["admin"]), (req, res) => {
  return res.status(405).json({ error: AUTHORED_CREATE_ERROR });
});

router.put("/:id", authorizeRole(["admin"]), (req, res) => {
  return res.status(405).json({ error: AUTHORED_CREATE_ERROR });
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const rows = db.taskSpecs || [];
  const existing = rows.find((spec) => spec.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Task spec not found" });

  db.taskSpecs = rows.filter((spec) => spec.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
