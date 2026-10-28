// server/utils/__tests__/itemExposure.test.js
//
// Day 29 (Week 6): recordItemUsage() -- the exposure-increment logic
// shared between POST /api/items/:id/record-usage (author-gated) and the
// item-based session delivery path (server/routes/sessionRoutes.js,
// triggered by a student's own submission). Exit check: usageCount
// increments on a real session; exposure figures are measurements rather
// than author declarations.

import { describe, it, expect } from "vitest";
import { recordItemUsage } from "../itemExposure.js";

function makeItem(overrides = {}) {
  return {
    id: "i1",
    taskModelId: "tm1",
    versionNumber: 1,
    taskModelVersion: 1,
    observationId: "o1",
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    locked: true,
    equivalenceGroupId: "grp1",
    stimulus: { layout: "single", blocks: [{ type: "text", content: "x" }] },
    interaction: { type: "mcq", responseComponents: [{ id: "a" }] },
    scoring: {
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        { responsePattern: { selected: "a" }, activatesObservable: true, rationale: "Correct." },
      ],
    },
    psychometrics: { statisticalModelType: "irt", irtParams: { a: 1, b: 0 } },
    status: "operational",
    exposureControl: { usageCount: 0, maxUsageBeforeRetire: 5, reactivationCount: 0, maxReactivations: 0 },
    ...overrides,
  };
}

function makeDb(items) {
  return {
    items,
    taskModels: [{
      id: "tm1", versionNumber: 1, status: "operational", locked: true,
      evidenceModelIds: ["em1"],
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
    }],
    evidenceModels: [{
      id: "em1", versionNumber: 1, status: "operational", locked: true,
      observables: [{ id: "o1", type: "selected_response", evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" } }],
      statisticalModels: [{ id: "sm1", type: "irt", active: true, structureConfig: {}, parameterSets: [], activeParameterSetId: null }],
    }],
  };
}

describe("recordItemUsage — the exit check itself", () => {
  it("increments usageCount by 1 by default", () => {
    const item = makeItem();
    const result = recordItemUsage(item, makeDb([item]));
    expect(result.ok).toBe(true);
    expect(result.usageCount).toBe(1);
    expect(result.item.exposureControl.usageCount).toBe(1);
  });

  it("accepts an explicit count greater than 1", () => {
    const item = makeItem();
    const result = recordItemUsage(item, makeDb([item]), { count: 3 });
    expect(result.usageCount).toBe(3);
  });

  it("treats a non-positive or non-finite count as 1", () => {
    const item = makeItem();
    expect(recordItemUsage(item, makeDb([item]), { count: 0 }).usageCount).toBe(1);
    expect(recordItemUsage(item, makeDb([item]), { count: -5 }).usageCount).toBe(1);
    expect(recordItemUsage(item, makeDb([item]), { count: NaN }).usageCount).toBe(1);
  });
});

describe("recordItemUsage — auto-retirement", () => {
  it("auto-suspends once usageCount reaches maxUsageBeforeRetire", () => {
    const item = makeItem({ exposureControl: { usageCount: 4, maxUsageBeforeRetire: 5, reactivationCount: 0, maxReactivations: 0 } });
    const result = recordItemUsage(item, makeDb([item]));
    expect(result.usageCount).toBe(5);
    expect(result.status).toBe("suspended");
    expect(result.autoSuspended).toBe(true);
  });

  it("does not suspend below the ceiling", () => {
    const item = makeItem({ exposureControl: { usageCount: 2, maxUsageBeforeRetire: 5, reactivationCount: 0, maxReactivations: 0 } });
    const result = recordItemUsage(item, makeDb([item]));
    expect(result.status).toBe("operational");
    expect(result.autoSuspended).toBe(false);
  });

  it("does not auto-suspend when well below a high ceiling", () => {
    // Note: `maxUsageBeforeRetire: 0` as "unlimited" is defensive code in
    // the ceiling calculation, but a real operational item can't reach
    // validateEntity with a zero ceiling at all -- confirmed separately:
    // "An operational item must declare exposureControl.maxUsageBeforeRetire.
    // Without a ceiling it is delivered indefinitely and never retires."
    // So this test uses a large, legal ceiling instead of 0.
    const item = makeItem({ exposureControl: { usageCount: 10, maxUsageBeforeRetire: 1000, reactivationCount: 0, maxReactivations: 0 } });
    const result = recordItemUsage(item, makeDb([item]));
    expect(result.status).toBe("operational");
    expect(result.autoSuspended).toBe(false);
  });
});

describe("recordItemUsage — only an operational item accrues exposure", () => {
  it("is a no-op (not an error) for a draft item", () => {
    const item = makeItem({ status: "draft" });
    const result = recordItemUsage(item, makeDb([item]));
    expect(result.ok).toBe(false);
    expect(result.accrued).toBe(false);
    expect(result.error).toMatch(/Operational exposure counts only an operational item/);
    expect(result.error).toMatch(/does not increment usageCount/);
  });

  it("is a no-op for a suspended item (already retired)", () => {
    const item = makeItem({ status: "suspended" });
    const result = recordItemUsage(item, makeDb([item]));
    expect(result.ok).toBe(false);
  });

  it("returns ok:false (does not throw) for a missing item", () => {
    const result = recordItemUsage(null, makeDb([]));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/requires an item/);
  });
});
