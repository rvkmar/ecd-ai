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
