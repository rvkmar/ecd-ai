import { describe, it, expect } from "vitest";
import {
  validateCalibrationResponse,
  parameterSetFromCalibrationResponse,
} from "../calibrationContract.js";
import { fitStatisticsForParameterSet } from "../../../src/utils/modelCriticism.js";
import { ingestCalibrationJob } from "../calibrationIngest.js";
import { parameterSetStorageErrors } from "../../../src/utils/parameterSetRecord.js";

function convergedBody(extra = {}) {
  return {
    contractVersion: "1.0",
    jobId: "job-tu4",
    converged: true,
    packageVersion: "mirt 1.47",
    sampleSize: 4,
    calibratedAt: "2026-10-30T00:00:00Z",
    parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0, c: 0 } },
    ...extra,
  };
}

const personFit = {
  statistic: "Zh",
  cutoff: -2,
  rule: "Zh < cutoff",
  nPersons: 4,
  nFinite: 4,
  nMisfit: 1,
  proportionMisfit: 0.25,
};

const localDependence = {
  statistic: "Q3",
  threshold: 0.2,
  maxAbsQ3: 0.31,
  nPairs: 1,
  nFlaggedPairs: 1,
  flaggedPairs: [{ itemId1: "item_a", itemId2: "item_b", q3: 0.31 }],
};

const cdmFit = { available: true, M2: 12.4, df: 8, p: 0.13, RMSEA2: 0.02, SRMSR: 0.03 };

const qValidation = {
  eps: 0.95,
  nItems: 2,
  nChanged: 1,
  attributeIds: ["A1"],
  suggestions: [
    { itemId: "item_b", original: [1], suggested: [0], pvaf: 0.97 },
  ],
};

describe("calibration response criticism", () => {
  it("accepts a response that has no criticism fields", () => {
    expect(validateCalibrationResponse(convergedBody())).toEqual([]);
  });

  it("accepts summaries plus sidecars", () => {
    const body = convergedBody({
      fitStatistics: { personFit, localDependence, cdmFit, qValidation },
      personFitRows: [
        { personId: "p1", Zh: -2.4, misfit: true },
        { personId: "p2", Zh: 0.1, misfit: false },
        { personId: "p3", Zh: 0.2, misfit: false },
        { personId: "p4", Zh: null, misfit: false },
      ],
      q3Matrix: {
        itemIds: ["item_a", "item_b"],
        values: [
          [1, 0.31],
          [0.31, 1],
        ],
      },
    });
    expect(validateCalibrationResponse(body)).toEqual([]);
  });

  it("refuses per-person rows nested in the summary", () => {
    const body = convergedBody({
      fitStatistics: { personFit: { ...personFit, rows: [{ personId: "p1" }] } },
    });
    expect(validateCalibrationResponse(body).join(" ")).toMatch(/per-person/);
  });

  it("refuses a Q3 matrix nested in local dependence", () => {
    const body = convergedBody({
      fitStatistics: { localDependence: { ...localDependence, matrix: [[1]] } },
    });
    expect(validateCalibrationResponse(body).join(" ")).toMatch(/Q3 matrix/);
  });

  it("accepts an unavailable criticism note", () => {
    const body = convergedBody({
      fitStatistics: {
        cdmFit: { available: false, note: "df too low" },
        qValidation: { available: false, note: "Qval failed" },
      },
    });
    expect(validateCalibrationResponse(body)).toEqual([]);
  });
});

describe("parameter set ingest keeps summaries only", () => {
  function db() {
    return {
      calibrationJobs: [],
      evidenceModels: [
        {
          id: "em1",
          statisticalModels: [{ id: "sm1", type: "irt", parameterSets: [] }],
        },
      ],
    };
  }

  const response = convergedBody({
    fitStatistics: {
      global: { RMSEA: 0.04 },
      personFit,
      localDependence,
    },
    personFitRows: [
      { personId: "p1", Zh: -3, misfit: true },
      { personId: "p2", Zh: 0, misfit: false },
      { personId: "p3", Zh: 0.2, misfit: false },
      { personId: "p4", Zh: 0.4, misfit: false },
    ],
    q3Matrix: {
      itemIds: ["item_a", "item_b"],
      values: [
        [1, 0.31],
        [0.31, 1],
      ],
    },
  });

  it("drops sidecars while copying the summary onto the parameter set", () => {
    const stored = db();
    const result = ingestCalibrationJob(
      {
        id: "job-tu4",
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        response,
      },
      stored
    );
    expect(result.ok, result.error).toBe(true);
    const ps = result.parameterSet;
    expect(ps.fitStatistics.personFit.nMisfit).toBe(1);
    expect(ps.fitStatistics.localDependence.maxAbsQ3).toBe(0.31);
    expect(ps.fitStatistics.global.RMSEA).toBe(0.04);
    expect(ps.fitStatistics.personFitRows).toBeUndefined();
    expect(ps.fitStatistics.q3Matrix).toBeUndefined();
    expect(ps.personFitRows).toBeUndefined();
    expect(ps.q3Matrix).toBeUndefined();
    expect(stored.calibrationJobs).toEqual([]);
    expect(stored.evidenceModels[0].statisticalModels[0].parameterSets[0].parameterSetId).toBe(
      ps.parameterSetId
    );
  });

  it("strips sidecar keys if they were nested under fitStatistics", () => {
    const stripped = fitStatisticsForParameterSet({
      personFit,
      personFitRows: [{ personId: "p1", Zh: -3, misfit: true }],
      q3Matrix: { itemIds: ["item_a", "item_b"], values: [[1, 0.3], [0.3, 1]] },
    });
    expect(stripped.personFit.nMisfit).toBe(1);
    expect(stripped.personFitRows).toBeUndefined();
    expect(stripped.q3Matrix).toBeUndefined();
  });

  it("refuses a stored set that still nests the matrix", () => {
    const ps = parameterSetFromCalibrationResponse(response, {
      parameterSetId: "ps1",
      calibrationKind: "irt-parameters",
    });
    ps.fitStatistics.q3Matrix = { itemIds: ["item_a"], values: [[1]] };
    const errors = parameterSetStorageErrors(ps, { id: "sm1", type: "irt" });
    expect(errors.join(" ")).toMatch(/q3Matrix/);
  });

  it("still ingests a response with no criticism fields", () => {
    const stored = db();
    const result = ingestCalibrationJob(
      {
        id: "job-old",
        kind: "irt-parameters",
        status: "succeeded",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        response: convergedBody({ fitStatistics: { global: { RMSEA: 0.04 } } }),
      },
      stored
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.parameterSet.fitStatistics).toEqual({ global: { RMSEA: 0.04 } });
  });
});
