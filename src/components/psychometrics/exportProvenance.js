// D85 — CSV/PDF export for every W17 psychometric view.
// Exports refuse incomplete provenance the same way PsychometricFigure does.

import { assertPsychometricProvenance, derivedFromLabel } from "./provenance";
import { itemRowsFromArtefact } from "./itemAnalysisFlags";
import { curvePointsFromArtefact, reliabilityFromArtefact } from "./testInformationCurve";
import { attributeRowsFromArtefact, profileDistributionFromArtefact } from "./attributeProfileView";
import { difRowsFromArtefact } from "./difView";

/** Every dashboard view in the W17 block that must export with provenance. */
export const PSYCHOMETRIC_EXPORT_VIEWS = Object.freeze([
  "item-analysis",
  "test-information",
  "attribute-profile",
  "dif",
]);

export function provenanceBlockLines(provenance) {
  assertPsychometricProvenance(provenance);
  const computedAt =
    provenance.computedAt instanceof Date
      ? provenance.computedAt.toISOString()
      : String(provenance.computedAt);
  return [
    `jobId: ${provenance.jobId}`,
    `packageVersion: ${provenance.packageVersion}`,
    `sampleSize: ${provenance.sampleSize}`,
    `computedAt: ${computedAt}`,
    `derivedFrom: ${derivedFromLabel(provenance)}`,
  ];
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Build a CSV string. Provenance occupies the leading rows so an exported
 * file that left the app still states where it came from.
 */
export function buildCsvExport({ view, provenance, title, dataHeaders, dataRows }) {
  assertPsychometricProvenance(provenance);
  if (!PSYCHOMETRIC_EXPORT_VIEWS.includes(view)) {
    throw new Error(`Unknown psychometric export view '${view}'.`);
  }
  const meta = [
    ["exportView", view],
    ["title", title || view],
    ...provenanceBlockLines(provenance).map((line) => {
      const [k, ...rest] = line.split(": ");
      return [k, rest.join(": ")];
    }),
  ];
  const metaCsv = rowsToCsv(["field", "value"], meta.map(([field, value]) => ({ field, value })));
  const dataCsv = rowsToCsv(dataHeaders, dataRows);
  return `# psychometric-export provenance-required\n${metaCsv}\n${dataCsv}`;
}

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Minimal single-page text PDF (no third-party dependency). Provenance is
 * written at the top of the page body.
 */
export function buildPdfExport({ view, provenance, title, bodyLines = [] }) {
  assertPsychometricProvenance(provenance);
  if (!PSYCHOMETRIC_EXPORT_VIEWS.includes(view)) {
    throw new Error(`Unknown psychometric export view '${view}'.`);
  }

  const lines = [
    title || `Psychometric export — ${view}`,
    "",
    "PROVENANCE (required)",
    ...provenanceBlockLines(provenance),
    "",
    ...bodyLines,
  ];

  const contentOps = ["BT", "/F1 10 Tf", "50 780 Td", "14 TL"];
  lines.forEach((line, i) => {
    if (i === 0) {
      contentOps.push(`(${escapePdfText(line)}) Tj`);
    } else {
      contentOps.push("T*", `(${escapePdfText(line)}) Tj`);
    }
  });
  contentOps.push("ET");
  const stream = contentOps.join("\n");
  const streamLength = new TextEncoder().encode(stream).length;

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
  );
  objects.push(
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return pdf;
}

/** Build CSV + PDF payloads for one W17 view from an analysis artefact. */
export function buildExportsForView(view, { provenance, artefact }) {
  assertPsychometricProvenance(provenance);
  switch (view) {
    case "item-analysis": {
      const rows = itemRowsFromArtefact(artefact);
      const dataRows = rows.map((r) => ({
        itemId: r.itemId,
        pValue: r.pValue,
        pointBiserial: r.pointBiserial,
        n: r.n,
        flags: (r.flags || []).map((f) => f.code).join("|"),
      }));
      const csv = buildCsvExport({
        view,
        provenance,
        title: "Item analysis",
        dataHeaders: ["itemId", "pValue", "pointBiserial", "n", "flags"],
        dataRows,
      });
      const pdf = buildPdfExport({
        view,
        provenance,
        title: "Item analysis",
        bodyLines: dataRows.map(
          (r) =>
            `${r.itemId}: p=${r.pValue}, rpb=${r.pointBiserial}, n=${r.n}, flags=${r.flags || "none"}`
        ),
      });
      return { csv, pdf };
    }
    case "test-information": {
      const points = curvePointsFromArtefact(artefact);
      const reliability = reliabilityFromArtefact(artefact);
      const dataRows = points.map((p) => ({
        theta: p.theta,
        information: p.information,
        conditionalSEM: p.conditionalSEM,
      }));
      const csv = buildCsvExport({
        view,
        provenance,
        title: "Test information",
        dataHeaders: ["theta", "information", "conditionalSEM"],
        dataRows,
      });
      const pdf = buildPdfExport({
        view,
        provenance,
        title: "Test information",
        bodyLines: [
          `KR-20 (classical): ${reliability.kr20 ?? "—"}`,
          `Marginal reliability (IRT): ${reliability.marginalReliability ?? "—"}`,
          "",
          ...dataRows.map(
            (r) => `θ=${r.theta}: I=${r.information}, SEM=${r.conditionalSEM}`
          ),
        ],
      });
      return { csv, pdf };
    }
    case "attribute-profile": {
      const rows = attributeRowsFromArtefact(artefact);
      const profiles = profileDistributionFromArtefact(artefact);
      const dataRows = rows.map((r) => ({
        attributeId: r.attributeId,
        probabilityAveragedMasteryRate: r.probabilityAveragedMasteryRate,
        classificationCountedMasteryRate: r.classificationCountedMasteryRate,
      }));
      const csv = buildCsvExport({
        view,
        provenance,
        title: "Attribute-profile cohort",
        dataHeaders: [
          "attributeId",
          "probabilityAveragedMasteryRate",
          "classificationCountedMasteryRate",
        ],
        dataRows,
      });
      const pdf = buildPdfExport({
        view,
        provenance,
        title: "Attribute-profile cohort",
        bodyLines: [
          ...dataRows.map(
            (r) =>
              `${r.attributeId}: probAvg=${r.probabilityAveragedMasteryRate}, classCount=${r.classificationCountedMasteryRate}`
          ),
          "",
          "Profiles:",
          ...profiles.map((p) => `${p.profileKey}: n=${p.count}, rate=${p.rate}`),
        ],
      });
      return { csv, pdf };
    }
    case "dif": {
      const rows = difRowsFromArtefact(artefact);
      const dataRows = rows.map((r) => ({
        itemId: r.itemId,
        statistic: r.statistic,
        pValue: r.pValue,
        alphaMH: r.alphaMH,
        deltaMH: r.deltaMH,
        etsClass: r.etsClass,
        flag: r.flag,
        method: r.method,
        pair: r.pair,
      }));
      const csv = buildCsvExport({
        view,
        provenance,
        title: "DIF analysis",
        dataHeaders: [
          "itemId",
          "statistic",
          "pValue",
          "alphaMH",
          "deltaMH",
          "etsClass",
          "flag",
          "method",
          "pair",
        ],
        dataRows,
      });
      const pdf = buildPdfExport({
        view,
        provenance,
        title: "DIF analysis",
        bodyLines: [
          "A DIF flag is a prompt to investigate an item, not a group-ability finding.",
          "",
          ...dataRows.map(
            (r) =>
              `${r.itemId}: δ=${r.deltaMH}, ETS ${r.etsClass}, flag=${r.flag}, ${r.method}, ${r.pair}`
          ),
        ],
      });
      return { csv, pdf };
    }
    default:
      throw new Error(`Unknown psychometric export view '${view}'.`);
  }
}

export function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportViewToFiles(view, { provenance, artefact, basename }) {
  const { csv, pdf } = buildExportsForView(view, { provenance, artefact });
  const stem = basename || `psychometrics-${view}`;
  downloadTextFile(`${stem}.csv`, csv, "text/csv;charset=utf-8");
  downloadTextFile(`${stem}.pdf`, pdf, "application/pdf");
  return { csv, pdf };
}

/** Assert an export string carries the full provenance block. */
export function assertExportCarriesProvenance(exportText, provenance) {
  assertPsychometricProvenance(provenance);
  const text = String(exportText);
  if (!text.includes(String(provenance.jobId))) {
    throw new Error("Export missing jobId provenance.");
  }
  if (!text.includes(String(provenance.packageVersion))) {
    throw new Error("Export missing packageVersion provenance.");
  }
  if (!text.includes(String(provenance.sampleSize))) {
    throw new Error("Export missing sampleSize provenance.");
  }
  const computed =
    provenance.computedAt instanceof Date
      ? provenance.computedAt.toISOString()
      : String(provenance.computedAt);
  if (!text.includes(computed)) {
    throw new Error("Export missing computedAt provenance.");
  }
  const derived = derivedFromLabel(provenance);
  if (!derived || !text.includes(derived)) {
    throw new Error("Export missing derived-from provenance.");
  }
  return true;
}
