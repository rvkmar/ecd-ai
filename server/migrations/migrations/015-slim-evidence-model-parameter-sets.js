// Strip report HTML and person-score payloads from evidence-model
// parameter sets. Item parameters, standard errors, and scalar fit
// indices stay. Each stripped payload is written to analysisArtefacts
// (or an existing artefact is linked when its payload already matches)
// and the parameter set keeps that id. Idempotent.
//
// A dry run writes nothing and reports evidenceModels byte savings.
// A real run copies db.json to backups/db.json.pre-evidence-slim (and
// a db.json.<timestamp> crash copy) before it changes the file. The
// store is checked, then a temp file is checked, and only then does
// the temp file replace db.json.
//
// Rollback: stop node. Copy backups/db.json.pre-evidence-slim over
// ECD_DB_FILE. Preserved analysisArtefacts are additive. Leave them,
// or restore the analysisArtefacts collection from the mongodump taken
// before deploy if that collection must match the old file. Start the
// previous build.
// See docs/ops/migration-policies.md.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { backupDirPath, forgetDbCache } from "../../../src/utils/db-server.js";
import { documentsMatch } from "../../calibrationData/documentCanonical.js";
import { slimParameterSet } from "../../../src/utils/slimParameterSet.js";
import { resolveAnalysisArtefactsBackend } from "../../analysisArtefacts/analysisArtefactBackend.js";
import {
  loadStoredAnalysisArtefacts,
  queryAnalysisArtefacts,
  upsertAnalysisArtefacts,
} from "../../analysisArtefacts/analysisArtefactRepository.js";

function dbFilePath() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

function readFileDb(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writePreMigrationCopy(file, now) {
  const dir = backupDirPath();
  fs.mkdirSync(dir, { recursive: true });
  const stamped = path.join(dir, `db.json.${stamp(now)}`);
  const stable = path.join(dir, "db.json.pre-evidence-slim");
  fs.copyFileSync(file, stamped);
  fs.copyFileSync(file, stable);
  return { stamped, stable };
}

function evidenceBytes(models) {
  return Buffer.byteLength(JSON.stringify(models ?? []), "utf8");
}

function sameValue(a, b) {
  if (a == null && b == null) return true;
  return documentsMatch(a, b);
}

function personScoreRows(personScores) {
  const ids = personScores?.personIds;
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  return ids.map((personId, i) => ({
    personId,
    theta: Array.isArray(personScores.theta) ? personScores.theta[i] : undefined,
    se: Array.isArray(personScores.se) ? personScores.se[i] : undefined,
  }));
}

function defined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function sidecarId(evidenceModelId, statisticalModelId, parameterSetId, index) {
  const hash = crypto
    .createHash("sha256")
    .update([evidenceModelId, statisticalModelId, parameterSetId || "", String(index)].join("\0"))
    .digest("hex")
    .slice(0, 20);
  return `aaps${hash}`;
}

function wantedPersons(stripped) {
  return stripped?.fitStatistics?.personScores || stripped?.personScores || null;
}

function artefactMatchesStripped(artefact, stripped) {
  if (!artefact?.payload || !stripped) return false;
  const preserved = artefact.payload.preservedParameterSet;
  if (preserved && documentsMatch(preserved, stripped)) return true;

  let compared = false;
  if (stripped.reportHtml) {
    compared = true;
    if (artefact.payload.reportHtml !== stripped.reportHtml) return false;
  }

  const wantPersons = wantedPersons(stripped);
  if (wantPersons) {
    compared = true;
    const got =
      artefact.payload.fitStatistics?.personScores ||
      artefact.payload.personScores ||
      preserved?.fitStatistics?.personScores ||
      null;
    if (!got || !documentsMatch(wantPersons, got)) return false;
  }

  if (Array.isArray(stripped.scores) && stripped.scores.length > 0) {
    compared = true;
    const gotScores = artefact.payload.scores || preserved?.scores;
    if (!gotScores || !documentsMatch(stripped.scores, gotScores)) return false;
  }

  for (const key of ["scoresCsv", "tifCsv", "iifCsv", "tifGrid", "iifGrid"]) {
    if (!presentPayload(stripped[key])) continue;
    compared = true;
    const got = artefact.payload[key] ?? preserved?.[key];
    if (!sameValue(got, stripped[key])) return false;
  }

  if (stripped.diagnostics) {
    compared = true;
    const got = artefact.payload.diagnostics || preserved?.diagnostics;
    if (!got || !documentsMatch(stripped.diagnostics, got)) return false;
  }

  return compared;
}

function presentPayload(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function scalarFit(fit) {
  if (!fit || typeof fit !== "object" || Array.isArray(fit)) return null;
  const kept = {};
  for (const [key, value] of Object.entries(fit)) {
    if (key === "personScores" || key === "scores" || key === "scoresCsv") continue;
    if (isPersonPayload(value)) continue;
    kept[key] = value;
  }
  return Object.keys(kept).length ? kept : null;
}

function isPersonPayload(value) {
  if (Array.isArray(value)) {
    return value.some((row) => row && typeof row === "object" && ("personId" in row || "studentId" in row));
  }
  if (!value || typeof value !== "object") return false;
  return (Array.isArray(value.personIds) && value.personIds.length > 0)
    || (Array.isArray(value.studentIds) && value.studentIds.length > 0);
}

function findMatch(artefacts, stripped, parameterSetId) {
  const hits = (artefacts || []).filter((row) => artefactMatchesStripped(row, stripped));
  if (!hits.length) return null;
  const scoped = hits.filter((row) => row.scope?.parameterSetId === parameterSetId);
  const pool = scoped.length ? scoped : hits;
  return [...pool].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
}

function buildArtefact({ id, stripped, evidenceModelId, statisticalModelId, parameterSet, now }) {
  const persons = wantedPersons(stripped);
  const scores = Array.isArray(stripped.scores) && stripped.scores.length
    ? stripped.scores
    : personScoreRows(persons);
  return {
    id,
    kind: "parameter-set-sidecar",
    jobId: parameterSet.calibrationJobId || `preserved:${parameterSet.parameterSetId || id}`,
    scope: {
      evidenceModelId,
      statisticalModelId: statisticalModelId || null,
      parameterSetId: parameterSet.parameterSetId || null,
    },
    packageVersion:
      typeof parameterSet.packageVersion === "string" && parameterSet.packageVersion
        ? parameterSet.packageVersion
        : "preserved",
    sampleSize: typeof parameterSet.sampleSize === "number" && parameterSet.sampleSize > 0
      ? parameterSet.sampleSize
      : 1,
    computedAt: parameterSet.calibratedAt || now,
    payload: defined({
      reportHtml: stripped.reportHtml,
      scores,
      scoresCsv: stripped.scoresCsv,
      tifCsv: stripped.tifCsv,
      iifCsv: stripped.iifCsv,
      tifGrid: stripped.tifGrid,
      iifGrid: stripped.iifGrid,
      fitStatistics: stripped.fitStatistics,
      diagnostics: stripped.diagnostics,
      responseMatrix: stripped.responseMatrix,
      optionMatrix: stripped.optionMatrix,
      personScores: stripped.personScores,
      preservedParameterSet: stripped,
      source: "015-slim-evidence-model-parameter-sets",
    }),
    createdAt: now,
  };
}

function planSlims(db, known, nowIso) {
  const plans = [];
  for (const em of db.evidenceModels || []) {
    for (const sm of em.statisticalModels || []) {
      const sets = sm.parameterSets || [];
      sets.forEach((ps, index) => {
        const { parameterSet, stripped } = slimParameterSet(ps);
        if (!stripped) return;
        let artefact = findMatch(known, stripped, ps.parameterSetId);
        if (!artefact) {
          const id = sidecarId(em.id, sm.id, ps.parameterSetId, index);
          const occupant = known.find((row) => row.id === id);
          const useId = occupant && !artefactMatchesStripped(occupant, stripped)
            ? `${id}${crypto.createHash("sha256").update(JSON.stringify(stripped)).digest("hex").slice(0, 8)}`
            : id;
          artefact = buildArtefact({
            id: useId,
            stripped,
            evidenceModelId: em.id,
            statisticalModelId: sm.id,
            parameterSet: ps,
            now: nowIso,
          });
          known.push(artefact);
        }
        parameterSet.analysisArtefactId = artefact.id;
        plans.push({
          evidenceModelId: em.id,
          statisticalModelId: sm.id,
          parameterSetIndex: index,
          parameterSetId: ps.parameterSetId,
          original: ps,
          parameterSet,
          stripped,
          artefact,
        });
      });
    }
  }
  return plans;
}

function applyPlans(db, plans) {
  const byIndex = new Map(
    plans.map((plan) => [
      `${plan.evidenceModelId}\0${plan.statisticalModelId}\0${plan.parameterSetIndex}`,
      plan,
    ])
  );
  const evidenceModels = (db.evidenceModels || []).map((em) => ({
    ...em,
    statisticalModels: (em.statisticalModels || []).map((sm) => ({
      ...sm,
      parameterSets: (sm.parameterSets || []).map((ps, index) => {
        const plan = byIndex.get(`${em.id}\0${sm.id}\0${index}`);
        return plan ? plan.parameterSet : ps;
      }),
    })),
  }));
  return { ...db, evidenceModels };
}

function refuse(message, copies) {
  const where = copies?.stable ? ` Pre-migration copy: ${copies.stable}` : "";
  throw new Error(`${message} db.json was not changed.${where}`);
}

function verifyEvidence(db, plans, copies) {
  for (const plan of plans) {
    const em = (db.evidenceModels || []).find((row) => row.id === plan.evidenceModelId);
    const sm = em?.statisticalModels?.find((row) => row.id === plan.statisticalModelId);
    const ps = sm?.parameterSets?.[plan.parameterSetIndex];
    if (!ps) {
      refuse(
        `Evidence slim verify failed (missing ${plan.evidenceModelId}/${plan.statisticalModelId} set ${plan.parameterSetIndex}).`,
        copies
      );
    }
    if (
      ps.reportHtml ||
      ps.scores ||
      ps.personScores ||
      ps.responseMatrix ||
      ps.optionMatrix ||
      ps.tifCsv ||
      ps.iifCsv ||
      ps.diagnostics?.plots ||
      ps.fitStatistics?.personScores
    ) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} still holds a report or person scores).`,
        copies
      );
    }
    if (
      plan.original.diagnostics &&
      Object.prototype.hasOwnProperty.call(plan.original.diagnostics, "iterations") &&
      ps.diagnostics?.iterations !== plan.original.diagnostics.iterations
    ) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} diagnostics changed).`,
        copies
      );
    }
    if (!sameValue(ps.parameters, plan.original.parameters)) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} parameters changed).`,
        copies
      );
    }
    if (!sameValue(ps.standardErrors, plan.original.standardErrors)) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} standard errors changed).`,
        copies
      );
    }
    if (!sameValue(ps.fitStatistics, scalarFit(plan.original.fitStatistics))) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} scalar fit changed).`,
        copies
      );
    }
    if (ps.analysisArtefactId !== plan.artefact.id) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} is missing its analysis artefact id).`,
        copies
      );
    }
    if (plan.original.calibrationJobId && ps.calibrationJobId !== plan.original.calibrationJobId) {
      refuse(
        `Evidence slim verify failed (${plan.parameterSetId || plan.parameterSetIndex} lost calibrationJobId).`,
        copies
      );
    }
  }
}

function verifyArtefacts(rows, plans, copies) {
  const byId = new Map((rows || []).filter((row) => row?.id).map((row) => [row.id, row]));
  for (const plan of plans) {
    const got = byId.get(plan.artefact.id);
    if (!got || !artefactMatchesStripped(got, plan.stripped)) {
      refuse(
        `Evidence slim verify failed (analysis artefact ${plan.artefact.id} does not hold the stripped payload).`,
        copies
      );
    }
    if (plan.stripped.reportHtml && got.payload?.reportHtml !== plan.stripped.reportHtml) {
      refuse(
        `Evidence slim verify failed (analysis artefact ${plan.artefact.id} dropped reportHtml).`,
        copies
      );
    }
  }
}

function commitFile(file, db, plans, copies, { artefactsInFile }) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  try {
    const readBack = JSON.parse(fs.readFileSync(tmp, "utf8"));
    verifyEvidence(readBack, plans, copies);
    if (artefactsInFile) verifyArtefacts(readBack.analysisArtefacts, plans, copies);
    fs.renameSync(tmp, file);
    forgetDbCache();
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function summaryFor(plans, before, after, { dryRun, backup }) {
  const saved = before - after;
  const sets = `${plans.length} parameter set(s)`;
  const bytes = `evidenceModels ${before} bytes to ${after} bytes, saving ${saved} bytes`;
  if (dryRun) return `Would slim ${sets}. ${bytes}.`;
  const copy = backup ? ` Pre-migration copy: ${backup}` : "";
  return `Slimmed ${sets}. ${bytes}.${copy}`;
}

async function listFileAndStore(db, backend, listArtefacts) {
  const fromFile = Array.isArray(db?.analysisArtefacts) ? db.analysisArtefacts : [];
  const fromStore = backend === "json" ? fromFile : await listArtefacts(db, backend);
  const byId = new Map();
  for (const row of [...fromFile, ...(fromStore || [])]) {
    if (row?.id) byId.set(row.id, row);
  }
  const storeIds = new Set(
    (backend === "json" ? fromFile : fromStore || []).map((row) => row?.id).filter(Boolean)
  );
  return { known: [...byId.values()], storeIds };
}

async function defaultListArtefacts(db, backend) {
  if (backend === "json") {
    return Array.isArray(db?.analysisArtefacts) ? db.analysisArtefacts : [];
  }
  return queryAnalysisArtefacts(db || {}, { unscoped: true });
}

async function migrateEvidenceModelParameterSets({
  dryRun = false,
  file = dbFilePath(),
  now = new Date(),
  artefactsBackend = resolveAnalysisArtefactsBackend(),
  listArtefacts = defaultListArtefacts,
  upsertArtefacts = upsertAnalysisArtefacts,
  loadArtefacts = loadStoredAnalysisArtefacts,
} = {}) {
  const db = readFileDb(file);
  const before = evidenceBytes(db?.evidenceModels);
  if (!db || !Array.isArray(db.evidenceModels)) {
    return {
      changed: [],
      summary: "No evidenceModels in db.json. Nothing to slim.",
      bytesBefore: before,
      bytesAfter: before,
      bytesSaved: 0,
    };
  }

  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const { known, storeIds } = await listFileAndStore(db, artefactsBackend, listArtefacts);
  const plans = planSlims(db, known, nowIso);
  const preview = applyPlans(db, plans);
  const after = evidenceBytes(preview.evidenceModels);

  if (plans.length === 0) {
    return {
      changed: [],
      summary: "Evidence model parameter sets have no report or person-score payloads. Nothing to slim.",
      bytesBefore: before,
      bytesAfter: before,
      bytesSaved: 0,
    };
  }

  const changed = plans.map((plan) => ({
    evidenceModelId: plan.evidenceModelId,
    statisticalModelId: plan.statisticalModelId,
    parameterSetId: plan.parameterSetId,
    analysisArtefactId: plan.artefact.id,
  }));

  if (dryRun) {
    return {
      changed,
      summary: summaryFor(plans, before, after, { dryRun: true }),
      bytesBefore: before,
      bytesAfter: after,
      bytesSaved: before - after,
    };
  }

  const copies = writePreMigrationCopy(file, now instanceof Date ? now : new Date(now));
  const toWrite = [];
  const seenWrite = new Set();
  for (const plan of plans) {
    if (storeIds.has(plan.artefact.id) || seenWrite.has(plan.artefact.id)) continue;
    seenWrite.add(plan.artefact.id);
    toWrite.push(plan.artefact);
  }

  let next = preview;
  if (artefactsBackend === "json") {
    const artefacts = [...(db.analysisArtefacts || [])];
    const have = new Set(artefacts.map((row) => row?.id).filter(Boolean));
    for (const artefact of toWrite) {
      if (have.has(artefact.id)) continue;
      artefacts.push(artefact);
      have.add(artefact.id);
    }
    next = { ...preview, analysisArtefacts: artefacts };
    verifyArtefacts(next.analysisArtefacts, plans, copies);
  } else if (toWrite.length) {
    await upsertArtefacts(toWrite);
  }

  if (artefactsBackend !== "json") {
    const loaded = await loadArtefacts(plans.map((plan) => plan.artefact.id));
    verifyArtefacts(loaded, plans, copies);
  }
  verifyEvidence(next, plans, copies);
  commitFile(file, next, plans, copies, { artefactsInFile: artefactsBackend === "json" });

  return {
    changed,
    summary: summaryFor(plans, before, after, { dryRun: false, backup: copies.stable }),
    bytesBefore: before,
    bytesAfter: after,
    bytesSaved: before - after,
    backup: copies.stable,
  };
}

const migration = {
  id: "015-slim-evidence-model-parameter-sets",
  description:
    "Remove report HTML and person scores from evidence-model parameter sets after preserving each payload on an analysis artefact.",
  forwardOnly: false,
  rollback:
    "Stop node. Copy backups/db.json.pre-evidence-slim over the ECD db file. Preserved analysisArtefacts are additive; leave them, or restore the analysisArtefacts collection from the mongodump taken before this migration. Start the previous build.",
  migrateEvidenceModelParameterSets,
  async run({ dryRun }) {
    return migrateEvidenceModelParameterSets({ dryRun });
  },
};

export default migration;
