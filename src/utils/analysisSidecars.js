// Sidecar CSV helpers for analysis artefacts. Person scores, TIF, and IIF
// stay off list/detail JSON (same pattern as reportHtml).

const SIDECAR_KEYS = [
  "reportHtml",
  "scores",
  "scoresCsv",
  "tifCsv",
  "iifCsv",
  "tifGrid",
  "iifGrid",
  "personFitRows",
  "q3Matrix",
  "bnPersonPosteriors",
];

export function stripArtefactSidecars(row) {
  if (!row) return row;
  const payload = row.payload;
  if (!payload || typeof payload !== "object") {
    return {
      ...row,
      hasReport: Boolean(row.hasReport),
      hasScores: Boolean(row.hasScores),
    };
  }
  const next = { ...payload };
  const hasReport = Boolean(payload.reportHtml) || Boolean(row.hasReport);
  const hasScores =
    (Array.isArray(payload.scores) && payload.scores.length > 0) ||
    (typeof payload.scoresCsv === "string" && payload.scoresCsv.trim()) ||
    Boolean(row.hasScores);
  const hasTif = Boolean(payload.tifCsv) || Boolean(payload.tifGrid) || Boolean(row.hasTif);
  const hasIif = Boolean(payload.iifCsv) || Boolean(payload.iifGrid) || Boolean(row.hasIif);
  const hasPersonFit =
    (Array.isArray(payload.personFitRows) && payload.personFitRows.length > 0) ||
    Boolean(row.hasPersonFit);
  const hasQ3 = Boolean(payload.q3Matrix) || Boolean(row.hasQ3);
  const hasBnPosteriors =
    (Array.isArray(payload.bnPersonPosteriors) && payload.bnPersonPosteriors.length > 0) ||
    Boolean(row.hasBnPosteriors);
  for (const key of SIDECAR_KEYS) {
    if (key in next) delete next[key];
  }
  return {
    ...row,
    payload: next,
    hasReport,
    hasScores,
    hasTif,
    hasIif,
    hasPersonFit,
    hasQ3,
    hasBnPosteriors,
  };
}

export function stripJobSidecars(job) {
  if (!job?.response) {
    return {
      ...job,
      hasReport: Boolean(job?.hasReport),
      hasScores: Boolean(job?.hasScores),
    };
  }
  const response = { ...job.response };
  const hasReport = Boolean(response.reportHtml) || Boolean(job.hasReport);
  const hasScores =
    (Array.isArray(response.scores) && response.scores.length > 0) ||
    (typeof response.scoresCsv === "string" && response.scoresCsv.trim()) ||
    Boolean(job.hasScores);
  const hasPersonFit =
    (Array.isArray(response.personFitRows) && response.personFitRows.length > 0) ||
    Boolean(job.hasPersonFit);
  const hasQ3 = Boolean(response.q3Matrix) || Boolean(job.hasQ3);
  const hasBnPosteriors =
    (Array.isArray(response.bnPersonPosteriors) && response.bnPersonPosteriors.length > 0) ||
    Boolean(job.hasBnPosteriors);
  for (const key of SIDECAR_KEYS) {
    if (key in response) delete response[key];
  }
  return { ...job, response, hasReport, hasScores, hasPersonFit, hasQ3, hasBnPosteriors };
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const keys = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  if (!keys.length) return "";
  const lines = [keys.join(",")];
  for (const row of rows) {
    lines.push(keys.map((key) => csvEscape(row?.[key])).join(","));
  }
  return lines.join("\n");
}

export function scoresFromPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.scores)) return payload.scores;
  return [];
}

export function redactPersonFitRows(rows) {
  return (rows || []).map((row, i) => ({
    Zh: row?.Zh ?? null,
    misfit: Boolean(row?.misfit),
    personId: `row-${i + 1}`,
    personIdRedacted: true,
  }));
}

function redactBnPosteriorRows(rows) {
  return (rows || []).map((row, i) => ({
    marginals: row?.marginals ?? null,
    personId: `row-${i + 1}`,
    personIdRedacted: true,
  }));
}

export function bnPosteriorBody(rows, { isAdmin, minCellSize, id }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (!isAdmin && rows.length < minCellSize) {
    return {
      id,
      suppressed: true,
      reason: `n < ${minCellSize}`,
      n: null,
      minCellSize,
    };
  }
  const out = isAdmin ? rows : redactBnPosteriorRows(rows);
  return {
    id,
    rows: out,
    n: out.length,
    personIdRedacted: !isAdmin,
    minCellSize,
  };
}

export function redactScoreRows(rows) {
  return (rows || []).map((row, i) => {
    if (!row || typeof row !== "object") return { row: i + 1 };
    const { personId, ...rest } = row;
    return { ...rest, personId: `row-${i + 1}`, personIdRedacted: true };
  });
}
