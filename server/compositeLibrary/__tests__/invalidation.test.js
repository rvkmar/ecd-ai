// server/compositeLibrary/__tests__/invalidation.test.js
//
// Day 25 (Week 5, closing): invalidation per ADR 0003. A revision to the
// Task Model or a bound Evidence Model invalidates a compiled package;
// recalibration (a new parameterSet, an activeParameterSetId flip) never
// does, since calibrated parameters are resolved live by pointer and were
// never baked into the package in the first place.

import { describe, it, expect } from "vitest";
import { buildCompositeLibrary, isCompositeLibraryStale } from "../builder.js";

const taskModel = {
  id: "tm1",
  status: "confirmed",
  locked: true,
  versionNumber: 1,
  expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
};

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [{ id: "o1", type: "selected_response", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
  statisticalModels: [],
};

const item = {
  id: "i1",
  taskModelId: "tm1",
  taskModelVersion: 1,
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  status: "confirmed",
  stimulus: { layout: "single", blocks: [] },
  interaction: { type: "mcq", responseComponents: [] },
  scoring: { method: "binary", maxScore: 1, evidenceActivationMap: [] },
};

function compile() {
  const { record } = buildCompositeLibrary(taskModel, { items: [item], evidenceModels: [evidenceModel] });
  return { id: "cl1", ...record };
}

describe("isCompositeLibraryStale", () => {
  it("is not stale when nothing has changed since compile time", () => {
    const record = compile();
    const { stale, reasons } = isCompositeLibraryStale(record, { taskModel, evidenceModels: [evidenceModel] });
    expect(stale).toBe(false);
    expect(reasons).toEqual([]);
  });

  it("is stale when the Task Model has moved to a new version", () => {
    const record = compile();
    const revisedTaskModel = { ...taskModel, versionNumber: 2 };
    const { stale, reasons } = isCompositeLibraryStale(record, { taskModel: revisedTaskModel, evidenceModels: [evidenceModel] });
    expect(stale).toBe(true);
    expect(reasons.join(" ")).toMatch(/Task model 'tm1' is now at version 2/);
  });

  it("is stale when a referenced Evidence Model has moved to a new version", () => {
    const record = compile();
    const revisedEvidenceModel = { ...evidenceModel, versionNumber: 2 };
    const { stale, reasons } = isCompositeLibraryStale(record, { taskModel, evidenceModels: [revisedEvidenceModel] });
    expect(stale).toBe(true);
    expect(reasons.join(" ")).toMatch(/Evidence model 'em1' is now at version 2/);
  });

  it("is NOT stale from recalibration alone (a new parameterSet, versionNumber unchanged)", () => {
    const record = compile();
    const recalibratedEvidenceModel = {
      ...evidenceModel,
      statisticalModels: [
        {
          id: "sm1",
          type: "irt",
          active: true,
          structureConfig: {},
          parameterSets: [{ parameterSetId: "ps1", parameters: { o1: { a: 1.2 } }, packageVersion: "mirt-1.42.1", converged: true, sampleSize: 500, calibratedAt: new Date().toISOString() }],
          activeParameterSetId: "ps1",
        },
      ],
    };
    const { stale, reasons } = isCompositeLibraryStale(record, { taskModel, evidenceModels: [recalibratedEvidenceModel] });
    expect(stale).toBe(false);
    expect(reasons).toEqual([]);
  });

  it("is stale when an evaluationProcedure changes without a version bump", () => {
    const record = compile();
    const revised = {
      ...evidenceModel,
      evaluationProcedures: [
        {
          id: "ep-new",
          observableId: "o1",
          method: "key",
          workProductType: "mcq_selection",
          description: "Revised key after pilot.",
          artifactRef: "keys/o1-v2.json",
        },
      ],
    };
    const { stale, reasons } = isCompositeLibraryStale(record, { taskModel, evidenceModels: [revised] });
    expect(stale).toBe(true);
    expect(reasons.join(" ")).toMatch(/evaluationProcedure for 'o1' changed/);
  });

  it("does not evaluate an evidence model that no item in the package references", () => {
    const record = compile();
    const unrelatedRevisedModel = { id: "em-unrelated", versionNumber: 99 };
    const { stale } = isCompositeLibraryStale(record, { taskModel, evidenceModels: [evidenceModel, unrelatedRevisedModel] });
    expect(stale).toBe(false);
  });

  it("throws without a libraryRecord or a taskModel", () => {
    const record = compile();
    expect(() => isCompositeLibraryStale(null, { taskModel })).toThrow(/requires both/);
    expect(() => isCompositeLibraryStale(record, {})).toThrow(/requires both/);
  });
});
