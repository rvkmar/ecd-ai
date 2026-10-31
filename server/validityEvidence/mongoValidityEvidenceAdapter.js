// Mongo adapter for the validityEvidence collection.
// Indexes: unique id, evidenceModelId + type, and a partial unique
// index on analysisArtefactId so one row is stored per artefact.

import mongoose from "mongoose";
import { VALIDITY_EVIDENCE_INDEX_FIELDS } from "./validityEvidenceBackend.js";
import { validityEvidenceMatchesFilter } from "../../src/utils/validityEvidence.js";

function mongoUri(env = process.env) {
  return env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";
}

function plain(row) {
  if (!row || typeof row !== "object") return null;
  const obj =
    typeof row.toObject === "function"
      ? row.toObject({ minimize: false, versionKey: false, flattenObjectIds: true })
      : { ...row };
  delete obj._id;
  delete obj.__v;
  return obj;
}

let indexesReady = null;

function mongoFilter(filter = {}) {
  const query = {};
  if (filter.id != null) query.id = filter.id;
  if (filter.evidenceModelId != null) query.evidenceModelId = filter.evidenceModelId;
  if (filter.type != null) query.type = filter.type;
  if (filter.analysisArtefactId != null) query.analysisArtefactId = filter.analysisArtefactId;
  if (filter.calibrationJobId != null) query.calibrationJobId = filter.calibrationJobId;
  return query;
}

async function getModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri(), {
      dbName: "ecd_assessment",
      serverSelectionTimeoutMS: 10000,
    });
  }
  if (mongoose.models.EcdValidityEvidence) {
    if (process.env.NODE_ENV !== "test") {
      if (!indexesReady) indexesReady = mongoose.models.EcdValidityEvidence.createIndexes();
      await indexesReady;
      return mongoose.models.EcdValidityEvidence;
    }
    delete mongoose.models.EcdValidityEvidence;
    indexesReady = null;
  }
  const schema = new mongoose.Schema(
    { id: { type: String, required: true } },
    {
      strict: false,
      collection: "validityEvidence",
      versionKey: false,
      minimize: false,
    }
  );
  schema.set("minimize", false);
  schema.set("toObject", { minimize: false, versionKey: false });
  schema.set("toJSON", { minimize: false, versionKey: false });
  for (const spec of VALIDITY_EVIDENCE_INDEX_FIELDS) {
    const fields = spec[0];
    const options = spec[1] || {};
    if (Array.isArray(fields)) {
      schema.index(Object.fromEntries(fields.map((name) => [name, 1])), options);
    } else {
      schema.index({ [fields]: 1 }, options);
    }
  }
  const model = mongoose.model("EcdValidityEvidence", schema);
  indexesReady = model.createIndexes();
  await indexesReady;
  return model;
}

export async function mongoListValidityEvidence(filter = {}) {
  const model = await getModel();
  const rows = await model.find(mongoFilter(filter)).lean();
  return rows.map(plain).filter((row) => row && validityEvidenceMatchesFilter(row, filter));
}

export async function mongoGetValidityEvidence(id) {
  if (id == null) return null;
  const model = await getModel();
  const row = await model.findOne({ id }).lean();
  return plain(row);
}

export async function mongoInsertValidityEvidence(record) {
  const model = await getModel();
  const created = await model.create(record);
  return plain(created) || record;
}

export async function mongoReplaceValidityEvidence(record) {
  const model = await getModel();
  const clean = plain(record) || record;
  await model.replaceOne({ id: clean.id }, clean, { upsert: true });
  return clean;
}

export async function mongoDeleteValidityEvidence(id) {
  const model = await getModel();
  const existing = plain(await model.findOne({ id }).lean());
  if (!existing) return null;
  await model.deleteOne({ id });
  return existing;
}

export async function ensureValidityEvidenceIndexes() {
  const model = await getModel();
  const indexes = await model.collection.indexes();
  return indexes.map((row) => row.name);
}
