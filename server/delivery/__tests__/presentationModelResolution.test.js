// server/delivery/__tests__/presentationModelResolution.test.js
//
// D114: pointer selection + live overlay resolve (ADR 0008).

import { describe, it, expect } from "vitest";
import {
  presentationTimeMultiplier,
  selectPresentationModelIdForTaskModel,
  resolvePresentationModel,
} from "../presentationModelResolution.js";
import { buildCompositeLibrary } from "../../compositeLibrary/builder.js";
import { isCompositeLibraryStale } from "../../compositeLibrary/builder.js";
import { validateEntity } from "../../../src/utils/schema.js";

function makePm(overrides = {}) {
  return {
    id: "pm1",
    name: "Default delivery",
    taskModelId: "tm1",
    taskModelVersion: 3,
    status: "confirmed",
    locked: true,
    layout: { itemOrder: "authored", navigation: "linear" },
    conditionalDisplay: { showFeedback: "after_item", allowSkip: false },
    accessibility: { profile: "large_text", fontScale: 1.25, timeMultiplier: 1 },
    updatedAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

const taskModel = {
  id: "tm1",
  name: "Fractions Task",
  status: "confirmed",
  locked: true,
  versionNumber: 3,
  evidenceModelIds: ["em1"],
  primaryEvidenceModelId: "em1",
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
  ],
};

const evidenceModel = {
  id: "em1",
  competencyId: "c1",
  observables: [
    {
      id: "o1",
      statement: "x",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "x",
      },
    },
  ],
  evidenceRules: [],
  evaluationProcedures: [],
  statisticalModels: [],
};

const item = {
  id: "i1",
  taskModelId: "tm1",
  taskModelVersion: 3,
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  status: "confirmed",
  stimulus: { layout: "single", blocks: [] },
  interaction: { type: "mcq", responseComponents: [] },
  scoring: { method: "binary", maxScore: 1, evidenceActivationMap: [] },
};

describe("selectPresentationModelIdForTaskModel", () => {
  it("prefers operational over confirmed", () => {
    const db = {
      presentationModels: [
        makePm({ id: "pm-c", status: "confirmed", updatedAt: "2026-09-21T12:00:00.000Z" }),
        makePm({ id: "pm-o", status: "operational", updatedAt: "2026-09-21T09:00:00.000Z" }),
      ],
    };
    expect(selectPresentationModelIdForTaskModel(db, "tm1", 3)).toBe("pm-o");
  });

  it("ignores wrong taskModelVersion and draft", () => {
    const db = {
      presentationModels: [
        makePm({ id: "pm-old", taskModelVersion: 2 }),
        makePm({ id: "pm-draft", status: "draft", locked: false }),
      ],
    };
    expect(selectPresentationModelIdForTaskModel(db, "tm1", 3)).toBeNull();
  });

  it("treats unlocked confirmed as not selectable", () => {
    const db = {
      presentationModels: [makePm({ id: "pm-unlocked", locked: false })],
    };
    expect(selectPresentationModelIdForTaskModel(db, "tm1", 3)).toBeNull();
  });
});

describe("resolvePresentationModel — live overlay", () => {
  it("returns live accessibility from the authored record, not a frozen copy", () => {
    const pm = makePm({
      accessibility: { profile: "large_text", fontScale: 1.5, timeMultiplier: 2 },
    });
    const db = { presentationModels: [pm] };

    const first = resolvePresentationModel(db, {
      presentationModelId: "pm1",
      taskModelId: "tm1",
      taskModelVersion: 3,
    });
    expect(first.ok).toBe(true);
    expect(first.overlay.accessibility.profile).toBe("large_text");
    expect(first.overlay.accessibility.fontScale).toBe(1.5);

    // Confirmed edit on the same id — next resolve must see it (ADR 0008).
    pm.accessibility = { profile: "high_contrast", fontScale: 1.2, timeMultiplier: 1.5 };
    const second = resolvePresentationModel(db, {
      presentationModelId: "pm1",
      taskModelId: "tm1",
      taskModelVersion: 3,
    });
    expect(second.overlay.accessibility.profile).toBe("high_contrast");
    expect(second.overlay.accessibility.fontScale).toBe(1.2);
    expect(second.overlay.timeMultiplier).toBe(1.5);
    expect(presentationTimeMultiplier(second.overlay)).toBe(1.5);
  });

  it("exposes a default multiplier of 1 when extra time is missing or out of range", () => {
    expect(presentationTimeMultiplier(null)).toBe(1);
    expect(presentationTimeMultiplier({ accessibility: {} })).toBe(1);
    expect(presentationTimeMultiplier({ accessibility: { timeMultiplier: 9 } })).toBe(1);
    expect(presentationTimeMultiplier({ timeMultiplier: 2 })).toBe(2);
    const resolved = resolvePresentationModel(
      { presentationModels: [makePm({ accessibility: { profile: "default" } })] },
      { presentationModelId: "pm1", taskModelId: "tm1", taskModelVersion: 3 }
    );
    expect(resolved.overlay.timeMultiplier).toBe(1);
  });

  it("falls back to live select when the pointer is no longer linkable", () => {
    const db = {
      presentationModels: [
        makePm({ id: "pm-stale", status: "archived", locked: true }),
        makePm({ id: "pm-live", status: "confirmed" }),
      ],
    };
    const resolved = resolvePresentationModel(db, {
      presentationModelId: "pm-stale",
      taskModelId: "tm1",
      taskModelVersion: 3,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.presentationModelId).toBe("pm-live");
  });
});

describe("buildCompositeLibrary — D114 presentationModelId pointer", () => {
  it("stamps presentationModelId and never bakes overlay fields", () => {
    const db = {
      taskModels: [taskModel],
      evidenceModels: [evidenceModel],
      items: [item],
      presentationModels: [makePm()],
    };
    const { record, warnings } = buildCompositeLibrary(taskModel, db);

    expect(record.presentationModelId).toBe("pm1");
    expect(record.layout).toBeUndefined();
    expect(record.accessibility).toBeUndefined();
    expect(record.conditionalDisplay).toBeUndefined();
    expect(JSON.stringify(record)).not.toMatch(/large_text/);
    expect(JSON.stringify(record)).not.toMatch(/fontScale/);
    expect(warnings).toEqual([]);

    const { valid, errors } = validateEntity("compositeLibrary", {
      ...record,
      id: "cl1",
      active: false,
    }, db);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("warns when no linkable Presentation Model exists", () => {
    const db = {
      taskModels: [taskModel],
      evidenceModels: [evidenceModel],
      items: [item],
      presentationModels: [makePm({ status: "draft", locked: false })],
    };
    const { record, warnings } = buildCompositeLibrary(taskModel, db);
    expect(record.presentationModelId).toBeNull();
    expect(warnings.some((w) => /No linkable Presentation Model/.test(w))).toBe(true);
  });

  it("does not stale the package when Presentation Model accessibility changes", () => {
    const pm = makePm();
    const db = {
      taskModels: [taskModel],
      evidenceModels: [evidenceModel],
      items: [item],
      presentationModels: [pm],
    };
    const { record } = buildCompositeLibrary(taskModel, db);
    const pkg = { ...record, id: "cl1", active: true };

    pm.accessibility = { profile: "high_contrast", fontScale: 2, timeMultiplier: 3 };

    const { stale, reasons } = isCompositeLibraryStale(pkg, {
      taskModel,
      evidenceModels: [evidenceModel],
    });
    expect(stale).toBe(false);
    expect(reasons).toEqual([]);
  });
});

describe("validateEntity(compositeLibrary) — ADR 0008 bake refusal", () => {
  it("refuses baked overlay fields on the package", () => {
    const db = {
      taskModels: [taskModel],
      presentationModels: [makePm()],
      items: [item],
    };
    const { errors } = validateEntity(
      "compositeLibrary",
      {
        id: "cl1",
        taskModelId: "tm1",
        taskModelVersion: 3,
        compiledAt: new Date().toISOString(),
        active: false,
        presentationModelId: "pm1",
        accessibility: { profile: "large_text" },
        items: [{ itemId: "i1" }],
      },
      db
    );
    expect(errors.some((e) => /must not bake Presentation Model overlay/.test(e))).toBe(true);
  });
});
