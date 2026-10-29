// Sidecar CSV helpers for analysis artefacts. Person scores, TIF, and IIF
// stay off list/detail JSON (same pattern as reportHtml).

const SIDECAR_KEYS = ["reportHtml", "scores", "scoresCsv", "tifCsv", "iifCsv", "tifGrid", "iifGrid"];

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
  for (const key of SIDECAR_KEYS) {
    if (key in response) delete response[key];
  }
  return { ...job, response, hasReport, hasScores };
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

export function redactScoreRows(rows) {
  return (rows || []).map((row, i) => {
    if (!row || typeof row !== "object") return { row: i + 1 };
    const { personId, ...rest } = row;
    return { ...rest, personId: `row-${i + 1}`, personIdRedacted: true };
  });
}
