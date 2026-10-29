import mongoose from "mongoose";
import { ANALYSIS_ARTEFACT_INDEX_FIELDS } from "./analysisArtefactBackend.js";

function mongoUri(env = process.env) {
  return env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";
}

export function analysisArtefactToPlain(row) {
  if (!row || typeof row !== "object") return null;
  const obj =
    typeof row.toObject === "function"
      ? row.toObject({ minimize: false, versionKey: false, flattenObjectIds: true })
      : { ...row };
  delete obj._id;
  delete obj.__v;
  return obj;
}

function plain(row) {
  return analysisArtefactToPlain(row);
}

let indexesReady = null;

async function getArtefactModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri(), {
      dbName: "ecd_assessment",
      serverSelectionTimeoutMS: 10000,
    });
  }
  if (mongoose.models.EcdAnalysisArtefact) {
    if (!indexesReady) indexesReady = mongoose.models.EcdAnalysisArtefact.createIndexes();
    await indexesReady;
    return mongoose.models.EcdAnalysisArtefact;
  }
  const schema = new mongoose.Schema(
    { id: { type: String, required: true } },
    {
      strict: false,
      collection: "analysisArtefacts",
      versionKey: false,
      minimize: false,
    }
  );
  schema.set("minimize", false);
  schema.set("toObject", { minimize: false, versionKey: false });
  schema.set("toJSON", { minimize: false, versionKey: false });
  for (const spec of ANALYSIS_ARTEFACT_INDEX_FIELDS) {
    const fields = spec[0];
    const options = spec[1] || {};
    if (Array.isArray(fields)) {
      schema.index(
        Object.fromEntries(fields.map((name) => [name, 1])),
        options
      );
    } else {
      schema.index({ [fields]: 1 }, options);
    }
  }
  const model = mongoose.model("EcdAnalysisArtefact", schema);
  indexesReady = model.createIndexes();
  await indexesReady;
  return model;
}

export async function mongoArtefactFind(filter = {}, options = {}) {
  const model = await getArtefactModel();
  let query = model.find(filter);
  if (options?.sort) query = query.sort(options.sort);
  if (options?.limit != null) query = query.limit(options.limit);
  const rows = await query.lean();
  return rows.map(plain).filter(Boolean);
}

export async function mongoArtefactFindOne(id) {
  const model = await getArtefactModel();
  const row = await model.findOne({ id }).lean();
  return plain(row);
}

export async function mongoArtefactReplace(doc) {
  const model = await getArtefactModel();
  const clean = plain(doc);
  await model.replaceOne({ id: clean.id }, clean, { upsert: true });
  return clean;
}

export async function ensureAnalysisArtefactIndexes() {
  const model = await getArtefactModel();
  const indexes = await model.collection.indexes();
  return indexes.map((row) => row.name);
}
