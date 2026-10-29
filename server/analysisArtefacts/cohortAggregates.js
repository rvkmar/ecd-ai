// Cohort / district summaries over person-score sidecars. Tenancy and
// MIN_CELL_SIZE stay in Express — R never sees a district rollup.

import { MIN_CELL_SIZE } from "../utils/aggregatePrivacy.js";
import { templateHonoursChapter } from "../../src/utils/psychometricReportTemplate.js";

function mean(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (xs.length < 2) return null;
  const m = mean(xs);
  const varSum = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varSum);
}

function num(row, key) {
  const v = row?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function summariseScoreRows(rows, { minCell = MIN_CELL_SIZE } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const n = list.length;
  if (n > 0 && n < minCell) {
    return {
      suppressed: true,
      reason: `n < ${minCell}`,
      n: null,
      meanRaw: null,
      sdRaw: null,
      meanTheta: null,
      sdTheta: null,
    };
  }
  const raw = list.map((r) => num(r, "raw")).filter((v) => v != null);
  const theta = list.map((r) => num(r, "theta")).filter((v) => v != null);
  return {
    suppressed: false,
    n,
    meanRaw: mean(raw),
    sdRaw: sd(raw),
    meanTheta: mean(theta),
    sdTheta: sd(theta),
  };
}

function flagCountsFromParameters(parameters) {
  const counts = {};
  if (!parameters || typeof parameters !== "object") return counts;
  for (const item of Object.values(parameters)) {
    const flags = Array.isArray(item?.flags) ? item.flags : [];
    for (const flag of flags) {
      const code = flag?.code || "flag";
      counts[code] = (counts[code] || 0) + 1;
    }
  }
  return counts;
}

function domainMeansFromTestLevel(testLevel) {
  const domains = testLevel?.domains;
  if (!domains || typeof domains !== "object") return [];
  const rows = Array.isArray(domains) ? domains : Object.values(domains);
  return rows
    .filter((d) => d && typeof d === "object")
    .map((d) => ({
      id: d.id,
      nItems: d.nItems ?? (Array.isArray(d.itemIds) ? d.itemIds.length : null),
      mean: d.mean ?? null,
      sd: d.sd ?? null,
      alpha: d.alpha ?? null,
    }));
}

export function aggregateArtefactScores(artefact, { level = "district", minCell = MIN_CELL_SIZE } = {}) {
  const scores = Array.isArray(artefact?.payload?.scores) ? artefact.payload.scores : [];
  const scope = artefact?.scope || {};
  const groupKey = level === "cohort" ? "cohortId" : "districtId";
  const groups = new Map();

  if (scores.some((row) => row && row[groupKey])) {
    for (const row of scores) {
      const key = row?.[groupKey] || "(ungrouped)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  } else {
    const key =
      level === "cohort"
        ? scope.cohort || scope.cohortId || "(ungrouped)"
        : scope.districtId || "(ungrouped)";
    groups.set(key, scores);
  }

  const cells = {};
  for (const [key, rows] of groups) {
    cells[key] = summariseScoreRows(rows, { minCell });
  }

  const n = scores.length;
  const wholeSuppressed = n > 0 && n < minCell;
  return {
    level,
    minCellSize: minCell,
    n: wholeSuppressed ? null : n,
    suppressed: wholeSuppressed,
    reason: wholeSuppressed ? `n < ${minCell}` : undefined,
    cells,
    flagCounts: wholeSuppressed ? null : flagCountsFromParameters(artefact?.payload?.parameters),
    domains: wholeSuppressed ? [] : domainMeansFromTestLevel(artefact?.payload?.diagnostics?.testLevel),
    reliability: wholeSuppressed
      ? null
      : artefact?.payload?.diagnostics?.testLevel?.reliability || artefact?.payload?.fitStatistics || null,
    scoreFrequency: wholeSuppressed
      ? null
      : artefact?.payload?.diagnostics?.testLevel?.scoreFrequency || null,
    scope: {
      districtId: scope.districtId ?? null,
      cohort: scope.cohort ?? scope.cohortId ?? null,
    },
  };
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function buildDistrictAggregateHtml(artefact, aggregate, { snapshot } = {}) {
  const tpl = snapshot || artefact?.payload?.reportTemplate || null;
  const show = (chapter) => templateHonoursChapter(tpl, chapter);
  const title = tpl?.name || "District / cohort summary";
  const cells = aggregate?.cells || {};
  const cellRows = Object.entries(cells).map(([id, cell]) => {
    if (cell?.suppressed) {
      return `<tr><td>${esc(id)}</td><td colspan="4">Suppressed (${esc(cell.reason)})</td></tr>`;
    }
    return `<tr><td>${esc(id)}</td><td>${esc(cell.n)}</td><td>${esc(fmt(cell.meanRaw))}</td><td>${esc(fmt(cell.sdRaw))}</td><td>${esc(fmt(cell.meanTheta))}</td></tr>`;
  });
  const flagRows = Object.entries(aggregate?.flagCounts || {}).map(
    ([code, n]) => `<tr><td>${esc(code)}</td><td>${esc(n)}</td></tr>`
  );
  const domainRows = (aggregate?.domains || []).map(
    (d) =>
      `<tr><td>${esc(d.id)}</td><td>${esc(d.nItems)}</td><td>${esc(fmt(d.mean))}</td><td>${esc(fmt(d.sd))}</td></tr>`
  );
  const rel = aggregate?.reliability || {};
  const credits = artefact?.payload?.credits;
  const creditHtml = credits
    ? `<h2>Software and packages</h2><pre class="note">${esc(
        [credits.rVersion, credits.r, ...(credits.packages || [])].filter(Boolean).join("\n\n")
      )}</pre>`
    : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#1a1a1a;line-height:1.45}
table{border-collapse:collapse;margin:12px 0 24px;font-size:14px}
th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
th{background:#f4f4f4}
.note{font-size:13px;color:#444;max-width:72ch;white-space:pre-wrap}
.stamp{font-size:12px;color:#444;margin-bottom:16px}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="stamp">artefact ${esc(artefact?.id)} | job ${esc(artefact?.jobId)} | ${esc(artefact?.packageVersion)} | n gated at ${esc(aggregate?.minCellSize)}</div>
<p class="note">District/cohort view. Person rows are omitted. Cells below MIN_CELL_SIZE (${esc(aggregate?.minCellSize)}) are suppressed. Student-facing item keys live on the Session report, not here.</p>
${
  show("reliability")
    ? `<h2>Reliability</h2><table><tbody>
<tr><th>KR-20</th><td>${esc(fmt(rel.kr20 ?? rel.cronbachAlpha, 4))}</td></tr>
<tr><th>Cronbach alpha</th><td>${esc(fmt(rel.cronbachAlpha, 4))}</td></tr>
<tr><th>SEM</th><td>${esc(fmt(rel.sem))}</td></tr>
</tbody></table>`
    : ""
}
<h2>${esc(aggregate?.level === "cohort" ? "Cohort cells" : "District cells")}</h2>
<table><thead><tr><th>Cell</th><th>n</th><th>Mean raw</th><th>SD raw</th><th>Mean theta</th></tr></thead><tbody>
${cellRows.join("") || "<tr><td colspan='5'>No scores sidecar on this artefact.</td></tr>"}
</tbody></table>
${
  show("flags")
    ? `<h2>Flag counts</h2><table><thead><tr><th>Flag</th><th>Items</th></tr></thead><tbody>${
        flagRows.join("") || "<tr><td colspan='2'>None</td></tr>"
      }</tbody></table>`
    : ""
}
${
  domainRows.length
    ? `<h2>Domain means</h2><table><thead><tr><th>Domain</th><th>Items</th><th>Mean</th><th>SD</th></tr></thead><tbody>${domainRows.join("")}</tbody></table>`
    : ""
}
${show("credits") ? creditHtml : ""}
</body></html>`;
}
