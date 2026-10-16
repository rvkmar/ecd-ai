// The psychological perspective is declared on a Domain Analysis.
// A Student Model cites that analysis and inherits the value.
// A perspective already stored on the model is left in place until rebuild.

export function applyDomainAnalysisChoice({
  model,
  domainAnalysisId,
  analyses = [],
  baselinePerspective = "",
}) {
  const next = {
    ...(model || {}),
    domainAnalysisId: domainAnalysisId || undefined,
  };
  const analysis = analyses.find((row) => row.id === domainAnalysisId);
  const declared = analysis?.psychologicalPerspective;
  if (!baselinePerspective && declared) {
    next.psychologicalPerspective = declared;
  }
  return next;
}

export function rebuildPerspective(model, analyses = []) {
  const analysis = analyses.find((row) => row.id === model?.domainAnalysisId);
  const declared = analysis?.psychologicalPerspective;
  if (!declared) return model;
  return { ...(model || {}), psychologicalPerspective: declared };
}
