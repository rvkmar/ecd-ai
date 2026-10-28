// server/migrations/runner.js
// ------------------------------------------------------------
// A minimal migration runner with a mandatory dry-run mode and a
// recorded version log, per the seven-artefact-adjacent convention this
// build follows: "migrations always have a dry-run mode and a recorded
// version" (see CONTRIBUTING.md).
//
// A migration is `{ id, description, run({ dryRun }) }`. `run` does its
// own reading and writing and must itself skip writing when `dryRun` is
// true -- the runner does not own a data source, because this app has
// two: sessions live in the session repository (Mongo in production,
// the JSON file in the harness; see server/sessions/sessionRepository.js),
// while the governed
// entities (competencyModels, evidenceModels, taskModels, items, ...)
// live behind server/utils/dbAdapter.js, which is dual-mode (json or
// Mongo) and async. A migration touching a dbAdapter-backed collection
// must go through dbAdapter so it works in both modes; one touching
// session data uses db-server.js's loadDB/saveDB directly. See
// migrations/001 and 002 for one example of each.
//
// The applied-migration log lives next to the JSON-mode data file (not
// in git) so dev/staging/prod each track their own history independently.
// It is irrelevant in Mongo mode beyond bookkeeping "did this run" --
// nothing about the log itself is Mongo-aware.
// ------------------------------------------------------------

import fs from "fs";
import path from "path";
import mongoose from "mongoose";

function dbFilePath() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

function logFilePath() {
  return path.join(path.dirname(dbFilePath()), "migrations.log.json");
}

function readLog() {
  const LOG_FILE = logFilePath();
  if (!fs.existsSync(LOG_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function appendLog(entry) {
  const LOG_FILE = logFilePath();
  const log = readLog();
  log.push(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

export function hasBeenApplied(migrationId) {
  return readLog().some((entry) => entry.id === migrationId);
}

/** Snapshot for health/metrics — which schema this environment is on. */
export function getMigrationStatus() {
  const applied = readLog();
  const latest = applied.length ? applied[applied.length - 1] : null;
  return {
    appliedCount: applied.length,
    appliedIds: applied.map((e) => e.id),
    latestId: latest?.id || null,
    latestAppliedAt: latest?.appliedAt || null,
    logPath: logFilePath(),
  };
}

/**
 * Run a single migration.
 * @param {{id: string, description: string, run: Function}} migration
 * @param {{dryRun?: boolean, force?: boolean}} options
 */
export async function runMigration(migration, { dryRun = false, force = false } = {}) {
  const { id, description, run } = migration;

  if (!dryRun && !force && hasBeenApplied(id)) {
    return { id, skipped: true, reason: "already applied" };
  }

  const result = (await run({ dryRun })) || {};
  const summary = result.summary || "(migration did not report a summary)";

  if (!dryRun) {
    appendLog({ id, description, appliedAt: new Date().toISOString(), summary });
  }

  return { id, description, dryRun, summary, changed: result.changed || [] };
}

export async function runMigrations(migrations, options = {}) {
  const results = [];
  for (const migration of migrations) {
    results.push(await runMigration(migration, options));
  }
  return results;
}

export async function shutdownMigrationConnections() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
