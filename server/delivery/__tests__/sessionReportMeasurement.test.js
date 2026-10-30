import { describe, it, expect } from "vitest";
import { sessionMeasurementReport } from "../sessionReportMeasurement.js";

const STOPPED = {
  rule: "targetsMet",
  assemblyModelId: "am1",
  reason: "Every declared Assembly Model target is scored and met (1 of 1) at 2 response(s).",
  targets: [
    {
      smvId: "attrA",
      classification: "master",
      expectedClassificationAccuracy: 0.95,
      masteryThreshold: 0.5,
      estimate: 0.95,
    },
  ],
  stoppedAt: "2026-09-13T06:00:00.000Z",
};

describe("sessionMeasurementReport", () => {
  it("recomputes the attribute profile from persisted posteriors", () => {
    const result = sessionMeasurementReport({
      stopped: STOPPED,
      studentModel: {
        smvPosteriors: {
          attrA: {
            smvId: "attrA",
            method: "attribute-mastery-posterior",
            modelFamily: "dina",
            estimate: 0.91,
          },
        },
      },
    });
    expect(result.stopped).toEqual(STOPPED);
    expect(result.attributeProfile).toHaveLength(1);
    expect(result.attributeProfile[0]).toMatchObject({
      smvId: "attrA",
      classification: "master",
      expectedClassificationAccuracy: 0.91,
    });
  });

  it("falls back to stopped.targets when no posterior is stored", () => {
    const result = sessionMeasurementReport({ stopped: STOPPED });
    expect(result.attributeProfile).toEqual([
      {
        smvId: "attrA",
        estimate: 0.95,
        classification: "master",
        expectedClassificationAccuracy: 0.95,
        masteryThreshold: 0.5,
      },
    ]);
  });

  it("returns empty measurement fields for a session with neither", () => {
    expect(sessionMeasurementReport({ id: "s1" })).toEqual({
      stopped: null,
      attributeProfile: [],
    });
  });

  it("classifies the report profile at 0.5 when no cut is authored", () => {
    const session = {
      studentModel: {
        smvPosteriors: {
          attrA: {
            smvId: "attrA",
            method: "attribute-mastery-posterior",
            modelFamily: "dina",
            estimate: 0.6,
            evidenceModelId: "em1",
            competencyModelId: "cm1",
          },
        },
      },
    };
    const db = {
      evidenceModels: [{
        id: "em1",
        decisionRule: { type: "posterior_threshold", threshold: 0.3, direction: "above" },
      }],
    };
    expect(sessionMeasurementReport(session, db).attributeProfile[0]).toMatchObject({
      classification: "master",
      masteryThreshold: 0.5,
    });
    expect(sessionMeasurementReport(session).attributeProfile[0].classification).toBe("master");
  });

  it("applies a mastery decision rule to the level the report shows", () => {
    const session = {
      assemblyProgress: { assemblyModelId: "am1" },
      studentModel: {
        smvPosteriors: {
          attrA: {
            smvId: "attrA",
            method: "attribute-mastery-posterior",
            modelFamily: "dina",
            estimate: 0.6,
            evidenceModelId: "em1",
            competencyModelId: "cm1",
          },
        },
      },
    };
    const db = {
      assemblyModels: [{ id: "am1", competencyModelId: "cm1", masteryThreshold: 0.75 }],
      competencyModels: [{
        id: "cm1",
        smVariables: [{ id: "attrA", type: "binary", masteryThreshold: 0.55 }],
      }],
      evidenceModels: [{
        id: "em1",
        decisionRule: { type: "mastery", threshold: 0.9, direction: "above" },
      }],
    };
    expect(sessionMeasurementReport(session, db).attributeProfile[0]).toMatchObject({
      classification: "master",
      masteryThreshold: 0.55,
      expectedClassificationAccuracy: 0.6,
    });

    delete db.competencyModels[0].smVariables[0].masteryThreshold;
    expect(sessionMeasurementReport(session, db).attributeProfile[0]).toMatchObject({
      classification: "nonmaster",
      masteryThreshold: 0.75,
    });

    delete db.assemblyModels[0].masteryThreshold;
    expect(sessionMeasurementReport(session, db).attributeProfile[0]).toMatchObject({
      classification: "nonmaster",
      masteryThreshold: 0.9,
    });
  });
});
