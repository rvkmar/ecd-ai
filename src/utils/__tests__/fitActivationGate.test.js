import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIT_THRESHOLDS,
  evaluateFitActivation,
  readFitOverride,
} from "../fitActivationGate.js";
import { parameterSetStorageErrors } from "../parameterSetRecord.js";
import { slimParameterSet } from "../slimParameterSet.js";

const irtModel = { id: "sm1", type: "irt", subtype: "2pl" };
const cdmModel = { id: "sm-d", type: "gdina" };

const passingIrtFit = {
  global: { RMSEA: 0.04, SRMSR: 0.03 },
  itemFit: {
    a: { "p.S_X2": 0.2 },
    b: { "p.S_X2": 0.4 },
  },
  personFit: { proportionMisfit: 0.02, nPersons: 100, nMisfit: 2, cutoff: -2 },
  localDependence: { maxAbsQ3: 0.12, nFlaggedPairs: 0 },
};

const failingIrtFit = {
  global: { RMSEA: 0.09, SRMSR: 0.08 },
  itemFit: {
    a: { "p.S_X2": 0.01 },
    b: { "p.S_X2": 0.01 },
    c: { "p.S_X2": 0.4 },
  },
  personFit: { proportionMisfit: 0.2, cutoff: -2 },
  localDependence: { maxAbsQ3: 0.4 },
};

function activate(extra) {
  return evaluateFitActivation({
    statisticalModel: irtModel,
    parameterSet: { parameterSetId: "ps2", fitStatistics: passingIrtFit },
    by: "ada",
    at: "2026-10-30T12:00:00.000Z",
    ...extra,
  });
}

describe("fit activation gate", () => {
  it("passes when every IRT check is inside the default thresholds", () => {
    const gate = activate();
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("pass");
    expect(gate.fitGate.family).toBe("irt");
    expect(gate.fitGate.failedChecks).toEqual([]);
    expect(gate.fitGate.thresholds).toEqual(DEFAULT_FIT_THRESHOLDS);
    expect(gate.fitGate.checks.map((check) => check.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ]);
  });

  it("fails and names each IRT check that is over its threshold", () => {
    const gate = activate({
      parameterSet: { parameterSetId: "ps2", fitStatistics: failingIrtFit },
    });
    expect(gate.ok).toBe(false);
    expect(gate.overrideRejected).toBe(false);
    expect(gate.fitGate.status).toBe("fail");
    expect(gate.failedChecks.map((check) => check.id)).toEqual([
      "irt.itemFit",
      "irt.rmsea",
      "irt.srmsr",
      "irt.personFit",
      "irt.localDependence",
    ]);
    expect(gate.failedChecks.find((check) => check.id === "irt.rmsea").message).toMatch(/0\.09/);
    expect(gate.failedChecks.find((check) => check.id === "irt.itemFit").message).toMatch(/2 of 3/);
  });

  it("records an override reason, the user, and the failing checks", () => {
    const gate = activate({
      parameterSet: { parameterSetId: "ps2", fitStatistics: failingIrtFit },
      override: { explicit: true, reason: "Pilot sample accepted by the committee" },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("override");
    expect(gate.fitGate.override).toMatchObject({
      reason: "Pilot sample accepted by the committee",
      by: "ada",
      at: "2026-10-30T12:00:00.000Z",
    });
    expect(gate.fitGate.override.failedChecks.map((check) => check.id)).toContain("irt.rmsea");
    expect(gate.fitGate.failedChecks.map((check) => check.id)).toContain("irt.srmsr");
  });

  it("rejects an explicit override that has no reason when checks fail", () => {
    const gate = activate({
      parameterSet: { parameterSetId: "ps2", fitStatistics: failingIrtFit },
      override: readFitOverride({ fitOverride: { reason: "   " } }),
    });
    expect(gate.ok).toBe(false);
    expect(gate.overrideRejected).toBe(true);
    expect(gate.fitGate.status).toBe("fail");
    expect(gate.failedChecks.length).toBeGreaterThan(0);
  });

  it("grandfathers a set that is already active and does not re-check fit", () => {
    const gate = activate({
      alreadyActive: true,
      parameterSet: { parameterSetId: "ps1", fitStatistics: failingIrtFit },
    });
    expect(gate.ok).toBe(true);
    expect(gate.grandfathered).toBe(true);
    expect(gate.fitGate.status).toBe("grandfathered");
    expect(gate.fitGate.checks).toBeUndefined();
    expect(gate.failedChecks).toEqual([]);
  });

  it("gates a bundle GRM parameter set on maxAbsQ3 and keeps the bundle with the gate record", () => {
    const bundleSet = {
      parameterSetId: "ps-bundle",
      parameters: {
        passage_1: { a: 1.1, b: [-0.5, 0.2, 0.9], c: 0, model: "GRM" },
        A: { a: 1, b: -0.2, c: 0 },
      },
      scoringBundles: [{
        id: "passage_1",
        itemIds: ["P1", "P2", "P3"],
        model: "GRM",
        maxScore: 3,
      }],
      packageVersion: "mirt 1.48",
      sampleSize: 500,
      calibratedAt: "2026-10-30T12:00:00.000Z",
      converged: true,
      fitStatistics: {
        ...passingIrtFit,
        itemFit: {
          passage_1: { "p.S_X2": 0.3 },
          A: { "p.S_X2": 0.5 },
        },
        localDependence: {
          statistic: "Q3",
          threshold: 0.2,
          maxAbsQ3: 0.11,
          nFlaggedPairs: 0,
          flaggedPairs: [],
          q3Matrix: { itemIds: ["passage_1", "A"], values: [[1, 0.11], [0.11, 1]] },
        },
      },
      q3Matrix: { itemIds: ["passage_1", "A"], values: [[1, 0.11], [0.11, 1]] },
    };
    const slimmed = slimParameterSet(bundleSet);
    expect(slimmed.parameterSet.parameters.passage_1.b).toEqual([-0.5, 0.2, 0.9]);
    expect(slimmed.parameterSet.scoringBundles).toEqual(bundleSet.scoringBundles);
    expect(slimmed.parameterSet.fitStatistics.localDependence.maxAbsQ3).toBe(0.11);
    expect(slimmed.parameterSet.fitStatistics.localDependence.q3Matrix).toBeUndefined();
    expect(slimmed.parameterSet.q3Matrix).toBeUndefined();

    const pass = evaluateFitActivation({
      statisticalModel: irtModel,
      parameterSet: slimmed.parameterSet,
      by: "ada",
      at: "2026-10-30T12:00:00.000Z",
    });
    expect(pass.ok).toBe(true);
    expect(pass.fitGate.status).toBe("pass");
    expect(pass.fitGate.checks.find((check) => check.id === "irt.localDependence")).toMatchObject({
      status: "pass",
      statistic: 0.11,
      threshold: 0.2,
    });

    const stored = slimParameterSet({ ...slimmed.parameterSet, fitGate: pass.fitGate });
    expect(stored.parameterSet.fitGate.status).toBe("pass");
    expect(stored.parameterSet.scoringBundles[0].itemIds).toEqual(["P1", "P2", "P3"]);
    expect(parameterSetStorageErrors(stored.parameterSet, irtModel)).toEqual([]);

    const fail = evaluateFitActivation({
      statisticalModel: irtModel,
      parameterSet: {
        ...slimmed.parameterSet,
        fitStatistics: {
          ...slimmed.parameterSet.fitStatistics,
          localDependence: {
            statistic: "Q3",
            threshold: 0.2,
            maxAbsQ3: 0.33,
            nFlaggedPairs: 1,
            flaggedPairs: [{ itemId1: "passage_1", itemId2: "A", q3: 0.33 }],
          },
        },
      },
      by: "ada",
      at: "2026-10-30T12:00:00.000Z",
    });
    expect(fail.ok).toBe(false);
    expect(fail.failedChecks.map((check) => check.id)).toEqual(["irt.localDependence"]);
    expect(fail.fitGate.failedChecks[0].message).toMatch(/0\.33/);
  });

  it("does not treat missing fit statistics as a failure", () => {
    const gate = activate({
      parameterSet: { parameterSetId: "ps2" },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("not_evaluated");
    expect(gate.fitGate.failedChecks).toEqual([]);
    expect(gate.fitGate.checks.every((check) => check.status === "missing")).toBe(true);
    expect(gate.fitGate.note).toMatch(/not applied/i);
  });

  it("uses calibrationPlan thresholds ahead of the defaults", () => {
    const gate = activate({
      calibrationPlan: { fitThresholds: { rmseaMax: 0.1 } },
      parameterSet: {
        parameterSetId: "ps2",
        fitStatistics: {
          ...passingIrtFit,
          global: { RMSEA: 0.08, SRMSR: 0.03 },
        },
      },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("pass");
    expect(gate.fitGate.thresholds.rmseaMax).toBe(0.1);
    expect(gate.fitGate.thresholds.srmsrMax).toBe(DEFAULT_FIT_THRESHOLDS.srmsrMax);
  });

  it("keeps the share check passing when the share equals the maximum", () => {
    const gate = activate({
      parameterSet: {
        parameterSetId: "ps2",
        fitStatistics: {
          ...passingIrtFit,
          itemFit: {
            a: { "p.S_X2": 0.01 },
            b: { "p.S_X2": 0.4 },
            c: { "p.S_X2": 0.4 },
            d: { "p.S_X2": 0.4 },
            e: { "p.S_X2": 0.4 },
            f: { "p.S_X2": 0.4 },
            g: { "p.S_X2": 0.4 },
            h: { "p.S_X2": 0.4 },
            i: { "p.S_X2": 0.4 },
            j: { "p.S_X2": 0.4 },
          },
        },
      },
    });
    const itemFit = gate.fitGate.checks.find((check) => check.id === "irt.itemFit");
    expect(itemFit.status).toBe("pass");
    expect(itemFit.statistic).toBe(0.1);
  });

  it("judges a CDM set on RMSEA2, SRMSR, and Q-matrix changes, not on IRT person fit", () => {
    const gate = evaluateFitActivation({
      statisticalModel: cdmModel,
      by: "ada",
      at: "2026-10-30T12:00:00.000Z",
      parameterSet: {
        parameterSetId: "ps-cdm",
        fitStatistics: {
          cdmFit: { M2: 12, df: 8, p: 0.01, RMSEA2: 0.02, SRMSR: 0.03 },
          qValidation: { nItems: 10, nChanged: 0, suggestions: [] },
          personFit: { proportionMisfit: 0.9, cutoff: -2 },
        },
      },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.family).toBe("cdm");
    expect(gate.fitGate.checks.map((check) => check.id)).toEqual([
      "cdm.rmsea",
      "cdm.srmsr",
      "cdm.qMatrix",
    ]);
  });

  it("fails a CDM set when RMSEA2, SRMSR, or the Q-matrix share is too high", () => {
    const gate = evaluateFitActivation({
      statisticalModel: cdmModel,
      parameterSet: {
        fitStatistics: {
          cdmFit: { RMSEA2: 0.08, SRMSR: 0.09 },
          qValidation: {
            nItems: 4,
            nChanged: 2,
            suggestions: [
              { itemId: "a", original: [1], suggested: [0] },
              { itemId: "b", original: [0], suggested: [1] },
            ],
          },
        },
      },
    });
    expect(gate.ok).toBe(false);
    expect(gate.failedChecks.map((check) => check.id)).toEqual([
      "cdm.rmsea",
      "cdm.srmsr",
      "cdm.qMatrix",
    ]);
  });

  it("applies an authored M2 p-value minimum only when the plan sets one", () => {
    const parameterSet = {
      fitStatistics: {
        cdmFit: { p: 0.01, RMSEA2: 0.02, SRMSR: 0.03 },
        qValidation: { nItems: 4, nChanged: 0 },
      },
    };
    const off = evaluateFitActivation({ statisticalModel: cdmModel, parameterSet });
    expect(off.ok).toBe(true);
    expect(off.fitGate.checks.some((check) => check.id === "cdm.m2p")).toBe(false);

    const on = evaluateFitActivation({
      statisticalModel: cdmModel,
      calibrationPlan: { fitThresholds: { m2PValueMin: 0.05 } },
      parameterSet,
    });
    expect(on.ok).toBe(false);
    expect(on.failedChecks.map((check) => check.id)).toEqual(["cdm.m2p"]);
  });

  it("passes a BN set inside the residual defaults and ignores AIC", () => {
    const gate = evaluateFitActivation({
      statisticalModel: { id: "sm-bn", type: "bayesian_network" },
      parameterSet: {
        fitStatistics: {
          bnFit: {
            logLik: -10,
            aic: 5000,
            bic: 9000,
            meanAbsResidual: 0.02,
            maxAbsResidual: 0.08,
          },
        },
      },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("pass");
    expect(gate.fitGate.family).toBe("bn");
    expect(gate.fitGate.checks.map((check) => check.id)).toEqual([
      "bn.meanAbsResidual",
      "bn.maxAbsResidual",
    ]);
  });

  it("fails a BN set when a marginal residual is over its threshold", () => {
    const gate = evaluateFitActivation({
      statisticalModel: { id: "sm-bn", type: "bayesian_network" },
      parameterSet: {
        fitStatistics: { bnFit: { meanAbsResidual: 0.08, maxAbsResidual: 0.2 } },
      },
    });
    expect(gate.ok).toBe(false);
    expect(gate.failedChecks.map((check) => check.id)).toEqual([
      "bn.meanAbsResidual",
      "bn.maxAbsResidual",
    ]);
  });

  it("does not evaluate a BN set that has no residual summary", () => {
    const gate = evaluateFitActivation({
      statisticalModel: { id: "sm-bn", type: "bayesian_network" },
      parameterSet: { fitStatistics: { bnFit: { logLik: -4, aic: 12, bic: 20 } } },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("not_evaluated");
    expect(gate.fitGate.note).toMatch(/AIC and BIC/);
  });

  it("uses an authored BN residual maximum ahead of the default", () => {
    const parameterSet = {
      fitStatistics: { bnFit: { meanAbsResidual: 0.04, maxAbsResidual: 0.04 } },
    };
    const gate = evaluateFitActivation({
      statisticalModel: { id: "sm-bn", type: "bayesian_network" },
      calibrationPlan: { fitThresholds: { bnMeanAbsResidualMax: 0.03 } },
      parameterSet,
    });
    expect(gate.ok).toBe(false);
    expect(gate.failedChecks.map((check) => check.id)).toEqual(["bn.meanAbsResidual"]);
  });

  it("refuses a predicted set even when fit is missing, fit would pass, or an override is offered", () => {
    const predicted = {
      parameterSetId: "ps-pred",
      parameterStatus: "predicted",
      origin: "predicted",
      sourceModel: "eRm::LLTM",
      converged: true,
      packageVersion: "eRm 1.0.4",
      sampleSize: 400,
    };
    const missing = evaluateFitActivation({
      statisticalModel: irtModel,
      parameterSet: predicted,
      override: { explicit: true, reason: "Use the prediction operationally" },
      by: "ada",
      at: "2026-10-30T12:00:00.000Z",
    });
    expect(missing.ok).toBe(false);
    expect(missing.predicted).toBe(true);
    expect(missing.fitGate.status).toBe("predicted");
    expect(missing.fitGate.status).not.toBe("not_evaluated");

    const passing = evaluateFitActivation({
      statisticalModel: irtModel,
      parameterSet: { ...predicted, fitStatistics: passingIrtFit },
      override: { explicit: true, reason: "Use the prediction operationally" },
    });
    expect(passing.ok).toBe(false);
    expect(passing.fitGate.status).toBe("predicted");

    const already = evaluateFitActivation({
      alreadyActive: true,
      statisticalModel: irtModel,
      parameterSet: predicted,
    });
    expect(already.ok).toBe(false);
    expect(already.grandfathered).toBe(false);
  });

  it("still treats a real set with no fit statistics as not evaluated", () => {
    const gate = evaluateFitActivation({
      statisticalModel: irtModel,
      parameterSet: { parameterSetId: "ps-old", converged: true },
    });
    expect(gate.ok).toBe(true);
    expect(gate.fitGate.status).toBe("not_evaluated");
  });

  it("refuses a predicted BN set before the residual checks", () => {
    const gate = evaluateFitActivation({
      alreadyActive: true,
      statisticalModel: { id: "sm-bn", type: "bayesian_network" },
      parameterSet: {
        parameterStatus: "predicted",
        origin: "predicted",
        fitStatistics: {
          bnFit: { meanAbsResidual: 0.01, maxAbsResidual: 0.02, aic: 10, bic: 12 },
        },
      },
      override: { explicit: true, reason: "Use the prediction" },
    });
    expect(gate.ok).toBe(false);
    expect(gate.fitGate.status).toBe("predicted");
    expect(gate.fitGate.family).toBe("bn");
    expect(gate.grandfathered).toBe(false);
  });

  it("refuses a stored override that has no reason", () => {
    const errors = parameterSetStorageErrors(
      {
        parameterSetId: "ps1",
        packageVersion: "mirt 1.47",
        sampleSize: 10,
        calibratedAt: "2026-10-30T00:00:00.000Z",
        converged: true,
        fitGate: { status: "override", override: { reason: "  " } },
      },
      { id: "sm1", type: "irt" }
    );
    expect(errors.join(" ")).toMatch(/non-empty reason/);
  });
});
