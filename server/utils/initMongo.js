// initMongo.js
// One-time initialization script for ecd-assessment MongoDB database

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import "dotenv/config";
import {
  buildTamilNaduSeedUsers,
  missingProfileFields,
  resolveSeedTempPassword,
} from "./tnSeedUsers.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ecd_assessment";

async function init() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { dbName: "ecd_assessment" });

    const db = mongoose.connection.db;
    console.log("✅ Connected to", db.databaseName);

    const collections = await db.listCollections().toArray();
    const exists = collections.some((c) => c.name === "questions");

    if (!exists) {
      console.log("🆕 Creating 'questions' collection...");
      await db.createCollection("questions");
    } else {
      console.log("ℹ️ 'questions' collection already exists");
    }

    const questionColl = db.collection("questions");
    console.log("⚙️ Creating indexes on { id, status, metadata.subject, metadata.grade }...");
    await questionColl.createIndex({ id: 1 }, { unique: true });
    await questionColl.createIndex({ status: 1 });
    await questionColl.createIndex({ "metadata.subject": 1 });
    await questionColl.createIndex({ "metadata.grade": 1 });
    console.log("✅ Question indexes created successfully");

    const userExists = collections.some((c) => c.name === "users");
    if (!userExists) {
      console.log("🆕 Creating 'users' collection...");
      await db.createCollection("users");
    } else {
      console.log("ℹ️ 'users' collection already exists");
    }

    const usersColl = db.collection("users");
    console.log("⚙️ Ensuring users indexes...");
    await usersColl.createIndex({ username: 1 }, { unique: true });
    await usersColl.createIndex({ role: 1 });
    await usersColl.createIndex({ "profile.districtId": 1 });
    await usersColl.createIndex({ "profile.state": 1 });
    // Sparse unique: only rows that have the field must be unique (admins have none).
    await usersColl.createIndex(
      { "profile.emisId": 1 },
      { unique: true, sparse: true }
    );
    await usersColl.createIndex(
      { "profile.udiseId": 1 },
      { unique: true, sparse: true }
    );

    const password = resolveSeedTempPassword();
    const defaultUsers = buildTamilNaduSeedUsers(password);

    console.log(`👥 Seeding TN roster (${defaultUsers.length} accounts, idempotent)...`);
    const createdCredentials = [];

    for (const user of defaultUsers) {
      const existsUser = await usersColl.findOne({ username: user.username });
      if (!existsUser) {
        const hashed = await bcrypt.hash(user.password, 10);
        await usersColl.insertOne({
          id: user.username,
          username: user.username,
          email: user.email,
          role: user.role,
          password: hashed,
          profile: user.profile || {},
          authProvider: user.authProvider || "local",
          mustChangePassword: Boolean(user.mustChangePassword),
          authEpoch: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        createdCredentials.push({
          username: user.username,
          role: user.role,
          password: user.password,
        });
        console.log(`✅ Created user: ${user.username} (${user.role})`);
      } else {
        // D96: pre-TN walk accounts often lack profile.districtId. Backfill
        // missing profile keys only ? never touch password / authEpoch.
        const missing = missingProfileFields(existsUser.profile, user.profile);
        if (Object.keys(missing).length) {
          const $set = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(missing)) {
            $set[`profile.${k}`] = v;
          }
          await usersColl.updateOne({ username: user.username }, { $set });
          console.log(
            `Backfilled profile on ${user.username}: ${Object.keys(missing).join(", ")}`
          );
        } else {
          console.log(`User '${user.username}' already exists, skipping.`);
        }
      }
    }

    if (createdCredentials.length) {
      console.log("\n🔐 New seed credentials (shown only for accounts created this run):");
      console.log(`   Temporary password for all new accounts: ${password}`);
      console.log(`   (${createdCredentials.length} usernames created — see log lines above)`);
      console.log("   Change passwords after first login (mustChangePassword=true).\n");
    }

    console.log("🎉 MongoDB initialization complete for ecd_assessment");
  } catch (err) {
    console.error("❌ Initialization failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Connection closed.");
  }
}

init();
