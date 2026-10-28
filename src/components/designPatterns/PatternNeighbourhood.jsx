import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { MarkerType } from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import { apiErrorMessage } from "@/api/apiClient";
import {
  neighbourhoodNodeLabel,
  patternNeighbourhood,
} from "@/utils/patternNeighbourhood";

const NODE_WIDTH = 210;
const NODE_HEIGHT = 56;

function layoutNodes(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB" });
  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    };
  });
}

function flowFrom(neighbourhood) {
  const nodes = neighbourhood.nodes.map((node) => ({
    id: node.id,
    data: { label: neighbourhoodNodeLabel(node) },
    position: { x: 0, y: 0 },
    style: {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      borderRadius: 8,
      border: node.diverged ? "2px dashed #334155" : "1px solid #cbd5e1",
      background: "#ffffff",
      color: "#1e293b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      padding: 6,
      textAlign: "center",
    },
  }));
  const edges = neighbourhood.edges.map((edge) => ({
    id: `${edge.from}-${edge.label}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#334155" },
    style: { stroke: "#334155", strokeWidth: 1.5 },
    labelStyle: { fill: "#334155", fontSize: 11 },
  }));
  return { nodes: layoutNodes(nodes, edges), edges };
}

function PatternNeighbourhood({
  patternId,
  patterns = [],
  report = null,
  onLoad,
  refreshKey = 0,
  onOpen,
}) {
  const [loaded, setLoaded] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (report) {
      setLoaded(report);
      return undefined;
    }
    if (!onLoad || !patternId) return undefined;
    let cancelled = false;
    onLoad(patternId)
      .then((next) => {
        if (!cancelled) setLoaded(next);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, "Could not list seeded models"));
      });
    return () => {
      cancelled = true;
    };
  }, [patternId, report, onLoad, refreshKey]);

  const descendants =
    loaded && (!loaded.designPatternId || loaded.designPatternId === patternId)
      ? loaded.descendants || []
      : [];

  const neighbourhood = useMemo(
    () => patternNeighbourhood({ anchorId: patternId, patterns, descendants }),
    [patternId, patterns, descendants]
  );
  const flow = useMemo(() => flowFrom(neighbourhood), [neighbourhood]);

  return (
    <div className="mb-4 space-y-2">
      <h4 className="text-sm font-medium text-slate-800">Neighbourhood</h4>
      <p className="text-xs text-slate-500">
        One step from this pattern: the patterns it cites, the patterns that
        cite it, and the models seeded from it. Other patterns are not drawn.
        A diverged model is labelled diverged.
      </p>
      {loadError ? (
        <p className="text-sm text-red-600" role="alert">{loadError}</p>
      ) : null}
      <ul aria-label="Patterns and seeded models in this neighbourhood" className="space-y-1">
        {neighbourhood.nodes.map((node) => (
          <li key={node.id} className="flex items-center justify-between gap-2 text-sm text-slate-800">
            <span>{neighbourhoodNodeLabel(node)}</span>
            {node.kind === "pattern" && node.role !== "anchor" ? (
              <button
                type="button"
                className="text-xs text-slate-700 underline"
                onClick={() => onOpen?.(node.id)}
              >
                {`Open ${node.name}`}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="h-72 rounded-md border border-slate-200">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        />
      </div>
    </div>
  );
}

export default React.memo(PatternNeighbourhood);
