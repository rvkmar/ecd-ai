import { describe, it, expect } from "vitest";
import {
  irtSummaryFromAccumulator,
  resolveReportLevel,
  sessionProbabilityReport,
  sessionThetaReport,
} from "../reportLevels.js";

const thetaLevels = {
  id: "c-theta",
  performanceLevelScale: "theta",
  performanceLevels: [
    { label: "Basic", descriptor: "Below the claim.", cut: -0.5 },
    { label: "Proficient", descriptor: "Meets the claim on the theta scale.", cut: 0.2 },
    { label: "Advanced", descriptor: "Beyond the claim.", cut: 1.5 },
  ],
};

const probabilityLevels = {
  id: "c-prob",
  performanceLevelScale: "probability",
  performanceLevels: [
    { label: "Partial", descriptor: "Some of the claim.", cut: 0.4 },
    { label: "Secure", descriptor: "The claim is met.", cut: 0.75 },
  ],
};

describe("resolveReportLevel", () => {
  it("uses the authored label and the descriptor as the level text", () => {
    expect(resolveReportLevel({ value: 0.4, scale: "theta", competency: thetaLevels })).toMatchObject({
      level: "Proficient",
      levelText: "Meets the claim on the theta scale.",
      descriptor: "Meets the claim on the theta scale.",
      levelSource: "authored",
      levelCut: 0.2,
      levelNote: null,
      levelBand: "middle",
    });
    expect(resolveReportLevel({ value: 1.6, scale: "theta", competency: thetaLevels }).level).toBe("Advanced");
    expect(resolveReportLevel({ value: 0.8, scale: "probability", competency: probabilityLevels })).toMatchObject({
      level: "Secure",
      levelText: "The claim is met.",
      levelSource: "authored",
      levelBand: "high",
    });
  });

  it("falls back to the historical cuts when nothing is authored", () => {
    expect(resolveReportLevel({ value: 1.2, scale: "theta", competency: null })).toMatchObject({
      level: "Advanced",
      levelSource: "default",
      levelNote: "default cut",
    });
    expect(resolveReportLevel({ value: 1, scale: "theta" }).level).toBe("Proficient");
    expect(resolveReportLevel({ value: 0, scale: "theta" }).level).toBe("Needs Support");
    expect(resolveReportLevel({ value: -0.2, scale: "theta" }).level).toBe("Needs Support");
    expect(resolveReportLevel({ value: 0.8, scale: "probability", competency: { performanceLevels: [] } })).toMatchObject({
      level: "Strong",
      levelSource: "default",
      levelNote: "default cut",
    });
    expect(resolveReportLevel({ value: 0.7, scale: "probability" }).level).toBe("Developing");
    expect(resolveReportLevel({ value: 0.4, scale: "probability" }).level).toBe("Needs Support");
    expect(resolveReportLevel({ value: 0.2, scale: "probability" }).level).toBe("Needs Support");
  });

  it("falls back when the authored scale does not match the score", () => {
    const resolved = resolveReportLevel({ value: 1.2, scale: "theta", competency: probabilityLevels });
    expect(resolved).toMatchObject({
      level: "Advanced",
      levelText: "Advanced",
      levelSource: "default",
      levelNote: "default cut",
    });
    expect(resolveReportLevel({ value: 0.9, scale: "probability", competency: thetaLevels })).toMatchObject({
      level: "Strong",
      levelSource: "default",
    });
  });

  it("falls back when the score sits below every authored cut", () => {
    expect(resolveReportLevel({ value: -1, scale: "theta", competency: thetaLevels })).toMatchObject({
      level: "Needs Support",
      levelSource: "default",
      levelNote: "default cut",
    });
  });
});

describe("session score reports", () => {
  const claim = "The student can name the called-out plant part.";
  const db = {
    competencies: [thetaLevels],
    evidenceModels: [{
      id: "em1",
      competencyId: "c-theta",
      claimStatement: claim,
    }],
    tasks: [{ id: "t1", taskModelId: "tm1" }],
    taskModels: [{ id: "tm1", evidenceModelIds: ["em1"], primaryEvidenceModelId: "em1" }],
  };

  it("quotes the claim and prefers a stored theta SE", () => {
    const session = {
      id: "s1",
      selectionStrategy: "IRT",
      taskIds: ["t1"],
      responses: [{ taskId: "t1" }, { taskId: "t1" }],
      studentModel: { irtTheta: 0.4, irtSe: 0.22 },
    };
    expect(sessionThetaReport(db, session, 0.4)).toMatchObject({
      level: "Proficient",
      levelText: "Meets the claim on the theta scale.",
      levelSource: "authored",
      claimStatement: claim,
      standardError: 0.22,
      competencyId: "c-theta",
    });
  });

  it("uses the posterior sem when irtSe is absent", () => {
    const session = {
      selectionStrategy: "IRT",
      responses: [{}, {}, {}, {}],
      studentModel: {
        irtTheta: 0.1,
        smvPosteriors: {
          smv1: { method: "eap", modelFamily: "irt", sem: 0.31, evidenceModelId: "em1" },
        },
      },
    };
    expect(sessionThetaReport(db, session, 0.1).standardError).toBe(0.31);
  });

  it("reports posterior SD and keeps the default probability word when levels are on theta", () => {
    const session = {
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        bnPosteriors: { smv1: 0.8 },
        smvPosteriors: {
          smv1: {
            smvId: "smv1",
            method: "exact-bayes",
            estimate: 0.8,
            sem: 0.15,
            evidenceModelId: "em1",
          },
        },
      },
    };
    const row = sessionProbabilityReport(db, session, "smv1", 0.8);
    expect(row).toMatchObject({
      level: "Strong",
      levelSource: "default",
      levelNote: "default cut",
      posteriorSd: 0.15,
      claimStatement: claim,
    });
    expect(row.classification).toBeUndefined();
  });

  it("classifies a mastery posterior with classifyByRule and still levels the probability", () => {
    const masteryDb = {
      ...db,
      competencies: [probabilityLevels],
      evidenceModels: [{
        id: "em1",
        competencyId: "c-prob",
        claimStatement: claim,
        decisionRule: { type: "mastery", threshold: 0.9, direction: "above" },
      }],
    };
    const session = {
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        bnPosteriors: { smv1: 0.8 },
        smvPosteriors: {
          smv1: {
            smvId: "smv1",
            method: "attribute-mastery-posterior",
            estimate: 0.8,
            precision: 0.11,
            evidenceModelId: "em1",
          },
        },
      },
    };
    expect(sessionProbabilityReport(masteryDb, session, "smv1", 0.8)).toMatchObject({
      level: "Secure",
      levelText: "The claim is met.",
      levelSource: "authored",
      posteriorSd: 0.11,
      classification: "nonmaster",
      masteryThreshold: 0.9,
      claimStatement: claim,
    });
  });
});

describe("aggregate standard error", () => {
  it("uses the person SE for one score and the SE of the mean when every score has one", () => {
    const one = irtSummaryFromAccumulator({}, {
      irtValues: [0.4],
      irtSes: [0.2],
      irtEvidenceIds: new Set(),
    });
    expect(one.standardError).toBe(0.2);
    const two = irtSummaryFromAccumulator({}, {
      irtValues: [0.2, 0.4],
      irtSes: [0.1, 0.1],
      irtEvidenceIds: new Set(),
    });
    expect(two.standardError).toBeCloseTo(Math.sqrt((0.01 + 0.01) / 4), 8);
  });
});
