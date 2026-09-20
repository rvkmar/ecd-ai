// server/routes/policiesRoutes.js
import express from "express";
import { authenticateToken } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";

const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// ------------------------------
// GET /api/policies
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.policies || []);
});

// middleware for role check
function requireAdmin(req, res, next) {
  const role = req.user?.role; // assuming JWT middleware sets req.user
  if (role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage policies" });
  }
  next();
}

// ------------------------------
// Shared create-policy logic, used by both POST / (single) and POST /bulk.
// Mutates `db` (pushes the new policy into db.policies) but does not save
// it -- the caller decides when to persist, so /bulk can write the file
// once after every row instead of once per row.
// `idSuffix` lets /bulk hand each row a distinct suffix so a fast loop
// creating several policies within the same millisecond doesn't collide
// on `p${Date.now()}`.
// ------------------------------
function createPolicyRecord(payload = {}, db, idSuffix = "") {
  const { name, description, type, config } = payload;

  if (!name || !type) {
    return { ok: false, status: 400, error: "name and type are required" };
  }

  const newPolicy = {
    id: `p${Date.now()}${idSuffix}`,
    name,
    description: description || "",
    type, // must match enum in schema.js: "fixed" | "IRT" | "BayesianNetwork"
    config: config || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // ✅ Validate against schema
  const { valid, errors } = validateEntity("policies", newPolicy, db);
  if (!valid) {
    return { ok: false, status: 400, error: "Schema validation failed", details: errors };
  }

  db.policies = db.policies || [];
  db.policies.push(newPolicy);

  return { ok: true, status: 201, record: newPolicy };
}

// ------------------------------
// POST /api/policies
// ------------------------------
// body: { name, description, type, config }
router.post("/", requireAdmin, (req, res) => {
  const db = loadDB();
  const result = createPolicyRecord(req.body, db);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(result.status).json(result.record);
});

// ------------------------------
// POST /api/policies/bulk
// ------------------------------
// body: Policy[] -- a JSON array of full policy objects, each validated
// and inserted with the exact same rules as POST / above. Independent
// per-row: one row failing does not stop the rest.
router.post("/bulk", requireAdmin, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: "Request body must be a JSON array of policies." });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createPolicyRecord(row, db, `_${i}`);
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

// ------------------------------
// PUT /api/policies/:id
// ------------------------------
router.put("/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  const idx = (db.policies || []).findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Policy not found" });

  const updated = {
    ...db.policies[idx],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  // ✅ Validate against schema
  const { valid, errors } = validateEntity("policies", updated, db);
  if (!valid) {
    return res.status(400).json({ error: "Schema validation failed", details: errors });
  }

  db.policies[idx] = updated;
  saveDB(db);
  res.json(updated);
});

// ------------------------------
// DELETE /api/policies/:id
// ------------------------------
router.delete("/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  const before = db.policies?.length || 0;
  db.policies = (db.policies || []).filter((p) => p.id !== req.params.id);

  if ((db.policies || []).length === before) {
    return res.status(404).json({ error: "Policy not found" });
  }

  saveDB(db);
  res.json({ success: true });
});

export default router;
