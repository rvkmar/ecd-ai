import { describe, it, expect } from "vitest";
import { parameterSetStorageErrors } from "../parameterSetRecord.js";
import { slimParameterSet, slimStatisticalModels } from "../slimParameterSet.js";

function fatSet(extra = {}) {
  return {
    parameterSetId: "ps1",
    parameters: { item_a: { a: 1.2, b: -0.4, c: 0.1 } },
    standardErrors: { item_a: { a: 0.05, b: 0.08 } },
    fitStatistics: {
      global: { RMSEA: 0.031, M2: 12.4 },
      itemFit: { item_a: { S_X2: 1.1 } },
      kr20: 0.81,
      personScores: {
        method: "EAP",
        personIds: ["stud-1", "stud-2"],
        theta: [0.2, -0.4],
        se: [0.3, 0.31],
      },
    },
    packageVersion: "mirt 1.41",
    converged: true,
    sampleSize: 300,
    calibratedAt: "2026-10-30T00:00:00.000Z",
    calibrationJobId: "job-1",
    reportHtml: `<html>${"r".repeat(4000)}</html>`,
    scores: [{ personId: "stud-1", theta: 0.2, se: 0.3 }],
    tifCsv: "theta,information\n0,1\n",
    responseMatrix: { personIds: ["stud-1", "stud-2"], itemIds: ["item_a"], data: [[1], [0]] },
    diagnostics: {
      iterations: 18,
      elapsedSeconds: 1.2,
      plots: { theta: [0, 1], information: [1, 2] },
    },
    ...extra,
  };
}

describe("slimParameterSet", () => {
  it("strips report, person scores, and sidecar payloads and keeps item parameters", () => {
    const input = fatSet();
    const snapshot = structuredClone(input);
    const { parameterSet, stripped, changed } = slimParameterSet(input);

    expect(changed).toBe(true);
    expect(input).toEqual(snapshot);
    expect(parameterSet.reportHtml).toBeUndefined();
    expect(parameterSet.scores).toBeUndefined();
    expect(parameterSet.tifCsv).toBeUndefined();
    expect(parameterSet.responseMatrix).toBeUndefined();
    expect(parameterSet.fitStatistics.personScores).toBeUndefined();
    expect(parameterSet.diagnostics.plots).toBeUndefined();
    expect(parameterSet.parameters).toEqual(input.parameters);
    expect(parameterSet.standardErrors).toEqual(input.standardErrors);
    expect(parameterSet.fitStatistics.global).toEqual({ RMSEA: 0.031, M2: 12.4 });
    expect(parameterSet.fitStatistics.itemFit).toEqual({ item_a: { S_X2: 1.1 } });
    expect(parameterSet.fitStatistics.kr20).toBe(0.81);
    expect(parameterSet.diagnostics.iterations).toBe(18);
    expect(parameterSet.calibrationJobId).toBe("job-1");
    expect(JSON.stringify(parameterSet)).not.toMatch(/stud-1/);

    expect(stripped.reportHtml).toBe(input.reportHtml);
    expect(stripped.fitStatistics.personScores.personIds).toEqual(["stud-1", "stud-2"]);
    expect(stripped.scores[0].personId).toBe("stud-1");
    expect(stripped.diagnostics.plots.information).toEqual([1, 2]);
  });

  it("keeps observable-keyed DINA and G-DINA parameters when sidecars are stripped", () => {
    const parameters = {
      "obs-a": { slip: 0.1, guess: 0.2 },
      "item-b": { slip: 0.15, guess: 0.1 },
      "obs-c": { probabilities: [0.2, 0.2, 0.2, 0.85] },
    };
    const standardErrors = {
      "obs-a": { slip: 0.02, guess: 0.03 },
      "item-b": { slip: 0.04, guess: 0.02 },
      "obs-c": { probabilities: [0.01, 0.01, 0.01, 0.02] },
    };
    const input = fatSet({
      parameters,
      standardErrors,
      calibrationKind: "dina-parameters",
    });
    const { parameterSet, changed } = slimParameterSet(input, { calibrationJobId: "job-1" });
    expect(changed).toBe(true);
    expect(parameterSet.reportHtml).toBeUndefined();
    expect(parameterSet.parameters).toEqual(parameters);
    expect(parameterSet.standardErrors).toEqual(standardErrors);
    expect(Object.keys(parameterSet.parameters)).toEqual(["obs-a", "item-b", "obs-c"]);
  });

  it("is idempotent and adds a reference only when one is known and missing", () => {
    const once = slimParameterSet(fatSet(), { analysisArtefactId: "aa-9" });
    const twice = slimParameterSet(once.parameterSet, { analysisArtefactId: "aa-other", calibrationJobId: "job-other" });
    expect(twice.changed).toBe(false);
    expect(twice.stripped).toBeNull();
    expect(twice.parameterSet).toBe(once.parameterSet);
    expect(once.parameterSet.analysisArtefactId).toBe("aa-9");
    expect(once.parameterSet.calibrationJobId).toBe("job-1");

    const cited = slimParameterSet(
      { parameterSetId: "ps-plain", parameters: { item_a: { a: 1 } } },
      { calibrationJobId: "job-new" }
    );
    expect(cited.changed).toBe(true);
    expect(cited.stripped).toBeNull();
    expect(cited.parameterSet.calibrationJobId).toBe("job-new");
    expect(cited.parameterSet.parameters).toEqual({ item_a: { a: 1 } });
  });

  it("keeps model-criticism summaries and strips person rows and the Q3 matrix", () => {
    const input = fatSet({
      personFitRows: [{ personId: "stud-9", Zh: -2.4, misfit: true }],
      q3Matrix: { itemIds: ["item_a", "item_b"], values: [[1, 0.4], [0.4, 1]] },
      fitStatistics: {
        global: { RMSEA: 0.031, M2: 12.4 },
        itemFit: { item_a: { S_X2: 1.1 } },
        kr20: 0.81,
        cdmFit: { M2: 8, df: 4, p: 0.09, RMSEA2: 0.02, SRMSR: 0.03 },
        qValidation: {
          eps: 0.95,
          nItems: 2,
          nChanged: 1,
          suggestions: [{ itemId: "item_b", original: [1, 0], suggested: [0, 1], pvaf: 0.97 }],
        },
        personFit: {
          statistic: "Zh",
          cutoff: -2,
          nPersons: 2,
          nMisfit: 1,
          proportionMisfit: 0.5,
          rows: [{ personId: "stud-9", Zh: -2.4, misfit: true }],
        },
        localDependence: {
          statistic: "Q3",
          threshold: 0.2,
          maxAbsQ3: 0.4,
          nFlaggedPairs: 1,
          flaggedPairs: [{ itemId1: "item_a", itemId2: "item_b", q3: 0.4 }],
          q3Matrix: { itemIds: ["item_a", "item_b"], values: [[1, 0.4], [0.4, 1]] },
        },
        personScores: {
          method: "EAP",
          personIds: ["stud-1", "stud-2"],
          theta: [0.2, -0.4],
          se: [0.3, 0.31],
        },
      },
    });
    const { parameterSet, stripped } = slimParameterSet(input);
    expect(parameterSet.personFitRows).toBeUndefined();
    expect(parameterSet.q3Matrix).toBeUndefined();
    expect(parameterSet.fitStatistics.cdmFit).toEqual({ M2: 8, df: 4, p: 0.09, RMSEA2: 0.02, SRMSR: 0.03 });
    expect(parameterSet.fitStatistics.qValidation.suggestions[0].pvaf).toBe(0.97);
    expect(parameterSet.fitStatistics.personFit).toEqual({
      statistic: "Zh",
      cutoff: -2,
      nPersons: 2,
      nMisfit: 1,
      proportionMisfit: 0.5,
    });
    expect(parameterSet.fitStatistics.localDependence.flaggedPairs).toEqual([
      { itemId1: "item_a", itemId2: "item_b", q3: 0.4 },
    ]);
    expect(parameterSet.fitStatistics.localDependence.q3Matrix).toBeUndefined();
    expect(parameterSet.fitStatistics.personScores).toBeUndefined();
    expect(parameterSet.fitStatistics.kr20).toBe(0.81);
    expect(JSON.stringify(parameterSet)).not.toMatch(/stud-9/);
    expect(stripped.personFitRows[0].personId).toBe("stud-9");
    expect(stripped.q3Matrix.values[0][1]).toBe(0.4);
    expect(stripped.fitStatistics.personFit.rows[0].personId).toBe("stud-9");
    expect(stripped.fitStatistics.localDependence.q3Matrix.itemIds).toEqual(["item_a", "item_b"]);
  });

  it("leaves criticism summaries in place when no sidecar is present", () => {
    const input = {
      parameterSetId: "ps-fit",
      parameters: { item_a: { a: 1 } },
      fitStatistics: {
        cdmFit: { M2: 8, RMSEA2: 0.02, SRMSR: 0.03 },
        qValidation: { eps: 0.95, nItems: 1, nChanged: 0, suggestions: [] },
        personFit: { statistic: "Zh", cutoff: -2, nPersons: 10, nMisfit: 1, proportionMisfit: 0.1 },
        localDependence: {
          statistic: "Q3",
          threshold: 0.2,
          maxAbsQ3: 0.11,
          nFlaggedPairs: 0,
          flaggedPairs: [],
        },
      },
    };
    const result = slimParameterSet(input);
    expect(result.changed).toBe(false);
    expect(result.parameterSet).toBe(input);
    expect(result.stripped).toBeNull();
  });

  it("leaves a parameter set with only scalar fit untouched", () => {
    const input = {
      parameterSetId: "ps-ok",
      parameters: { item_a: { b: 0 } },
      standardErrors: { item_a: { b: 0.2 } },
      fitStatistics: { RMSEA: 0.04 },
    };
    const result = slimParameterSet(input);
    expect(result.changed).toBe(false);
    expect(result.parameterSet).toBe(input);
    expect(result.stripped).toBeNull();
  });

  it("slims every set on a statistical model list", () => {
    const models = slimStatisticalModels([
      { id: "sm1", parameterSets: [fatSet(), { parameterSetId: "ps-keep", parameters: { item_a: { a: 1 } } }] },
    ]);
    expect(models[0].parameterSets[0].reportHtml).toBeUndefined();
    expect(models[0].parameterSets[0].parameters.item_a.a).toBe(1.2);
    expect(models[0].parameterSets[1].parameterSetId).toBe("ps-keep");
  });

  it("rejects a non-string analysisArtefactId", () => {
    const errors = parameterSetStorageErrors(
      {
        parameterSetId: "ps1",
        packageVersion: "mirt 1.41",
        sampleSize: 10,
        calibratedAt: "2026-10-30T00:00:00.000Z",
        converged: true,
        analysisArtefactId: 12,
      },
      { id: "sm1", type: "irt" }
    );
    expect(errors.join(" ")).toMatch(/analysisArtefactId/);
  });
});
