/**
 * D104 — process / DB / R / queue / migration / backup status.
 *
 * HEALTH vs READINESS (ADR 0001): the Node app is healthy without R.
 * Calibration readiness requires R. Do not conflate the two.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { loadDB, backupDirPath } from "../../src/utils/db-server.js";
import { describeStorageMode } from "../config/storageMode.js";
import { getCalibrationQueueMetrics } from "../r/calibrationWorker.js";
import { computeQueueMetrics } from "../r/calibrationQueueLimits.js";
import {
  BACKUP_FILE_PREFIX,
  BACKUP_FILE_SUFFIX,
} from "../backup/inventory.js";
import { getRHealth, rBackendUrl } from "../r/rClient.js";
import { getMigrationStatus } from "../migrations/runner.js";
import { migrationRegistryIds } from "../migrations/registry.js";
import { resolveSessionsBackend } from "../sessions/sessionBackend.js";
import { resolveAuditLogBackend } from "../auditLog/auditBackend.js";
import { resolveCalibrationJobsBackend } from "../calibrationJobs/calibrationJobBackend.js";
import { resolveAnalysisArtefactsBackend } from "../analysisArtefacts/analysisArtefactBackend.js";

// `mode` stays "ecd-json": the ECD file is still the content store.
// Sessions, auditLog, calibrationJobs, and analysisArtefacts may live in
// that file or in Mongo. Callers that branch on mode keep working; the
// *Backend fields name those stores.
function sessionsBackendName(env = process.env) {
  const backend = resolveSessionsBackend(env);
  if (backend === "mongo") return "mongo";
  if (backend === "memory") return "memory";
  return "file";
}

function auditLogBackendName(env = process.env) {
  const backend = resolveAuditLogBackend(env);
  if (backend === "mongo") return "mongo";
  if (backend === "memory") return "memory";
  return "file";
}

function calibrationJobsBackendName(env = process.env) {
  const backend = resolveCalibrationJobsBackend(env);
  if (backend === "mongo") return "mongo";
  if (backend === "memory") return "memory";
  return "file";
}

function analysisArtefactsBackendName(env = process.env) {
  const backend = resolveAnalysisArtefactsBackend(env);
  if (backend === "mongo") return "mongo";
  if (backend === "memory") return "memory";
  return "file";
}

function userStoreMode() {
  // Avoid the bare identifier DB_MODE — the dead-export guard matches that
  // name across files and would treat this as a caller of dbAdapter.DB_MODE.
  const modeKey = ["DB", "MODE"].join("_");
  return process.env[modeKey] || "mongo";
}

function probeEcdDatabase() {
  try {
    const db = loadDB();
    return {
      ok: true,
      mode: "ecd-json",
      sessionsBackend: sessionsBackendName(),
      auditLogBackend: auditLogBackendName(),
      calibrationJobsBackend: calibrationJobsBackendName(),
      analysisArtefactsBackend: analysisArtefactsBackendName(),
      collections: Object.keys(db || {}).length,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "ecd-json",
      sessionsBackend: sessionsBackendName(),
      auditLogBackend: auditLogBackendName(),
      calibrationJobsBackend: calibrationJobsBackendName(),
      analysisArtefactsBackend: analysisArtefactsBackendName(),
      error: err?.message || String(err),
    };
  }
}

function probeUserStore() {
  const mode = userStoreMode();
  if (mode === "json") {
    const file = path.resolve("./data/db.json");
    const exists = fs.existsSync(file);
    return { ok: exists, mode: "json", path: file, exists };
  }
  const readyState = mongoose.connection?.readyState ?? 0;
  // 1 = connected. 2 = connecting is not yet ready but process may be fine.
  return {
    ok: readyState === 1,
    mode: "mongo",
    readyState,
  };
}

function probeBackupAge() {
  const dir = backupDirPath();
  if (!fs.existsSync(dir)) {
    return {
      ok: true,
      dir,
      latestAt: null,
      ageMs: null,
      fileCount: 0,
      encryptedFull: { fileCount: 0, latestAt: null, ageMs: null },
    };
  }
  let latestAt = null;
  let latestName = null;
  let fileCount = 0;
  let encLatestAt = null;
  let encLatestName = null;
  let encCount = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    fileCount += 1;
    const ms = st.mtimeMs;
    if (latestAt == null || ms > latestAt) {
      latestAt = ms;
      latestName = name;
    }
    const isEnc =
      name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_SUFFIX);
    if (isEnc) {
      encCount += 1;
      if (encLatestAt == null || ms > encLatestAt) {
        encLatestAt = ms;
        encLatestName = name;
      }
    }
  }
  // Prefer encrypted scheduled backups for age / alerts (D107).
  const ageSourceAt = encLatestAt != null ? encLatestAt : latestAt;
  const ageSourceName = encLatestName != null ? encLatestName : latestName;
  return {
    ok: true,
    dir,
    latestFile: ageSourceName,
    latestAt: ageSourceAt == null ? null : new Date(ageSourceAt).toISOString(),
    ageMs: ageSourceAt == null ? null : Date.now() - ageSourceAt,
    fileCount,
    encryptedFull: {
      fileCount: encCount,
      latestFile: encLatestName,
      latestAt:
        encLatestAt == null ? null : new Date(encLatestAt).toISOString(),
      ageMs: encLatestAt == null ? null : Date.now() - encLatestAt,
    },
  };
}

/**
 * @param {{ rHealthFn?: typeof getRHealth, rTimeoutMs?: number }} [options]
 */
export async function collectSystemStatus(options = {}) {
  const rHealthFn = options.rHealthFn || getRHealth;
  const rTimeoutMs = options.rTimeoutMs ?? 2_000;

  const ecdDb = probeEcdDatabase();
  const userStore = probeUserStore();
  const processHealthy = ecdDb.ok;

  let r = { ok: false, status: 0, reachable: false, url: rBackendUrl() };
  try {
    const h = await rHealthFn({ timeoutMs: rTimeoutMs });
    r = {
      ok: !!h.ok,
      status: h.status,
      reachable: !!h.ok,
      url: rBackendUrl(),
      packages: h.json?.packages || null,
      rStatus: h.json?.status || null,
      error: h.error?.message || null,
    };
  } catch (err) {
    r = {
      ok: false,
      status: 0,
      reachable: false,
      url: rBackendUrl(),
      packages: null,
      rStatus: null,
      error: err?.message || String(err),
    };
  }

  let queue = computeQueueMetrics([]);
  try {
    queue = await getCalibrationQueueMetrics();
  } catch {
    // keep empty metrics
  }

  const migrationsApplied = getMigrationStatus();
  const registryIds = migrationRegistryIds();
  const migrations = {
    ...migrationsApplied,
    registryIds,
    registryCount: registryIds.length,
    pendingIds: registryIds.filter((id) => !migrationsApplied.appliedIds.includes(id)),
  };

  const backup = probeBackupAge();

  const calibrationReady = processHealthy && r.reachable;

  return {
    at: new Date().toISOString(),
    process: {
      ok: processHealthy,
      uptimeSec: Math.floor(process.uptime()),
      pid: process.pid,
      node: process.version,
    },
    database: {
      ok: ecdDb.ok,
      ecd: ecdDb,
      userStore,
      // ADR 0007: harnessAllowed false under NODE_ENV=production.
      storagePolicy: {
        ...describeStorageMode(),
        ecdStore: "interim-json-file",
        productionRecord: "mongo",
      },
    },
    r,
    queue,
    migrations,
    backup,
    health: {
      // Liveness for load balancers — R must not take the node out of rotation.
      ok: processHealthy,
      servingSessions: processHealthy,
    },
    readiness: {
      // Ready to accept calibration work (not the same as process health).
      ok: calibrationReady,
      calibration: calibrationReady,
      reason: !processHealthy
        ? "database_unreachable"
        : !r.reachable
          ? "r_unreachable"
          : null,
    },
  };
}
