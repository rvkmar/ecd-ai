// TU15: ingest stores DINA/G-DINA parameters under the keys R was
// asked to use. A request with no observableIds still accepts an
// item-keyed map. Nothing rewrites a set that is already stored.

import { describe, it, expect } from "vitest";
import { ingestCalibrationJob } from "../calibrationIngest.js";

function job(overrides = {}) {
  return {
    id: "job-tu15",
    kind: "dina-parameters",
    status: "succeeded",
    evidenceModelId: "em1",
    statisticalModelId: "sm1",
    requestedBy: "admin1",
    request: {
      model: {
        family: "dina",
        itemIds: ["item-a", "item-b", "item-c"],
        observableIds: ["obs-a", "obs-b", "obs-c"],
      },
    },
    response: {
      contractVersion: "1.0",
      jobId: "job-tu15",
      converged: true,
      packageVersion: "GDINA 2.9.4",
      sampleSize: 40,
      calibratedAt: "2026-10-30T12:00:00.000Z",
      parameters: {
        "obs-a": { slip: 0.1, guess: 0.2 },
        "obs-b": { slip: 0.15, guess: 0.1 },
        "obs-c": { slip: 0.05, guess: 0.25 },
      },
    },
    ...overrides,
  };
}

function db(type = "dina") {
  return {
    evidenceModels: [{
      id: "em1",
      statisticalModels: [{
        id: "sm1",
        type,
        parameterSets: [{
          parameterSetId: "ps-old",
          parameters: { "item-a": { slip: 0.4, guess: 0.3 } },
          packageVersion: "GDINA 2.9.0",
          sampleSize: 10,
          calibratedAt: "2026-01-01T00:00:00.000Z",
          converged: true,
          calibrationKind: "dina-parameters",
          status: "active",
        }],
        activeParameterSetId: "ps-old",
      }],
    }],
  };
}

describe("TU15 diagnostic ingest keying", () => {
  it("stores a new DINA set keyed by observable id and leaves the active set", () => {
    const store = db();
    const incoming = job();
    incoming.response.reportHtml = "<html>keep off the model</html>";
    incoming.response.standardErrors = {
      "obs-a": { slip: 0.02, guess: 0.03 },
      "obs-b": { slip: 0.02, guess: 0.02 },
      "obs-c": { slip: 0.01, guess: 0.01 },
    };
    const result = ingestCalibrationJob(incoming, store, { parameterSetId: "ps-new" });
    expect(result.ok).toBe(true);
    expect(result.parameterSet.reportHtml).toBeUndefined();
    expect(Object.keys(result.parameterSet.parameters)).toEqual(["obs-a", "obs-b", "obs-c"]);
    expect(result.parameterSet.parameters["obs-a"]).toEqual({ slip: 0.1, guess: 0.2 });
    expect(result.parameterSet.standardErrors["obs-c"]).toEqual({ slip: 0.01, guess: 0.01 });
    expect(store.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe("ps-old");
    expect(store.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters).toEqual({
      "item-a": { slip: 0.4, guess: 0.3 },
    });
  });

  it("stores G-DINA probabilities under the same observable keys", () => {
    const store = db("gdina");
    const incoming = job();
    incoming.request.model.family = "gdina";
    incoming.response.parameters = {
      "obs-a": { probabilities: [0.2, 0.9] },
      "obs-b": { probabilities: [0.1, 0.8] },
      "obs-c": { probabilities: [0.2, 0.2, 0.2, 0.85] },
    };
    const result = ingestCalibrationJob(incoming, store, { parameterSetId: "ps-gdina" });
    expect(result.ok).toBe(true);
    expect(result.parameterSet.parameters["obs-c"].probabilities).toHaveLength(4);
  });

  it("refuses an item-keyed map when the request named unique observables", () => {
    const store = db();
    const incoming = job();
    incoming.response.parameters = {
      "item-a": { slip: 0.1, guess: 0.2 },
      "item-b": { slip: 0.1, guess: 0.2 },
      "item-c": { slip: 0.1, guess: 0.2 },
    };
    const result = ingestCalibrationJob(incoming, store, { parameterSetId: "ps-bad" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/keyed by observable id/);
    expect(store.evidenceModels[0].statisticalModels[0].parameterSets).toHaveLength(1);
  });

  it("still ingests a legacy item-keyed set and a mixed set", () => {
    const legacyStore = db();
    const legacy = job();
    delete legacy.request.model.observableIds;
    legacy.response.parameters = {
      "item-a": { slip: 0.1, guess: 0.2 },
      "item-b": { slip: 0.2, guess: 0.1 },
      "item-c": { slip: 0.05, guess: 0.05 },
    };
    const legacyResult = ingestCalibrationJob(legacy, legacyStore, { parameterSetId: "ps-legacy" });
    expect(legacyResult.ok).toBe(true);
    expect(Object.keys(legacyResult.parameterSet.parameters)).toEqual(["item-a", "item-b", "item-c"]);

    const mixedStore = db();
    const mixed = job();
    mixed.request.model.observableIds = ["obs-a", "", "obs-c"];
    mixed.response.parameters = {
      "obs-a": { slip: 0.1, guess: 0.2 },
      "item-b": { slip: 0.2, guess: 0.1 },
      "obs-c": { slip: 0.05, guess: 0.05 },
    };
    const mixedResult = ingestCalibrationJob(mixed, mixedStore, { parameterSetId: "ps-mixed" });
    expect(mixedResult.ok).toBe(true);
    expect(Object.keys(mixedResult.parameterSet.parameters)).toEqual(["obs-a", "item-b", "obs-c"]);

    const sharedStore = db();
    const shared = job();
    shared.request.model.observableIds = ["obs-a", "obs-a", "obs-a"];
    shared.response.parameters = {
      "item-a": { slip: 0.1, guess: 0.2 },
      "item-b": { slip: 0.2, guess: 0.1 },
      "item-c": { slip: 0.05, guess: 0.05 },
    };
    const sharedResult = ingestCalibrationJob(shared, sharedStore, { parameterSetId: "ps-shared" });
    expect(sharedResult.ok).toBe(true);
    expect(Object.keys(sharedResult.parameterSet.parameters)).toEqual(["item-a", "item-b", "item-c"]);
  });
});
