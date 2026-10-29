// server/routes/auditLogRoutes.js
// D101: append-only audit log. Admin may read; writes happen only through
// saveDB / recordAuditEvent — there is no POST body path here.
//
// D105 / W21 tenancy: auditLog is deliberately NOT in TENANT_SCOPED_COLLECTIONS.
// This surface is admin-only and returns rows from every tenant — accountability
// requires seeing who promoted what across the system. District/teacher get 403.
// Do not "fix" that by applying D97 filters here.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";
import {
  getAuditEntryById,
  queryAuditLog,
} from "../auditLog/auditRepository.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canView = authorizeRole(["admin"]);

const APPEND_ONLY =
  "auditLog is append-only — entries are written by the persistence path, not by HTTP mutation.";

// GET /api/auditLog
// ?entityCollection=  ?entityId=  ?action=  ?actor=  ?from=  ?to=  ?toStatus=
router.get("/", canView, async (req, res) => {
  const db = loadDB();
  const { entityCollection, entityId, action, actor, from, to, toStatus } = req.query;
  const rows = await queryAuditLog(
    { entityCollection, entityId, action, actor, from, to, toStatus },
    { db }
  );
  res.json(rows);
});

router.get("/:id", canView, async (req, res) => {
  const db = loadDB();
  const row = await getAuditEntryById(req.params.id, { db });
  if (!row) return res.status(404).json({ error: "Audit entry not found" });
  res.json(row);
});

function refuseMutation(_req, res) {
  return res.status(405).json({ error: APPEND_ONLY });
}

router.post("/", canView, refuseMutation);
router.put("/:id", canView, refuseMutation);
router.patch("/:id", canView, refuseMutation);
router.delete("/:id", canView, refuseMutation);

export default router;
