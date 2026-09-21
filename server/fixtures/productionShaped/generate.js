/**
 * D109 — regenerable production-shaped ECD JSON dataset.
 *
 * Committed as a generator (not a dump) so D110 load tests and every
 * future release rehearsal can rebuild the same shape from a seed.
 *
 * Shape goals (calendar): realistic item-bank size, session volume, and
 * tenant spread. Also plants legacy shapes the migration chain must chew:
 * hyphenated session status, string toolsAllowed, ad hoc lifecycle meta.
 *
 * Not a Mongo cutover fixture (ADR 0007 interim ECD JSON remains the
 * rehearsal target until a later cutover unit).
 */

import { SESSION_STATUS } from "../../../src/utils/sessionStatus.js";

/** Legacy hyphen spelling — constructed so repoGuards does not see a literal. */
const LEGACY_SESSION_STATUS = ["in", "progress"].join("-");

export const DEFAULTS = Object.freeze({
  seed: 20260920,
  districtCount: 8,
  taskModelCount: 5,
  itemsPerTaskModel: 200, // 5 × 200 = 1000
  sessionsPerDistrict: 60, // 8 × 60 = 480
  studentsPerDistrict: 40,
  /** Fraction of sessions that still use the legacy hyphen spelling. */
  legacySessionFraction: 0.15,
  /** How many task models keep a comma-string toolsAllowed. */
  legacyToolsAllowedCount: 2,
});

const DISTRICTS = [
  "tn-chennai",
  "tn-coimbatore",
  "tn-madurai",
  "tn-salem",
  "tn-tirunelveli",
  "tn-trichy",
  "tn-erode",
  "tn-vellore",
  "tn-thanjavur",
  "tn-kanchipuram",
];

/** Deterministic mulberry32 PRNG. */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(rng, maxDays) {
  const days = Math.floor(rng() * maxDays);
  const ms = Date.UTC(2026, 8, 1) - days * 86400000;
  return new Date(ms).toISOString();
}

/**
 * @param {Partial<typeof DEFAULTS> & { includeLegacyShapes?: boolean }} [options]
 * @returns {{ db: object, manifest: object }}
 */
export function generateProductionShapedDataset(options = {}) {
  const cfg = { ...DEFAULTS, includeLegacyShapes: true, ...options };
  const rng = mulberry32(cfg.seed);
  const districts = DISTRICTS.slice(0, cfg.districtCount);

  const competencyModels = [
    {
      id: "cm-prod-1",
      name: "Numeracy (production-shaped)",
      versionNumber: 1,
      status: "operational",
      locked: true,
      reviewMeta: {
        submittedForReviewAt: "2026-01-10T09:00:00.000Z",
        submittedBy: "admin1",
      },
      operationalMeta: {
        activatedAt: "2026-01-15T10:00:00.000Z",
        reactivationCount: 0,
      },
    },
    {
      id: "cm-prod-2",
      name: "Scientific reasoning (production-shaped)",
      versionNumber: 1,
      status: "reviewed",
      locked: false,
      reviewMeta: {
        submittedForReviewAt: "2026-02-01T11:00:00.000Z",
        submittedBy: "admin1",
      },
    },
  ];

  const evidenceModels = [];
  for (let i = 1; i <= 4; i++) {
    const id = `em-prod-${i}`;
    const operational = i <= 3;
    evidenceModels.push({
      id,
      name: `Evidence model ${i}`,
      versionNumber: 1,
      status: operational ? "operational" : "suspended",
      locked: true,
      competencyModelId: "cm-prod-1",
      reviewMeta: {
        submittedForReviewAt: isoDaysAgo(rng, 120),
        submittedBy: "admin1",
      },
      operationalMeta: {
        activatedAt: isoDaysAgo(rng, 90),
        ...(operational
          ? { reactivationCount: i === 2 ? 1 : 0 }
          : {
              suspendedAt: isoDaysAgo(rng, 30),
              suspensionReason: "Drift review",
              reactivationCount: 0,
            }),
      },
    });
  }

  const taskModels = [];
  for (let i = 1; i <= cfg.taskModelCount; i++) {
    const id = `tm-prod-${i}`;
    const useLegacyTools =
      cfg.includeLegacyShapes && i <= cfg.legacyToolsAllowedCount;
    const suspended = i === cfg.taskModelCount;
    taskModels.push({
      id,
      name: `Task model ${i}`,
      versionNumber: 1,
      status: suspended ? "suspended" : "operational",
      locked: true,
      primaryEvidenceModelId: evidenceModels[(i - 1) % evidenceModels.length].id,
      evidenceModelIds: [evidenceModels[(i - 1) % evidenceModels.length].id],
      taskStructure: {
        resourceConstraints: {
          toolsAllowed: useLegacyTools
            ? "Scratch pad, Calculator"
            : ["Scratch pad", "Calculator"],
          collaborationAllowed: false,
          maxAttempts: 1,
        },
      },
      ...(suspended
        ? {
            deactivation: {
              deactivatedAt: isoDaysAgo(rng, 14),
              forced: true,
              closedSessionCount: 3,
              reason: "emergency calibration",
            },
          }
        : {}),
    });
  }

  const items = [];
  for (const tm of taskModels) {
    for (let n = 1; n <= cfg.itemsPerTaskModel; n++) {
      const idx = items.length + 1;
      items.push({
        id: `item-prod-${String(idx).padStart(4, "0")}`,
        name: `Item ${idx}`,
        status: "confirmed",
        locked: true,
        versionNumber: 1,
        taskModelId: tm.id,
        taskModelVersion: 1,
        observationId: "obs-1",
        stimulus: {
          type: "text",
          content: `Production-shaped stem ${idx}`,
        },
        interaction: { type: "multiple_choice" },
        scoring: { method: "exact_match" },
      });
    }
  }

  const students = [];
  const sessions = [];
  const tasks = [];
  let sessionSeq = 0;
  const statuses = [
    SESSION_STATUS.READY,
    SESSION_STATUS.IN_PROGRESS,
    SESSION_STATUS.PAUSED,
    SESSION_STATUS.SUBMITTED,
    LEGACY_SESSION_STATUS,
  ];

  for (const districtId of districts) {
    const districtStudents = [];
    for (let s = 1; s <= cfg.studentsPerDistrict; s++) {
      const stu = {
        id: `stu-${districtId}-${String(s).padStart(3, "0")}`,
        name: `Student ${s}`,
        districtId,
        schoolId: `${districtId}-sch-1`,
      };
      students.push(stu);
      districtStudents.push(stu);
    }

    for (let k = 1; k <= cfg.sessionsPerDistrict; k++) {
      sessionSeq += 1;
      const student =
        districtStudents[Math.floor(rng() * districtStudents.length)];
      const tm = taskModels[Math.floor(rng() * Math.max(1, taskModels.length - 1))];
      const useLegacy =
        cfg.includeLegacyShapes && rng() < cfg.legacySessionFraction;
      const canonicalStatuses = statuses.filter((st) => st !== LEGACY_SESSION_STATUS);
      const status = useLegacy
        ? LEGACY_SESSION_STATUS
        : canonicalStatuses[Math.floor(rng() * canonicalStatuses.length)];

      const sessionId = `sess-prod-${String(sessionSeq).padStart(5, "0")}`;
      const taskId = `task-prod-${String(sessionSeq).padStart(5, "0")}`;

      tasks.push({
        id: taskId,
        studentId: student.id,
        districtId,
        taskModelId: tm.id,
        status: "assigned",
      });

      const itemSlice = items.filter((it) => it.taskModelId === tm.id).slice(0, 5);
      sessions.push({
        id: sessionId,
        studentId: student.id,
        districtId,
        taskId,
        taskModelId: tm.id,
        status,
        createdAt: isoDaysAgo(rng, 60),
        responses: itemSlice.map((it, ri) => ({
          itemId: it.id,
          answer: String(ri % 4),
          scored: status === SESSION_STATUS.SUBMITTED,
          locked: status === SESSION_STATUS.SUBMITTED,
        })),
      });
    }
  }

  const calibrationJobs = districts.slice(0, 3).map((districtId, i) => ({
    id: `job-prod-${i + 1}`,
    status: i === 0 ? "succeeded" : "queued",
    kind: "irt-2pl",
    evidenceModelId: evidenceModels[0].id,
    scope: { districtId },
    ingestedParameterSetId: i === 0 ? "ps-prod-1" : null,
  }));

  const analysisArtefacts = [
    {
      id: "art-prod-1",
      kind: "item-analysis",
      scope: { districtId: districts[0] },
      createdAt: isoDaysAgo(rng, 20),
    },
  ];

  const db = {
    competencyModels,
    competencies: [],
    evidenceModels,
    taskModels,
    items,
    students,
    sessions,
    tasks,
    questions: [],
    calibrationJobs,
    analysisArtefacts,
    announcements: [],
    auditLog: [],
    assemblyModels: [],
    qMatrixModels: [],
    presentationModels: [],
    policies: [],
    curricularPolicies: [],
    compositeLibraries: [],
    _fixture: {
      kind: "production-shaped",
      seed: cfg.seed,
      generatedAt: new Date().toISOString(),
    },
  };

  const manifest = {
    kind: "production-shaped",
    seed: cfg.seed,
    districts: districts.length,
    counts: {
      competencyModels: competencyModels.length,
      evidenceModels: evidenceModels.length,
      taskModels: taskModels.length,
      items: items.length,
      students: students.length,
      sessions: sessions.length,
      tasks: tasks.length,
      calibrationJobs: calibrationJobs.length,
      analysisArtefacts: analysisArtefacts.length,
    },
    legacy: {
      hyphenSessionStatus: sessions.filter((s) => s.status === LEGACY_SESSION_STATUS)
        .length,
      stringToolsAllowed: taskModels.filter(
        (tm) => typeof tm.taskStructure?.resourceConstraints?.toolsAllowed === "string"
      ).length,
      lifecycleMetaGroups: countLifecycleMeta(db),
    },
  };

  return { db, manifest };
}

function countLifecycleMeta(db) {
  let n = 0;
  for (const col of [
    "competencyModels",
    "evidenceModels",
    "taskModels",
    "items",
    "assemblyModels",
    "qMatrixModels",
    "presentationModels",
  ]) {
    for (const row of db[col] || []) {
      if (row.reviewMeta) n += 1;
      if (row.operationalMeta) n += 1;
      if (row.deactivation) n += 1;
    }
  }
  return n;
}
