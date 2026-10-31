// Validity evidence access.
//
// JSON harness: db.validityEvidence, written by saveDB. memory and mongo:
// one document per record. Tenancy is applied here. JSON saves are audited
// by saveDB. External writes record the audit event themselves.

import fs from "fs";
import path from "path";
import { validateEntity } from "../../src/utils/schema.js";
import { getTenancyContext, TenancyError } from "../utils/tenancyContext.js";
import { filterRows, rowVisible } from "../utils/tenancyScope.js";
import { recordAuditEvent } from "../../src/utils/db-server.js";
import {
  resolveValidityEvidenceBackend,
  validityEvidenceUseExternalStore,
} from "./validityEvidenceBackend.js";
import {
  jsonListValidityEvidence,
  jsonGetValidityEvidence,
  jsonInsertValidityEvidence,
  jsonReplaceValidityEvidence,
  jsonDeleteValidityEvidence,
} from "./jsonValidityEvidenceAdapter.js";
import {
  mongoListValidityEvidence,
  mongoGetValidityEvidence,
  mongoInsertValidityEvidence,
  mongoReplaceValidityEvidence,
  mongoDeleteValidityEvidence,
} from "./mongoValidityEvidenceAdapter.js";
import { linkTu4FitEvidence } from "./linkTu4Fit.js";

const memoryDocs = new Map();

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

function ecdFile() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

function knownRowsFromFile(evidenceModelId) {
  const file = ecdFile();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed?.validityEvidence) ? parsed.validityEvidence : [];
    if (!evidenceModelId) return rows;
    return rows.filter((row) => row && row.evidenceModelId === evidenceModelId);
  } catch {
    return [];
  }
}

async function loadKnown(evidenceModelId) {
  const backend = resolveValidityEvidenceBackend();
  if (backend === "json") return knownRowsFromFile(evidenceModelId);
  const filter = evidenceModelId ? { evidenceModelId } : {};
  if (backend === "mongo") return mongoListValidityEvidence(filter);
  return [...memoryDocs.values()]
    .map(clone)
    .filter((row) => !evidenceModelId || row.evidenceModelId === evidenceModelId);
}

async function persistExternal(record) {
  const backend = resolveValidityEvidenceBackend();
  if (backend === "mongo") return mongoReplaceValidityEvidence(record);
  const clean = clone(record);
  memoryDocs.set(clean.id, clean);
  return clean;
}

async function removeExternal(id) {
  const backend = resolveValidityEvidenceBackend();
  if (backend === "mongo") return mongoDeleteValidityEvidence(id);
  const existing = memoryDocs.get(id) || null;
  memoryDocs.delete(id);
  return existing ? clone(existing) : null;
}

function assertVisible(row, db) {
  const ctx = getTenancyContext();
  if (!ctx || ctx.unscoped || ctx.role === "admin") return;
  if (!row || !rowVisible("validityEvidence", row, ctx, db || { validityEvidence: [row] })) {
    throw new TenancyError("Row out of tenant scope");
  }
}

function mergeRows(primary, secondary) {
  const map = new Map();
  for (const row of primary || []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of secondary || []) {
    if (row?.id) map.set(row.id, row);
  }
  return [...map.values()];
}

async function validate(record, db) {
  const known = await loadKnown(null);
  const validateDb = {
    ...(db || {}),
    validityEvidence: mergeRows(known, db?.validityEvidence || []),
  };
  const { valid, errors } = validateEntity("validityEvidence", record, validateDb);
  if (!valid) {
    const err = new Error(errors.join(" "));
    err.status = 400;
    throw err;
  }
}

async function audit(action, record, detail = {}) {
  if (!validityEvidenceUseExternalStore()) return;
  await recordAuditEvent({
    action,
    entity: { collection: "validityEvidence", id: record?.id || null, version: null },
    detail: {
      evidenceModelId: record?.evidenceModelId ?? null,
      type: record?.type ?? null,
      source: record?.source ?? null,
      analysisArtefactId: record?.analysisArtefactId ?? null,
      ...detail,
    },
  });
}

export async function queryValidityEvidence(db, filter = {}) {
  let rows;
  const backend = resolveValidityEvidenceBackend();
  if (backend === "json") rows = jsonListValidityEvidence(db, filter);
  else if (backend === "mongo") rows = await mongoListValidityEvidence(filter);
  else {
    rows = [...memoryDocs.values()]
      .map(clone)
      .filter((row) => {
        if (filter.id != null && row.id !== filter.id) return false;
        if (filter.evidenceModelId != null && row.evidenceModelId !== filter.evidenceModelId) return false;
        if (filter.type != null && row.type !== filter.type) return false;
        if (filter.analysisArtefactId != null && row.analysisArtefactId !== filter.analysisArtefactId) {
          return false;
        }
        return true;
      });
  }
  return filterRows("validityEvidence", rows, getTenancyContext(), db || { validityEvidence: rows });
}

export async function getValidityEvidenceById(db, id) {
  let row;
  const backend = resolveValidityEvidenceBackend();
  if (backend === "json") row = jsonGetValidityEvidence(db, id);
  else if (backend === "mongo") row = await mongoGetValidityEvidence(id);
  else row = memoryDocs.has(id) ? clone(memoryDocs.get(id)) : null;
  if (!row) return null;
  const ctx = getTenancyContext();
  const peer = db || { validityEvidence: [row] };
  if (!rowVisible("validityEvidence", row, ctx, peer)) return null;
  return row;
}

export async function insertValidityEvidence(db, record) {
  await validate(record, db);
  assertVisible(record, db);
  const backend = resolveValidityEvidenceBackend();
  if (backend === "json") return jsonInsertValidityEvidence(db, record);
  if (backend === "mongo") {
    const saved = await mongoInsertValidityEvidence(record);
    await audit("validity_evidence.create", saved);
    return saved;
  }
  if (memoryDocs.has(record.id)) throw new Error(`Validity evidence '${record.id}' already exists.`);
  memoryDocs.set(record.id, clone(record));
  await audit("validity_evidence.create", record);
  return clone(record);
}

export async function updateValidityEvidence(db, id, record) {
  await validate(record, db);
  const existing = await getValidityEvidenceById(db, id);
  if (!existing) {
    const err = new Error("Validity evidence not found");
    err.status = 404;
    throw err;
  }
  assertVisible(existing, db);
  assertVisible(record, db);
  const backend = resolveValidityEvidenceBackend();
  if (backend === "json") return jsonReplaceValidityEvidence(db, record);
  if (backend === "mongo") {
    const saved = await mongoReplaceValidityEvidence(record);
    await audit("validity_evidence.update", saved);
    return saved;
  }
  memoryDocs.set(id, clone(record));
  await audit("validity_evidence.update", record);
  return clone(record);
}

export async function removeValidityEvidence(db, id) {
  const existing = await getValidityEvidenceById(db, id);
  if (!existing) return null;
  assertVisible(existing, db);
  const backend = resolveValidityEvidenceBackend();
  if (backend === "json") {
    jsonDeleteValidityEvidence(db, id);
    return existing;
  }
  const removed = await removeExternal(id);
  await audit("validity_evidence.delete", existing);
  return removed || existing;
}

/**
 * Idempotent TU4 link. JSON callers still saveDB. External stores
 * upsert the new or updated row immediately.
 */
export async function ensureTu4Link(db, input) {
  if (!input) return { created: false, updated: false, record: null };
  const known = await loadKnown(input.evidenceModelId);
  const result = linkTu4FitEvidence(db, input, known);
  if ((result.created || result.updated) && result.record && validityEvidenceUseExternalStore()) {
    await persistExternal(result.record);
    await audit(result.created ? "validity_evidence.create" : "validity_evidence.update", result.record);
  }
  return result;
}
