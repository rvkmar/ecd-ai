#!/usr/bin/env node
// Time session list queries against 600 heavy sessions.
//
// Usage:
//   node scripts/bench-session-list.js
//   MONGO_URI=mongodb://127.0.0.1:27017/ecd_assessment node scripts/bench-session-list.js
//
// The default store is the in-memory repository. Those milliseconds are not
// a live Mongo timing: Mongo still has to read the documents. When MONGO_URI
// is set, the script also times the mongo backend and drops the bench ids
// afterwards.

import fs from "fs";
import os from "os";
import path from "path";
import { performance } from "node:perf_hooks";

const sessions = 600;
const repeats = 5;
const heavy = "n".repeat(240);

function buildSessions() {
  const rows = [];
  for (let i = 0; i < sessions; i++) {
    const pending = i < 12;
    const responses = [];
    for (let r = 0; r < 8; r++) {
      responses.push({
        taskId: `t${r}`,
        itemId: `item${r % 40}`,
        observationId: "o1",
        rawAnswer: { selected: "A", note: heavy },
        rationale: heavy,
        evaluationStatus: pending && r === 0 ? "pending_human" : "complete",
        pendingPhase:
          pending && r === 0
            ? { order: 2, kind: "human", rubricId: "rub1", adjudicationRule: "human_wins" }
            : null,
        timestamp: "2026-01-01T00:00:00.000Z",
      });
    }
    rows.push({
      id: `bench-s${i}`,
      studentId: i % 17 === 0 ? "me" : "bulk",
      studentIds: [i % 17 === 0 ? "me" : "bulk"],
      taskIds: responses.map((row) => row.taskId),
      currentTaskIndex: 3,
      responses,
      studentModel: {
        smvPosteriors: {
          theta: {
            smvId: "theta",
            estimate: i / 100,
            precision: 0.2,
            distribution: Object.fromEntries(
              Array.from({ length: 21 }, (_, k) => [`p${k}`, (k + 1) / 21])
            ),
          },
        },
      },
      selectionStrategy: "fixed",
      nextTaskPolicy: { policyId: "p1" },
      deliveryModelId: "dm1",
      status: i % 11 === 0 ? "archived" : "completed",
      isCompleted: true,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      districtId: "d1",
    });
  }
  return rows;
}

function mean(samples) {
  return samples.reduce((sum, n) => sum + n, 0) / samples.length;
}

async function timeList(fn) {
  await fn();
  const samples = [];
  for (let i = 0; i < repeats; i++) samples.push(await fn());
  return Number(mean(samples).toFixed(2));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-bench-list-"));
process.env.ECD_DB_FILE = path.join(tmp, "db.json");
process.env.ECD_BACKUP_DIR = path.join(tmp, "backups");
fs.mkdirSync(process.env.ECD_BACKUP_DIR, { recursive: true });
fs.writeFileSync(
  process.env.ECD_DB_FILE,
  JSON.stringify({
    sessions: [],
    students: [
      { id: "me", districtId: "d1" },
      { id: "bulk", districtId: "d1" },
    ],
    users: [],
  })
);

const rows = buildSessions();
process.env.SESSIONS_BACKEND = "memory";

const { querySessions, resetSessionStoreForTests, upsertSessions } = await import(
  "../server/sessions/sessionRepository.js"
);
const {
  CATALOG_SUMMARY_PROJECTION,
  RATING_QUEUE_PROJECTION,
  catalogListSummary,
} = await import("../server/sessions/sessionListProjection.js");
const { blindedRatingQueueFromSessions } = await import("../server/delivery/raterQueue.js");

resetSessionStoreForTests();
await upsertSessions(rows);
const db = { students: [{ id: "me", districtId: "d1" }, { id: "bulk", districtId: "d1" }], users: [] };

const catalogMs = await timeList(async () => {
  const started = performance.now();
  const listed = await querySessions(db, {}, { projection: CATALOG_SUMMARY_PROJECTION });
  JSON.stringify(listed.map(catalogListSummary));
  return performance.now() - started;
});

const activeMs = await timeList(async () => {
  const started = performance.now();
  const listed = await querySessions(db, { statusNe: "archived" }, { projection: CATALOG_SUMMARY_PROJECTION });
  JSON.stringify(listed.map(catalogListSummary));
  return performance.now() - started;
});

const ratingMs = await timeList(async () => {
  const started = performance.now();
  const listed = await querySessions(db, { pendingRating: true }, { projection: RATING_QUEUE_PROJECTION });
  JSON.stringify({ items: blindedRatingQueueFromSessions(listed) });
  return performance.now() - started;
});

const unprojectedRatingMs = await timeList(async () => {
  const started = performance.now();
  const listed = await querySessions(db, { pendingRating: true });
  JSON.stringify({ items: blindedRatingQueueFromSessions(listed) });
  return performance.now() - started;
});

const unprojectedMs = await timeList(async () => {
  const started = performance.now();
  const listed = await querySessions(db, {});
  JSON.stringify(listed);
  return performance.now() - started;
});

const oneCatalog = (
  await querySessions(db, {}, { projection: CATALOG_SUMMARY_PROJECTION })
).map(catalogListSummary);
const oneRating = await querySessions(db, { pendingRating: true }, { projection: RATING_QUEUE_PROJECTION });

const report = {
  sessions,
  repeats,
  note: "The memory block is not a live Mongo measurement. The mongo block is a local MongoDB process, not the profiled install.",
  memory: {
    catalogListMs: catalogMs,
    activeListMs: activeMs,
    ratingQueueMs: ratingMs,
    unprojectedRatingQueueMs: unprojectedRatingMs,
    unprojectedCatalogMs: unprojectedMs,
    catalogBytes: Buffer.byteLength(JSON.stringify(oneCatalog)),
    ratingQueueBytes: Buffer.byteLength(
      JSON.stringify({ items: blindedRatingQueueFromSessions(oneRating) })
    ),
  },
};

if (process.env.MONGO_URI) {
  process.env.SESSIONS_BACKEND = "mongo";
  resetSessionStoreForTests();
  const { mongoRemove } = await import("../server/sessions/mongoSessionStore.js");
  try {
    await upsertSessions(rows);
    report.mongo = {
      catalogListMs: await timeList(async () => {
        const started = performance.now();
        const listed = await querySessions(db, {}, { projection: CATALOG_SUMMARY_PROJECTION });
        JSON.stringify(listed.map(catalogListSummary));
        return performance.now() - started;
      }),
      activeListMs: await timeList(async () => {
        const started = performance.now();
        const listed = await querySessions(
          db,
          { statusNe: "archived" },
          { projection: CATALOG_SUMMARY_PROJECTION }
        );
        JSON.stringify(listed.map(catalogListSummary));
        return performance.now() - started;
      }),
      ratingQueueMs: await timeList(async () => {
        const started = performance.now();
        const listed = await querySessions(
          db,
          { pendingRating: true },
          { projection: RATING_QUEUE_PROJECTION }
        );
        JSON.stringify({ items: blindedRatingQueueFromSessions(listed) });
        return performance.now() - started;
      }),
      unprojectedRatingQueueMs: await timeList(async () => {
        const started = performance.now();
        const listed = await querySessions(db, { pendingRating: true });
        JSON.stringify({ items: blindedRatingQueueFromSessions(listed) });
        return performance.now() - started;
      }),
      unprojectedCatalogMs: await timeList(async () => {
        const started = performance.now();
        const listed = await querySessions(db, {});
        JSON.stringify(listed);
        return performance.now() - started;
      }),
    };
  } finally {
    for (const row of rows) {
      try {
        await mongoRemove(row.id);
      } catch {
        // best-effort cleanup of bench ids
      }
    }
  }
}

const mongoose = (await import("mongoose")).default;
if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
console.log(JSON.stringify(report, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
