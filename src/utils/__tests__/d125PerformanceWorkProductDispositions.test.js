// src/utils/__tests__/d125PerformanceWorkProductDispositions.test.js
//
// D125 / W25 exit check: each of the four performance work-product types
// has an explicit recorded disposition; two-phase evaluation with
// adjudication still applies (D123 path consumed, not rebuilt).

import { describe, it, expect } from "vitest";
import {
  PERFORMANCE_ASSESSMENT_WORK_PRODUCT_TYPES,
  WORK_PRODUCT_TYPE_DISPOSITIONS,
  WORK_PRODUCT_DISPOSITION_STATUS,
  WORK_PRODUCT_TYPE_VALUES,
  INTERACTION_COMPATIBILITY,
  workProductTypeDisposition,
  isPerformanceAssessmentWorkProductType,
  interactionCompatibilityMessage,
} from "../ecdVocabulary.js";
import {
  applyPhaseGate,
  completeHumanEvaluation,
  EVALUATION_STATUS,
} from "../../../server/delivery/evaluationPhases.js";

describe("D125 — performance work-product dispositions", () => {
  it("records an explicit disposition for every work-product type", () => {
    for (const type of WORK_PRODUCT_TYPE_VALUES) {
      const d = workProductTypeDisposition(type);
      expect(d, type).toBeTruthy();
      expect(Object.values(WORK_PRODUCT_DISPOSITION_STATUS)).toContain(d.status);
      expect(d.note && d.note.length).toBeGreaterThan(20);
      expect(d.resolvedAt).toBeTruthy();
    }
  });

  it("resolves the §6 deferred four as supported (not inventing widgets)", () => {
    expect(PERFORMANCE_ASSESSMENT_WORK_PRODUCT_TYPES).toEqual([
      "performance",
      "artifact",
      "behavior",
      "process_trace",
    ]);
    for (const type of PERFORMANCE_ASSESSMENT_WORK_PRODUCT_TYPES) {
      expect(isPerformanceAssessmentWorkProductType(type)).toBe(true);
      const d = WORK_PRODUCT_TYPE_DISPOSITIONS[type];
      expect(d.status).toBe(WORK_PRODUCT_DISPOSITION_STATUS.SUPPORTED);
      expect(d.resolvedAt).toBe("D125");
      expect(d.interactionTypes).toEqual([]);
      expect(INTERACTION_COMPATIBILITY[type]).toEqual([]);
      expect(d.evaluation).toEqual(
        expect.arrayContaining(["human"])
      );
    }
  });

  it("does not pretend a rated performance is a constructed text box", () => {
    const msg = interactionCompatibilityMessage("performance", "constructed");
    expect(msg).toMatch(/human-rating|Work Product/i);
    expect(msg).not.toMatch(/\byet\b/);
  });
});

describe("D125 — W25 two-phase + adjudication still holds", () => {
  it("automated then human with human_wins adjudication completes", () => {
    const pending = applyPhaseGate(
      {
        activated: true,
        strength: 3,
        rationale: "auto match on process/performance payload",
        workProductType: "performance",
      },
      {
        workProductType: "performance",
        method: "rubric",
        phases: [
          { order: 1, kind: "automated" },
          { order: 2, kind: "human", adjudicationRule: "human_wins" },
        ],
      }
    );
    expect(pending.evaluationStatus).toBe(EVALUATION_STATUS.PENDING_HUMAN);
    expect(pending.activated).toBeNull();

    const done = completeHumanEvaluation(pending, {
      activated: false,
      rationale: "Assessor overrides",
      ratedBy: "teach1",
    });
    expect(done.evaluationStatus).toBe(EVALUATION_STATUS.COMPLETE);
    expect(done.activated).toBe(false);
    expect(done.adjudicationApplied).toBe("human_wins");
  });
});
