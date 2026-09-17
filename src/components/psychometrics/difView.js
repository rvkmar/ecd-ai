// D84 — helpers for dif-analysis artefacts (D69).
// Operational flag is ETS C (|deltaMH| ≥ 1.5). Unadjusted MH p is not.

export const DIF_INVESTIGATION_FRAMING =
  "A DIF flag is a prompt to investigate an item for differential item functioning conditional on ability. It is not a finding that one group of students has higher or lower ability.";

export const DIF_FLAG_NOT =
  "A flag does not mean the focal group is less able, does not authorise a parameter-set change, and is not the same as an unadjusted MH p < 0.05.";

export function etsEffectSizeBand(etsClass) {
  const c = String(etsClass || "").toUpperCase();
  if (c === "A") return { band: "A", label: "Negligible (ETS A)" };
  if (c === "B") return { band: "B", label: "Moderate (ETS B)" };
  if (c === "C") return { band: "C", label: "Large (ETS C) — operational flag" };
  return { band: c || "—", label: etsClass ? `Class ${etsClass}` : "—" };
}

export function difRowsFromArtefact(artefact) {
  const parameters = artefact?.payload?.parameters || artefact?.parameters || {};
  return Object.entries(parameters).map(([itemId, stats]) => {
    const band = etsEffectSizeBand(stats?.etsClass);
    return {
      itemId,
      statistic: stats?.statistic ?? null,
      pValue: stats?.pValue ?? null,
      alphaMH: stats?.alphaMH ?? null,
      deltaMH: stats?.deltaMH ?? null,
      etsClass: stats?.etsClass ?? null,
      effectSizeBand: band.label,
      flag: Boolean(stats?.flag),
      method: stats?.method || artefact?.payload?.diagnostics?.method || "—",
      pair: stats?.pair || "focal vs reference",
    };
  });
}
