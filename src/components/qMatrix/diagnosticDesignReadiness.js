// Client mirror of the stored-record gates in validateQMatrixModelLifecycle.
// A diagnostic design is a Q-matrix: binary Student Model attributes and
// the item cells that require them.
//
// Reviewed needs a name, a Student Model, and at least one attribute.
// Confirmed also needs at least one stored entry. An all-zero row cannot
// sit in entries[] — the editor blocks that save — so this mirror does
// not re-check it. The server's unplaced-item check needs the evidence
// models and items bound to this design; with nothing bound it passes.

export function meetsDiagnosticDesignReviewedGates(record) {
  if (!record || typeof record !== "object") return false;
  return Boolean(
    String(record.name || "").trim() &&
      String(record.competencyModelId || "").trim() &&
      Array.isArray(record.attributeIds) &&
      record.attributeIds.length > 0
  );
}

export function meetsDiagnosticDesignConfirmedGates(record) {
  return (
    meetsDiagnosticDesignReviewedGates(record) &&
    Array.isArray(record.entries) &&
    record.entries.length > 0
  );
}
