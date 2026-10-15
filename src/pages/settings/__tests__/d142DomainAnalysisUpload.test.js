import { describe, it, expect } from "vitest";
import { detectKind } from "../UnifiedBulkUploadPanel.jsx";

describe("D142 domain analysis file detection", () => {
  it("classifies a Layer-1 file even when it declares a perspective", () => {
    const kind = detectKind(
      [
        {
          name: "Diagrams",
          psychologicalPerspective: "trait",
          valuedWork: [{ label: "Explain a diagram" }],
        },
      ],
      "sample-domain-analyses.json",
      ""
    );
    expect(kind).toBe("domainAnalyses");
  });

  it("still classifies a Student Model by its perspective when no Layer-1 section is present", () => {
    const kind = detectKind(
      [{ name: "Numeracy", psychologicalPerspective: "trait", measurementIntent: "A trait model." }],
      "competency.json",
      ""
    );
    expect(kind).toBe("competencyModels");
  });
});
