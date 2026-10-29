import mongoose from "mongoose";
import { STUDENT_MODEL_RECORD_INDEX_FIELDS } from "./studentModelRecordBackend.js";

function mongoUri(env = process.env) {
  return env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";
}

export function studentModelRecordToPlain(row) {
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
  return studentModelRecordToPlain(row);
}

let indexesReady = null;

async function getRecordModel() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri(), {
      dbName: "ecd_assessment",
      serverSelectionTimeoutMS: 10000,
    });
  }
  if (mongoose.models.EcdStudentModelRecord) {
    if (!indexesReady) indexesReady = mongoose.models.EcdStudentModelRecord.createIndexes();
    await indexesReady;
    return mongoose.models.EcdStudentModelRecord;
  }
  const schema = new mongoose.Schema(
    { id: { type: String, required: true } },
    {
      strict: false,
      collection: "studentModelRecords",
      versionKey: false,
      minimize: false,
    }
  );
  schema.set("minimize", false);
  schema.set("toObject", { minimize: false, versionKey: false });
  schema.set("toJSON", { minimize: false, versionKey: false });
  for (const spec of STUDENT_MODEL_RECORD_INDEX_FIELDS) {
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
  const model = mongoose.model("EcdStudentModelRecord", schema);
  indexesReady = model.createIndexes();
  await indexesReady;
  return model;
}

export async function mongoRecordFind(filter = {}, options = {}) {
  const model = await getRecordModel();
  let query = model.find(filter);
  if (options?.sort) query = query.sort(options.sort);
  if (options?.limit != null) query = query.limit(options.limit);
  const rows = await query.lean();
  return rows.map(plain).filter(Boolean);
}

export async function mongoRecordFindOne(id) {
  const model = await getRecordModel();
  const row = await model.findOne({ id }).lean();
  return plain(row);
}

export async function mongoRecordReplace(doc) {
  const model = await getRecordModel();
  const clean = plain(doc);
  await model.replaceOne({ id: clean.id }, clean, { upsert: true });
  return clean;
}

function finishPipeline(entry, fields, insertId) {
  const scalars = { ...fields };
  const createdAt = scalars.createdAt;
  const name = scalars.competencyModelName;
  delete scalars.createdAt;
  delete scalars.competencyModelName;
  delete scalars.history;
  delete scalars.smvPosteriors;
  delete scalars.id;
  delete scalars._id;
  delete scalars.__v;
  return [
    {
      $set: {
        ...scalars,
        id: { $ifNull: ["$id", insertId] },
        createdAt: { $ifNull: ["$createdAt", createdAt] },
        competencyModelName: name
          ? name
          : { $ifNull: ["$competencyModelName", ""] },
        history: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ["$history", []] },
                as: "row",
                cond: { $ne: ["$$row.sessionId", entry.sessionId] },
              },
            },
            [entry],
          ],
        },
      },
    },
    {
      $set: {
        smvPosteriors: {
          $let: {
            vars: {
              latest: {
                $reduce: {
                  input: "$history",
                  initialValue: null,
                  in: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ["$$value", null] },
                          { $gte: ["$$this.timestamp", "$$value.timestamp"] },
                        ],
                      },
                      "$$this",
                      "$$value",
                    ],
                  },
                },
              },
            },
            in: { $ifNull: ["$$latest.posteriorSnapshot", {}] },
          },
        },
      },
    },
  ];
}

// One round trip. History for this session replaces any earlier entry
// for the same session id, then the current posterior is the snapshot
// with the latest timestamp. A second finish cannot drop the other
// session's history entry.
export async function mongoApplySessionFinish({
  filter,
  entry,
  fields,
  insertId,
  upsert = false,
}) {
  const model = await getRecordModel();
  const row = await model.findOneAndUpdate(
    filter,
    finishPipeline(entry, fields, insertId),
    { upsert: !!upsert, new: true, lean: true }
  );
  return plain(row);
}

export async function ensureStudentModelRecordIndexes() {
  const model = await getRecordModel();
  const indexes = await model.collection.indexes();
  return indexes.map((row) => row.name);
}
