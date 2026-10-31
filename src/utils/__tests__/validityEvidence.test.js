import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { applySaveAudits, auditBaseline } from "../../../server/utils/auditLog.js";
import { summariseTu4Fit, VALIDITY_EVIDENCE_TYPES } from "../validityEvidence.js";
import { applyTenancyToDb } from "../../../server/utils/tenancyScope.js";

const evidenceModel = {
  id: "em1",
  warrants: [{ id: "w1" }, { id: "w2" }],
  alternativeExplanations: [
    { text: "Speeded responding", addressedBy: "obs1" },
  ],
};

function record(extra = {}) {
  return {
    id: "ve1",
    evidenceModelId: "em1",
    type: "response-process",
    summary: "Three students talked through the item.",
    body: "They named the diagram before choosing.",
    source: "cognitive lab",
    author: "admin1",
    warrantIds: ["w1"],
    alternativeExplanationIndexes: [0],
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...extra,
  };
}

describe("validityEvidence schema", () => {
  it("accepts the four argument types and warrant links", () => {
    const db = { evidenceModels: [evidenceModel], validityEvidence: [] };
    for (const type of VALIDITY_EVIDENCE_TYPES) {
      const result = validateEntity("validityEvidence", record({ type }), db);
      expect(result.valid, result.errors?.join(" ")).toBe(true);
    }
  });

  it("refuses an unknown type, a blank summary, and a warrant that is not on the model", () => {
    const db = { evidenceModels: [evidenceModel], validityEvidence: [] };
    const badType = validateEntity("validityEvidence", record({ type: "face" }), db);
    expect(badType.valid).toBe(false);
    expect(badType.errors.join(" ")).toMatch(/type must be one of/);

    const blank = validateEntity("validityEvidence", record({ summary: "  " }), db);
    expect(blank.errors.join(" ")).toMatch(/summary is required/);

    const dangling = validateEntity(
      "validityEvidence",
      record({ warrantIds: ["missing"], alternativeExplanationIndexes: [3] }),
      db
    );
    expect(dangling.errors.join(" ")).toMatch(/Warrant 'missing'/);
    expect(dangling.errors.join(" ")).toMatch(/index 3/);
  });

  it("refuses a second row for the same analysis artefact", () => {
    const db = {
      evidenceModels: [evidenceModel],
      validityEvidence: [record({ id: "ve-old", analysisArtefactId: "aa1" })],
    };
    const result = validateEntity(
      "validityEvidence",
      record({ id: "ve-new", analysisArtefactId: "aa1", type: "internal-structure", source: "tu4-fit" }),
      db
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/already linked/);
  });
});

describe("TU4 fit summary", () => {
  it("states counts and does not copy person ids", () => {
    const text = summariseTu4Fit({
      fitStatistics: {
        personFit: { nPersons: 20, nMisfit: 2, cutoff: -2 },
        localDependence: { maxAbsQ3: 0.31, flaggedPairs: [{ itemId1: "a", itemId2: "b" }] },
        cdmFit: { RMSEA2: 0.02, SRMSR: 0.03, M2: 12 },
        qValidation: { nChanged: 1 },
      },
      personFitRows: [{ personId: "student-secret" }],
    });
    expect(text).toMatch(/2 of 20/);
    expect(text).toMatch(/max absolute Q3 0.31/);
    expect(text).toMatch(/RMSEA2 0.02/);
    expect(text).toMatch(/1 change/);
    expect(text).not.toMatch(/student-secret/);
  });
});

describe("validity evidence audit", () => {
  it("records create, update, and delete, and ignores an unchanged row", () => {
    const row = record();
    const created = { validityEvidence: [row], auditLog: [] };
    applySaveAudits({ validityEvidence: [] }, created);
    expect(created.auditLog.map((entry) => entry.action)).toEqual(["validity_evidence.create"]);
    expect(created.auditLog[0].entity).toEqual({
      collection: "validityEvidence",
      id: "ve1",
      version: null,
    });

    const baseline = auditBaseline({ validityEvidence: [row] });
    const quiet = { validityEvidence: [{ ...row }], auditLog: [] };
    applySaveAudits(baseline, quiet);
    expect(quiet.auditLog).toEqual([]);

    const edited = {
      validityEvidence: [{ ...row, summary: "A longer lab note." }],
      auditLog: [],
    };
    applySaveAudits(baseline, edited);
    expect(edited.auditLog.map((entry) => entry.action)).toEqual(["validity_evidence.update"]);

    const removed = { validityEvidence: [], auditLog: [] };
    applySaveAudits(baseline, removed);
    expect(removed.auditLog.map((entry) => entry.action)).toEqual(["validity_evidence.delete"]);
  });
});

describe("validity evidence tenancy", () => {
  const db = {
    validityEvidence: [
      { id: "ve-platform", evidenceModelId: "em1", districtId: null },
      { id: "ve-c", evidenceModelId: "em1", districtId: "tn-chennai", schoolId: "sch-1" },
      { id: "ve-m", evidenceModelId: "em1", districtId: "tn-madurai" },
    ],
  };

  it("shows a district its own rows and platform evidence", () => {
    const scoped = applyTenancyToDb(db, {
      role: "district",
      username: "dist1",
      viewScope: "district",
      districtId: "tn-chennai",
      schoolId: null,
    });
    expect(scoped.validityEvidence.map((row) => row.id).sort()).toEqual(["ve-c", "ve-platform"]);
  });

  it("hides another school's row from a school-scoped teacher", () => {
    const scoped = applyTenancyToDb(db, {
      role: "teacher",
      username: "teach1",
      viewScope: "school",
      districtId: "tn-chennai",
      schoolId: "sch-2",
    });
    expect(scoped.validityEvidence.map((row) => row.id)).toEqual(["ve-platform"]);
  });
});
