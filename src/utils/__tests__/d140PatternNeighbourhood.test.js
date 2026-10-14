import { describe, it, expect } from "vitest";
import { patternNeighbourhood } from "../patternNeighbourhood.js";

function chain(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `dp${index}`,
    name: `Pattern ${index}`,
    relationships:
      index === 0 ? [] : [{ type: "kind-of", targetPatternId: `dp${index - 1}` }],
  }));
}

describe("D140 pattern neighbourhood", () => {
  it("keeps a long chain to the anchor, one step, and the seeded model", () => {
    const patterns = chain(24);
    const graph = patternNeighbourhood({
      anchorId: "dp12",
      patterns,
      descendants: [
        {
          kind: "evidenceModel",
          id: "em1",
          name: "Seeded evidence",
          divergences: [{ reason: "edited" }],
        },
      ],
    });

    expect(graph.nodes.map((node) => node.id).sort()).toEqual([
      "dp11",
      "dp12",
      "dp13",
      "evidenceModel:em1",
    ]);
    expect(graph.nodes.find((node) => node.id === "evidenceModel:em1").diverged).toBe(true);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: "dp12", to: "dp11", label: "kind-of" },
        { from: "dp13", to: "dp12", label: "kind-of" },
        { from: "dp12", to: "evidenceModel:em1", label: "seeded" },
      ])
    );
    expect(graph.nodes.some((node) => node.id === "dp0")).toBe(false);
  });
});
