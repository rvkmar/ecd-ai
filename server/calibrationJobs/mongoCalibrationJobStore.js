import mongoose from "mongoose";
import { CALIBRATION_JOB_INDEX_FIELDS } from "./calibrationJobBackend.js";

function mongoUri(env = process.env) {
  return env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";
}

export function calibrationJobToPlain(row) {
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
  return calibrationJobToPlain(row);
}

let indexesReady = null;

async function getJobModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri(), {
      dbName: "ecd_assessment",
      serverSelectionTimeoutMS: 10000,
    });
  }
  if (mongoose.models.EcdCalibrationJob) {
    if (!indexesReady) indexesReady = mongoose.models.EcdCalibrationJob.createIndexes();
    await indexesReady;
    return mongoose.models.EcdCalibrationJob;
  }
  const schema = new mongoose.Schema(
    { id: { type: String, required: true } },
    {
      strict: false,
      collection: "calibrationJobs",
      versionKey: false,
      minimize: false,
    }
  );
  schema.set("minimize", false);
  schema.set("toObject", { minimize: false, versionKey: false });
  schema.set("toJSON", { minimize: false, versionKey: false });
  for (const spec of CALIBRATION_JOB_INDEX_FIELDS) {
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
  const model = mongoose.model("EcdCalibrationJob", schema);
  indexesReady = model.createIndexes();
  await indexesReady;
  return model;
}

export async function mongoJobFind(filter = {}, options = {}) {
  const model = await getJobModel();
  let query = model.find(filter);
  if (options?.sort) query = query.sort(options.sort);
  if (options?.limit != null) query = query.limit(options.limit);
  const rows = await query.lean();
  return rows.map(plain).filter(Boolean);
}

export async function mongoJobFindOne(id) {
  const model = await getJobModel();
  const row = await model.findOne({ id }).lean();
  return plain(row);
}

export async function mongoJobReplace(doc) {
  const model = await getJobModel();
  const clean = plain(doc);
  await model.replaceOne({ id: clean.id }, clean, { upsert: true });
  return clean;
}

export async function mongoJobDelete(id) {
  const model = await getJobModel();
  await model.deleteOne({ id });
}

// One round trip. The status predicate is in the filter so a second worker
// or a requeue that already moved the job cannot match the same document.
export async function mongoClaimQueuedJob(id, fields = {}) {
  const model = await getJobModel();
  const row = await model.findOneAndUpdate(
    { id, status: "queued" },
    { $set: { ...fields, status: "running" } },
    { new: true, lean: true }
  );
  return plain(row);
}

// Single-document field update. Matches only while `status` is still
// `expectedStatus`, so a late worker cannot overwrite a recovered or
// requeued job.
export async function mongoPatchJobIfStatus(id, expectedStatus, patch) {
  const model = await getJobModel();
  const row = await model.findOneAndUpdate(
    { id, status: expectedStatus },
    { $set: patch },
    { new: true, lean: true }
  );
  return plain(row);
}

export async function ensureCalibrationJobIndexes() {
  const model = await getJobModel();
  const indexes = await model.collection.indexes();
  return indexes.map((row) => row.name);
}
