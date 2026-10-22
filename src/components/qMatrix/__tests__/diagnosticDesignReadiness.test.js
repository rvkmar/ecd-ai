import { describe, it, expect } from "vitest";
import {
  meetsDiagnosticDesignConfirmedGates,
  meetsDiagnosticDesignReviewedGates,
} from "../diagnosticDesignReadiness";
import { isReadyToConfirm } from "../DiagnosticDesignDashboard";
import {
  confirmedDesign,
  operationalDesign,
  readyDraft,
  reviewedDesign,
  thinDraft,
} from "./diagnosticDesignTabFixture";

describe("diagnostic design readiness", () => {
  it("treats a named design with attributes and an entry as ready to confirm", () => {
    expect(meetsDiagnosticDesignReviewedGates(readyDraft)).toBe(true);
    expect(meetsDiagnosticDesignConfirmedGates(readyDraft)).toBe(true);
    expect(meetsDiagnosticDesignConfirmedGates(reviewedDesign)).toBe(true);
    expect(isReadyToConfirm(readyDraft)).toBe(true);
    expect(isReadyToConfirm(reviewedDesign)).toBe(true);
  });

  it("does not count a confirmed design again, or a design with no cells", () => {
    expect(meetsDiagnosticDesignConfirmedGates(thinDraft)).toBe(false);
    expect(isReadyToConfirm(thinDraft)).toBe(false);
    expect(meetsDiagnosticDesignConfirmedGates(confirmedDesign)).toBe(true);
    expect(meetsDiagnosticDesignConfirmedGates(operationalDesign)).toBe(true);
    expect(isReadyToConfirm(confirmedDesign)).toBe(false);
    expect(isReadyToConfirm(operationalDesign)).toBe(false);
    expect(
      meetsDiagnosticDesignConfirmedGates({
        name: "Named",
        competencyModelId: "cm-plant",
        attributeIds: ["smv-part"],
        entries: [],
        status: "draft",
      })
    ).toBe(false);
    expect(meetsDiagnosticDesignReviewedGates(null)).toBe(false);
  });
});
