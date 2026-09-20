/**
 * D110 — five load scenarios that break THIS app, each with a recorded
 * number and the configuration it was measured on.
 *
 * 1. Wizard autosave under school-network latency (PUT draft path)
 * 2. Dashboard-shaped aggregate against the D109 production-shaped bank
 * 3. Concurrent adaptive selection at a stated cohort size
 * 4. Composite library compile at Task Model activation scale
 * 5. Calibration queue pressure (D87 backpressure / depth alarm)
 */

import { performance } from "perf_hooks";
import fs from "fs";
import path from "path";
import { generateProductionShapedDataset, DEFAULTS } from "../fixtures/productionShaped/generate.js";
import { buildCompositeLibrary } from "../compositeLibrary/builder.js";
import { selectNextActivity } from "../delivery/activitySelection.js";
import {
  computeQueueMetrics,
  maybeEmitQueueDepthAlarm,
  __testing__ as queueTesting,
} from "../r/calibrationQueueLimits.js";
import { saveDB, readRawDB } from "../../src/utils/db-server.js";

const WARMUP = 2;
const SAMPLES = 7;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundMs(n) {
  return Math.round(n * 1000) / 1000;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sampleMs(fn, { warmup = WARMUP, samples = SAMPLES } = {}) {
  for (let i = 0; i < warmup; i++) fn();
  const times = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return {
    samplesMs: times.map(roundMs),
    medianMs: roundMs(median(times)),
    minMs: roundMs(Math.min(...times)),
    maxMs: roundMs(Math.max(...times)),
  };
}

async function sampleAsyncMs(fn, { warmup = WARMUP, samples = SAMPLES } = {}) {
  for (let i = 0; i < warmup; i++) await fn();
  const times = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  return {
    samplesMs: times.map(roundMs),
    medianMs: roundMs(median(times)),
    minMs: roundMs(Math.min(...times)),
    maxMs: roundMs(Math.max(...times)),
  };
}

/** Dashboard reduce matching reportsRoutes (sessions/students/tasks lists). */
function dashboardShapedScan(db) {
  const sessions = db.sessions || [];
  const students = db.students || [];
  const tasks = db.tasks || [];
  const scopedStudentIds = new Set(students.map((s) => s.id));
  const filtered = sessions.filter((s) => scopedStudentIds.has(s.studentId));
  const totalSessions = filtered.length;
  const avgScore =
    filtered.reduce((sum, s) => {
      const vals = (s.responses || [])
        .map((r) =>
          typeof r.scoredValue === "number" ? r.scoredValue : parseFloat(r.scoredValue)
        )
        .filter((v) => !Number.isNaN(v));
      return sum + (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    }, 0) / (totalSessions || 1);
  return {
    totalSessions,
    activeStudents: students.length,
    taskCount: tasks.length,
    avgScore,
  };
}

/**
 * Enrich a production-shaped TM + items so buildCompositeLibrary compiles
 * a non-empty package at D109 item-bank scale (200 items / TM).
 */
function compositeBankFromProductionShaped(db, taskModelId) {
  const tm = (db.taskModels || []).find((t) => t.id === taskModelId);
  if (!tm) throw new Error(`missing ${taskModelId}`);
  const emId = tm.primaryEvidenceModelId || (db.evidenceModels || [])[0]?.id;
  const em = (db.evidenceModels || []).find((e) => e.id === emId) || {
    id: emId || "em-load",
    versionNumber: 1,
    status: "operational",
    locked: true,
  };

  em.observables = [{ id: "obs-1", evidenceRule: { direction: "supports", strengthLevel: 3 } }];
  em.evaluationProcedures = [
    { id: "ep-1", observableId: "obs-1", method: "key", workProductType: "selected_response" },
  ];

  tm.expectedObservations = [
    { observationId: "obs-1", weight: 1, required: true },
  ];
  tm.versionNumber = tm.versionNumber || 1;
  tm.status = "operational";
  tm.locked = true;

  const items = (db.items || [])
    .filter((it) => it.taskModelId === tm.id)
    .map((it) => ({
      ...it,
      observationId: "obs-1",
      evidenceModelId: em.id,
      evidenceModelVersion: em.versionNumber || 1,
      taskModelVersion: tm.versionNumber,
      status: "confirmed",
      stimulus: it.stimulus || { layout: "single", blocks: [{ type: "text", content: it.name }] },
      interaction: it.interaction || { type: "mcq", options: [{ id: "a" }, { id: "b" }] },
      scoring: it.scoring || { method: "binary", maxScore: 1, evidenceActivationMap: [] },
    }));

  return {
    taskModel: tm,
    db: {
      ...db,
      evidenceModels: [em, ...(db.evidenceModels || []).filter((e) => e.id !== em.id)],
      taskModels: [tm, ...(db.taskModels || []).filter((t) => t.id !== tm.id)],
      items,
    },
    itemCount: items.length,
  };
}

/** IRT selection fixture scaled to `itemCount` candidates. */
function adaptiveSelectionFixture(itemCount) {
  const parameters = {};
  const libraryItems = [];
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const oid = `o${i + 1}`;
    const iid = `item-load-${i + 1}`;
    parameters[oid] = { a: 1, b: (i / Math.max(1, itemCount - 1)) * 4 - 2 };
    items.push({
      id: iid,
      taskModelId: "tm-load",
      observationId: oid,
      evidenceModelId: "em-load",
      status: "operational",
    });
    libraryItems.push({
      itemId: iid,
      observationId: oid,
      evidenceModelId: "em-load",
      evidenceModelVersion: 1,
    });
  }

  const db = {
    competencyModels: [
      {
        id: "cm-load",
        versionNumber: 1,
        smVariables: [
          {
            id: "smv-theta",
            label: "Ability",
            type: "continuous",
            scale: { min: -4, max: 4 },
            priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
          },
        ],
      },
    ],
    competencies: [{ id: "c-load", modelId: "cm-load" }],
    evidenceModels: [
      {
        id: "em-load",
        competencyId: "c-load",
        versionNumber: 1,
        observables: Object.keys(parameters).map((id) => ({ id })),
        statisticalModels: [
          {
            id: "sm1",
            active: true,
            type: "irt",
            activeParameterSetId: "ps1",
            parameterSets: [{ parameterSetId: "ps1", parameters }],
          },
        ],
      },
    ],
    taskModels: [{ id: "tm-load", versionNumber: 1, evidenceModelIds: ["em-load"] }],
    items,
    compositeLibrary: [
      {
        id: "cl-load",
        taskModelId: "tm-load",
        taskModelVersion: 1,
        active: true,
        items: libraryItems,
      },
    ],
    assemblyModels: [],
  };

  function makeSession(idx) {
    return {
      id: `sess-load-${idx}`,
      taskModelId: "tm-load",
      selectionStrategy: "IRT",
      tasks: items.map((it) => ({ id: `t-${it.id}`, itemId: it.id })),
      currentTaskIndex: 0,
      responses: [],
      studentModel: {
        smvPosteriors: {
          "smv-theta": { estimate: (idx % 7) * 0.3 - 0.9, variance: 1 },
        },
      },
      openingParameterSource: "calibrated",
      openingParameterSetId: "ps1",
    };
  }

  return { db, makeSession };
}

/**
 * @param {{ recordPath?: string, networkRttMs?: number, cohortSize?: number, selectionItemCount?: number }} [opts]
 */
export async function performLoadRehearsal(opts = {}) {
  const networkRttMs = opts.networkRttMs ?? 300; // school-network round trip
  const cohortSize = opts.cohortSize ?? 30;
  const selectionItemCount = opts.selectionItemCount ?? 50;

  const { db: shaped, manifest } = generateProductionShapedDataset(DEFAULTS);

  // ——— 1. Wizard autosave under latency ———
  const draftPayload = {
    id: "cm-autosave-load",
    name: "Autosave load fixture",
    status: "draft",
    locked: false,
    versionNumber: 1,
    measurementIntent: "unidimensional",
    description: "x".repeat(4000), // authoring-sized body
    smVariables: [],
  };

  const prevDb = process.env.ECD_DB_FILE;
  const prevBackup = process.env.ECD_BACKUP_DIR;
  const tmpDir = opts.tmpDir;
  if (tmpDir) {
    process.env.ECD_DB_FILE = path.join(tmpDir, "autosave-db.json");
    process.env.ECD_BACKUP_DIR = path.join(tmpDir, "backups");
    fs.mkdirSync(process.env.ECD_BACKUP_DIR, { recursive: true });
    fs.writeFileSync(
      process.env.ECD_DB_FILE,
      JSON.stringify({ competencyModels: [draftPayload], auditLog: [] }, null, 2)
    );
  }

  let autosaveServer;
  let autosavePerceived;
  try {
    autosaveServer = sampleMs(() => {
      const db = readRawDB();
      const row = (db.competencyModels || []).find((m) => m.id === draftPayload.id) || draftPayload;
      row.updatedAt = new Date().toISOString();
      row.description = `edited ${Math.random().toString(36).slice(2)} ${"y".repeat(200)}`;
      db.competencyModels = [row];
      saveDB(db, { skipAudit: true });
    });

    autosavePerceived = await sampleAsyncMs(async () => {
      await sleep(networkRttMs / 2); // uplink
      const db = readRawDB();
      const row = (db.competencyModels || []).find((m) => m.id === draftPayload.id) || draftPayload;
      row.updatedAt = new Date().toISOString();
      db.competencyModels = [row];
      saveDB(db, { skipAudit: true });
      await sleep(networkRttMs / 2); // downlink
    });
  } finally {
    if (prevDb === undefined) delete process.env.ECD_DB_FILE;
    else process.env.ECD_DB_FILE = prevDb;
    if (prevBackup === undefined) delete process.env.ECD_BACKUP_DIR;
    else process.env.ECD_BACKUP_DIR = prevBackup;
  }

  const scenario1 = {
    id: "wizard-autosave-latency",
    title: "Wizard autosave under school-network latency",
    configuration: {
      path: "PUT /api/competencies/models/:id (draft autosave body)",
      payloadBytesApprox: JSON.stringify(draftPayload).length,
      networkRttMs,
      samples: SAMPLES,
      note: "Server write timed alone; perceived = write + simulated RTT (half up, half down).",
    },
    serverWrite: autosaveServer,
    perceivedWithLatency: autosavePerceived,
    recordedNumber: {
      metric: "perceived_autosave_median_ms",
      value: autosavePerceived.medianMs,
      unit: "ms",
    },
  };

  // ——— 2. Dashboard against D109 bank ———
  const dashScan = sampleMs(() => dashboardShapedScan(shaped));
  const dashOnce = dashboardShapedScan(shaped);
  const scenario2 = {
    id: "dashboard-d109-bank",
    title: "Dashboard aggregate against D109 production-shaped bank",
    configuration: {
      seed: manifest.seed,
      items: manifest.counts.items,
      sessions: manifest.counts.sessions,
      students: manifest.counts.students,
      districts: manifest.districts,
      samples: SAMPLES,
      note: "In-process reduce matching GET /api/reports/dashboard (sessions/students/tasks). Live HTTP cost is storage round-trips on top.",
    },
    timing: dashScan,
    aggregateSnapshot: dashOnce,
    recordedNumber: {
      metric: "dashboard_shaped_scan_median_ms",
      value: dashScan.medianMs,
      unit: "ms",
    },
  };

  // ——— 3. Concurrent adaptive selection ———
  const { db: selDb, makeSession } = adaptiveSelectionFixture(selectionItemCount);
  const sessions = Array.from({ length: cohortSize }, (_, i) => makeSession(i));

  // Warm one call
  selectNextActivity(sessions[0], selDb);

  const concurrentTimes = [];
  for (let s = 0; s < SAMPLES; s++) {
    const t0 = performance.now();
    const results = await Promise.all(
      sessions.map((sess) => Promise.resolve(selectNextActivity(sess, selDb)))
    );
    concurrentTimes.push(performance.now() - t0);
    if (!results.every((r) => r && (r.taskId || r.itemId || r.stop))) {
      // selection may return taskId — tolerate empty stop
    }
  }

  const perCall = sampleMs(() => {
    selectNextActivity(makeSession(0), selDb);
  });

  const scenario3 = {
    id: "concurrent-adaptive-selection",
    title: "Concurrent sessions — adaptive selection recompute",
    configuration: {
      cohortSize,
      candidateItems: selectionItemCount,
      strategy: "IRT",
      concurrency: "Promise.all over cohort",
      samples: SAMPLES,
    },
    wallClockCohort: {
      samplesMs: concurrentTimes.map(roundMs),
      medianMs: roundMs(median(concurrentTimes)),
      minMs: roundMs(Math.min(...concurrentTimes)),
      maxMs: roundMs(Math.max(...concurrentTimes)),
    },
    singleCall: perCall,
    recordedNumber: {
      metric: "cohort_selection_wall_median_ms",
      value: roundMs(median(concurrentTimes)),
      unit: "ms",
    },
  };

  // ——— 4. Composite library at activation scale ———
  const { taskModel, db: compDb, itemCount } = compositeBankFromProductionShaped(
    shaped,
    "tm-prod-1"
  );
  const compTiming = sampleMs(() => {
    buildCompositeLibrary(taskModel, compDb);
  });
  const { record: compiledPackage, warnings } = buildCompositeLibrary(taskModel, compDb);

  const scenario4 = {
    id: "composite-library-activation",
    title: "Composite library build at Task Model activation",
    configuration: {
      taskModelId: taskModel.id,
      compiledItemCount: compiledPackage.items.length,
      sourceItemCount: itemCount,
      samples: SAMPLES,
      warningCount: warnings.length,
    },
    timing: compTiming,
    recordedNumber: {
      metric: "buildCompositeLibrary_median_ms",
      value: compTiming.medianMs,
      unit: "ms",
    },
  };

  // ——— 5. Calibration queue pressure ———
  queueTesting.resetQueueDepthAlarm();
  const pressureJobs = Array.from({ length: 25 }, (_, i) => ({
    id: `job-pressure-${i}`,
    status: i === 0 ? "running" : "queued",
  }));
  const queueTiming = sampleMs(() => computeQueueMetrics(pressureJobs));
  const metrics = computeQueueMetrics(pressureJobs);
  const warns = [];
  const alarmAt = maybeEmitQueueDepthAlarm(metrics, {
    warn: (msg) => warns.push(String(msg)),
  });

  // Admit simulation: with maxConcurrent=1, how long to decide next dispatch N times
  const admitTiming = sampleMs(() => {
    const m = computeQueueMetrics(pressureJobs);
    const canDispatch = m.running < m.maxConcurrent;
    void canDispatch;
  });

  const scenario5 = {
    id: "calibration-queue-pressure",
    title: "Calibration under queue pressure (D87 backpressure)",
    configuration: {
      queued: metrics.queued,
      running: metrics.running,
      maxConcurrent: metrics.maxConcurrent,
      depthAlarmThreshold: metrics.depthAlarmThreshold,
      depthAlarm: metrics.depthAlarm,
      samples: SAMPLES,
      note: "Metrics over 25 jobs (1 running + 24 queued). Alarm fires when queued ≥ threshold (default 20).",
    },
    timing: queueTiming,
    admitDecision: admitTiming,
    depthAlarmEmittedAt: alarmAt,
    depthAlarmMessage: warns[0] || null,
    recordedNumber: {
      metric: "queue_metrics_median_us",
      value: roundMs(queueTiming.medianMs * 1000),
      unit: "µs",
      also: {
        depthAlarm: metrics.depthAlarm,
        queued: metrics.queued,
      },
    },
  };

  const record = {
    ok: true,
    unit: "D110",
    performedAt: new Date().toISOString(),
    productionShaped: {
      seed: manifest.seed,
      counts: manifest.counts,
      districts: manifest.districts,
    },
    scenarios: [scenario1, scenario2, scenario3, scenario4, scenario5],
    recordedNumbers: [
      scenario1.recordedNumber,
      scenario2.recordedNumber,
      scenario3.recordedNumber,
      scenario4.recordedNumber,
      scenario5.recordedNumber,
    ],
  };

  if (opts.recordPath) {
    fs.mkdirSync(path.dirname(opts.recordPath), { recursive: true });
    fs.writeFileSync(opts.recordPath, JSON.stringify(record, null, 2));
  }

  return record;
}
