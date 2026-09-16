// server/compositeLibrary/__tests__/builder.test.js
//
// Day 24 (Week 5): the composite library builder. Exit check: the builder
// runs against a real Task Model and produces a library record. Also
// verifies the ADR 0003 boundary directly -- calibrated parameters must
// never leak into a compiled entry -- and that the record it produces
// passes the Day 19 `validateEntity("compositeLibrary", ...)` gate.

import { describe, it, expect } from "vitest";
import { buildCompositeLibrary } from "../builder.js";
import { validateEntity } from "../../../src/utils/schema.js";

const taskModel = {
  id: "tm1",
  name: "Fractions Task",
  status: "confirmed",
  locked: true,
  versionNumber: 3,
  evidenceModelIds: ["em1"],
  primaryEvidenceModelId: "em1",
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em1", required: true, weight: 0.7 },
    { observationId: "o2", evidenceModelId: "em1", required: false, weight: 0.3 },
  ],
};

const evidenceModel = {
  id: "em1",
  competencyId: "c1",
  observables: [
    {
      id: "o1",
      statement: "Correctly identifies equivalent fractions",
      type: "selected_response",
      evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" },
    },
    // o2 deliberately has NO embedded evidenceRule -- must fall back to
    // the top-level evidenceRules[] array.
    { id: "o2", statement: "Simplifies a fraction", type: "constructed_response" },
  ],
  evidenceRules: [
    { observableId: "o2", direction: "supports", strengthLevel: 3, activationCondition: "any", justification: "y" },
  ],
  evaluationProcedures: [
    {
      id: "ep1",
      observableId: "o1",
      workProductType: "mcq_selection",
      method: "key",
      description: "Answer key maps selected option to dichotomous observable.",
      artifactRef: "keys/o1.json",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
    },
    {
      id: "ep2",
      observableId: "o2",
      workProductType: "constructed_text",
      method: "rubric",
      description: "Analytic rubric for simplification steps.",
      artifactRef: "rubrics/o2.json",
      artifact: {
        kind: "rubric",
        dimensions: [{ id: "accuracy", levels: [0, 1, 2] }],
      },
    },
  ],
  statisticalModels: [
    {
      id: "sm1",
      type: "irt",
      active: true,
      structureConfig: {},
      parameterSets: [{ parameterSetId: "ps1", parameters: { o1: { a: 1.1, b: 0.2 } }, packageVersion: "mirt-1.42.1", converged: true, sampleSize: 400, calibratedAt: "2026-01-01T00:00:00Z" }],
      activeParameterSetId: "ps1",
    },
  ],
};

function makeItem(overrides = {}) {
  return {
    id: "i1",
    taskModelId: "tm1",
    taskModelVersion: 3,
    observationId: "o1",
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    status: "confirmed",
    stimulus: { layout: "single", blocks: [{ type: "text", content: "1/2 = ?" }] },
    interaction: { type: "mcq", responseComponents: [{ id: "a" }, { id: "b" }] },
    scoring: {
      method: "binary",
      maxScore: 1,
      evidenceActivationMap: [{ responsePattern: { equalsCorrect: true }, activatesObservable: true, rationale: "correct" }],
    },
    ...overrides,
  };
}

function makeDb(overrides = {}) {
  return {
    taskModels: [taskModel],
    evidenceModels: [evidenceModel],
    items: [
      makeItem(),
      makeItem({ id: "i2", observationId: "o2", stimulus: { layout: "single", blocks: [] }, interaction: { type: "constructed", responseComponents: [] } }),
    ],
    ...overrides,
  };
}

describe("buildCompositeLibrary — happy path", () => {
  it("builds a record against a real, instantiable Task Model with real items", () => {
    const { record, warnings } = buildCompositeLibrary(taskModel, makeDb());

    expect(record.taskModelId).toBe("tm1");
    expect(record.taskModelVersion).toBe(3);
    expect(record.active).toBe(false);
    expect(typeof record.compiledAt).toBe("string");
    expect(record.items).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it("bakes in presentation material, interaction params, weight and evidence rule per item", () => {
    const { record } = buildCompositeLibrary(taskModel, makeDb());
    const entry = record.items.find((i) => i.itemId === "i1");

    expect(entry.presentationMaterial).toEqual({ layout: "single", blocks: [{ type: "text", content: "1/2 = ?" }] });
    expect(entry.interactionParams).toEqual({ type: "mcq", responseComponents: [{ id: "a" }, { id: "b" }] });
    expect(entry.weight).toBe(0.7);
    expect(entry.required).toBe(true);
    expect(entry.evidenceRule).toEqual({ direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "x" });
    expect(entry.scoring.evidenceActivationMap).toHaveLength(1);
  });

  it("bakes the Evidence Model evaluationProcedure for the item observation", () => {
    const { record } = buildCompositeLibrary(taskModel, makeDb());
    const entry = record.items.find((i) => i.itemId === "i1");

    expect(entry.evaluationProcedure).toMatchObject({
      id: "ep1",
      observableId: "o1",
      method: "key",
      artifactRef: "keys/o1.json",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
    });
  });

  it("falls back to evidenceModel.evidenceRules[] when the observable has no embedded evidenceRule", () => {
    const { record } = buildCompositeLibrary(taskModel, makeDb());
    const entry = record.items.find((i) => i.itemId === "i2");

    expect(entry.evidenceRule).toEqual({ observableId: "o2", direction: "supports", strengthLevel: 3, activationCondition: "any", justification: "y" });
    expect(entry.weight).toBe(0.3);
  });
});

describe("buildCompositeLibrary — ADR 0003 boundary: never bakes in calibrated parameters", () => {
  it("does not copy statisticalModels/parameterSets/activeParameterSetId into any compiled entry", () => {
    const { record } = buildCompositeLibrary(taskModel, makeDb());
    const serialized = JSON.stringify(record);

    expect(serialized).not.toMatch(/parameterSets/);
    expect(serialized).not.toMatch(/activeParameterSetId/);
    expect(serialized).not.toMatch(/packageVersion/);
    expect(serialized).not.toMatch(/mirt-1\.42\.1/);
  });
});

describe("buildCompositeLibrary — filtering", () => {
  it("excludes items from a different taskModelVersion", () => {
    const db = makeDb({ items: [makeItem(), makeItem({ id: "i-old", taskModelVersion: 2 })] });
    const { record } = buildCompositeLibrary(taskModel, db);
    expect(record.items.map((i) => i.itemId)).not.toContain("i-old");
  });

  it("excludes draft items", () => {
    const db = makeDb({ items: [makeItem(), makeItem({ id: "i-draft", status: "draft" })] });
    const { record } = buildCompositeLibrary(taskModel, db);
    expect(record.items.map((i) => i.itemId)).not.toContain("i-draft");
  });

  it("includes suspended items (still instantiable)", () => {
    const db = makeDb({ items: [makeItem({ id: "i-suspended", status: "suspended" })] });
    const { record } = buildCompositeLibrary(taskModel, db);
    expect(record.items.map((i) => i.itemId)).toContain("i-suspended");
  });
});

describe("buildCompositeLibrary — degrades gracefully rather than throwing", () => {
  it("compiles an empty package with a warning for a draft (not yet instantiable) Task Model", () => {
    const draftTaskModel = { ...taskModel, status: "draft", locked: false };
    const { record, warnings } = buildCompositeLibrary(draftTaskModel, makeDb());

    expect(record.items).toEqual([]);
    expect(warnings.join(" ")).toMatch(/is not locked and confirmed\/operational\/suspended/);
  });

  it("warns (but still produces an entry) for an item referencing an unknown evidenceModelId", () => {
    const db = makeDb({ items: [makeItem({ evidenceModelId: "em-ghost" })] });
    const { record, warnings } = buildCompositeLibrary(taskModel, db);

    expect(record.items).toHaveLength(1);
    expect(record.items[0].evidenceRule).toBeNull();
    expect(warnings.join(" ")).toMatch(/references unknown evidenceModelId 'em-ghost'/);
  });

  it("warns (but still produces an entry) for an item whose observationId isn't in expectedObservations", () => {
    const db = makeDb({ items: [makeItem({ observationId: "o-not-declared" })] });
    const { record, warnings } = buildCompositeLibrary(taskModel, db);

    expect(record.items).toHaveLength(1);
    expect(record.items[0].weight).toBeNull();
    expect(warnings.join(" ")).toMatch(/is not declared in task model 'tm1''s expectedObservations/);
  });

  it("warns when an instantiable Task Model has no usable items at all", () => {
    const { warnings } = buildCompositeLibrary(taskModel, makeDb({ items: [] }));
    expect(warnings.join(" ")).toMatch(/No confirmed\/operational\/suspended items found/);
  });

  it("throws for a missing Task Model", () => {
    expect(() => buildCompositeLibrary(null, makeDb())).toThrow(/requires a Task Model/);
  });

  it("throws for a missing db", () => {
    expect(() => buildCompositeLibrary(taskModel, null)).toThrow(/requires a db snapshot/);
  });
});

describe("buildCompositeLibrary — output passes validateEntity", () => {
  it("produces a record that validates cleanly once given an id", () => {
    const db = makeDb();
    const { record } = buildCompositeLibrary(taskModel, db);
    const withId = { id: "cl1", ...record };
    db.compositeLibrary = [];

    const { errors } = validateEntity("compositeLibrary", withId, db);
    expect(errors).toEqual([]);
  });
});
