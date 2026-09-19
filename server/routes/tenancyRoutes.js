/**
 * D100 — tenancy admin + scope inspector HTTP surface (admin-only).
 */
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { dbAdapter } from "../utils/dbAdapter.js";
import {
  inspectSubjectVisibility,
  listTenantDirectory,
} from "../utils/scopeInspector.js";
import { TENANT_SCOPED_COLLECTIONS } from "../utils/tenancyScope.js";
import { namedAggregateScope } from "../utils/aggregatePrivacy.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const adminOnly = authorizeRole(["admin"]);

/** Admin ALS is unscoped — list each tenant collection for a full snapshot. */
async function loadUnscopedSnapshot() {
  const db = {};
  for (const col of TENANT_SCOPED_COLLECTIONS) {
    db[col] = await dbAdapter.list(col);
  }
  return db;
}

// GET /api/tenancy/directory — districts + schools observed in data
router.get("/directory", adminOnly, async (req, res) => {
  try {
    const db = await loadUnscopedSnapshot();
    res.json({
      scope: namedAggregateScope(req, { kind: "tenant-directory" }),
      ...listTenantDirectory(db),
    });
  } catch (err) {
    console.error("tenancy directory failed:", err);
    res.status(500).json({ error: "Failed to load tenant directory" });
  }
});

// GET /api/tenancy/inspect/:username — what can this user see?
router.get("/inspect/:username", adminOnly, async (req, res) => {
  try {
    const db = await loadUnscopedSnapshot();
    const users = db.users || [];
    const user = users.find(
      (u) => String(u.username) === String(req.params.username)
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const inspection = inspectSubjectVisibility(user, db);
    res.json({
      scope: namedAggregateScope(req, { kind: "scope-inspector" }),
      ...inspection,
    });
  } catch (err) {
    console.error("tenancy inspect failed:", err);
    res.status(500).json({ error: "Failed to inspect subject scope" });
  }
});

export default router;
