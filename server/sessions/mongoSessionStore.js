import mongoose from "mongoose";
import { SESSION_INDEX_FIELDS } from "./sessionBackend.js";

function mongoUri(env = process.env) {
  return env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";
}

export function sessionToPlain(row) {
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
  return sessionToPlain(row);
}

let indexesReady = null;

async function getSessionModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri(), {
      dbName: "ecd_assessment",
      serverSelectionTimeoutMS: 10000,
    });
  }
  if (mongoose.models.EcdSession) {
    if (!indexesReady) indexesReady = mongoose.models.EcdSession.createIndexes();
    await indexesReady;
    return mongoose.models.EcdSession;
  }
  const schema = new mongoose.Schema(
    { id: { type: String, required: true } },
    {
      strict: false,
      collection: "sessions",
      versionKey: false,
      // Default minimize drops empty objects such as studentModel.smvPosteriors = {}.
      minimize: false,
    }
  );
  schema.set("minimize", false);
  schema.set("toObject", { minimize: false, versionKey: false });
  schema.set("toJSON", { minimize: false, versionKey: false });
  for (const spec of SESSION_INDEX_FIELDS) {
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
  const model = mongoose.model("EcdSession", schema);
  indexesReady = model.createIndexes();
  await indexesReady;
  return model;
}

export async function mongoFind(filter = {}) {
  const model = await getSessionModel();
  const rows = await model.find(filter).lean();
  return rows.map(plain).filter(Boolean);
}

export async function mongoFindOne(id) {
  const model = await getSessionModel();
  const row = await model.findOne({ id }).lean();
  return plain(row);
}

export async function mongoReplace(doc) {
  const model = await getSessionModel();
  const clean = plain(doc);
  await model.replaceOne({ id: clean.id }, clean, { upsert: true });
  return clean;
}

export async function mongoRemove(id) {
  const model = await getSessionModel();
  await model.deleteOne({ id });
}

export async function ensureSessionIndexes() {
  const model = await getSessionModel();
  const indexes = await model.collection.indexes();
  return indexes.map((row) => row.name);
}
