import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  attributeIdsForDeliveryItem,
  entriesForResponse,
  itemIsPlacedInQMatrix,
  qMatrixRowKey,
} from "../qMatrixEntries.js";

const competencyModel = {
  id: "cm1",
  smVariables: [
    { id: "attr-a", type: "binary", label: "A" },
    { id: "attr-b", type: "binary", label: "B" },
  ],
};

function db(extra = {}) {
  return {
    competencyModels: [competencyModel],
    competencies: [{ id: "c1", modelId: "cm1" }],
    items: [{ id: "i1", observationId: "obs-a" }, { id: "i2" }],
    evidenceModels: [
      {
        id: "em1",
        competencyId: "c1",
        observables: [{ id: "obs-a", statement: "Selects A" }],
      },
    ],
    ...extra,
  };
}

function matrix(entries, extra = {}) {
  return {
    id: "qm1",
    name: "Grid",
    competencyModelId: "cm1",
    attributeIds: ["attr-a", "attr-b"],
    entries,
    status: "draft",
    ...extra,
  };
}

function errorsFor(entries, store = db()) {
  return validateEntity("qMatrixModels", matrix(entries), store).errors || [];
}

describe("q-matrix observable rows", () => {
  it("accepts an item-only matrix unchanged", () => {
    expect(errorsFor([
      { itemId: "i1", attributeId: "attr-a" },
      { itemId: "i2", attributeId: "attr-b", required: false },
    ])).toEqual([]);
  });

  it("accepts an observable row and keeps itemId optional", () => {
    expect(errorsFor([
      { observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
    ])).toEqual([]);
    expect(errorsFor([
      { observableId: "obs-a", attributeId: "attr-a" },
    ])).toEqual([]);
  });

  it("accepts one cell that cites both the item and the observable", () => {
    expect(errorsFor([
      { itemId: "i1", observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
    ])).toEqual([]);
  });

  it("rejects an unknown observable and an observable on the wrong model", () => {
    expect(errorsFor([
      { observableId: "missing", attributeId: "attr-a" },
    ]).join(" ")).toMatch(/not an observable on any evidence model/);

    const other = db({
      competencies: [
        { id: "c1", modelId: "cm1" },
        { id: "c-other", modelId: "cm-other" },
      ],
      evidenceModels: [
        {
          id: "em-other",
          competencyId: "c-other",
          observables: [{ id: "obs-a" }],
        },
      ],
    });
    expect(errorsFor([
      { observableId: "obs-a", evidenceModelId: "em-other", attributeId: "attr-a" },
    ], other).join(" ")).toMatch(/not 'cm1'/);
  });

  it("requires evidenceModelId when the observable id is shared", () => {
    const shared = db({
      evidenceModels: [
        { id: "em1", competencyId: "c1", observables: [{ id: "obs-a" }] },
        { id: "em2", competencyId: "c1", observables: [{ id: "obs-a" }] },
      ],
    });
    expect(errorsFor([
      { observableId: "obs-a", attributeId: "attr-a" },
    ], shared).join(" ")).toMatch(/Name evidenceModelId/);
    expect(errorsFor([
      { observableId: "obs-a", evidenceModelId: "em2", attributeId: "attr-a" },
    ], shared)).toEqual([]);
  });

  it("rejects duplicate item cells and duplicate observable cells", () => {
    expect(errorsFor([
      { itemId: "i1", attributeId: "attr-a" },
      { itemId: "i1", attributeId: "attr-a" },
    ]).join(" ")).toMatch(/duplicates the \(itemId, attributeId\) pair/);

    expect(errorsFor([
      { observableId: "obs-a", attributeId: "attr-a" },
      { observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
    ]).join(" ")).toMatch(/duplicates the \(observableId, attributeId\) cell/);
  });

  it("resolves a response to the observable row, then falls back to the item row", () => {
    const entries = [
      { itemId: "i1", attributeId: "attr-b" },
      { observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
    ];
    expect(entriesForResponse(entries, {
      itemId: "i1",
      observableId: "obs-a",
      evidenceModelId: "em1",
    }).map((entry) => entry.attributeId)).toEqual(["attr-a"]);
    expect(entriesForResponse(entries, {
      itemId: "i1",
      observableId: "obs-other",
      evidenceModelId: "em1",
    }).map((entry) => entry.attributeId)).toEqual(["attr-b"]);
    expect(attributeIdsForDeliveryItem(entries, {
      itemId: "i1",
      observableId: "obs-a",
      evidenceModelId: "em1",
    })).toEqual(["attr-a"]);
  });

  it("places an item by its observation when the row has no itemId", () => {
    const entries = [{ observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" }];
    expect(itemIsPlacedInQMatrix(
      { id: "i1", observationId: "obs-a", evidenceModelId: "em1" },
      entries,
      "em1"
    )).toBe(true);
    expect(itemIsPlacedInQMatrix(
      { id: "i2", observationId: "obs-other", evidenceModelId: "em1" },
      entries,
      "em1"
    )).toBe(false);
    expect(qMatrixRowKey(entries[0])).toBe("observable:em1:obs-a:");
    expect(qMatrixRowKey({ itemId: "i1", attributeId: "attr-a" })).toBe("i1");
  });

  it("counts one attribute when an any-item row and an item row both match", () => {
    const entries = [
      { observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
      { itemId: "i1", observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" },
    ];
    expect(attributeIdsForDeliveryItem(entries, {
      itemId: "i1",
      observableId: "obs-a",
      evidenceModelId: "em1",
    })).toEqual(["attr-a"]);
  });
});
