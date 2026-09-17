// D81 — reusable provenance stamp for every W17 figure.

import { derivedFromLabel } from "./provenance";

function formatComputedAt(value) {
  if (value == null || value === "") return "—";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toISOString();
  } catch {
    return String(value);
  }
}

/**
 * Inline provenance block. Presentational — validation lives in
 * assertPsychometricProvenance / PsychometricFigure so a missing stamp
 * cannot be "forgotten" as optional UI chrome.
 */
export default function ProvenanceStamp({ provenance, className = "" }) {
  const source = derivedFromLabel(provenance);
  const rows = [
    { label: "Job", value: provenance?.jobId },
    { label: "Package", value: provenance?.packageVersion },
    { label: "Sample size", value: provenance?.sampleSize },
    { label: "Computed at", value: formatComputedAt(provenance?.computedAt) },
    { label: "Derived from", value: source },
  ];

  return (
    <figcaption
      data-testid="provenance-stamp"
      className={`mt-3 border-t border-border pt-3 text-caption text-muted-foreground ${className}`.trim()}
    >
      <p className="mb-1 text-label font-medium text-foreground">Provenance</p>
      <dl className="grid gap-1 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-foreground/80">{row.label}</dt>
            <dd className="font-mono text-2xs break-all">
              {row.value == null || row.value === "" ? "—" : String(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </figcaption>
  );
}
