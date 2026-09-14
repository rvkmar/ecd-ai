// src/utils/__tests__/sessionResponseValidation.test.js
//
// Day 28 (Week 6): schema.js's `collection === "sessions"` response
// provenance checks (evidenceModelId/parameterSetId/version consistency)
// sit right beside an `if (r.itemId) {...}` block for item-version checks,
// but were themselves unscoped -- they ran for EVERY response regardless
// of whether it was item-based, which meant the pre-existing legacy
// db.questions response shape (no evidenceModelId field at all) failed
// this check unconditionally the moment a session went "in_progress".
// Found while wiring the first real caller of the item-based shape
// (sessionRoutes.js /submit) and fixed by scoping the whole block to
// `r.itemId` responses, matching the version checks it already sits beside.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  competencyId: "c1",
  statisticalModels: [
    { id: "sm1", type: "irt", active: true, activeParameterSetId: "ps1" },
  ],
};

const item = { id: "item1", versionNumber: 2, taskModelVersion: 3 };

function makeSession(responses) {
  return {
    id: "s1",
    studentId: "u1",
    taskIds: ["t1"],
    currentTaskIndex: 1,
    responses,
    status: "in_progress",
  };
}

function makeDb(overrides = {}) {
  return { evidenceModels: [evidenceModel], items: [item], ...overrides };
}

function sessionErrors(responses, db = makeDb()) {
  const { errors } = validateEntity("sessions", makeSession(responses), db);
  return errors || [];
}

describe("sessions.responses — provenance checks are scoped to item-based responses", () => {
  it("a legacy response (no itemId, no evidenceModelId) passes cleanly once the session is in_progress", () => {
    const errors = sessionErrors([
      { taskId: "t1", questionId: "q1", rawAnswer: "a", scoredValue: 1, timestamp: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(errors).toEqual([]);
  });

  it("a fully-specified item-based response passes cleanly", () => {
    const errors = sessionErrors([
      {
        taskId: "t1",
        itemId: "item1",
        itemVersion: 2,
        taskModelVersion: 3,
        evidenceModelId: "em1",
        evidenceModelVersion: 1,
        parameterSetId: "ps1",
      },
    ]);
    expect(errors).toEqual([]);
  });

  it("an item-based response missing evidenceModelId is refused", () => {
    const errors = sessionErrors([{ taskId: "t1", itemId: "item1", itemVersion: 2, taskModelVersion: 3 }]);
    expect(errors.join(" ")).toMatch(/Session response missing evidenceModelId/);
  });

  it("an item-based response with a dangling evidenceModelId is refused", () => {
    const errors = sessionErrors([
      { taskId: "t1", itemId: "item1", itemVersion: 2, taskModelVersion: 3, evidenceModelId: "em-ghost" },
    ]);
    expect(errors.join(" ")).toMatch(/Invalid evidenceModelId in session: em-ghost/);
  });

  it("an item-based response with a stale parameterSetId is refused", () => {
    const errors = sessionErrors([
      {
        taskId: "t1",
        itemId: "item1",
        itemVersion: 2,
        taskModelVersion: 3,
        evidenceModelId: "em1",
        evidenceModelVersion: 1,
        parameterSetId: "ps-old",
      },
    ]);
    expect(errors.join(" ")).toMatch(/Session response parameterSetId mismatch/);
  });

  it("D68: a calibrated response may cite a still-owned set that is no longer active", () => {
    const db = makeDb({
      evidenceModels: [{
        id: "em1",
        versionNumber: 1,
        competencyId: "c1",
        statisticalModels: [{
          id: "sm1",
          type: "irt",
          active: true,
          activeParameterSetId: "ps2",
          parameterSets: [
            { parameterSetId: "ps1", parameters: { o1: { a: 1, b: 0 } } },
            { parameterSetId: "ps2", parameters: { o1: { a: 2, b: -1 } } },
          ],
        }],
      }],
    });
    const errors = sessionErrors([
      {
        taskId: "t1",
        itemId: "item1",
        itemVersion: 2,
        taskModelVersion: 3,
        evidenceModelId: "em1",
        evidenceModelVersion: 1,
        parameterSetId: "ps1",
        parameterSource: "calibrated",
      },
    ], db);
    expect(errors).toEqual([]);
  });

  it("an item-based response with a stale itemVersion or taskModelVersion is refused", () => {
    const errors = sessionErrors([
      {
        taskId: "t1",
        itemId: "item1",
        itemVersion: 1, // real item is at version 2
        taskModelVersion: 3,
        evidenceModelId: "em1",
        evidenceModelVersion: 1,
        parameterSetId: "ps1",
      },
    ]);
    expect(errors.join(" ")).toMatch(/Session item version mismatch/);
  });

  it("an item-based response with a stale evidenceModelVersion is refused", () => {
    const errors = sessionErrors([
      {
        taskId: "t1",
        itemId: "item1",
        itemVersion: 2,
        taskModelVersion: 3,
        evidenceModelId: "em1",
        evidenceModelVersion: 99,
        parameterSetId: "ps1",
      },
    ]);
    expect(errors.join(" ")).toMatch(/Session evidenceModelVersion mismatch/);
  });
});

/* ------------------------------------------------------------------
   Day 33 (Week 7): studentModel.smvPosteriors -- the persisted shape of
   an accumulateEvidence() result. See evidenceAccumulation.js's
   applyPosteriorsToSession(), the one producer this shape is validated
   against.
------------------------------------------------------------------ */

function validPosterior(overrides = {}) {
  return {
    smvId: "smv1",
    smvType: "continuous",
    evidenceModelId: "em1",
    parameterSetId: "ps1",
    modelFamily: "irt",
    method: "eap",
    estimate: 0.5,
    precision: 0.3,
    sem: 0.3,
    responsesUsed: 4,
    responsesExcluded: 0,
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function sessionWithPosteriors(smvPosteriors) {
  return {
    id: "s1",
    studentId: "u1",
    taskIds: ["t1"],
    currentTaskIndex: 1,
    responses: [],
    status: "in_progress",
    studentModel: { smvPosteriors },
  };
}

describe("sessions.studentModel.smvPosteriors — the accumulated posterior's persisted shape", () => {
  it("a well-formed posterior, correctly keyed, passes cleanly", () => {
    const { errors } = validateEntity("sessions", sessionWithPosteriors({ smv1: validPosterior() }), makeDb());
    expect(errors).toEqual([]);
  });

  it("a session with no smvPosteriors at all is unaffected (backward compatible)", () => {
    const session = { id: "s1", studentId: "u1", taskIds: ["t1"], currentTaskIndex: 0, responses: [], status: "draft" };
    const { errors } = validateEntity("sessions", session, makeDb());
    expect(errors).toEqual([]);
  });

  it("the legacy studentModel.irtTheta/bnPosteriors shape is untouched by this check", () => {
    const session = sessionWithPosteriors(undefined);
    session.studentModel = { irtTheta: 0.4, stderr: 0.2, bnPosteriors: { node1: 0.7 } };
    const { errors } = validateEntity("sessions", session, makeDb());
    expect(errors).toEqual([]);
  });

  it("rejects smvPosteriors that is not an object map (e.g. an array)", () => {
    const { errors } = validateEntity("sessions", sessionWithPosteriors([validPosterior()]), makeDb());
    expect(errors.join(" ")).toMatch(/must be an object keyed by Student Model Variable id/);
  });

  it("rejects a posterior whose smvId does not match its own map key (the 'one pointer' check)", () => {
    const { errors } = validateEntity(
      "sessions",
      sessionWithPosteriors({ smv1: validPosterior({ smvId: "smv-other" }) }),
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/smvId \('smv-other'\) must match its own key \('smv1'\)/);
  });

  it("rejects a posterior missing a required string field", () => {
    const { errors } = validateEntity(
      "sessions",
      sessionWithPosteriors({ smv1: validPosterior({ evidenceModelId: undefined }) }),
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/evidenceModelId must be a non-empty string/);
  });

  it("rejects a non-finite estimate", () => {
    const { errors } = validateEntity(
      "sessions",
      sessionWithPosteriors({ smv1: validPosterior({ estimate: NaN }) }),
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/estimate must be a finite number/);
  });

  it("rejects a negative precision -- the exact 'confidently wrong number' this shape exists to prevent", () => {
    const { errors } = validateEntity(
      "sessions",
      sessionWithPosteriors({ smv1: validPosterior({ precision: -0.1 }) }),
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/precision must be a non-negative finite number/);
  });

  it("rejects a non-ISO updatedAt", () => {
    const { errors } = validateEntity(
      "sessions",
      sessionWithPosteriors({ smv1: validPosterior({ updatedAt: "not-a-date" }) }),
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/updatedAt must be an ISO date string/);
  });

  it("validates every entry in a multi-SMV map independently", () => {
    const { errors } = validateEntity(
      "sessions",
      sessionWithPosteriors({
        smv1: validPosterior(),
        smv2: validPosterior({ smvId: "smv2", precision: -1 }),
      }),
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/smvPosteriors\['smv2'\]\.precision/);
  });
});

describe("sessions.stopped — D58 persisted measurement stop", () => {
  const validStop = {
    rule: "targetsMet",
    assemblyModelId: "am1",
    reason: "Every reported Assembly Model target is met.",
    stoppedAt: "2026-09-13T06:00:00.000Z",
  };

  it("accepts a well-formed stop on an in-progress session", () => {
    const { errors } = validateEntity(
      "sessions",
      { ...makeSession([]), stopped: validStop },
      makeDb()
    );
    expect(errors).toEqual([]);
  });

  it("refuses an invented coverage rule", () => {
    const { errors } = validateEntity(
      "sessions",
      { ...makeSession([]), stopped: { ...validStop, rule: "coverage" } },
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/stopped\.rule must be 'maxItems' or 'targetsMet'/);
  });

  it("refuses a stop without a reason", () => {
    const { errors } = validateEntity(
      "sessions",
      { ...makeSession([]), stopped: { ...validStop, reason: "  " } },
      makeDb()
    );
    expect(errors.join(" ")).toMatch(/stopped\.reason must be a non-empty string/);
  });
});
