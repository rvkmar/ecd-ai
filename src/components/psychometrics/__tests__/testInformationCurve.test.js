import { describe, it, expect } from "vitest";
import {
  continuousSemTargetsFromAssemblyModels,
  curvePointsFromArtefact,
  evaluateSemTarget,
  reliabilityFromArtefact,
} from "../testInformationCurve";

describe("testInformationCurve (D83)", () => {
  const pointsHighSem = [
    { theta: -1, information: 0.5, conditionalSEM: 1.5 },
    { theta: 0, information: 0.8, conditionalSEM: 1.2 },
    { theta: 1, information: 0.4, conditionalSEM: 1.6 },
  ];
  const pointsMeets = [
    { theta: -1, information: 2, conditionalSEM: 0.5 },
    { theta: 0, information: 10, conditionalSEM: 0.2 },
    { theta: 1, information: 2, conditionalSEM: 0.5 },
  ];

  it("flattens artefact curve arrays", () => {
    const pts = curvePointsFromArtefact({
      payload: {
        parameters: {
          theta: [-1, 0, 1],
          information: [0.8, 0.9, 0.5],
          conditionalSEM: [1.1, 1.05, 1.4],
        },
      },
    });
    expect(pts).toHaveLength(3);
    expect(pts[1]).toEqual({
      theta: 0,
      information: 0.9,
      conditionalSEM: 1.05,
    });
  });

  it("marks never-meets when every SEM is above requiredSEM", () => {
    const ev = evaluateSemTarget(pointsHighSem, 0.35);
    expect(ev.status).toBe("never-meets");
    expect(ev.meetsAnywhere).toBe(false);
    expect(ev.message).toMatch(/never reaches SEM ≤ 0\.35/);
    expect(ev.message).toMatch(/stop on length/i);
  });

  it("marks meets-somewhere when SEM dips to or below the target", () => {
    const ev = evaluateSemTarget(pointsMeets, 0.35);
    expect(ev.status).toBe("meets-somewhere");
    expect(ev.meetsAnywhere).toBe(true);
  });

  it("extracts continuous SEM targets from Assembly Models", () => {
    const targets = continuousSemTargetsFromAssemblyModels([
      {
        id: "am1",
        name: "Adaptive IRT",
        targetsBySMV: [
          { smvId: "theta", requiredSEM: 0.35 },
          { smvId: "attrA", requiredClassificationAccuracy: 0.8 },
        ],
      },
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].requiredSEM).toBe(0.35);
    expect(targets[0].smvId).toBe("theta");
  });

  it("labels KR-20 and marginal reliability separately", () => {
    const r = reliabilityFromArtefact({
      payload: {
        fitStatistics: { kr20: 0.35, marginalReliability: 0.72 },
        diagnostics: {
          reliabilityNote: "kr20 classical; marginal IRT",
        },
      },
    });
    expect(r.kr20).toBe(0.35);
    expect(r.marginalReliability).toBe(0.72);
    expect(r.reliabilityNote).toMatch(/classical/);
  });
});
