// server/routes/psychometricReportTemplatesRoutes.js
// Governed Iteman/Xcalibre-class report templates. Admin authors; district
// may view operational rows. Distinct from ECD task `templates`.
// Adopting a template on a calibration job freezes a snapshot; editing
// a template never rewrites ingested artefacts.

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { validateEntity } from "../../src/utils/schema.js";
import { validatePsychometricReportTemplateLifecycle } from "../utils/lifecycleValidation.js";
import { canTransition } from "../utils/lifecycleMatrix.js";
import {
  DEFAULT_CHAPTERS_BY_KIND,
  DEFAULT_REPORT_FLAGS,
  DEFAULT_SKIN_BY_KIND,
} from "../../src/utils/psychometricReportTemplate.js";

const router = express.Router();

router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canAuthor = authorizeRole(["admin"]);
const canDelete = authorizeRole(["admin"]);
const canView = authorizeRole(["admin", "district"]);

let idCounter = 0;
const genId = () => `prt${Date.now()}${(idCounter++ % 1000).toString().padStart(3, "0")}`;

const WRITE_KEYS = [
  "name",
  "description",
  "kind",
  "audience",
  "chapters",
  "flags",
  "nQuantiles",
  "includePretest",
  "includeDif",
  "cutScoreLabels",
  "skinId",
  "status",
];

function pickWrites(body = {}) {
  const out = {};
  for (const key of WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

function visibleTo(req, rows) {
  if (req.user?.role === "admin") return rows;
  return rows.filter((row) => row.status === "operational");
}

function createPsychometricReportTemplateRecord(payload = {}, db, options = {}) {
  const now = new Date().toISOString();
  const preserve = options.preserveLifecycle === true;
  const kind = payload.kind || "combined";
  const record = {
    name: payload.name,
    description: payload.description || "",
    kind,
    audience: payload.audience || "psychometrician",
    chapters: Array.isArray(payload.chapters) ? payload.chapters : DEFAULT_CHAPTERS_BY_KIND[kind] || DEFAULT_CHAPTERS_BY_KIND.combined,
    flags: { ...DEFAULT_REPORT_FLAGS, ...(payload.flags || {}) },
    nQuantiles: Number.isFinite(payload.nQuantiles) ? payload.nQuantiles : 5,
    includePretest: Boolean(payload.includePretest),
    includeDif: Boolean(payload.includeDif),
    cutScoreLabels: payload.cutScoreLabels ?? null,
    skinId: payload.skinId || DEFAULT_SKIN_BY_KIND[kind] || "iteman-classic",
    id: options.assignedId || genId(),
    status: preserve && payload.status ? payload.status : "draft",
    locked: preserve && typeof payload.locked === "boolean" ? payload.locked : false,
    versionNumber: preserve
      ? Number.isFinite(payload.versionNumber)
        ? payload.versionNumber
        : 1
      : payload.versionNumber ?? 1,
    createdAt: now,
    updatedAt: now,
  };

  const { valid, errors } = validateEntity("psychometricReportTemplates", record, db);
  if (!valid) {
    return { ok: false, error: "Report template validation failed", details: errors };
  }
  const lifecycleErrors = validatePsychometricReportTemplateLifecycle(record, db);
  if (lifecycleErrors.length) {
    return {
      ok: false,
      error: "Report template lifecycle validation failed",
      details: lifecycleErrors,
    };
  }

  db.psychometricReportTemplates = db.psychometricReportTemplates || [];
  db.psychometricReportTemplates.push(record);
  return { ok: true, record };
}

router.get("/", canView, (req, res) => {
  const db = loadDB();
  res.json(visibleTo(req, db.psychometricReportTemplates || []));
});

router.get("/:id", canView, (req, res) => {
  const db = loadDB();
  const row = (db.psychometricReportTemplates || []).find((m) => m.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Report template not found" });
  if (req.user?.role !== "admin" && row.status !== "operational") {
    return res.status(404).json({ error: "Report template not found" });
  }
  res.json(row);
});

router.post("/", canAuthor, (req, res) => {
  const db = loadDB();
  const result = createPsychometricReportTemplateRecord(pickWrites(req.body || {}), db);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, details: result.details });
  }
  saveDB(db);
  res.status(201).json(result.record);
});

router.put("/:id", canAuthor, (req, res) => {
  const db = loadDB();
  const idx = (db.psychometricReportTemplates || []).findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Report template not found" });

  const existing = db.psychometricReportTemplates[idx];
  const prevStatus = existing.status || "draft";
  const writes = pickWrites(req.body || {});
  const nextStatus = writes.status || prevStatus;

  if (existing.locked === true) {
    const contentKeys = Object.keys(writes).filter((k) => k !== "status");
    if (contentKeys.length > 0) {
      return res.status(409).json({
        error: "Report template is locked; only a status transition is permitted.",
        details: contentKeys,
      });
    }
  }

  if (nextStatus !== prevStatus && !canTransition(prevStatus, nextStatus)) {
    return res.status(400).json({
      error: `Illegal report template status transition: '${prevStatus}' -> '${nextStatus}'.`,
    });
  }

  const becomingLocked =
    ["confirmed", "operational", "suspended"].includes(nextStatus) || existing.locked === true;

  const updated = {
    ...existing,
    ...writes,
    id: existing.id,
    createdAt: existing.createdAt,
    status: nextStatus,
    locked: becomingLocked,
    updatedAt: new Date().toISOString(),
  };

  const { valid, errors } = validateEntity("psychometricReportTemplates", updated, db);
  if (!valid) {
    return res.status(400).json({ error: "Report template validation failed", details: errors });
  }
  const lifecycleErrors = validatePsychometricReportTemplateLifecycle(updated, db);
  if (lifecycleErrors.length) {
    return res.status(400).json({
      error: "Report template lifecycle validation failed",
      details: lifecycleErrors,
    });
  }

  db.psychometricReportTemplates[idx] = updated;
  saveDB(db);
  res.json(updated);
});

router.delete("/:id", canDelete, (req, res) => {
  const db = loadDB();
  const row = (db.psychometricReportTemplates || []).find((m) => m.id === req.params.id);
  if (!row) return res.status(404).json({ error: "Report template not found" });
  if (row.locked === true && row.status !== "draft") {
    return res.status(409).json({
      error: "Locked report templates cannot be deleted; archive them instead.",
    });
  }
  db.psychometricReportTemplates = (db.psychometricReportTemplates || []).filter(
    (m) => m.id !== req.params.id
  );
  saveDB(db);
  res.json({ success: true });
});

export default router;
