import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const mongoState = vi.hoisted(() => ({
  indexCalls: [],
  docs: [],
}));

vi.mock("mongoose", () => {
  class Schema {
    index(fields, options) {
      mongoState.indexCalls.push({ fields, options });
    }
    set() {}
  }
  const api = {
    connection: { readyState: 1 },
    models: {},
    Schema,
    model: vi.fn(() => ({
      createIndexes: vi.fn(async () => {}),
      collection: {
        indexes: vi.fn(async () => mongoState.indexCalls.map((_, i) => ({ name: `idx-${i}` }))),
      },
      find(filter) {
        const rows = mongoState.docs.filter((doc) => {
          if (filter.evidenceModelId && doc.evidenceModelId !== filter.evidenceModelId) return false;
          if (filter.type && doc.type !== filter.type) return false;
          if (filter.id && doc.id !== filter.id) return false;
          return true;
        });
        return { lean: async () => rows.map((row) => ({ ...row })) };
      },
      findOne(filter) {
        const row = mongoState.docs.find((doc) => doc.id === filter.id) || null;
        return { lean: async () => (row ? { ...row } : null) };
      },
      async create(doc) {
        mongoState.docs.push({ ...doc });
        return { ...doc };
      },
      async replaceOne(filter, doc) {
        const idx = mongoState.docs.findIndex((row) => row.id === filter.id);
        if (idx === -1) mongoState.docs.push({ ...doc });
        else mongoState.docs[idx] = { ...doc };
        return { acknowledged: true };
      },
      async deleteOne(filter) {
        mongoState.docs = mongoState.docs.filter((row) => row.id !== filter.id);
        return { deletedCount: 1 };
      },
    })),
  };
  return { default: api };
});

const { jsonInsertValidityEvidence, jsonListValidityEvidence, jsonReplaceValidityEvidence, jsonDeleteValidityEvidence } =
  await import("../jsonValidityEvidenceAdapter.js");
const {
  mongoInsertValidityEvidence,
  mongoListValidityEvidence,
  mongoReplaceValidityEvidence,
  mongoDeleteValidityEvidence,
  ensureValidityEvidenceIndexes,
} = await import("../mongoValidityEvidenceAdapter.js");
const { VALIDITY_EVIDENCE_INDEX_FIELDS } = await import("../validityEvidenceBackend.js");
const { forgetDbCache } = await import("../../../src/utils/db-server.js");
const { dbAdapter } = await import("../../utils/dbAdapter.js");

function row(id, extra = {}) {
  return {
    id,
    evidenceModelId: "em1",
    type: "relations",
    summary: "Criterion study",
    body: "Correlation 0.42 with the external score.",
    source: "criterion study",
    author: "admin1",
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...extra,
  };
}

describe("JSON validity evidence adapter", () => {
  it("inserts, lists by evidence model and type, updates, and deletes", () => {
    const db = { validityEvidence: [] };
    jsonInsertValidityEvidence(db, row("ve1"));
    jsonInsertValidityEvidence(db, row("ve2", { evidenceModelId: "em2", type: "consequences" }));
    expect(jsonListValidityEvidence(db, { evidenceModelId: "em1", type: "relations" }).map((item) => item.id)).toEqual([
      "ve1",
    ]);
    jsonReplaceValidityEvidence(db, row("ve1", { summary: "Updated criterion study" }));
    expect(db.validityEvidence[0].summary).toBe("Updated criterion study");
    expect(jsonDeleteValidityEvidence(db, "ve1").id).toBe("ve1");
    expect(db.validityEvidence.map((item) => item.id)).toEqual(["ve2"]);
  });

  it("refuses a second insert for the same analysis artefact", () => {
    const db = { validityEvidence: [] };
    jsonInsertValidityEvidence(db, row("ve1", { analysisArtefactId: "aa1", type: "internal-structure" }));
    expect(() =>
      jsonInsertValidityEvidence(db, row("ve2", { analysisArtefactId: "aa1", type: "internal-structure" }))
    ).toThrow(/already linked/);
  });
});

describe("Mongo validity evidence adapter", () => {
  beforeEach(() => {
    mongoState.docs = [];
    mongoState.indexCalls = [];
  });

  it("declares an evidenceModelId + type index and a partial unique artefact index", async () => {
    const names = await ensureValidityEvidenceIndexes();
    expect(names.length).toBe(VALIDITY_EVIDENCE_INDEX_FIELDS.length);
    expect(mongoState.indexCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: { evidenceModelId: 1, type: 1 },
        }),
        expect.objectContaining({
          fields: { analysisArtefactId: 1 },
          options: expect.objectContaining({
            unique: true,
            partialFilterExpression: { analysisArtefactId: { $type: "string" } },
          }),
        }),
      ])
    );
  });

  it("inserts, lists, replaces, and deletes through the model", async () => {
    await mongoInsertValidityEvidence(row("ve1"));
    await mongoInsertValidityEvidence(row("ve2", { type: "consequences" }));
    const listed = await mongoListValidityEvidence({ evidenceModelId: "em1", type: "relations" });
    expect(listed.map((item) => item.id)).toEqual(["ve1"]);
    await mongoReplaceValidityEvidence(row("ve1", { summary: "Replaced" }));
    expect(mongoState.docs.find((item) => item.id === "ve1").summary).toBe("Replaced");
    await mongoDeleteValidityEvidence("ve1");
    expect(mongoState.docs.map((item) => item.id)).toEqual(["ve2"]);
  });
});

describe("dbAdapter validityEvidence JSON path", () => {
  let tmp;
  let previousFile;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-ve-adapter-"));
    previousFile = process.env.ECD_DB_FILE;
    process.env.ECD_DB_FILE = path.join(tmp, "db.json");
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({
        evidenceModels: [{ id: "em1", warrants: [{ id: "w1" }], alternativeExplanations: [] }],
        validityEvidence: [],
        auditLog: [],
      })
    );
    forgetDbCache();
  });
  afterEach(() => {
    forgetDbCache();
    if (previousFile === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = previousFile;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes the ECD file, not a separate JSON store", async () => {
    const saved = await dbAdapter.insert("validityEvidence", row("ve-adapter", { warrantIds: ["w1"] }));
    expect(saved.id).toBe("ve-adapter");
    const onDisk = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    expect(onDisk.validityEvidence.map((item) => item.id)).toEqual(["ve-adapter"]);
    const listed = await dbAdapter.list("validityEvidence");
    expect(listed.map((item) => item.id)).toEqual(["ve-adapter"]);
  });
});
