// D81 — every psychometric figure must compose with a provenance stamp.

import ProvenanceStamp from "./ProvenanceStamp";
import { assertPsychometricProvenance } from "./provenance";

/**
 * Frame for W17 charts. Renders children only when provenance is complete;
 * always mounts ProvenanceStamp. Call sites cannot omit the stamp.
 */
export default function PsychometricFigure({
  provenance,
  title,
  description,
  children,
  className = "",
}) {
  assertPsychometricProvenance(provenance);

  return (
    <figure
      data-testid="psychometric-figure"
      className={`rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm ${className}`.trim()}
    >
      {title ? (
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      ) : null}
      {description ? (
        <p className="mt-1 text-caption text-muted-foreground">{description}</p>
      ) : null}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
      <ProvenanceStamp provenance={provenance} />
    </figure>
  );
}
