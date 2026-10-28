// server/routes/domainAnalysesRoutes.js
// ------------------------------------------------------------------
// Domain Analysis (D141 / W29 G10, ADR 0010). One record, seven
// labelled sections. Confirmed means the analysis is complete. It
// authorises no student delivery, so there is no operational status.
//
// Admin-authored. District may view. D142: POST /bulk always lands
// a draft. The correction form is the Admin Domain Analysis screen.
// This route does not write competency models.
// ------------------------------------------------------------------
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import {
  assignDomainAnalysisEntryIds,
  citedEntryRemovals,
  collectDomainEntryIds,
  domainAnalysisDeleteConflict,
  removalConflict,
} from "../../src/utils/domainAnalysisEntries.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canRead = authorizeRole(["admin", "district"]);
const canAuthor = authorizeRole(["admin"]);

const WRITE_KEYS = [
  "name",
  "valuedWork",
  "taskFeatures",
  "representationalForms",
  "performanceOutcomes",
  "valuedKnowledge",
  "knowledgeStructure",
  "knowledgeTaskRelationships",
  "psychologicalPerspective",
  "status",
];

let idCounter = 0;
const genId = () => `da${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

function authorTenancy(req) {
  return {
    districtId: req.user?.districtId || null,
    schoolId: req.user?.schoolId || null,
    createdBy: req.user?.username || req.user?.id || null,
  };
}

function pickWrites(body = {}) {
  const out = {};
  for (const key of WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

function rejectIfInvalid(res, record, db) {
  const strict = record.status === "confirmed";
  const { valid, errors } = validateEntity("domainAnalyses", record, db, { strict });
  if (valid) return false;
  return res.status(400).json({
    error: errors[0] || "Domain Analysis validation failed",
    details: errors,
  });
}

export function createDomainAnalysisRecord(body, db, req, { forceDraft = false, assignedId } = {}) {
  const now = new Date().toISOString();
  const writes = pickWrites(body);
  const record = {
    ...writes,
    status: forceDraft ? "draft" : writes.status || "draft",
    id: assignedId || genId(),
    ...authorTenancy(req),
    createdAt: now,
    updatedAt: now,
  };
  assignDomainAnalysisEntryIds(record, null, collectDomainEntryIds(db));
  const strict = record.status === "confirmed";
  const { valid, errors } = validateEntity("domainAnalyses", record, db, { strict });
  if (!valid) {
    return { ok: false, error: errors[0] || "Domain Analysis validation failed", details: errors };
  }
  db.domainAnalyses = db.domainAnalyses || [];
  db.domainAnalyses.push(record);
  return { ok: true, record };
}

router.get("/", canRead, (req, res) => {
  const db = loadDB();
  res.json(db.domainAnalyses || []);
});

router.get("/:id", canRead, (req, res) => {
  const db = loadDB();
  const row = (db.domainAnalyses || []).find((v) => v.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Domain Analysis not found" });
  res.json(row);
});

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createDomainAnalysisRecord(req.body, db, req);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.post("/bulk", canAuthor, (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows)) {
    return res
      .status(400)
      .json({ error: "Request body must be a JSON array of domain analyses." });
  }

  const db = loadDB();
  const results = rows.map((row, i) => {
    const result = createDomainAnalysisRecord(row, db, req, { forceDraft: true });
    return result.ok
      ? { index: i, ok: true, id: result.record.id, name: result.record.name }
      : { index: i, ok: false, error: result.error, details: result.details };
  });
  saveDB(db);

  const created = results.filter((r) => r.ok).length;
  res.status(207).json({ created, failed: results.length - created, results });
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.domainAnalyses || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Domain Analysis not found" });

  const existing = rows[idx];
  const updated = {
    ...existing,
    ...pickWrites(req.body),
    id: existing.id,
    districtId: existing.districtId ?? null,
    schoolId: existing.schoolId ?? null,
    createdBy: existing.createdBy ?? null,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  assignDomainAnalysisEntryIds(updated, existing, collectDomainEntryIds(db));
  const conflict = removalConflict(citedEntryRemovals(existing, updated, db));
  if (conflict) return res.status(409).json(conflict);
  if (rejectIfInvalid(res, updated, db)) return;

  db.domainAnalyses[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.post("/:id/confirm", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.domainAnalyses || [];
  const idx = rows.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Domain Analysis not found" });

  const updated = {
    ...rows[idx],
    status: "confirmed",
    updatedAt: new Date().toISOString(),
  };
  if (rejectIfInvalid(res, updated, db)) return;

  db.domainAnalyses[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const rows = db.domainAnalyses || [];
  const existing = rows.find((v) => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Domain Analysis not found" });

  const conflict = domainAnalysisDeleteConflict(existing, db);
  if (conflict) return res.status(409).json(conflict);

  db.domainAnalyses = rows.filter((v) => v.id !== existing.id);
  saveDB(db);
  res.json({ success: true });
});

export default router;
