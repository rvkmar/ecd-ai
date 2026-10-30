// Cohort / district summaries over person-score sidecars. Tenancy and
// MIN_CELL_SIZE stay in Express — R never sees a district rollup.

import { MIN_CELL_SIZE } from "../utils/aggregatePrivacy.js";
import { templateHonoursChapter } from "../../src/utils/psychometricReportTemplate.js";
import { formatSoftwareCredits } from "../../src/utils/softwareCredits.js";

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

const DISTRICT_REPORT_CSS = `@import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap");
:root{color-scheme:light;--ink:#1c1917;--ink-muted:#57534e;--paper:#e8e4dc;--raised:#fbfaf6;--rule:#d0c8b8;--rule-strong:#5c5346;--accent:#3f4a3a;--flag-bg:#efe4cc;--flag-ink:#7a3e09;--thead:#ece6d8;--row-alt:#f6f3ea;--font-display:"Source Serif 4","Palatino Linotype",Palatino,Georgia,serif;--font-ui:"Source Sans 3","Segoe UI",Calibri,system-ui,sans-serif}
*{box-sizing:border-box}html{background:var(--paper)}
body{margin:0;color:var(--ink);font-family:var(--font-ui);font-size:16px;line-height:1.55;background:var(--paper);-webkit-font-smoothing:antialiased}
::selection{background:var(--flag-bg);color:var(--ink)}
.report{max-width:52rem;margin:0 auto;padding:2.75rem 2.35rem 3.5rem;background:var(--raised);min-height:100vh;box-shadow:0 18px 48px -24px rgba(28,25,23,.35)}
h1{font-family:var(--font-display);font-size:2.2rem;font-weight:700;line-height:1.12;letter-spacing:-.022em;margin:0 0 .8rem}
h2{font-family:var(--font-display);font-size:1.28rem;font-weight:600;margin:2.5rem 0 .7rem;padding-bottom:.38rem;border-bottom:1px solid var(--rule)}
.cover{padding-bottom:1.35rem;margin-bottom:.35rem;border-bottom:2.5px solid var(--ink)}
.cover::after{content:"";display:block;margin-top:.4rem;border-bottom:1px solid var(--ink)}
.lede{color:var(--ink-muted);max-width:66ch;font-size:.98rem;line-height:1.5;margin-bottom:1.2rem}
.meta,.stamp{display:grid;grid-template-columns:repeat(auto-fit,minmax(10.25rem,1fr));gap:.9rem 1.35rem;margin:0;padding:1.1rem 0 0}
.meta dt,.stamp dt{font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 .18rem}
.meta dd,.stamp dd{margin:0;font-size:.92rem;font-variant-numeric:tabular-nums;word-break:break-word}
.note{font-size:.94rem;color:var(--ink-muted);max-width:68ch;white-space:pre-wrap}
.table-wrap{overflow-x:auto;margin:.45rem 0 1.55rem}
table{width:100%;border-collapse:collapse;margin:0;font-size:.84rem;font-variant-numeric:tabular-nums lining-nums}
caption{caption-side:top;text-align:left;font-size:.78rem;font-weight:600;color:var(--ink-muted);margin:0 0 .45rem}
th,td{border:none;border-bottom:1px solid var(--rule);padding:.45rem .6rem;text-align:left;vertical-align:top}
thead th{background:var(--thead);font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted);border-bottom:1.5px solid var(--rule-strong)}
tbody tr:nth-child(even) td,tbody tr:nth-child(even) th{background:var(--row-alt)}
td.n,th.n{text-align:right}td.muted{color:var(--ink-muted)}
table.kv th{width:44%;font-size:.88rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--ink);background:transparent}
table.kv td{text-align:right}table.compact{width:auto;min-width:16rem}
pre.credits{font-size:.8rem;line-height:1.5;background:var(--paper);border:1px solid var(--rule);padding:1rem 1.15rem;overflow:auto;white-space:pre-wrap}
.colophon{margin-top:2.25rem;padding-top:.85rem;border-top:1px solid var(--rule);font-size:.75rem;color:var(--ink-muted)}
@media print{html,body{background:#fff}.report{max-width:none;padding:0;box-shadow:none;background:#fff}}`;

export function buildDistrictAggregateHtml(artefact, aggregate, { snapshot } = {}) {
  const tpl = snapshot || artefact?.payload?.reportTemplate || null;
  const show = (chapter) => templateHonoursChapter(tpl, chapter);
  const title = tpl?.name || "District / cohort summary";
  const cells = aggregate?.cells || {};
  const cellRows = Object.entries(cells).map(([id, cell]) => {
    if (cell?.suppressed) {
      return `<tr><td>${esc(id)}</td><td class="muted" colspan="4">Suppressed (${esc(cell.reason)})</td></tr>`;
    }
    return `<tr><td>${esc(id)}</td><td class="n">${esc(cell.n)}</td><td class="n">${esc(fmt(cell.meanRaw))}</td><td class="n">${esc(fmt(cell.sdRaw))}</td><td class="n">${esc(fmt(cell.meanTheta))}</td></tr>`;
  });
  const flagRows = Object.entries(aggregate?.flagCounts || {}).map(
    ([code, n]) => `<tr><td>${esc(code)}</td><td class="n">${esc(n)}</td></tr>`
  );
  const domainRows = (aggregate?.domains || []).map(
    (d) =>
      `<tr><td>${esc(d.id)}</td><td class="n">${esc(d.nItems)}</td><td class="n">${esc(fmt(d.mean))}</td><td class="n">${esc(fmt(d.sd))}</td></tr>`
  );
  const rel = aggregate?.reliability || {};
  const creditText = formatSoftwareCredits(artefact?.payload?.credits, {
    packageVersion: artefact?.packageVersion,
  });
  const creditHtml = creditText
    ? `<section class="credits-block" id="credits"><h2>Software and packages</h2><p class="note">This report was produced by the ECD R bureau. It is not Iteman or Xcalibre software.</p><pre class="credits">${esc(
        creditText
      )}</pre></section>`
    : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${DISTRICT_REPORT_CSS}</style></head><body>
<main class="report">
<header class="cover">
<h1>${esc(title)}</h1>
<p class="lede">District/cohort view. Person rows are omitted. Cells below MIN_CELL_SIZE (${esc(aggregate?.minCellSize)}) are suppressed. Student-facing item keys live on the Session report, not here.</p>
<dl class="meta stamp">
<div><dt>Artefact</dt><dd>${esc(artefact?.id)}</dd></div>
<div><dt>Job</dt><dd>${esc(artefact?.jobId)}</dd></div>
<div><dt>Engine</dt><dd>${esc(artefact?.packageVersion)}</dd></div>
<div><dt>n gated at</dt><dd>${esc(aggregate?.minCellSize)}</dd></div>
</dl>
</header>
${
  show("reliability")
    ? `<h2>Reliability</h2><div class="table-wrap"><table class="kv"><caption>Internal consistency for this aggregate</caption><tbody>
<tr><th>KR-20</th><td class="n">${esc(fmt(rel.kr20 ?? rel.cronbachAlpha, 4))}</td></tr>
<tr><th>Cronbach alpha</th><td class="n">${esc(fmt(rel.cronbachAlpha, 4))}</td></tr>
<tr><th>SEM</th><td class="n">${esc(fmt(rel.sem))}</td></tr>
</tbody></table></div>`
    : ""
}
<h2>${esc(aggregate?.level === "cohort" ? "Cohort cells" : "District cells")}</h2>
<div class="table-wrap"><table><caption>Cell means with suppression below the privacy floor</caption><thead><tr><th>Cell</th><th class="n">n</th><th class="n">Mean raw</th><th class="n">SD raw</th><th class="n">Mean theta</th></tr></thead><tbody>
${cellRows.join("") || "<tr><td colspan='5'>No scores sidecar on this artefact.</td></tr>"}
</tbody></table></div>
${
  show("flags")
    ? `<h2>Flag counts</h2><div class="table-wrap"><table><caption>Review flags across items in this aggregate</caption><thead><tr><th>Flag</th><th class="n">Items</th></tr></thead><tbody>${
        flagRows.join("") || "<tr><td colspan='2'>None</td></tr>"
      }</tbody></table></div>`
    : ""
}
${
  domainRows.length
    ? `<h2>Domain means</h2><div class="table-wrap"><table><caption>Domain means for this aggregate</caption><thead><tr><th>Domain</th><th class="n">Items</th><th class="n">Mean</th><th class="n">SD</th></tr></thead><tbody>${domainRows.join("")}</tbody></table></div>`
    : ""
}
${creditHtml}
<footer class="colophon">ECD Assessment Platform · psychometric analysis bureau</footer>
</main>
</body></html>`;
}
