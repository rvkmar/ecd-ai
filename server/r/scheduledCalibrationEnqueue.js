// server/r/scheduledCalibrationEnqueue.js
//
// D80 (W16): scheduled enqueue of calibration / analysis jobs.
//
// THE RULE THAT DEFINES THIS MODULE: it ENQUEUES, it never INGESTS.
// Replacing an operational parameter set is a measurement decision made
// by a person through the D65 calibration console — not a timer.
// This file must not import the calibration ingest helper, must not write
// parameterSets, and must not assign an active parameter-set pointer.

import { validateEntity } from "../../src/utils/schema.js";
import { validateCalibrationJobLifecycle } from "../utils/lifecycleValidation.js";
import {
  CALIBRATION_CONTRACT_VERSION,
  isDeclaredJobKind,
  validateCalibrationRequest,
} from "./calibrationContract.js";
import { applyNamedCalibrationFixture } from "./calibrationFixtures.js";
import { assessLiveResponseMatrix } from "./liveResponseMatrix.js";

const SCHEDULED_CALIBRATION_REQUESTED_BY = "scheduled-calibration-cron";

const DEFAULT_MIN_SAMPLE_SIZE = 30;

const RETAIN_MS = 182 * 24 * 60 * 60 * 1000;

function retainUntilFrom(requestedAt) {
  return new Date(new Date(requestedAt).getTime() + RETAIN_MS).toISOString();
}

let idCounter = 0;
function genId(nowMs) {
  return `job${nowMs}${(idCounter++ % 1000).toString().padStart(3, "0")}`;
}

/**
 * Sample size for the min-sample gate: persons in a response matrix, or
 * cohort members for attribute-profile jobs.
 */
function sampleSizeFromRequest(request) {
  const cohortN = request?.cohort?.members?.length;
  if (Number.isFinite(cohortN) && cohortN > 0) return cohortN;
  const personN = request?.responseMatrix?.personIds?.length;
  if (Number.isFinite(personN) && personN > 0) return personN;
  return 0;
}

/**
 * Targets come from evidenceModels[].calibrationPlan.scheduledEnqueue.
 *
 * Shape:
 *   scheduledEnqueue: {
 *     enabled: true,
 *     minSampleSize?: number,   // default for every job entry
 *     jobs: [
 *       { kind, fixture?, source?, evidenceModelId?, statisticalModelId?,
 *         minSampleSize?, itemIds?, sessionIds?, from?, to? }
 *     ]
 *   }
 *
 * statisticalModelId defaults to the active SM on the Evidence Model.
 */
function collectScheduledEnqueueTargets(db) {
  const targets = [];
  for (const em of db?.evidenceModels || []) {
    const plan = em?.calibrationPlan?.scheduledEnqueue;
    if (!plan || plan.enabled !== true) continue;
    if (!Array.isArray(plan.jobs) || plan.jobs.length === 0) continue;

    const activeSm =
      (em.statisticalModels || []).find((sm) => sm.active) ||
      (em.statisticalModels || [])[0] ||
      null;

    for (const jobSpec of plan.jobs) {
      if (!jobSpec || typeof jobSpec !== "object") continue;
      targets.push({
        evidenceModelId: jobSpec.evidenceModelId || em.id,
        statisticalModelId: jobSpec.statisticalModelId || activeSm?.id || null,
        kind: jobSpec.kind,
        fixture: jobSpec.fixture || null,
        source: jobSpec.source === "sessions" || jobSpec.source === "fixture" ? jobSpec.source : null,
        itemIds: Array.isArray(jobSpec.itemIds) ? jobSpec.itemIds : null,
        sessionIds: Array.isArray(jobSpec.sessionIds) ? jobSpec.sessionIds : null,
        from: typeof jobSpec.from === "string" ? jobSpec.from : null,
        to: typeof jobSpec.to === "string" ? jobSpec.to : null,
        minSampleSize:
          Number.isFinite(jobSpec.minSampleSize) && jobSpec.minSampleSize > 0
            ? Number(jobSpec.minSampleSize)
            : Number.isFinite(plan.minSampleSize) && plan.minSampleSize > 0
              ? Number(plan.minSampleSize)
              : DEFAULT_MIN_SAMPLE_SIZE,
      });
    }
  }
  return targets;
}

function stampJobSource(record, stamps) {
  if (!stamps) return record;
  if (stamps.responseSource) record.responseSource = stamps.responseSource;
  if (stamps.fixtureName) record.fixtureName = stamps.fixtureName;
  if (stamps.qMatrixId) record.qMatrixId = stamps.qMatrixId;
  if (typeof stamps.sourceSessionCount === "number") {
    record.sourceSessionCount = stamps.sourceSessionCount;
  }
  if (stamps.sourceSessionIdsHash) record.sourceSessionIdsHash = stamps.sourceSessionIdsHash;
  if (Array.isArray(stamps.sourceSessionIds)) record.sourceSessionIds = stamps.sourceSessionIds;
  return record;
}

function finalizeQueuedJob(db, target, incoming, stamps, { nowIso, nowMs, requestedBy, enforceSampleGate = true }) {
  const id = genId(nowMs);
  const request = {
    ...(incoming?.request || {}),
    contractVersion: incoming?.request?.contractVersion || CALIBRATION_CONTRACT_VERSION,
    jobId: id,
    options: {
      ...(incoming?.request?.options || {}),
      scheduledBy: SCHEDULED_CALIBRATION_REQUESTED_BY,
    },
  };

  const record = stampJobSource(
    {
      id,
      kind: incoming?.kind ?? target.kind,
      status: "queued",
      evidenceModelId: incoming?.evidenceModelId ?? target.evidenceModelId,
      statisticalModelId: incoming?.statisticalModelId ?? target.statisticalModelId,
      requestedBy,
      requestedAt: nowIso,
      startedAt: null,
      finishedAt: null,
      request,
      response: null,
      error: null,
      attempts: 1,
      maxAttempts: 3,
      ingestedParameterSetId: null,
      ingestedAnalysisArtefactId: null,
      retainUntil: retainUntilFrom(nowIso),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    stamps
  );

  if (!isDeclaredJobKind(record.kind)) {
    return { ok: false, error: `Invalid calibration job kind '${record.kind}'` };
  }

  const requestErrors = validateCalibrationRequest(record.request);
  if (requestErrors.length) {
    return { ok: false, error: "Invalid calibration request envelope", details: requestErrors };
  }

  const sampleSize = sampleSizeFromRequest(record.request);
  if (enforceSampleGate && sampleSize < target.minSampleSize) {
    return {
      ok: false,
      skipped: true,
      reason: `sampleSize ${sampleSize} < minSampleSize ${target.minSampleSize}`,
      sampleSize,
      minSampleSize: target.minSampleSize,
    };
  }

  const { valid, errors } = validateEntity("calibrationJobs", record, db);
  if (!valid) {
    return { ok: false, error: "Calibration job validation failed", details: errors };
  }

  const lifecycleErrors = validateCalibrationJobLifecycle(record, db);
  if (lifecycleErrors.length) {
    return { ok: false, error: "Calibration job lifecycle validation failed", details: lifecycleErrors };
  }

  return { ok: true, job: record, sampleSize };
}

function buildFixtureJob(db, target, ctx) {
  const body = {
    kind: target.kind,
    evidenceModelId: target.evidenceModelId,
    statisticalModelId: target.statisticalModelId,
    fixture: target.fixture,
  };
  let incoming;
  try {
    incoming = applyNamedCalibrationFixture(body, db);
  } catch (err) {
    return { ok: false, error: err?.message || String(err), code: err?.code };
  }
  return finalizeQueuedJob(
    db,
    target,
    incoming,
    { responseSource: "fixture", fixtureName: target.fixture },
    ctx
  );
}

function buildLiveJob(db, target, ctx) {
  const assessed = assessLiveResponseMatrix(db, {
    evidenceModelId: target.evidenceModelId,
    statisticalModelId: target.statisticalModelId,
    kind: target.kind,
    itemIds: target.itemIds || undefined,
    sessionIds: target.sessionIds || undefined,
    from: target.from || undefined,
    to: target.to || undefined,
    minSampleSize: target.minSampleSize,
  });
  if (!assessed.ok) {
    return {
      ok: false,
      skipped: true,
      reason: assessed.message || assessed.code || "live session matrix was not built",
      code: assessed.code,
      sampleSize: assessed.sampleSize,
      minSampleSize: target.minSampleSize,
    };
  }
  return finalizeQueuedJob(
    db,
    target,
    {
      kind: assessed.kind,
      evidenceModelId: target.evidenceModelId,
      statisticalModelId: target.statisticalModelId,
      request: assessed.request,
    },
    {
      responseSource: "sessions",
      qMatrixId: assessed.qMatrixId,
      sourceSessionCount: assessed.sourceSessionCount,
      sourceSessionIdsHash: assessed.sourceSessionIdsHash,
      sourceSessionIds: assessed.sourceSessionIds,
    },
    { ...ctx, enforceSampleGate: false }
  );
}

/**
 * Scan Evidence Models for enabled scheduledEnqueue targets and append
 * queued calibrationJobs. Mutates `db` in place when jobs are enqueued.
 * Never ingests. Never touches activeParameterSetId.
 */
export function runScheduledCalibrationEnqueue(
  db,
  { now = new Date(), requestedBy = SCHEDULED_CALIBRATION_REQUESTED_BY } = {}
) {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const enqueued = [];
  const skipped = [];
  const errors = [];

  const targets = collectScheduledEnqueueTargets(db);
  for (const target of targets) {
    if (!target.kind) {
      skipped.push({ target, reason: "missing kind" });
      continue;
    }
    if (!target.statisticalModelId) {
      skipped.push({ target, reason: "no statisticalModelId to bind" });
      continue;
    }
    const wantsFixture =
      target.source === "fixture" || (Boolean(target.fixture) && target.source !== "sessions");
    if (wantsFixture && !target.fixture) {
      skipped.push({ target, reason: "A fixture source needs a named fixture." });
      continue;
    }

    const built = wantsFixture
      ? buildFixtureJob(db, target, { nowIso, nowMs, requestedBy })
      : buildLiveJob(db, target, { nowIso, nowMs, requestedBy });
    if (built.skipped) {
      skipped.push({ target, reason: built.reason, sampleSize: built.sampleSize });
      continue;
    }
    if (!built.ok) {
      errors.push({ target, error: built.error, details: built.details, code: built.code });
      continue;
    }

    db.calibrationJobs = db.calibrationJobs || [];
    db.calibrationJobs.push(built.job);
    enqueued.push({
      jobId: built.job.id,
      kind: built.job.kind,
      evidenceModelId: built.job.evidenceModelId,
      sampleSize: built.sampleSize,
      minSampleSize: target.minSampleSize,
      fixture: wantsFixture ? target.fixture : null,
      responseSource: wantsFixture ? "fixture" : "sessions",
      qMatrixId: built.job.qMatrixId || null,
      sourceSessionCount: built.job.sourceSessionCount ?? null,
    });
  }

  return { enqueued, skipped, errors };
}

/** Test-only access for target collection / sample sizing. */
export const __testing__ = {
  sampleSizeFromRequest,
  collectScheduledEnqueueTargets,
  DEFAULT_MIN_SAMPLE_SIZE,
  SCHEDULED_CALIBRATION_REQUESTED_BY,
};
