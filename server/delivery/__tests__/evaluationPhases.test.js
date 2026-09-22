// server/delivery/__tests__/evaluationPhases.test.js
//
// D123: multi-phase evaluation gate + adjudication (public API only).

import { describe, it, expect } from "vitest";
import {
  applyPhaseGate,
  completeHumanEvaluation,
  pendingHumanRatingsFromSession,
  EVALUATION_STATUS,
} from "../evaluationPhases.js";

describe("applyPhaseGate", () => {
  it("marks complete when no human phase is needed", () => {
    const out = applyPhaseGate(
      { activated: true, strength: 3, rationale: "ok" },
      { method: "key" }
    );
    expect(out.evaluationStatus).toBe(EVALUATION_STATUS.COMPLETE);
    expect(out.activated).toBe(true);
  });

  it("holds with activated null when a human phase follows", () => {
    const out = applyPhaseGate(
      { activated: true, strength: 4, rationale: "auto match" },
      {
        phases: [
          { order: 1, kind: "automated" },
          { order: 2, kind: "human", adjudicationRule: "human_wins" },
        ],
      }
    );
    expect(out.evaluationStatus).toBe(EVALUATION_STATUS.PENDING_HUMAN);
    expect(out.activated).toBeNull();
    expect(out.provisionalActivated).toBe(true);
    expect(out.automatedPhaseResult.activated).toBe(true);
    expect(out.pendingPhase.kind).toBe("human");
  });

  it("does not gate refusals", () => {
    const refused = { refused: true, error: "stale", activated: null };
    expect(applyPhaseGate(refused, { phases: [{ kind: "human" }] })).toBe(refused);
  });
});

describe("completeHumanEvaluation + pendingHumanRatingsFromSession", () => {
  it("completes a pending response and reports honestly before completion", () => {
    const pending = applyPhaseGate(
      { activated: true, strength: 3, observationId: "o1", taskId: "t1" },
      {
        phases: [
          { order: 1, kind: "automated" },
          { order: 2, kind: "human", adjudicationRule: "human_wins" },
        ],
      }
    );
    const session = { responses: [{ ...pending, taskId: "t1", itemId: "i1" }] };
    const queue = pendingHumanRatingsFromSession(session);
    expect(queue).toHaveLength(1);
    expect(queue[0].activated).toBeNull();
    expect(queue[0].provisionalActivated).toBeUndefined();
    expect(queue[0].evaluationStatus).toBe(EVALUATION_STATUS.PENDING_HUMAN);

    const done = completeHumanEvaluation(session.responses[0], {
      activated: false,
      rationale: "rater override",
      ratedBy: "teacher1",
    });
    expect(done.activated).toBe(false);
    expect(done.evaluationStatus).toBe(EVALUATION_STATUS.COMPLETE);
    expect(done.humanRatedBy).toBe("teacher1");
    expect(done.adjudicationApplied).toBe("human_wins");
  });

  it("require_agreement holds on automated/human disagreement", () => {
    const pending = applyPhaseGate(
      { activated: true, strength: 2 },
      {
        phases: [
          { order: 1, kind: "automated" },
          { order: 2, kind: "human", adjudicationRule: "require_agreement" },
        ],
      }
    );
    const done = completeHumanEvaluation(pending, { activated: false });
    expect(done.activated).toBeNull();
    expect(done.evaluationStatus).toBe(EVALUATION_STATUS.PENDING_ADJUDICATION);
  });
});
