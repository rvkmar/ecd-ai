// dbAdapter.js
// Unified database adapter for ecd-assessment (JSON + MongoDB)

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { schema } from "../../src/utils/schema.js";
import { validateEntity } from "../../src/utils/schema.js";
import { assertSafeEqualityFilter } from "./requestValidation.js";
import { getTenancyContext, TenancyError } from "./tenancyContext.js";
import {
  filterRows,
  isTenantScopedCollection,
  rowVisible,
  assertTenancyAllowsScopedAccess,
  TENANT_SCOPED_COLLECTIONS,
} from "./tenancyScope.js";

// ADR 0006 list must stay live (repoGuards); sessions need peer resolution.
if (!TENANT_SCOPED_COLLECTIONS.includes("sessions")) {
  throw new Error("TENANT_SCOPED_COLLECTIONS missing sessions");
}

// ------------------------------
// Configuration
// ------------------------------
export const DB_MODE = process.env.DB_MODE || "mongo"; // "json" | "mongo"

// JSON file path
const DB_FILE = path.resolve("./data/db.json");

// MongoDB config
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";

// ------------------------------
// JSON utility functions
// ------------------------------
function loadJSON() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

function saveJSON(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ------------------------------
// MongoDB setup
// ------------------------------
let mongoModels = {};

function ensureMongoModel(name) {
  if (mongoModels[name]) return mongoModels[name];
  if (mongoose.models[name]) {
    mongoModels[name] = mongoose.models[name];
    return mongoModels[name];
  }
  const GenericSchema = new mongoose.Schema(
    { any: {} },
    { strict: false, timestamps: true }
  );
  mongoModels[name] = mongoose.model(name, GenericSchema);
  return mongoModels[name];
}

async function initMongo() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI, { dbName: "ecd_assessment" });
  }

  // 1️⃣ Explicit schema for Questions (with ECD fields)
  if (!mongoModels.Question) {
    const QuestionSchema = new mongoose.Schema({
      id: { type: String, unique: true },
      type: String,
      stem: String,
      status: { type: String, enum: ["new", "review", "active", "retired"] },
      creator: String,
      modifier: String,
      usageCount: { type: Number, default: 0 },
      maxUsageBeforeRetire: { type: Number, default: 5 },
      reactivationCount: { type: Number, default: 0 },
      maxReactivations: { type: Number, default: 2 },
      metadata: Object,
      irtParams: {
        a: { type: Number, default: 1.0 },
        b: { type: Number, default: 0.0 },
        c: { type: Number, default: 0.2 },
        updatedAt: Date,
        source: String,
      },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });

    mongoModels.Question = mongoose.model("Question", QuestionSchema);
  }

  // 2️⃣ Generic dynamic schema generator for other collections
  const ensureModel = ensureMongoModel;

  // 2️⃣b Explicit User schema for profile fields
  if (!mongoModels.User) {
    const UserSchema = new mongoose.Schema(
      {
        // Declared explicitly because this schema is strict: without it,
        // mongoose silently drops the `id` field createUserRecord() sets,
        // so even freshly created users had no id for the generic
        // id-keyed get/update/remove helpers to match on.
        id: String,
        username: { type: String, unique: true },
        password: String,
        role: { type: String, enum: ["admin", "district", "teacher", "student"] },
        email: String,
        profile: {
          name: String,
          designation: String,
          subject: String,
          emisId: String,
          apaarId: String,
          udiseId: String,
          grade: String,
          districtId: String,
          state: String,
        },
        // "local" (default) | future "oidc" / "saml" — see server/auth/localIdentity.js
        authProvider: { type: String, default: "local" },
        mustChangePassword: { type: Boolean, default: false },
        authEpoch: { type: Number, default: 0 },
      },
      { timestamps: true }
    );
    mongoModels.User = mongoose.model("User", UserSchema);
  }

  // Ensure other common models
  ensureModel("Task");
  ensureModel("Session");
  ensureModel("Policy");
  ensureModel("EvidenceModel");
  ensureModel("CompetencyModel");

  return mongoModels;
}


// ------------------------------
// D97 — tenancy at the adapter boundary
// ------------------------------
async function peerSnapshotFor(collection, rows) {
  const snap = { [collection]: rows || [] };
  // Sessions resolve district via assignees → students/users (ADR 0006).
  if (collection === "sessions") {
    if (DB_MODE === "json") {
      const db = loadJSON();
      snap.students = db.students || [];
      snap.users = db.users || [];
    } else {
      await initMongo();
      snap.students = await ensureMongoModel("Student").find().lean();
      snap.users = await ensureMongoModel("User").find().lean();
    }
  }
  return snap;
}

async function applyListFilter(collection, rows) {
  const ctx = getTenancyContext();
  const snap = await peerSnapshotFor(collection, rows);
  return filterRows(collection, rows, ctx, snap);
}

async function visibleOrNull(collection, row, peerRows) {
  const ctx = getTenancyContext();
  if (!ctx || ctx.unscoped || ctx.role === "admin") return row;
  if (!isTenantScopedCollection(collection)) return row;
  assertTenancyAllowsScopedAccess(ctx);
  if (!row) return null;
  const snap = await peerSnapshotFor(
    collection,
    peerRows || (row ? [row] : [])
  );
  return rowVisible(collection, row, ctx, snap) ? row : null;
}

async function assertWriteAllowed(collection, row, peerRows) {
  const ctx = getTenancyContext();
  if (!ctx || ctx.unscoped || ctx.role === "admin") return;
  if (!isTenantScopedCollection(collection)) return;
  assertTenancyAllowsScopedAccess(ctx);
  const snap = await peerSnapshotFor(
    collection,
    peerRows || (row ? [row] : [])
  );
  if (!row || !rowVisible(collection, row, ctx, snap)) {
    throw new TenancyError("Row out of tenant scope");
  }
}

// ------------------------------
// CRUD adapter
// ------------------------------
export const dbAdapter = {
  async list(collection) {
    if (DB_MODE === "json") {
      const db = loadJSON();
      return await applyListFilter(collection, db[collection] || []);
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    const rows = await Model.find().lean();
    return await applyListFilter(collection, rows);
  },

  async get(collection, id) {
    if (DB_MODE === "json") {
      const db = loadJSON();
      const rows = db[collection] || [];
      const row = rows.find((x) => x.id === id);
      return await visibleOrNull(collection, row, rows);
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    const row = await Model.findOne({ id }).lean();
    return await visibleOrNull(collection, row, row ? [row] : []);
  },

  async insert(collection, obj) {
    // Users are intentionally absent from schema.js (auth records, not ECD
    // entities). createUserRecord / TN seed still go through this helper.
    if (collection !== "users") {
      const { valid, errors } = validateEntity(collection, obj);
      if (!valid) throw new Error(errors.join(", "));
    }

    await assertWriteAllowed(collection, obj, [obj]);

    obj.createdAt = new Date().toISOString();
    obj.updatedAt = new Date().toISOString();

    if (DB_MODE === "json") {
      const db = loadJSON();
      db[collection] = db[collection] || [];
      db[collection].push(obj);
      saveJSON(db);
      return obj;
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    return await Model.create(obj);
  },

  // Filter-based sibling of update() below, for collections whose records
  // are not reliably keyed by a synthetic `id`. The four seed accounts
  // (admin1/dist1/teach1/stud1) are inserted by initMongo.js / users.json
  // with no `id` field at all, so update("users", username, ...) matched
  // nothing: in Mongo mode findOneAndUpdate({ id: "admin1" }) simply
  // returned null and the route still reported success, which is exactly
  // the "password reset doesn't stick for existing accounts" bug. Matching
  // on { username } instead finds those records whether or not they were
  // ever given an id.
  async updateWhere(collection, filter, updates) {
    assertSafeEqualityFilter(filter);
    updates.updatedAt = new Date().toISOString();

    if (DB_MODE === "json") {
      const db = loadJSON();
      const rows = db[collection] || [];
      const idx = rows.findIndex((x) =>
        Object.entries(filter).every(([k, v]) => x?.[k] === v)
      );
      if (idx === -1) throw new Error("Not found");
      await assertWriteAllowed(collection, rows[idx], rows);
      rows[idx] = { ...rows[idx], ...updates };
      await assertWriteAllowed(collection, rows[idx], rows);
      db[collection] = rows;
      saveJSON(db);
      return rows[idx];
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    const existing = await Model.findOne(filter).lean();
    if (!existing) throw new Error("Not found");
    await assertWriteAllowed(collection, existing, [existing]);
    const next = await Model.findOneAndUpdate(filter, updates, { new: true }).lean();
    await assertWriteAllowed(collection, next, [next]);
    return next;
  },

  // Filter-based sibling of remove(), for the same reason as updateWhere.
  async removeWhere(collection, filter) {
    assertSafeEqualityFilter(filter);
    if (DB_MODE === "json") {
      const db = loadJSON();
      const rows = db[collection] || [];
      const doomed = rows.filter((x) =>
        Object.entries(filter).every(([k, v]) => x?.[k] === v)
      );
      for (const row of doomed) await assertWriteAllowed(collection, row, rows);
      db[collection] = rows.filter(
        (x) => !Object.entries(filter).every(([k, v]) => x?.[k] === v)
      );
      saveJSON(db);
      return true;
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    const existing = await Model.findOne(filter).lean();
    if (existing) await assertWriteAllowed(collection, existing, [existing]);
    await Model.deleteOne(filter);
    return true;
  },

  async update(collection, id, updates) {
    updates.updatedAt = new Date().toISOString();

    if (DB_MODE === "json") {
      const db = loadJSON();
      const rows = db[collection] || [];
      const idx = rows.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error("Not found");
      await assertWriteAllowed(collection, rows[idx], rows);
      rows[idx] = { ...rows[idx], ...updates };
      await assertWriteAllowed(collection, rows[idx], rows);
      db[collection] = rows;
      saveJSON(db);
      return rows[idx];
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    const existing = await Model.findOne({ id }).lean();
    if (!existing) throw new Error("Not found");
    await assertWriteAllowed(collection, existing, [existing]);
    const next = await Model.findOneAndUpdate({ id }, updates, { new: true }).lean();
    await assertWriteAllowed(collection, next, [next]);
    return next;
  },

  async remove(collection, id) {
    if (DB_MODE === "json") {
      const db = loadJSON();
      const rows = db[collection] || [];
      const row = rows.find((x) => x.id === id);
      if (row) await assertWriteAllowed(collection, row, rows);
      db[collection] = rows.filter((x) => x.id !== id);
      saveJSON(db);
      return true;
    }

    const models = await initMongo();
    const Model = ensureMongoModel(capitalize(collection));
    const existing = await Model.findOne({ id }).lean();
    if (existing) await assertWriteAllowed(collection, existing, [existing]);
    // Prefer id field; fall back to _id for legacy rows.
    if (existing) await Model.deleteOne({ id });
    else await Model.deleteOne({ _id: id });
    return true;
  },
};

function capitalize(str) {
  if (!str) return "";
  // Strip trailing "s" to singularize if plural
  const base = str.endsWith("s") ? str.slice(0, -1) : str;
  return base.charAt(0).toUpperCase() + base.slice(1);
}


// ------------------------------
// Usage example:
// import { dbAdapter } from './dbAdapter.js';
// const list = await dbAdapter.list('questions');
// ------------------------------
