#!/usr/bin/env node
// Time JSON saveDB on a generated db. Not part of CI.
//
// Usage:
//   node scripts/bench-json-save.js --bytes 5000000 --saves 30
//   node scripts/bench-json-save.js --bytes 19000000 --saves 30 --mode unscoped
//
// Prints mean milliseconds. Default mode is scoped: a student loadDB/saveDB,
// which is the session submit path. Warmup saves are not included in the mean.
// The starting file is pretty-printed so the first read matches a legacy db.json.
// The temp directory is removed on exit.

import fs from "fs";
import os from "os";
import path from "path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1];
}

const targetBytes = Number(flag("--bytes", 5 * 1024 * 1024));
const saves = Number(flag("--saves", 30));
const warmup = Number(flag("--warmup", 2));
const mode = flag("--mode", "scoped");
const sessionCap = Number(flag("--sessions", 0));
const compare = args.includes("--compare");

if (!Number.isFinite(targetBytes) || targetBytes < 1024) {
  console.error("--bytes must be a number of bytes >= 1024");
  process.exit(1);
}
if (!Number.isFinite(saves) || saves < 1) {
  console.error("--saves must be >= 1");
  process.exit(1);
}
if (mode !== "scoped" && mode !== "unscoped") {
  console.error("--mode must be scoped or unscoped");
  process.exit(1);
}

function buildDb(target) {
  const note = "x".repeat(240);
  const sessions = [
    {
      id: "s-me",
      studentId: "me",
      responses: [],
      taskIds: ["t0"],
      status: "in_progress",
    },
  ];
  let guard = 0;
  while (guard < 1_000_000) {
    const id = `s${sessions.length}`;
    const responses = [];
    for (let r = 0; r < 6; r++) {
      responses.push({
        taskId: `${id}-t${r}`,
        itemId: `item${r % 40}`,
        rawAnswer: { selected: "A", note },
        scoredValue: r % 2,
        evaluationStatus: "final",
        timestamp: "2026-01-01T00:00:00.000Z",
      });
    }
    sessions.push({
      id,
      studentId: "bulk",
      districtId: "d-other",
      responses,
      taskIds: responses.map((row) => row.taskId),
      status: "completed",
    });
    guard += 1;
    if (sessionCap > 0 && sessions.length >= sessionCap) break;
    if (sessions.length % 200 !== 0) continue;
    const pretty = JSON.stringify(shell(sessions), null, 2);
    if (Buffer.byteLength(pretty) >= target) break;
  }
  if (sessionCap > 0 && sessions.length > sessionCap) {
    sessions.length = sessionCap;
  }
  if (sessionCap > 0 && sessions.length > 1) {
    const current = Buffer.byteLength(JSON.stringify(shell(sessions)));
    if (current < target) {
      const each = Math.floor((target - current) / sessions.length);
      const pad = "p".repeat(Math.max(0, Math.min(each, 80000)));
      if (pad) {
        for (const row of sessions) row.pad = pad;
      }
    }
  }
  return shell(sessions);
}

function shell(sessions) {
  return {
    items: Array.from({ length: 40 }, (_, i) => ({
      id: `item${i}`,
      status: "operational",
      stem: "Which part is this?",
    })),
    evidenceModels: [
      {
        id: "em1",
        status: "operational",
        versionNumber: 1,
        competencyId: "c1",
        statisticalModels: [
          { id: "sm1", type: "irt", active: true, activeParameterSetId: "ps1" },
        ],
      },
    ],
    competencyModels: [
      {
        id: "cm1",
        status: "operational",
        domainAnalysisId: "da1",
        psychologicalPerspective: "trait",
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1" }],
    domainAnalyses: [
      { id: "da1", name: "Plants", psychologicalPerspective: "trait" },
    ],
    sessions,
    students: [
      { id: "me", districtId: "d1" },
      { id: "bulk", districtId: "d-other" },
    ],
    tasks: [],
    auditLog: [],
    calibrationJobs: [],
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-bench-json-"));
process.env.ECD_DB_FILE = path.join(tmp, "db.json");
process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");

const db = buildDb(targetBytes);
const pretty = JSON.stringify(db, null, 2);
fs.mkdirSync(process.env.ECD_BACKUP_DIR, { recursive: true });
fs.writeFileSync(process.env.ECD_DB_FILE, pretty);
const startBytes = Buffer.byteLength(pretty);

const { loadDB, saveDB } = await import("../src/utils/db-server.js");
const { runWithTenancy } = await import("../server/utils/tenancyContext.js");

const student = {
  role: "student",
  username: "me",
  viewScope: "self",
  districtId: "d1",
  schoolId: null,
};

function oneSubmit(i) {
  const started = performance.now();
  const live = loadDB();
  const session = (live.sessions || []).find((row) => row.id === "s-me");
  session.responses.push({
    taskId: "t0",
    rawAnswer: { selected: i % 2 === 0 ? "A" : "B" },
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
  });
  const saveStarted = performance.now();
  saveDB(live);
  const saveEnded = performance.now();
  return {
    saveMs: saveEnded - saveStarted,
    submitMs: saveEnded - started,
  };
}

function runLoop() {
  const samples = [];
  const total = warmup + saves;
  for (let i = 0; i < total; i++) {
    const sample = oneSubmit(i);
    if (i >= warmup) samples.push(sample);
  }
  const mean = (key) =>
    samples.reduce((sum, row) => sum + row[key], 0) / samples.length;
  return { meanSaveMs: mean("saveMs"), meanSubmitMs: mean("submitMs") };
}

try {
  const result =
    mode === "scoped" ? runWithTenancy(student, runLoop) : runLoop();
  const endBytes = fs.statSync(process.env.ECD_DB_FILE).size;
  const report = {
    mode,
    targetBytes,
    sessionCount: db.sessions.length,
    startBytes,
    endBytes,
    warmup,
    saves,
    before: {
      meanSaveMs: Number(result.meanSaveMs.toFixed(2)),
      meanSubmitMs: Number(result.meanSubmitMs.toFixed(2)),
    },
    meanSaveMs: Number(result.meanSaveMs.toFixed(2)),
    meanSubmitMs: Number(result.meanSubmitMs.toFixed(2)),
  };

  if (compare) {
    const { forgetDbCache } = await import("../src/utils/db-server.js");
    const sessions = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8")).sessions;
    const shellOnly = JSON.parse(fs.readFileSync(process.env.ECD_DB_FILE, "utf8"));
    delete shellOnly.sessions;
    fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify(shellOnly));
    forgetDbCache();
    process.env.SESSIONS_BACKEND = "memory";
    process.env.AUDITLOG_BACKEND = "memory";
    const repo = await import("../server/sessions/sessionRepository.js");
    const auditRepo = await import("../server/auditLog/auditRepository.js");
    repo.resetSessionStoreForTests();
    auditRepo.resetAuditStoreForTests();
    const jobsRepo = await import("../server/calibrationJobs/calibrationJobRepository.js");
    const artefactsRepo = await import("../server/analysisArtefacts/analysisArtefactRepository.js");
    jobsRepo.resetCalibrationJobStoreForTests();
    artefactsRepo.resetAnalysisArtefactStoreForTests();
    process.env.STUDENT_MODEL_RECORDS_BACKEND = "memory";
    const studentModelRepo = await import("../server/studentModelRecords/studentModelRecordRepository.js");
    studentModelRepo.resetStudentModelRecordStoreForTests();
    await repo.upsertSessions(sessions);

    async function oneExternal(i) {
      const started = performance.now();
      const live = loadDB();
      const session = await repo.getSessionById(live, "s-me");
      session.responses.push({
        taskId: "t0",
        rawAnswer: { selected: i % 2 === 0 ? "A" : "B" },
        timestamp: new Date(1_700_000_000_000 + i).toISOString(),
      });
      const saveStarted = performance.now();
      await repo.replaceStoredSession(live, session);
      saveDB(live);
      const saveEnded = performance.now();
      return {
        saveMs: saveEnded - saveStarted,
        submitMs: saveEnded - started,
      };
    }

    async function externalLoop() {
      const samples = [];
      const total = warmup + saves;
      for (let i = 0; i < total; i++) {
        const sample = await oneExternal(i);
        if (i >= warmup) samples.push(sample);
      }
      const mean = (key) =>
        samples.reduce((sum, row) => sum + row[key], 0) / samples.length;
      return { meanSaveMs: mean("saveMs"), meanSubmitMs: mean("submitMs") };
    }

    const after =
      mode === "scoped" ? await runWithTenancy(student, externalLoop) : await externalLoop();
    const afterBytes = fs.statSync(process.env.ECD_DB_FILE).size;
    report.after = {
      meanSaveMs: Number(after.meanSaveMs.toFixed(2)),
      meanSubmitMs: Number(after.meanSubmitMs.toFixed(2)),
      fileBytes: afterBytes,
      store: "memory",
    };
    delete process.env.SESSIONS_BACKEND;
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
