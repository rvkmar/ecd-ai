import { describe, it, expect } from "vitest";
import { validateQMatrixModelLifecycle } from "../lifecycleValidation.js";

function world(entries, items) {
  return {
    qMatrixModels: [],
    competencyModels: [{
      id: "cm1",
      status: "confirmed",
      locked: true,
      versionNumber: 1,
    }],
    evidenceModels: [{
      id: "em1",
      observables: [{ id: "obs-a" }],
      statisticalModels: [{
        id: "sm1",
        type: "dina",
        structureConfig: { qMatrixId: "qm1" },
      }],
    }],
    items,
    qMatrix: {
      id: "qm1",
      name: "Grid",
      competencyModelId: "cm1",
      competencyModelVersion: 1,
      attributeIds: ["attr-a"],
      entries,
      status: "confirmed",
      locked: true,
    },
  };
}

describe("Q-matrix confirmation placement", () => {
  it("treats an observable row as placing the item that elicits it", () => {
    const placed = world(
      [{ observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" }],
      [{ id: "i1", evidenceModelId: "em1", observationId: "obs-a", status: "confirmed" }]
    );
    expect(validateQMatrixModelLifecycle(placed.qMatrix, placed)).toEqual([]);

    const missing = world(
      [{ observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-a" }],
      [{ id: "i2", evidenceModelId: "em1", observationId: "obs-other", status: "confirmed" }]
    );
    expect(validateQMatrixModelLifecycle(missing.qMatrix, missing).join(" ")).toMatch(/does not place 1 item/);
  });

  it("still places an item-only row", () => {
    const placed = world(
      [{ itemId: "i1", attributeId: "attr-a" }],
      [{ id: "i1", evidenceModelId: "em1", status: "confirmed" }]
    );
    expect(validateQMatrixModelLifecycle(placed.qMatrix, placed)).toEqual([]);
  });
});
