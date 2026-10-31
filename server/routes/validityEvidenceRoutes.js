// TU17. Empirical validity evidence linked to an evidence model.
// Admin and district may write. Teachers may read. Students may not.
// Rows are tenant-scoped. A row with no districtId is platform evidence.

import express from "express";
import { randomBytes } from "crypto";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { VALIDITY_EVIDENCE_TYPES } from "../../src/utils/validityEvidence.js";
import {
  queryValidityEvidence,
  getValidityEvidenceById,
  insertValidityEvidence,
  updateValidityEvidence,
  removeValidityEvidence,
} from "../validityEvidence/validityEvidenceRepository.js";

const router = express.Router();
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

const canView = authorizeRole(["admin", "district", "teacher"]);
const canWrite = authorizeRole(["admin", "district"]);

function newId() {
  return `ve${randomBytes(8).toString("hex")}`;
}

function claim(user) {
  return {
    districtId: user?.districtId || user?.profile?.districtId || null,
    schoolId: user?.schoolId || user?.profile?.schoolId || null,
  };
}

function cleanStringList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return value;
  return value.filter((item) => typeof item === "string");
}

function cleanIndexList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return value;
  return value.filter((item) => typeof item === "number");
}

function sendError(res, err) {
  const status = err?.status || (err?.name === "TenancyError" ? 403 : 400);
  const body = { error: err?.message || "Invalid validity evidence" };
  if (err?.code) body.code = err.code;
  return res.status(status).json(body);
}

function stampTenancy(user, requested = {}) {
  if (user?.role === "admin") {
    return {
      districtId: typeof requested.districtId === "string" && requested.districtId
        ? requested.districtId
        : null,
      schoolId: typeof requested.schoolId === "string" && requested.schoolId
        ? requested.schoolId
        : null,
    };
  }
  const fromUser = claim(user);
  return {
    districtId: fromUser.districtId,
    schoolId: fromUser.schoolId,
  };
}

router.get("/", canView, async (req, res) => {
  try {
    const db = loadDB();
    const { evidenceModelId, type } = req.query;
    const rows = await queryValidityEvidence(db, {
      ...(evidenceModelId ? { evidenceModelId: String(evidenceModelId) } : {}),
      ...(type ? { type: String(type) } : {}),
    });
    rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    res.json(rows);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/:id", canView, async (req, res) => {
  try {
    const db = loadDB();
    const row = await getValidityEvidenceById(db, req.params.id);
    if (!row) return res.status(404).json({ error: "Validity evidence not found" });
    res.json(row);
  } catch (err) {
    return sendError(res, err);
  }
});

router.post("/", canWrite, async (req, res) => {
  try {
    const db = loadDB();
    const now = new Date().toISOString();
    const tenancy = stampTenancy(req.user, req.body || {});
    const record = {
      id: newId(),
      evidenceModelId: req.body?.evidenceModelId,
      type: req.body?.type,
      summary: typeof req.body?.summary === "string" ? req.body.summary.trim() : req.body?.summary,
      body: typeof req.body?.body === "string" ? req.body.body : "",
      source: typeof req.body?.source === "string" ? req.body.source.trim() : req.body?.source,
      author: req.user?.username || "unknown",
      warrantIds: cleanStringList(req.body?.warrantIds),
      alternativeExplanationIndexes: cleanIndexList(req.body?.alternativeExplanationIndexes),
      analysisArtefactId:
        typeof req.body?.analysisArtefactId === "string" && req.body.analysisArtefactId
          ? req.body.analysisArtefactId
          : null,
      calibrationJobId:
        typeof req.body?.calibrationJobId === "string" && req.body.calibrationJobId
          ? req.body.calibrationJobId
          : null,
      parameterSetId:
        typeof req.body?.parameterSetId === "string" && req.body.parameterSetId
          ? req.body.parameterSetId
          : null,
      districtId: tenancy.districtId,
      schoolId: tenancy.schoolId,
      createdAt: now,
      updatedAt: now,
    };
    if (record.type && !VALIDITY_EVIDENCE_TYPES.includes(record.type)) {
      return res.status(400).json({
        error: `type must be one of: ${VALIDITY_EVIDENCE_TYPES.join(", ")}.`,
      });
    }
    const saved = await insertValidityEvidence(db, record);
    await saveDB(db);
    res.status(201).json(saved);
  } catch (err) {
    return sendError(res, err);
  }
});

router.put("/:id", canWrite, async (req, res) => {
  try {
    const db = loadDB();
    const existing = await getValidityEvidenceById(db, req.params.id);
    if (!existing) return res.status(404).json({ error: "Validity evidence not found" });
    if (
      req.body?.evidenceModelId &&
      req.body.evidenceModelId !== existing.evidenceModelId
    ) {
      return res.status(400).json({ error: "evidenceModelId cannot be changed." });
    }
    const tenancy = stampTenancy(req.user, {
      districtId: existing.districtId,
      schoolId: existing.schoolId,
    });
    const next = {
      ...existing,
      type: req.body?.type ?? existing.type,
      summary:
        typeof req.body?.summary === "string" ? req.body.summary.trim() : existing.summary,
      body: typeof req.body?.body === "string" ? req.body.body : existing.body || "",
      source: typeof req.body?.source === "string" ? req.body.source.trim() : existing.source,
      warrantIds:
        req.body?.warrantIds !== undefined ? cleanStringList(req.body.warrantIds) : existing.warrantIds || [],
      alternativeExplanationIndexes:
        req.body?.alternativeExplanationIndexes !== undefined
          ? cleanIndexList(req.body.alternativeExplanationIndexes)
          : existing.alternativeExplanationIndexes || [],
      updatedAt: new Date().toISOString(),
      districtId: req.user?.role === "admin" ? tenancy.districtId : existing.districtId || null,
      schoolId: req.user?.role === "admin" ? tenancy.schoolId : existing.schoolId || null,
    };
    const saved = await updateValidityEvidence(db, existing.id, next);
    await saveDB(db);
    res.json(saved);
  } catch (err) {
    return sendError(res, err);
  }
});

router.delete("/:id", canWrite, async (req, res) => {
  try {
    const db = loadDB();
    const removed = await removeValidityEvidence(db, req.params.id);
    if (!removed) return res.status(404).json({ error: "Validity evidence not found" });
    await saveDB(db);
    res.status(204).end();
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
