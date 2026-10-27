// Item analysis built from completed session responses for one evidence
// model. Sample size is the number of students with a scored response.
// LSAT7 stays a named fixture and is not used here.

const MIN_SESSION_ITEM_ANALYSIS_N = 10;
const SESSION_ITEM_ANALYSIS_SEED = 20261016;

const CLOSED_STATUSES = new Set(["completed", "submitted", "reviewed"]);

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

/**
 * @returns {{
 *   ok: boolean,
 *   code: string|null,
 *   message: string|null,
 *   sampleSize: number,
 *   studentIds: string[],
 *   itemIds: string[],
 *   request: object|null
 * }}
 */
export function assessSessionItemAnalysis(db, evidenceModelId) {
  const empty = {
    ok: false,
    code: null,
    message: null,
    sampleSize: 0,
    studentIds: [],
    itemIds: [],
    request: null,
  };
  if (!evidenceModelId || typeof evidenceModelId !== "string") {
    return { ...empty, code: "MISSING_EVIDENCE_MODEL", message: "Choose an evidence model." };
  }

  const rows = [];
  for (const session of db?.sessions || []) {
    if (!isClosedSession(session)) continue;
    const studentId = studentIdOf(session);
    if (!studentId) continue;
    for (const response of session.responses || []) {
      if (response?.evidenceModelId !== evidenceModelId) continue;
      rows.push({
        studentId,
        itemId: response.itemId,
        activated: response.activated,
        timestamp: response.timestamp || "",
        selected: selectedOptionId(response),
      });
    }
  }

  const citedStudents = [...new Set(rows.map((row) => row.studentId))].sort((a, b) =>
    a.localeCompare(b)
  );

  if (rows.length === 0) {
    return {
      ...empty,
      code: "NO_RESPONSES",
      message: "No completed session responses cite this evidence model.",
    };
  }

  if (rows.every((row) => row.activated == null)) {
    return {
      ...empty,
      code: "UNSCORED",
      message:
        "Every completed response for this evidence model has activated null, so there is no scored answer to analyse.",
      sampleSize: citedStudents.length,
      studentIds: citedStudents,
    };
  }

  const scored = rows.filter((row) => isScored(row.activated) && row.itemId);
  const byCell = new Map();
  for (const row of scored) {
    const key = `${row.studentId}\0${row.itemId}`;
    const prev = byCell.get(key);
    if (!prev || String(row.timestamp) >= String(prev.timestamp)) byCell.set(key, row);
  }

  const studentIds = [...new Set(scored.map((row) => row.studentId))].sort((a, b) =>
    a.localeCompare(b)
  );
  const itemIds = [...new Set(scored.map((row) => row.itemId))].sort((a, b) =>
    a.localeCompare(b)
  );

  if (studentIds.length < MIN_SESSION_ITEM_ANALYSIS_N) {
    return {
      ...empty,
      code: "SAMPLE_TOO_SMALL",
      message: `Item analysis needs at least ${MIN_SESSION_ITEM_ANALYSIS_N} students with a scored response. This evidence model has ${studentIds.length}.`,
      sampleSize: studentIds.length,
      studentIds,
      itemIds,
    };
  }

  if (itemIds.length < 2) {
    return {
      ...empty,
      code: "TOO_FEW_ITEMS",
      message: `Item analysis needs scored responses on at least two items. This evidence model has ${itemIds.length}.`,
      sampleSize: studentIds.length,
      studentIds,
      itemIds,
    };
  }

  const data = studentIds.map((studentId) =>
    itemIds.map((itemId) => {
      const cell = byCell.get(`${studentId}\0${itemId}`);
      if (!cell) return null;
      return cell.activated === true ? 1 : 0;
    })
  );

  const optionData = studentIds.map((studentId) =>
    itemIds.map((itemId) => {
      const cell = byCell.get(`${studentId}\0${itemId}`);
      if (!cell) return null;
      return cell.selected || null;
    })
  );
  const hasOptions = optionData.some((row) => row.some((cell) => cell != null));
  const itemKeys = itemKeysFromDb(db, itemIds);

  const request = {
    model: { family: "item-analysis", itemIds },
    responseMatrix: { personIds: studentIds, itemIds, data },
    options: { seed: SESSION_ITEM_ANALYSIS_SEED, maxIterations: 1 },
    provenance: {
      source: "completed-sessions",
      evidenceModelId,
      sampleSize: studentIds.length,
      studentIds,
    },
  };
  if (hasOptions) {
    request.optionMatrix = { personIds: studentIds, itemIds, data: optionData };
  }
  if (itemKeys) {
    request.itemKeys = itemKeys;
  }

  return {
    ok: true,
    code: null,
    message: null,
    sampleSize: studentIds.length,
    studentIds,
    itemIds,
    request,
  };
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
