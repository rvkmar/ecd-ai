// Live response matrices for calibration jobs.
//
// Finished sessions supply the scored cells. A missing item for a student
// is JSON null. The R contract turns that null into NA and does not treat
// it as a wrong answer or drop the column.
//
// DINA and G-DINA take their Q-matrix from the statistical model's
// qMatrixModels row. The item columns are the items that matrix covers,
// including items scored under another evidence model, intersected with
// the items finished sessions actually answered. Observable-keyed entries
// win over item-only entries, the same rule scoring uses. Slip and guess
// stay keyed by item id.
//
// Item floors are per family. The ADR envelope still requires two items.
// These floors are the smallest dichotomous models mirt or GDINA can
// identify, so a job is refused here instead of coming back from R with
// "Too few degrees of freedom".
//
// Saturated dichotomous patterns: 2^J - 1. mirt fixes the latent mean at
// 0 and the variance at 1.
//   Rasch / 1PL / PCM: J difficulty parameters. J = 2 leaves 1 df.
//   2PL, and dichotomous GRM / GPCM: 2J parameters. J = 2 leaves -1 df
//     (mirt: "Too few degrees of freedom"). J = 3 leaves 1 df.
//   3PL: 3J parameters (slope, difficulty, guessing). J = 3 leaves -2 df.
//     J = 4 leaves 3 df. Stable guessing still wants more people; this
//     floor only stops the unidentified model.
//   DINA / G-DINA: slip and guess (2J) plus 2^K - 1 class probabilities.
//     K = 1 is already unidentified at J = 2 (5 parameters, 3 patterns).
//     J = 3 is the smallest saturated single-attribute matrix. G-DINA
//     has at least that many item parameters.
//   CTT and item analysis: a p-value is defined at J = 2. Item analysis
//     still requires 10 students.

import { createHash } from "node:crypto";
import { statisticalModelTypesForJobKind } from "../../src/utils/ecdVocabulary.js";
import { entriesForResponse, itemIsPlacedInQMatrix, textId } from "../../src/utils/qMatrixEntries.js";

const ITEM_ANALYSIS_MIN_STUDENTS = 10;
const CONTRACT_MIN_PERSONS = 2;
const SOURCE_SESSION_ID_LIST_LIMIT = 50;

const CALIBRATION_MIN_ITEMS = Object.freeze({
  Rasch: 2,
  "2PL": 3,
  "3PL": 4,
  GRM: 3,
  GPCM: 3,
  PCM: 2,
  dina: 3,
  gdina: 3,
  ctt: 2,
  "item-analysis": 2,
});

function minimumItemsForRequest(family, subtype) {
  if (family === "item-analysis") return CALIBRATION_MIN_ITEMS["item-analysis"];
  if (family === "ctt") return CALIBRATION_MIN_ITEMS.ctt;
  if (family === "dina") return CALIBRATION_MIN_ITEMS.dina;
  if (family === "gdina") return CALIBRATION_MIN_ITEMS.gdina;
  if (family === "irt") {
    return CALIBRATION_MIN_ITEMS[subtype] || CALIBRATION_MIN_ITEMS["2PL"];
  }
  return CALIBRATION_MIN_ITEMS["item-analysis"];
}

const ITEM_ANALYSIS_SEED = 20261016;
const LIVE_CALIBRATION_SEED = 20261028;

const CLOSED_STATUSES = new Set(["completed", "submitted", "reviewed"]);

const LIVE_KINDS = new Set([
  "irt-parameters",
  "dina-parameters",
  "ctt-statistics",
  "item-analysis",
]);

function isClosedSession(session) {
  return session?.isCompleted === true || CLOSED_STATUSES.has(session?.status);
}

function studentIdOf(session) {
  if (typeof session?.studentId === "string" && session.studentId.trim()) {
    return session.studentId.trim();
  }
  const listed = Array.isArray(session?.studentIds) ? session.studentIds : [];
  const first = listed.find((id) => typeof id === "string" && id.trim());
  return first ? first.trim() : null;
}

function isScored(activated) {
  return activated === true || activated === false;
}

function emptyAssessment() {
  return {
    ok: false,
    code: null,
    message: null,
    sampleSize: 0,
    studentIds: [],
    itemIds: [],
    sessionIds: [],
    sourceSessionIds: undefined,
    sourceSessionCount: 0,
    sourceSessionIdsHash: null,
    qMatrixId: null,
    kind: null,
    request: null,
  };
}

function fail(partial) {
  return { ...emptyAssessment(), ...partial, ok: false, request: null };
}

function sourceSessionStamp(sessionIds) {
  const sorted = [...new Set((sessionIds || []).filter((id) => typeof id === "string" && id))]
    .sort((a, b) => a.localeCompare(b));
  const sourceSessionIdsHash = createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex");
  const stamp = {
    sourceSessionCount: sorted.length,
    sourceSessionIdsHash,
  };
  if (sorted.length <= SOURCE_SESSION_ID_LIST_LIMIT) {
    stamp.sourceSessionIds = sorted;
  }
  return stamp;
}

function idList(value) {
  if (value == null || value === "") return null;
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
  if (!raw) return { error: "Filters must be a list of ids." };
  const ids = raw.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean);
  return ids.length ? ids : null;
}

function parseBound(value, end) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { error: true };
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const iso = dateOnly
    ? end
      ? `${trimmed}T23:59:59.999Z`
      : `${trimmed}T00:00:00.000Z`
    : trimmed;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { error: true };
  return { ms };
}

function eventTime(session, response) {
  const raw = response?.timestamp || session?.finishedAt || session?.completedAt || session?.updatedAt || "";
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function irtContractSubtype(statisticalModel) {
  if (statisticalModel?.type === "rasch") {
    return String(statisticalModel.subtype || "").toLowerCase() === "pcm" ? "PCM" : "Rasch";
  }
  const subtype = String(statisticalModel?.subtype || "2pl").toLowerCase();
  const mapped = {
    "1pl": "Rasch",
    rasch: "Rasch",
    "2pl": "2PL",
    "3pl": "3PL",
    grm: "GRM",
    graded: "GRM",
    gpcm: "GPCM",
    pcm: "PCM",
  };
  return mapped[subtype] || "2PL";
}

function familyLabel(family) {
  if (family === "item-analysis") return "Item analysis";
  if (family === "ctt") return "CTT calibration";
  if (family === "dina") return "DINA calibration";
  if (family === "gdina") return "G-DINA calibration";
  return "IRT calibration";
}

function personMinimum(kind, minSampleSize) {
  const familyDefault = kind === "item-analysis" ? ITEM_ANALYSIS_MIN_STUDENTS : CONTRACT_MIN_PERSONS;
  if (Number.isFinite(minSampleSize) && minSampleSize > 0) {
    return Math.max(CONTRACT_MIN_PERSONS, Math.floor(minSampleSize));
  }
  return familyDefault;
}

function selectedOptionId(response) {
  const raw = response?.rawAnswer;
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") {
    const s = String(raw).trim();
    return s ? s : null;
  }
  if (Array.isArray(raw)) {
    const first = raw.find((v) => v != null && String(v).trim());
    return first != null ? String(first) : null;
  }
  if (typeof raw === "object") {
    const selected = raw.selected;
    if (selected == null) return null;
    if (Array.isArray(selected)) {
      const first = selected.find((v) => v != null && String(v).trim());
      return first != null ? String(first) : null;
    }
    const s = String(selected).trim();
    return s ? s : null;
  }
  return null;
}

function itemKeysFromDb(db, itemIds) {
  const items = db?.items || [];
  if (!items.length) return null;
  const keys = {};
  let any = false;
  for (const id of itemIds) {
    const item = items.find((it) => it.id === id);
    const components = item?.interaction?.responseComponents;
    if (!Array.isArray(components) || components.length === 0) continue;
    const keyed = components.find((c) => c?.isCorrect === true);
    if (!keyed?.id) continue;
    any = true;
    keys[id] = {
      keyedOptionId: String(keyed.id),
      options: components
        .filter((c) => c?.id)
        .map((c) => ({
          id: String(c.id),
          label: c.label != null ? String(c.label) : String(c.id),
          text: c.value != null ? String(c.value) : c.label != null ? String(c.label) : "",
        })),
    };
  }
  return any ? keys : null;
}

function coveredItemIds(qMatrix, db) {
  const ids = new Set();
  for (const entry of qMatrix?.entries || []) {
    const itemId = textId(entry?.itemId);
    if (itemId) ids.add(itemId);
  }
  for (const item of db?.items || []) {
    if (!item?.id) continue;
    if (itemIsPlacedInQMatrix(item, qMatrix?.entries, item.evidenceModelId)) {
      ids.add(textId(item.id));
    }
  }
  return ids;
}

function attributeIdsOf(qMatrix) {
  const declared = Array.isArray(qMatrix?.attributeIds)
    ? qMatrix.attributeIds.map(textId).filter(Boolean)
    : [];
  const unique = [];
  for (const id of declared) {
    if (!unique.includes(id)) unique.push(id);
  }
  if (unique.length) return unique;
  for (const entry of qMatrix?.entries || []) {
    const id = textId(entry?.attributeId);
    if (id && !unique.includes(id)) unique.push(id);
  }
  return unique;
}

function majorityText(itemId, cells, field) {
  const counts = new Map();
  for (const cell of cells) {
    if (cell.itemId !== itemId) continue;
    const id = textId(cell[field]);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (counts.size === 0) return "";
  let best = [];
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = [id];
      bestN = n;
    } else if (n === bestN) {
      best.push(id);
    }
  }
  best.sort((a, b) => a.localeCompare(b));
  return best[0] || "";
}

function primaryObservableId(itemId, cells, items) {
  const counts = new Map();
  for (const cell of cells) {
    if (cell.itemId !== itemId) continue;
    const observableId = textId(cell.observableId);
    if (!observableId) continue;
    counts.set(observableId, (counts.get(observableId) || 0) + 1);
  }
  const item = (items || []).find((row) => row?.id === itemId);
  const authored = textId(item?.observationId);
  // Scoring uses an observable row only when the response names that
  // observable. A response with no observableId keeps the item-only row.
  if (counts.size === 0) return "";
  let best = [];
  let bestN = 0;
  for (const [observableId, n] of counts) {
    if (n > bestN) {
      best = [observableId];
      bestN = n;
    } else if (n === bestN) {
      best.push(observableId);
    }
  }
  if (authored && best.includes(authored)) return authored;
  best.sort((a, b) => a.localeCompare(b));
  return best[0] || authored;
}

function qVectorForItem({ entries, itemId, observableId, evidenceModelId, attributeIds }) {
  const matched = entriesForResponse(entries, {
    itemId,
    observableId,
    evidenceModelId,
  });
  const unknown = [];
  const required = new Set();
  for (const entry of matched) {
    const attributeId = textId(entry?.attributeId);
    if (!attributeId) continue;
    if (!attributeIds.includes(attributeId)) {
      unknown.push(attributeId);
      continue;
    }
    if (entry.required !== undefined && !entry.required) continue;
    required.add(attributeId);
  }
  return {
    unknown,
    requiredCount: required.size,
    usedObservableRows: matched.some((entry) => textId(entry?.observableId)),
    data: attributeIds.map((id) => (required.has(id) ? 1 : 0)),
  };
}

/**
 * Build the ADR 0002 request for one live calibration family.
 *
 * @param {object} db
 * @param {{
 *   evidenceModelId?: string,
 *   statisticalModelId?: string,
 *   kind?: string,
 *   itemIds?: string[]|string,
 *   sessionIds?: string[]|string,
 *   from?: string,
 *   to?: string,
 *   minSampleSize?: number,
 * }} [options]
 */
export function assessLiveResponseMatrix(db, options = {}) {
  const evidenceModelId = typeof options.evidenceModelId === "string" ? options.evidenceModelId.trim() : "";
  const statisticalModelId =
    typeof options.statisticalModelId === "string" ? options.statisticalModelId.trim() : "";
  const kind = options.kind || "item-analysis";

  if (!evidenceModelId) {
    return fail({ code: "MISSING_EVIDENCE_MODEL", message: "Choose an evidence model.", kind });
  }
  if (!LIVE_KINDS.has(kind)) {
    return fail({
      code: "KIND_NOT_LIVE",
      kind,
      message: `Live session matrices are defined for irt-parameters, dina-parameters, ctt-statistics, and item-analysis. Kind '${kind}' still needs a named fixture.`,
    });
  }

  const itemIdsFilter = idList(options.itemIds);
  if (itemIdsFilter?.error) {
    return fail({ code: "INVALID_FILTER", kind, message: "itemIds must be a list of ids." });
  }
  const sessionIdsFilter = idList(options.sessionIds);
  if (sessionIdsFilter?.error) {
    return fail({ code: "INVALID_FILTER", kind, message: "sessionIds must be a list of ids." });
  }
  const fromBound = parseBound(options.from, false);
  const toBound = parseBound(options.to, true);
  if (fromBound?.error || toBound?.error) {
    return fail({ code: "INVALID_FILTER", kind, message: "from and to must be ISO dates." });
  }
  if (fromBound && toBound && fromBound.ms > toBound.ms) {
    return fail({ code: "INVALID_FILTER", kind, message: "from must be on or before to." });
  }

  const evidenceModel = (db?.evidenceModels || []).find((row) => row?.id === evidenceModelId) || null;
  const statisticalModel = statisticalModelId
    ? (evidenceModel?.statisticalModels || []).find((row) => row?.id === statisticalModelId) || null
    : null;

  if (statisticalModelId && !statisticalModel) {
    return fail({
      code: "UNKNOWN_STATISTICAL_MODEL",
      kind,
      message: `Statistical model '${statisticalModelId}' is not on evidence model '${evidenceModelId}'.`,
    });
  }

  if (kind !== "item-analysis" && !statisticalModel) {
    return fail({ code: "MISSING_STATISTICAL_MODEL", kind, message: "Choose a statistical model." });
  }

  if (statisticalModel?.type) {
    const allowed = statisticalModelTypesForJobKind(kind);
    if (allowed.length > 0 && !allowed.includes(statisticalModel.type)) {
      return fail({
        code: "KIND_MISMATCH",
        kind,
        message: `Job kind '${kind}' does not apply to statistical model type '${statisticalModel.type}'.`,
      });
    }
  }

  let family = "item-analysis";
  let subtype = null;
  if (kind === "ctt-statistics") family = "ctt";
  else if (kind === "dina-parameters") family = statisticalModel?.type === "gdina" ? "gdina" : "dina";
  else if (kind === "irt-parameters") {
    family = "irt";
    subtype = irtContractSubtype(statisticalModel);
  }

  const diagnostic = family === "dina" || family === "gdina";
  let qMatrix = null;
  let qMatrixId = null;
  if (diagnostic) {
    qMatrixId = textId(statisticalModel?.structureConfig?.qMatrixId);
    if (!qMatrixId) {
      return fail({
        code: "MISSING_Q_MATRIX",
        kind,
        message: `Statistical model '${statisticalModelId}' has no structureConfig.qMatrixId, so a live ${familyLabel(family)} cannot build a Q-matrix.`,
      });
    }
    qMatrix = (db?.qMatrixModels || []).find((row) => row?.id === qMatrixId) || null;
    if (!qMatrix) {
      return fail({
        code: "UNKNOWN_Q_MATRIX",
        kind,
        qMatrixId,
        message: `Statistical model '${statisticalModelId}' cites Q-matrix '${qMatrixId}', which is not in qMatrixModels.`,
      });
    }
  }

  const itemIdSet = itemIdsFilter ? new Set(itemIdsFilter) : null;
  const sessionIdSet = sessionIdsFilter ? new Set(sessionIdsFilter) : null;
  const hasDateFilter = Boolean(fromBound || toBound);
  const qCovered = diagnostic ? coveredItemIds(qMatrix, db) : null;
  const rows = [];

  for (const session of db?.sessions || []) {
    if (!isClosedSession(session)) continue;
    if (sessionIdSet && !sessionIdSet.has(session.id)) continue;
    const studentId = studentIdOf(session);
    if (!studentId) continue;
    for (const response of session.responses || []) {
      if (diagnostic) {
        const itemId = textId(response?.itemId);
        if (!itemId || !qCovered.has(itemId)) continue;
      } else if (response?.evidenceModelId !== evidenceModelId) {
        continue;
      }
      if (
        statisticalModelId &&
        response.statisticalModelId &&
        response.statisticalModelId !== statisticalModelId
      ) {
        continue;
      }
      if (itemIdSet && !itemIdSet.has(response.itemId)) continue;
      if (hasDateFilter) {
        const at = eventTime(session, response);
        if (at == null) continue;
        if (fromBound && at < fromBound.ms) continue;
        if (toBound && at > toBound.ms) continue;
      }
      rows.push({
        studentId,
        sessionId: typeof session.id === "string" ? session.id : "",
        itemId: response.itemId,
        observableId: response.observableId,
        evidenceModelId: response.evidenceModelId,
        activated: response.activated,
        category: response.category,
        value: response.value,
        timestamp: response.timestamp || "",
        selected: selectedOptionId(response),
      });
    }
  }

  const citedStudents = [...new Set(rows.map((row) => row.studentId))].sort((a, b) =>
    a.localeCompare(b)
  );
  const filtered = Boolean(itemIdsFilter || sessionIdsFilter || hasDateFilter);
  const scopePhrase = filtered ? "this selection" : "this evidence model";

  if (rows.length === 0) {
    return fail({
      code: "NO_RESPONSES",
      kind,
      qMatrixId,
      message: diagnostic
        ? filtered
          ? "No completed session responses match items on this Q-matrix and the item, session, or date filters."
          : `No completed session responses cite an item on Q-matrix '${qMatrixId}'.`
        : filtered
          ? "No completed session responses match this evidence model and the item, session, or date filters."
          : "No completed session responses cite this evidence model.",
    });
  }

  if (rows.every((row) => row.activated == null)) {
    return fail({
      code: "UNSCORED",
      kind,
      qMatrixId,
      message:
        "Every completed response for this evidence model has activated null, so there is no scored answer to analyse.",
      sampleSize: citedStudents.length,
      studentIds: citedStudents,
    });
  }

  const scored = rows.filter((row) => isScored(row.activated) && row.itemId);
  const byCell = new Map();
  for (const row of scored) {
    const key = `${row.studentId}\0${row.itemId}`;
    const prev = byCell.get(key);
    if (!prev || String(row.timestamp) >= String(prev.timestamp)) byCell.set(key, row);
  }

  let itemIds = [...new Set(scored.map((row) => row.itemId))].sort((a, b) => a.localeCompare(b));
  const minimumPersons = personMinimum(kind, options.minSampleSize);
  const minimumItems = minimumItemsForRequest(family, subtype);
  const label = familyLabel(family);

  let qRows = null;
  if (diagnostic) {
    const attributeIds = attributeIdsOf(qMatrix);
    if (attributeIds.length < 1) {
      return fail({
        code: "EMPTY_Q_MATRIX",
        kind,
        qMatrixId,
        message: `Q-matrix '${qMatrixId}' does not name any attributes.`,
      });
    }
    const cells = [...byCell.values()];
    const kept = [];
    const dropped = [];
    for (const itemId of itemIds) {
      const observableId = primaryObservableId(itemId, cells, db?.items);
      const responseEvidenceModelId = majorityText(itemId, cells, "evidenceModelId") || evidenceModelId;
      const vector = qVectorForItem({
        entries: qMatrix.entries,
        itemId,
        observableId,
        evidenceModelId: responseEvidenceModelId,
        attributeIds,
      });
      if (vector.unknown.length) {
        return fail({
          code: "Q_MATRIX_ATTRIBUTE",
          kind,
          qMatrixId,
          message: `Q-matrix '${qMatrixId}' places item '${itemId}' on attribute '${vector.unknown[0]}', which is not in attributeIds.`,
        });
      }
      if (vector.requiredCount < 1) {
        dropped.push(itemId);
        continue;
      }
      kept.push({ itemId, data: vector.data, usedObservableRows: vector.usedObservableRows });
    }
    if (kept.length < minimumItems) {
      const droppedNote = dropped.length ? ` Dropped items with an empty Q-vector: ${dropped.join(", ")}.` : "";
      return fail({
        code: "TOO_FEW_ITEMS",
        kind,
        qMatrixId,
        message: `${label} needs at least ${minimumItems} items with a required attribute on Q-matrix '${qMatrixId}'. This selection has ${kept.length}.${droppedNote}`,
        sampleSize: new Set(scored.map((row) => row.studentId)).size,
        itemIds: kept.map((row) => row.itemId),
      });
    }
    itemIds = kept.map((row) => row.itemId);
    qRows = { attributeIds, rows: kept };
  }

  const itemIdKeep = new Set(itemIds);
  const studentIds = [...new Set(scored.filter((row) => itemIdKeep.has(row.itemId)).map((row) => row.studentId))].sort(
    (a, b) => a.localeCompare(b)
  );

  if (studentIds.length < minimumPersons) {
    const message =
      kind === "item-analysis"
        ? `Item analysis needs at least ${minimumPersons} students with a scored response. This evidence model has ${studentIds.length}.`
        : `${label} needs at least ${minimumPersons} students with a scored response. This selection has ${studentIds.length}.`;
    return fail({
      code: "SAMPLE_TOO_SMALL",
      kind,
      qMatrixId,
      message,
      sampleSize: studentIds.length,
      studentIds,
      itemIds,
    });
  }

  if (itemIds.length < minimumItems) {
    const message =
      kind === "item-analysis"
        ? `Item analysis needs scored responses on at least ${minimumItems} items. This evidence model has ${itemIds.length}.`
        : `${label} needs scored responses on at least ${minimumItems} items. This selection has ${itemIds.length}.`;
    return fail({
      code: "TOO_FEW_ITEMS",
      kind,
      qMatrixId,
      message,
      sampleSize: studentIds.length,
      studentIds,
      itemIds,
    });
  }

  const polytomous = subtype === "GRM" || subtype === "GPCM" || subtype === "PCM";
  const data = studentIds.map((studentId) =>
    itemIds.map((itemId) => {
      const cell = byCell.get(`${studentId}\0${itemId}`);
      if (!cell) return null;
      if (polytomous) {
        if (Number.isInteger(cell.category) && cell.category >= 0) return cell.category;
        if (Number.isInteger(cell.value) && cell.value >= 0) return cell.value;
      }
      return cell.activated === true ? 1 : 0;
    })
  );
  let missingCellCount = 0;
  for (const row of data) {
    for (const cell of row) {
      if (cell == null) missingCellCount += 1;
    }
  }

  const contributingSessions = [];
  for (const row of scored) {
    if (!itemIdKeep.has(row.itemId)) continue;
    if (row.sessionId) contributingSessions.push(row.sessionId);
  }
  const stamp = sourceSessionStamp(contributingSessions);

  const model = subtype ? { family, subtype, itemIds } : { family, itemIds };
  const request = {
    model,
    responseMatrix: { personIds: studentIds, itemIds, data },
    options:
      kind === "item-analysis"
        ? { seed: ITEM_ANALYSIS_SEED, maxIterations: 1 }
        : { seed: LIVE_CALIBRATION_SEED },
    provenance: {
      source: "completed-sessions",
      responseSource: "sessions",
      evidenceModelId,
      statisticalModelId: statisticalModelId || null,
      kind,
      family,
      sampleSize: studentIds.length,
      studentIds,
      missingCellCount,
      missingResponses: "null",
      qMatrixId,
      ...stamp,
    },
  };

  if (qRows) {
    request.qMatrix = {
      id: qMatrixId,
      attributeIds: qRows.attributeIds,
      itemIds,
      data: qRows.rows.map((row) => row.data),
    };
    request.provenance.qMatrixUsesObservableRows = qRows.rows.some((row) => row.usedObservableRows);
  }

  if (kind === "item-analysis") {
    const optionData = studentIds.map((studentId) =>
      itemIds.map((itemId) => {
        const cell = byCell.get(`${studentId}\0${itemId}`);
        if (!cell) return null;
        return cell.selected || null;
      })
    );
    const hasOptions = optionData.some((row) => row.some((cell) => cell != null));
    if (hasOptions) {
      request.optionMatrix = { personIds: studentIds, itemIds, data: optionData };
    }
    const itemKeys = itemKeysFromDb(db, itemIds);
    if (itemKeys) request.itemKeys = itemKeys;
  }

  return {
    ok: true,
    code: null,
    message: null,
    sampleSize: studentIds.length,
    studentIds,
    itemIds,
    sessionIds: stamp.sourceSessionIds || [],
    sourceSessionIds: stamp.sourceSessionIds,
    sourceSessionCount: stamp.sourceSessionCount,
    sourceSessionIdsHash: stamp.sourceSessionIdsHash,
    qMatrixId,
    kind,
    missingCellCount,
    request,
  };
}
