export const ADDITIONAL_KSA_RELATIONSHIPS = Object.freeze([
  {
    value: "required_but_not_measured",
    label: "Required but not measured",
  },
  {
    value: "potentially_confounding",
    label: "Potentially confounding",
  },
]);

export const ADDITIONAL_KSA_RELATIONSHIP_VALUES = ADDITIONAL_KSA_RELATIONSHIPS.map(
  (row) => row.value
);

function ksaLabel(entry) {
  return String(entry?.label || "").trim().toLowerCase();
}

export function additionalKsaFocalOverlap(pattern, patterns = []) {
  const wanted = new Set(
    (pattern?.additionalKsas || []).map(ksaLabel).filter(Boolean)
  );
  if (!wanted.size) return [];
  const hits = [];
  for (const other of patterns || []) {
    if (!other || other.id === pattern?.id) continue;
    for (const focal of other.focalKsas || []) {
      const key = ksaLabel(focal);
      if (!key || !wanted.has(key)) continue;
      hits.push({
        label: String(focal.label).trim(),
        patternId: other.id,
        patternName: other.name || other.id,
      });
    }
  }
  return hits;
}
