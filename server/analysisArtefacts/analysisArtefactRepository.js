// Analysis artefact data access.
//
// JSON harness: the analysisArtefacts array on the ECD db object. saveDB
// writes it. memory and mongo: one document per artefact. Artefacts are
// immutable after insert; callers enqueue a new job instead of editing one.
//
// Production uses mongo. Vitest and `npm run dev` stay on json so existing
// tests keep passing. Unit tests set ANALYSIS_ARTEFACTS_BACKEND=memory.

import { getTenancyContext } from "../utils/tenancyContext.js";
import { filterRows, rowVisible } from "../utils/tenancyScope.js";
import {
  resolveAnalysisArtefactsBackend,
  analysisArtefactsUseExternalStore,
} from "./analysisArtefactBackend.js";
import {
  mongoArtefactFind,
  mongoArtefactFindOne,
  mongoArtefactReplace,
  analysisArtefactToPlain,
} from "./mongoAnalysisArtefactStore.js";

const memoryDocs = new Map();

function clone(value) {
  if (value == null) return value;
  return structuredClone(value);
}

export function resetAnalysisArtefactStoreForTests() {
  memoryDocs.clear();
}

export { analysisArtefactsUseExternalStore, resolveAnalysisArtefactsBackend };

function artefactMatchesFilter(row, filter = {}) {
  if (!row) return false;
  if (filter.id != null && row.id !== filter.id) return false;
  if (filter.kind != null && row.kind !== filter.kind) return false;
  if (filter.jobId != null && row.jobId !== filter.jobId) return false;
  if (
    filter.evidenceModelId != null &&
    row.scope?.evidenceModelId !== filter.evidenceModelId
  ) {
    return false;
  }
  return true;
}

function mongoFilterFrom(filter = {}) {
  const query = {};
  if (filter.id != null) query.id = filter.id;
  if (filter.kind != null) query.kind = filter.kind;
  if (filter.jobId != null) query.jobId = filter.jobId;
  if (filter.evidenceModelId != null) query["scope.evidenceModelId"] = filter.evidenceModelId;
  return query;
}

function applyTenancy(rows, db, filter) {
  if (filter?.unscoped) return rows;
  return filterRows(
    "analysisArtefacts",
    rows,
    getTenancyContext(),
    db || { analysisArtefacts: rows }
  );
}

export function placeAnalysisArtefact(db, artefact) {
  if (!db || !artefact) return artefact;
  db.analysisArtefacts = db.analysisArtefacts || [];
  db.analysisArtefacts.push(artefact);
  return artefact;
}

async function writeStoredArtefact(artefact) {
  const clean = analysisArtefactToPlain(clone(artefact)) || clone(artefact);
  if (!clean?.id) throw new Error("Analysis artefact store refused a document with no id.");
  if (resolveAnalysisArtefactsBackend() === "mongo") {
    await mongoArtefactReplace(clean);
  }
  memoryDocs.set(clean.id, clone(clean));
  return clone(clean);
}

export async function queryAnalysisArtefacts(db, filter = {}) {
  if (!analysisArtefactsUseExternalStore()) {
    return (db?.analysisArtefacts || []).filter((row) => artefactMatchesFilter(row, filter));
  }
  let rows;
  if (resolveAnalysisArtefactsBackend() === "mongo") {
    rows = await mongoArtefactFind(mongoFilterFrom(filter));
    rows = rows.filter((row) => artefactMatchesFilter(row, filter));
  } else {
    rows = [...memoryDocs.values()]
      .filter((row) => artefactMatchesFilter(row, filter))
      .map(clone);
  }
  return applyTenancy(rows, db, filter);
}

export async function getAnalysisArtefactById(db, id) {
  if (id == null) return null;
  if (!analysisArtefactsUseExternalStore()) {
    return (db?.analysisArtefacts || []).find((row) => row && row.id === id) || null;
  }
  const row =
    resolveAnalysisArtefactsBackend() === "mongo"
      ? await mongoArtefactFindOne(id)
      : memoryDocs.has(id)
        ? clone(memoryDocs.get(id))
        : null;
  if (!row) return null;
  const ctx = getTenancyContext();
  const peer = db || { analysisArtefacts: [row] };
  if (!rowVisible("analysisArtefacts", row, ctx, peer)) return null;
  return row;
}

export async function persistAnalysisArtefact(db, artefact) {
  if (!artefact?.id) throw new Error("Analysis artefact store refused a document with no id.");
  if (!analysisArtefactsUseExternalStore()) return artefact;
  return writeStoredArtefact(artefact);
}

export async function exportAllAnalysisArtefacts() {
  if (!analysisArtefactsUseExternalStore()) return null;
  if (resolveAnalysisArtefactsBackend() === "mongo") return mongoArtefactFind({});
  return [...memoryDocs.values()].map(clone);
}

export async function upsertAnalysisArtefacts(docs) {
  const ids = [];
  for (const doc of docs || []) {
    if (!doc?.id) throw new Error("Analysis artefact migration refused a document with no id.");
    ids.push(doc.id);
    if (resolveAnalysisArtefactsBackend() === "mongo") await mongoArtefactReplace(doc);
    if (resolveAnalysisArtefactsBackend() !== "json") {
      const clean = analysisArtefactToPlain(clone(doc)) || clone(doc);
      memoryDocs.set(clean.id, clean);
    }
  }
  return ids;
}

export async function loadStoredAnalysisArtefacts(ids) {
  const want = new Set(ids || []);
  if (resolveAnalysisArtefactsBackend() === "mongo") {
    const rows = await mongoArtefactFind({ id: { $in: [...want] } });
    return rows.filter((row) => want.has(row.id));
  }
  const out = [];
  for (const id of want) {
    if (memoryDocs.has(id)) out.push(clone(memoryDocs.get(id)));
  }
  return out;
}
