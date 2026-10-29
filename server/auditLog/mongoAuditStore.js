import mongoose from "mongoose";
import {
  AUDIT_INDEX_FIELDS,
  resolveAuditLogRetentionDays,
} from "./auditBackend.js";

function mongoUri(env = process.env) {
  return env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";
}

export function auditEntryToPlain(row) {
  if (!row || typeof row !== "object") return null;
  const obj =
    typeof row.toObject === "function"
      ? row.toObject({ minimize: false, versionKey: false, flattenObjectIds: true })
      : { ...row };
  delete obj._id;
  delete obj.__v;
  delete obj.atTime;
  return obj;
}

function plain(row) {
  return auditEntryToPlain(row);
}

function withAtTime(doc) {
  const clean = plain(doc) || doc;
  const atTime = clean?.at ? new Date(clean.at) : null;
  if (atTime && !Number.isNaN(atTime.getTime())) {
    return { ...clean, atTime };
  }
  return clean;
}

let indexesReady = null;

async function getAuditModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri(), {
      dbName: "ecd_assessment",
      serverSelectionTimeoutMS: 10000,
    });
  }
  if (mongoose.models.EcdAuditLog) {
    if (!indexesReady) indexesReady = mongoose.models.EcdAuditLog.createIndexes();
    await indexesReady;
    return mongoose.models.EcdAuditLog;
  }
  const schema = new mongoose.Schema(
    { id: { type: String, required: true } },
    {
      strict: false,
      collection: "auditLog",
      versionKey: false,
      minimize: false,
    }
  );
  schema.set("minimize", false);
  schema.set("toObject", { minimize: false, versionKey: false });
  schema.set("toJSON", { minimize: false, versionKey: false });
  for (const spec of AUDIT_INDEX_FIELDS) {
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
  // Optional TTL. Off unless AUDITLOG_RETENTION_DAYS > 0. atTime is a
  // Date twin of the ISO `at` string so Mongo can expire rows.
  const retentionDays = resolveAuditLogRetentionDays();
  if (retentionDays > 0) {
    schema.index(
      { atTime: 1 },
      { expireAfterSeconds: retentionDays * 24 * 60 * 60, name: "auditLog_ttl_atTime" }
    );
  } else {
    schema.index({ atTime: 1 }, { name: "auditLog_atTime" });
  }
  const model = mongoose.model("EcdAuditLog", schema);
  indexesReady = model.createIndexes();
  await indexesReady;
  return model;
}

export async function mongoAuditFind(filter = {}, options = {}) {
  const model = await getAuditModel();
  let query = model.find(filter);
  if (options?.sort) query = query.sort(options.sort);
  if (options?.limit != null) query = query.limit(options.limit);
  const rows = await query.lean();
  return rows.map(plain).filter(Boolean);
}

export async function mongoAuditFindOne(id) {
  const model = await getAuditModel();
  const row = await model.findOne({ id }).lean();
  return plain(row);
}

export async function mongoAuditInsertMany(docs) {
  const model = await getAuditModel();
  const list = (docs || []).map(withAtTime).filter((row) => row?.id);
  if (!list.length) return [];
  for (const doc of list) {
    await model.replaceOne({ id: doc.id }, doc, { upsert: true });
  }
  return list.map(plain);
}

export async function ensureAuditIndexes() {
  const model = await getAuditModel();
  const indexes = await model.collection.indexes();
  return indexes.map((row) => row.name);
}
