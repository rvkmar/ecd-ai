// server/routes/auditLogRoutes.js
// D101: append-only audit log. Admin may read; writes happen only through
// saveDB / recordAuditEvent — there is no POST body path here.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canView = authorizeRole(["admin"]);

const APPEND_ONLY =
  "auditLog is append-only — entries are written by the persistence path, not by HTTP mutation.";

// GET /api/auditLog
// ?entityCollection=  ?entityId=  ?action=  ?actor=  ?from=  ?to=
router.get("/", canView, (req, res) => {
  const db = loadDB();
  let rows = Array.isArray(db.auditLog) ? [...db.auditLog] : [];
  const { entityCollection, entityId, action, actor, from, to } = req.query;

  if (entityCollection) {
    rows = rows.filter((r) => r.entity?.collection === entityCollection);
  }
  if (entityId) {
    rows = rows.filter((r) => String(r.entity?.id) === String(entityId));
  }
  if (action) {
    rows = rows.filter((r) => r.action === action);
  }
  if (actor) {
    rows = rows.filter(
      (r) =>
        r.actor?.userId === actor ||
        (r.actor?.userId && String(r.actor.userId).includes(String(actor)))
    );
  }
  if (from) {
    const t = Date.parse(from);
    if (!Number.isNaN(t)) rows = rows.filter((r) => Date.parse(r.at) >= t);
  }
  if (to) {
    const t = Date.parse(to);
    if (!Number.isNaN(t)) rows = rows.filter((r) => Date.parse(r.at) <= t);
  }

  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  res.json(rows);
});

router.get("/:id", canView, (req, res) => {
  const db = loadDB();
  const row = (db.auditLog || []).find((a) => a.id === req.params.id);
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
