// server/routes/curricularPoliciesRoutes.js
// ------------------------------------------------------------------
// Curricular policies: published curriculum documents (e.g. NCF-SE 2023)
// expressed as Curricular Goals -> Competencies -> Learning Outcomes.
//
// Deliberately a separate collection/router from `policies`
// (policiesRoutes.js). Those are adaptive item-SELECTION policies
// consumed by sessions (fixed | IRT | BayesianNetwork | MarkovChain);
// folding curriculum documents into that enum would leak them into every
// session/report policy picker that lists `/api/policies`.
//
// Consumers:
//   - Settings > Policies > Curricular Policies (list, JSON upload, delete)
//   - CompetencyWizard Step 3 (policy name dropdown + curricular goal
//     multi-select), via src/api/queries/curricularPolicies.js
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";

const router = express.Router();

// Same posture as every other router in this app: a valid bearer token is
// required for everything, then write operations are additionally gated to
// admin below. Reads stay open to any logged-in role because Step 3 of the
// Competency Wizard needs the list and is reachable by non-admin authors.
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage curricular policies" });
  }
  next();
}

// ------------------------------
// GET /api/curricularPolicies
// ------------------------------
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db.curricularPolicies || []);
});

// ------------------------------
// GET /api/curricularPolicies/:id
// ------------------------------
router.get("/:id", (req, res) => {
  const db = loadDB();
  const policy = (db.curricularPolicies || []).find((p) => p.id === req.params.id);
  if (!policy) return res.status(404).json({ error: "Curricular policy not found" });
  res.json(policy);
});

// ------------------------------
// Shared create logic, used by both POST / (single) and POST /bulk.
// Mutates `db` but does not persist -- the caller decides when to save, so
// /bulk writes the file once after every row instead of once per row.
// `idSuffix` lets /bulk hand each row a distinct suffix so a fast loop
// creating several policies inside the same millisecond doesn't collide
// on `cp${Date.now()}`. (Same pattern as policiesRoutes.js.)
// ------------------------------
function createCurricularPolicyRecord(payload = {}, db, idSuffix = "") {
  const {
    name,
    description,
    version,
    issuingBody,
    subject,
    stage,
    curricularGoals,
  } = payload;

  const newPolicy = {
    id: `cp${Date.now()}${idSuffix}`,
    name: name || "",
    description: description || "",
    version: version || "",
    issuingBody: issuingBody || "",
    subject: subject || "",
    stage: stage || "",
    // Normalised on the way in so Step 3 can render options without
    // defensive coding on every field: codes/statements trimmed, optional
    // nested levels always present as arrays.
    curricularGoals: normaliseGoals(curricularGoals),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { valid, errors } = validateEntity("curricularPolicies", newPolicy, db);
  if (!valid) {
    return { ok: false, status: 400, error: "Schema validation failed", details: errors };
  }

  db.curricularPolicies = db.curricularPolicies || [];
  db.curricularPolicies.push(newPolicy);

  return { ok: true, status: 201, record: newPolicy };
}

// Trims and shapes the nested goal tree. Returns the input untouched when
// it isn't an array so validateEntity produces the real "at least one
// curricular goal is required" error rather than this silently swallowing
// a malformed upload into an empty list.
function normaliseGoals(goals) {
  if (!Array.isArray(goals)) return goals;

  return goals.map((goal) => {
    if (!goal || typeof goal !== "object" || Array.isArray(goal)) return goal;

    const competencies = Array.isArray(goal.competencies) ? goal.competencies : [];

    return {
      ...goal,
      code: typeof goal.code === "string" ? goal.code.trim() : goal.code,
      statement: typeof goal.statement === "string" ? goal.statement.trim() : goal.statement,
      competencies: competencies.map((comp) => {
        if (!comp || typeof comp !== "object" || Array.isArray(comp)) return comp;
        return {
          ...comp,
          code: typeof comp.code === "string" ? comp.code.trim() : comp.code,
          statement:
            typeof comp.statement === "string" ? comp.statement.trim() : comp.statement,
          learningOutcomes: Array.isArray(comp.learningOutcomes)
            ? comp.learningOutcomes
            : comp.learningOutcomes === undefined
            ? []
            : comp.learningOutcomes,
        };
      }),
    };
  });
}

// ------------------------------
// POST /api/curricularPolicies
// body: { name, description?, version?, issuingBody?, subject?, stage?,
//         curricularGoals: [{ code, statement,
//                             competencies?: [{ code, statement,
//                                               learningOutcomes?: string[] }] }] }
// ------------------------------
router.post("/", requireAdmin, (req, res) => {
  const db = loadDB();
  const result = createCurricularPolicyRecord(req.body, db);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(result.status).json(result.record);
});

// ------------------------------
// POST /api/curricularPolicies/bulk
// body: CurricularPolicy[] -- each row validated and inserted with the
// exact same rules as POST / above. Independent per-row: one bad row does
// not stop the rest. Returns 207 Multi-Status like every other /bulk
// endpoint, which BulkUploadCard already understands.
// ------------------------------
router.post("/bulk", requireAdmin, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res
      .status(400)
      .json({ error: "Request body must be a JSON array of curricular policies." });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createCurricularPolicyRecord(row, db, `_${i}`);
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

// ------------------------------
// PUT /api/curricularPolicies/:id
// ------------------------------
router.put("/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  const idx = (db.curricularPolicies || []).findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Curricular policy not found" });

  const updated = {
    ...db.curricularPolicies[idx],
    ...req.body,
    // Never let a payload rewrite identity or creation time.
    id: db.curricularPolicies[idx].id,
    createdAt: db.curricularPolicies[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (req.body.curricularGoals !== undefined) {
    updated.curricularGoals = normaliseGoals(req.body.curricularGoals);
  }

  const { valid, errors } = validateEntity("curricularPolicies", updated, db);
  if (!valid) {
    return res.status(400).json({ error: "Schema validation failed", details: errors });
  }

  db.curricularPolicies[idx] = updated;
  saveDB(db);
  res.json(updated);
});

// ------------------------------
// DELETE /api/curricularPolicies/:id
// ------------------------------
// Competency models snapshot the policy name and the selected goals into
// their own constructFramework at selection time, so deleting a policy
// never blanks out an existing model's provenance. It would, however,
// break the "re-open Step 3 and change the selection" affordance for a
// model still under construction -- and silently retire the source of a
// model that has already been confirmed on the strength of it. So this
// mirrors competencyModels.js's own delete guard: blocked only when a
// CONFIRMED or LOCKED model references it, allowed otherwise.
router.delete("/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  const policy = (db.curricularPolicies || []).find((p) => p.id === req.params.id);
  if (!policy) return res.status(404).json({ error: "Curricular policy not found" });

  const blockingModels = (db.competencyModels || []).filter(
    (m) =>
      m.constructFramework?.policyId === req.params.id &&
      (m.locked === true || m.status === "confirmed")
  );

  if (blockingModels.length > 0) {
    return res.status(409).json({
      error: "Curricular policy is referenced by confirmed or locked competency models.",
      details: blockingModels.map((m) => m.name || m.id),
    });
  }

  db.curricularPolicies = (db.curricularPolicies || []).filter(
    (p) => p.id !== req.params.id
  );
  saveDB(db);
  res.json({ success: true });
});

export default router;
