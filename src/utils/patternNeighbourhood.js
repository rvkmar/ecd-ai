// D140. One pattern, its relations one step away, and the models that
// pattern already seeded. Unrelated patterns are not drawn.

export function neighbourhoodNodeLabel(node) {
  if (node.role === "anchor") return `${node.name} (this pattern)`;
  if (node.diverged) return `${node.name} (seeded, diverged)`;
  if (node.role === "seeded") return `${node.name} (seeded)`;
  return `${node.name} (${node.relationType || "related"})`;
}

/**
 * @param {{ anchorId: string, patterns?: object[], descendants?: object[] }} input
 * @returns {{ nodes: object[], edges: { from: string, to: string, label: string }[] }}
 */
export function patternNeighbourhood({ anchorId, patterns = [], descendants = [] }) {
  const byId = new Map(
    patterns.filter((row) => row && row.id).map((row) => [row.id, row])
  );
  const anchor = byId.get(anchorId);
  if (!anchor) return { nodes: [], edges: [] };

  const nodes = new Map();
  const edges = [];

  function addPattern(row, role, relationType) {
    if (!row || nodes.has(row.id)) return;
    nodes.set(row.id, {
      id: row.id,
      kind: "pattern",
      name: row.name || row.id,
      role,
      relationType: relationType || "",
      diverged: false,
    });
  }

  addPattern(anchor, "anchor", "");

  for (const rel of anchor.relationships || []) {
    if (!rel || !rel.targetPatternId || rel.targetPatternId === anchor.id) continue;
    const target = byId.get(rel.targetPatternId);
    if (!target) continue;
    addPattern(target, "relation", rel.type);
    edges.push({ from: anchor.id, to: target.id, label: rel.type || "related" });
  }

  for (const row of patterns) {
    if (!row || row.id === anchor.id) continue;
    for (const rel of row.relationships || []) {
      if (!rel || rel.targetPatternId !== anchor.id) continue;
      addPattern(row, "relation", rel.type);
      edges.push({ from: row.id, to: anchor.id, label: rel.type || "related" });
    }
  }

  for (const row of descendants) {
    if (!row || !row.id) continue;
    const id = `${row.kind || "model"}:${row.id}`;
    const diverged = Array.isArray(row.divergences) && row.divergences.length > 0;
    nodes.set(id, {
      id,
      kind: row.kind || "model",
      name: row.name || row.id,
      role: "seeded",
      relationType: "seeded",
      diverged,
    });
    edges.push({ from: anchor.id, to: id, label: "seeded" });
  }

  return { nodes: [...nodes.values()], edges };
}
