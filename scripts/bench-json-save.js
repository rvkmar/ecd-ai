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
    if (sessions.length % 200 !== 0) continue;
    const pretty = JSON.stringify(shell(sessions), null, 2);
    if (Buffer.byteLength(pretty) >= target) break;
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
  console.log(
    JSON.stringify(
      {
        mode,
        targetBytes,
        startBytes,
        endBytes,
        warmup,
        saves,
        meanSaveMs: Number(result.meanSaveMs.toFixed(2)),
        meanSubmitMs: Number(result.meanSubmitMs.toFixed(2)),
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
