// server/routes/__tests__/day35Walkthrough.test.js
//
// Day 35 (Week 7, closing): "a multi-item session's posterior narrows (SEM
// decreases) in the expected direction as responses accumulate" -- run
// against REAL seed data, not synthetic unit-test fixtures, and through
// the REAL persistence layer (src/utils/db-server.js, unmocked -- every
// other sessionRoutes test in this directory mocks it), not a mocked one.
//
// "Real seed data" in THIS sandbox means samples/*.json -- there is no
// live running database here (DB_MODE defaults to "mongo", no .env/mongo
// container is present, and nothing seeds ECD content beyond user
// accounts; see server/compositeLibrary/__tests__/compileSeededTaskModels
// .test.js's header for the same finding on Day 25). samples/README.md's
// own worked example ("Grade 6 Fractions -- Equivalent Fractions") is the
// canonical fixture this project treats as its real content, with
// placeholders resolved exactly as the README instructs. This test reuses
// the SAME evidence model content (observables, warrants, evidenceRules)
// and the SAME calibrated 2PL parameters from
// samples/sample-calibration-irt-2pl.json (o1: a=1.42, b=0.38 -- real
// numbers from a simulated mirt MML-EM run, not a=1/b=0 defaults), plus
// Task Model row 1 ("Equivalent Fractions -- Bar Model Selection") and its
// matching item from samples/sample-items.json.
//
// One resolution choice worth naming: samples/sample-items.json's row 1
// uses `observationId: "obs_equivalent_fractions"`, which does not match
// any id in sample-evidence-model.json's observables[] (o1/o2/o3) -- an
// inconsistency between the two sample files, not a placeholder the
// README documents replacing. Resolved here to "o1", the same choice
// compileSeededTaskModels.test.js made for the Task Model layer's
// analogous placeholders, so the whole chain is internally consistent and
// actually validates.
//
// A genuinely distinct SMV/Competency Model declaration is added on top of
// the sample content, since Week 7's accumulation feature (and the
// smVariables it reads) postdates when these sample files were authored.

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-day35-"));
const scratchDbFile = path.join(scratchDir, "db.json");
process.env.ECD_DB_FILE = scratchDbFile;
process.env.ECD_BACKUP_DIR = path.join(scratchDir, "backups");

import { vi } from "vitest";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: "student-1", username: "student-1", role: "student" };
    next();
  },
  authorizeRole: () => (_req, _res, next) => next(),
}));

const express = (await import("express")).default;
const request = (await import("supertest")).default;
const { default: router } = await import("../sessionRoutes.js");

// ---------------------------------------------------------------------
// Fixture content, resolved from samples/*.json exactly as described in
// the module header above.
// ---------------------------------------------------------------------

const competencyModel = {
  id: "cm-grade6-fractions",
  name: "Grade 6 Numeracy - Fractions",
  measurementIntent: "unidimensional",
  status: "operational",
  versionNumber: 1,
  smVariables: [{
    id: "smv-numerical-reasoning",
    label: "Numerical Reasoning Ability",
    type: "continuous",
    priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
  }],
};

const competency = { id: "c-numerical-reasoning", modelId: "cm-grade6-fractions" };

// samples/sample-evidence-model.json's real content (warrants, observables,
// evidenceRules verbatim), with the calibrated 2PL parameters from
// samples/sample-calibration-irt-2pl.json committed as its active
// parameter set -- real numbers from a simulated mirt run, not defaults.
const evidenceModel = {
  id: "em-numerical-reasoning",
  name: "Numerical Reasoning Evidence Model",
  competencyId: "c-numerical-reasoning",
  competencyModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observables: [
    { id: "o1", statement: "The learner computes the correct final numeric answer to a multi-step arithmetic word problem within the given constraints.", type: "numeric_response", warrantId: "w1" },
    { id: "o2", statement: "The learner shows correct sequential working steps culminating in the right order of operations.", type: "constructed_response", warrantId: "w1" },
    { id: "o3", statement: "The learner selects the proportional relationship that correctly represents the quantities described in the problem.", type: "selected_response", warrantId: "w2" },
  ],
  evidenceRules: [
    { id: "er_o1", observableId: "o1", direction: "supports", strengthLevel: 4, activationCondition: "Final numeric answer matches the expected value within rounding tolerance.", justification: "Direct evidence." },
    { id: "er_o2", observableId: "o2", direction: "supports", strengthLevel: 3, activationCondition: "Steps in correct order.", justification: "Converging process evidence." },
    { id: "er_o3", observableId: "o3", direction: "supports", strengthLevel: 3, activationCondition: "Correct option selected.", justification: "Ratio recognition." },
  ],
  statisticalModels: [{
    id: "sm1",
    type: "irt",
    active: true,
    structureConfig: { observableIds: ["o1", "o2", "o3"], dimensions: 1, smvId: "smv-numerical-reasoning" },
    parameterSets: [{
      parameterSetId: "ps-2026-06-18",
      // samples/sample-calibration-irt-2pl.json, verbatim a/b values.
      parameters: {
        o1: { a: 1.42, b: 0.38, c: 0 },
        o2: { a: 1.08, b: -0.12, c: 0 },
        o3: { a: 0.86, b: -0.74, c: 0 },
      },
      packageVersion: "mirt-1.42",
      converged: true,
      sampleSize: 4821,
      calibratedAt: "2026-06-18T00:00:00.000Z",
      calibrationMethod: "R mirt 2PL marginal maximum likelihood (MML-EM)",
    }],
    activeParameterSetId: "ps-2026-06-18",
  }],
};

// samples/sample-task-models.json row 1, "Equivalent Fractions -- Bar
// Model Selection" -- the minimal confirmable task, one observable at
// full weight. `<EVIDENCE_MODEL_ID>` -> em-numerical-reasoning,
// `<OBSERVABLE_ID_1>` -> o1 (both per the README's own resolution table).
const taskModel = {
  id: "tm-equivalent-fractions",
  name: "Equivalent Fractions — Bar Model Selection",
  status: "operational",
  versionNumber: 1,
  evidenceModelIds: ["em-numerical-reasoning"],
  primaryEvidenceModelId: "em-numerical-reasoning",
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em-numerical-reasoning", required: true, weight: 1 },
  ],
};

// samples/sample-items.json row 1, "Which fraction is equivalent to 2/4?"
// -- verbatim stimulus/interaction/scoring, observationId resolved to
// "o1" (see module header).
const item = {
  id: "item-equivalent-fractions",
  taskModelId: "tm-equivalent-fractions",
  taskModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observationId: "o1",
  evidenceModelId: "em-numerical-reasoning",
  evidenceModelVersion: 1,
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Which fraction is equivalent to 2/4?" }] },
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "opt_a", label: "1/2" },
      { id: "opt_b", label: "3/8" },
      { id: "opt_c", label: "2/3" },
      { id: "opt_d", label: "5/6" },
    ],
  },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Selecting 1/2 demonstrates recognition that 2/4 and 1/2 represent the same value." },
      { responsePattern: { selected: ["opt_b", "opt_c", "opt_d"] }, activatesObservable: false, rationale: "Distractors reflect common non-equivalence errors." },
    ],
  },
  exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500, maxReactivations: 2, reactivationCount: 0 },
};

// Five task instances, all against the same Task Model/item -- standing in
// for "five parallel-form items calibrated the same way", which exercises
// the exact same accumulation arithmetic a genuinely distinct five-item
// pool would, without authoring four more items whose content would add
// nothing this walkthrough needs to prove.
function makeTasks() {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `t${i + 1}`,
    taskModelId: "tm-equivalent-fractions",
    generatedObservationIds: [],
    generatedEvidenceIds: [],
  }));
}

function seedDb() {
  return seedActivePackages({
    sessions: [{
      id: "s-walkthrough",
      studentId: "student-1",
      taskIds: makeTasks().map((t) => t.id),
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "fixed",
      status: "in_progress",
      isCompleted: false,
    }],
    tasks: makeTasks(),
    taskModels: [taskModel],
    evidenceModels: [evidenceModel],
    competencies: [competency],
    competencyModels: [competencyModel],
    items: [item],
    students: [],
    questions: [],
  });
}

let app;

beforeAll(() => {
  fs.writeFileSync(scratchDbFile, JSON.stringify(seedDb(), null, 2));
  app = express();
  app.use(express.json());
  app.use("/api/sessions", router);
});

afterAll(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

describe("Day 35 walkthrough — a real multi-item session against real seed data", () => {
  it("scores every response through the real Evidence Model and Evidence Accumulation, narrowing the posterior as it goes", async () => {
    const precisions = [];
    const estimates = [];

    for (const taskId of ["t1", "t2", "t3", "t4", "t5"]) {
      const res = await request(app)
        .post("/api/sessions/s-walkthrough/submit")
        .send({ taskId, itemId: "item-equivalent-fractions", rawAnswer: "opt_a" }); // always correct

      expect(res.status).toBe(200);
      expect(res.body.responses.at(-1).activated).toBe(true);
      expect(res.body.responses.at(-1)).not.toHaveProperty("accumulationNote");

      const posterior = res.body.studentModel.smvPosteriors["smv-numerical-reasoning"];
      expect(posterior).toBeTruthy();
      expect(posterior.responsesUsed).toBe(precisions.length + 1);

      precisions.push(posterior.precision);
      estimates.push(posterior.estimate);
    }

    // The D35 exit check, verbatim: SEM decreases in the expected
    // direction as responses accumulate.
    for (let i = 1; i < precisions.length; i += 1) {
      expect(precisions[i]).toBeLessThan(precisions[i - 1]);
    }

    // And the estimate should rise with five straight correct answers to
    // an item of real (positive) difficulty (b = 0.38), moving away from
    // the prior mean of 0 in the expected direction.
    expect(estimates.at(-1)).toBeGreaterThan(estimates[0]);
    expect(estimates.at(-1)).toBeGreaterThan(0);

    // Confirms this ran the REAL calibrated parameters, not a = 1/b = 0
    // defaults: five responses to a b = 0.38 item should settle noticeably
    // off zero, not at some arbitrary small number.
    expect(estimates.at(-1)).toBeGreaterThan(0.3);
  });

  it("persisted the final posterior to the real, unmocked db.json file on disk", () => {
    const onDisk = JSON.parse(fs.readFileSync(scratchDbFile, "utf8"));
    const session = onDisk.sessions.find((s) => s.id === "s-walkthrough");
    const posterior = session.studentModel.smvPosteriors["smv-numerical-reasoning"];

    expect(posterior.responsesUsed).toBe(5);
    expect(posterior.parameterSetId).toBe("ps-2026-06-18");
    expect(posterior.modelFamily).toBe("irt");
    expect(Number.isFinite(posterior.estimate)).toBe(true);
    expect(Number.isFinite(posterior.precision)).toBe(true);
  });
});
