import { describe, it, expect } from "vitest";
import { ingestCalibrationJob } from "../../r/calibrationIngest.js";
import {
  linkTu4FitEvidence,
  tu4LinkInputFromArtefact,
  tu4LinkInputFromJob,
  tu4LinkInputFromParameterSet,
} from "../linkTu4Fit.js";

const personFit = {
  statistic: "Zh",
  cutoff: -2,
  rule: "Zh < cutoff",
  nPersons: 8,
  nMisfit: 1,
  proportionMisfit: 0.125,
};

function artefact(id = "aa1") {
  return {
    id,
    kind: "irt-parameters",
    jobId: "job1",
    scope: { evidenceModelId: "em1", districtId: "tn-chennai" },
    payload: {
      fitStatistics: { personFit },
      personFitRows: [{ personId: "secret-student", Zh: -3, misfit: true }],
      calibratedBy: "admin1",
    },
    computedAt: "2026-10-31T01:00:00.000Z",
  };
}

describe("TU4 validity evidence link", () => {
  it("stores one internal-structure row per artefact and ignores a repeat", () => {
    const db = { validityEvidence: [] };
    const first = linkTu4FitEvidence(db, tu4LinkInputFromArtefact(artefact()));
    const second = linkTu4FitEvidence(db, tu4LinkInputFromArtefact(artefact()));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(db.validityEvidence).toHaveLength(1);
    expect(db.validityEvidence[0].type).toBe("internal-structure");
    expect(db.validityEvidence[0].source).toBe("tu4-fit");
    expect(db.validityEvidence[0].analysisArtefactId).toBe("aa1");
    expect(db.validityEvidence[0].evidenceModelId).toBe("em1");
    expect(db.validityEvidence[0].districtId).toBe("tn-chennai");
    expect(JSON.stringify(db.validityEvidence[0])).not.toMatch(/secret-student/);
    expect(second.record.id).toBe(first.record.id);
  });

  it("collapses a parameter set and a job that name the same artefact or job", () => {
    const db = { validityEvidence: [] };
    linkTu4FitEvidence(db, tu4LinkInputFromJob({
      id: "job1",
      status: "succeeded",
      evidenceModelId: "em1",
      response: { fitStatistics: { personFit }, calibratedAt: "2026-10-31T01:00:00.000Z" },
      requestedBy: "admin1",
    }));
    const fromSet = linkTu4FitEvidence(
      db,
      tu4LinkInputFromParameterSet("em1", {
        parameterSetId: "ps1",
        calibrationJobId: "job1",
        analysisArtefactId: "aa1",
        calibratedBy: "admin1",
        fitStatistics: { localDependence: { maxAbsQ3: 0.4, flaggedPairs: [] } },
      })
    );
    expect(fromSet.created).toBe(false);
    expect(fromSet.updated).toBe(true);
    expect(db.validityEvidence).toHaveLength(1);
    expect(db.validityEvidence[0].analysisArtefactId).toBe("aa1");
    expect(db.validityEvidence[0].parameterSetId).toBe("ps1");
  });

  it("links once when a TU4 parameter set is ingested", () => {
    const db = {
      calibrationJobs: [],
      analysisArtefacts: [],
      validityEvidence: [],
      evidenceModels: [
        {
          id: "em1",
          statisticalModels: [{ id: "sm1", type: "irt", parameterSets: [] }],
        },
      ],
    };
    const response = {
      contractVersion: "1.0",
      jobId: "job-tu4",
      converged: true,
      packageVersion: "mirt 1.47",
      sampleSize: 4,
      calibratedAt: "2026-10-30T00:00:00Z",
      parameters: { item_a: { a: 1, b: 0, c: 0 }, item_b: { a: 1, b: 0, c: 0 } },
      fitStatistics: {
        global: { RMSEA: 0.04 },
        personFit,
        localDependence: { statistic: "Q3", threshold: 0.2, maxAbsQ3: 0.31, flaggedPairs: [] },
      },
    };
    const job = {
      id: "job-tu4",
      kind: "irt-parameters",
      status: "succeeded",
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      response,
    };
    const first = ingestCalibrationJob(job, db, { parameterSetId: "ps-tu4" });
    expect(first.ok, first.error).toBe(true);
    expect(db.validityEvidence).toHaveLength(1);
    expect(db.validityEvidence[0].calibrationJobId).toBe("job-tu4");
    expect(db.validityEvidence[0].parameterSetId).toBe("ps-tu4");
    const again = ingestCalibrationJob(job, db, { parameterSetId: "ps-tu4-again" });
    expect(again.ok).toBe(false);
    expect(db.validityEvidence).toHaveLength(1);
  });
});
