// server/r/__tests__/scheduledCalibrationEnqueue.test.js
// D80: scheduled enqueue is enqueue-only. Exit check — an analytics
// artefact can be produced after a scheduled enqueue (process + human
// ingest); no scheduled run changes activeParameterSetId.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  runScheduledCalibrationEnqueue,
  __testing__,
} from "../scheduledCalibrationEnqueue.js";
import { processJobById } from "../calibrationWorker.js";
import { ingestCalibrationJob } from "../calibrationIngest.js";

const {
  collectScheduledEnqueueTargets,
  sampleSizeFromRequest,
  SCHEDULED_CALIBRATION_REQUESTED_BY,
} = __testing__;

const here = path.dirname(fileURLToPath(import.meta.url));
const ENQUEUE_SRC = path.resolve(here, "../scheduledCalibrationEnqueue.js");
const CRON_SRC = path.resolve(here, "../../cron/scheduledCalibrationCron.js");

const dbState = { current: {} };
vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
}));

function seedDb({ minSampleSize = 2, kind = "attribute-profile-summary", fixture = "known-attribute-profile-cohort" } = {}) {
  dbState.current = {
    calibrationJobs: [],
    analysisArtefacts: [],
    questions: [{ id: "q1", metadata: {} }],
    evidenceModels: [
      {
        id: "em-dina",
        competencyId: "c1",
        calibrationPlan: {
          scheduledEnqueue: {
            enabled: true,
            minSampleSize,
            jobs: [{ kind, fixture }],
          },
        },
        statisticalModels: [
          {
            id: "sm-dina",
            type: "dina",
            active: true,
            parameterSets: [],
            activeParameterSetId: "ps-keep",
          },
        ],
      },
    ],
    competencies: [{ id: "c1", modelId: "cm1", variableType: "binary" }],
  };
}

beforeEach(() => {
  seedDb();
});

describe("D80 scheduled enqueue — source invariants", () => {
  it("enqueue and cron modules never call ingest or write active parameter sets", () => {
    const enqueueSrc = fs.readFileSync(ENQUEUE_SRC, "utf8");
    const cronSrc = fs.readFileSync(CRON_SRC, "utf8");

    // Strip block/line comments so the invariant note in the header does not trip the scan.
    const live = (src) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    const enqueueLive = live(enqueueSrc);
    const cronLive = live(cronSrc);

    expect(enqueueLive).not.toMatch(/ingestCalibrationJob/);
    expect(enqueueLive).not.toMatch(/activeParameterSetId\s*=/);
    expect(enqueueLive).not.toMatch(/from\s+["'].*calibrationIngest/);

    expect(cronLive).not.toMatch(/ingestCalibrationJob/);
    expect(cronLive).not.toMatch(/from\s+["'].*calibrationIngest/);
    expect(cronSrc).toMatch(/snapshotActiveParameterSetIds/);
  });
});

describe("D80 scheduled enqueue — min-sample gate", () => {
  it("collects enabled targets from calibrationPlan.scheduledEnqueue", () => {
    const targets = collectScheduledEnqueueTargets(dbState.current);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      evidenceModelId: "em-dina",
      statisticalModelId: "sm-dina",
      kind: "attribute-profile-summary",
      fixture: "known-attribute-profile-cohort",
      minSampleSize: 2,
    });
  });

  it("skips when sample size is below the gate", () => {
    seedDb({ minSampleSize: 9999 });
    const before = dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId;
    const result = runScheduledCalibrationEnqueue(dbState.current);
    expect(result.enqueued).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/sampleSize \d+ < minSampleSize 9999/);
    expect(dbState.current.calibrationJobs).toHaveLength(0);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe(
      before
    );
  });

  it("sampleSizeFromRequest reads cohort members and response-matrix persons", () => {
    expect(sampleSizeFromRequest({ cohort: { members: [{}, {}, {}] } })).toBe(3);
    expect(
      sampleSizeFromRequest({ responseMatrix: { personIds: ["a", "b"] } })
    ).toBe(2);
  });
});

describe("D80 exit check — scheduled analytics artefact without active-set change", () => {
  it("enqueues on schedule; human ingest stores artefact; active set untouched", async () => {
    const activeBefore =
      dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId;

    const result = runScheduledCalibrationEnqueue(dbState.current, {
      now: new Date("2026-09-16T22:00:00.000Z"),
    });
    expect(result.errors).toEqual([]);
    expect(result.enqueued).toHaveLength(1);
    expect(result.enqueued[0].kind).toBe("attribute-profile-summary");
    expect(result.enqueued[0].sampleSize).toBe(4);

    const job = dbState.current.calibrationJobs[0];
    expect(job.status).toBe("queued");
    expect(job.requestedBy).toBe(SCHEDULED_CALIBRATION_REQUESTED_BY);
    expect(job.request.options.scheduledBy).toBe(SCHEDULED_CALIBRATION_REQUESTED_BY);
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe(
      activeBefore
    );

    // Worker may process; still not ingest.
    const processed = await processJobById(job.id);
    expect(processed.ok).toBe(true);
    expect(processed.job.status).toBe("succeeded");
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe(
      activeBefore
    );
    expect(dbState.current.analysisArtefacts || []).toHaveLength(0);

    // Human decision (D65 console / ingest route) — not the scheduler.
    const ingest = ingestCalibrationJob(processed.job, dbState.current, {
      calibratedBy: "admin1",
    });
    expect(ingest.ok).toBe(true);
    expect(ingest.parameterSet).toBeFalsy();
    expect(ingest.analysisArtefact).toBeTruthy();

    const artefact = dbState.current.analysisArtefacts[0];
    expect(artefact.jobId).toBe(job.id);
    expect(artefact.packageVersion).toMatch(/^ecd-node attribute-profile-summary/);
    expect(artefact.sampleSize).toBe(4);
    expect(artefact.kind).toBe("attribute-profile-summary");

    // Analysis ingest must not promote a parameter set.
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe(
      activeBefore
    );
  });

  it("enqueuing a parameter-set kind still does not change activeParameterSetId", () => {
    seedDb({
      minSampleSize: 2,
      kind: "irt-parameters",
      fixture: "lsat7",
    });
    // Bind IRT SM for the kind.
    dbState.current.evidenceModels[0].statisticalModels = [
      {
        id: "sm-irt",
        type: "irt",
        active: true,
        parameterSets: [{ parameterSetId: "ps-keep", parameters: {} }],
        activeParameterSetId: "ps-keep",
      },
    ];

    const result = runScheduledCalibrationEnqueue(dbState.current);
    expect(result.enqueued).toHaveLength(1);
    expect(result.enqueued[0].kind).toBe("irt-parameters");
    expect(dbState.current.evidenceModels[0].statisticalModels[0].activeParameterSetId).toBe(
      "ps-keep"
    );
    expect(dbState.current.calibrationJobs[0].ingestedParameterSetId).toBeNull();
  });
});
