// server/routes/__tests__/day38Walkthrough.test.js
//
// Day 38 (Week 8): "End-to-end accumulation on pilot parameters" (build
// reference row 38). Exit check, verbatim: "Every seeded Task Model whose
// Evidence Model has a measurement model can accumulate evidence and
// persist a posterior using pilot parameters, no manual patching."
//
// Before Day 38, sessionRoutes.js's /submit refused to deliver ANY item
// whose Evidence Model had no active CALIBRATED parameter set -- which made
// the build reference's own dependency chain (Part 0.2) circular: R
// calibration needs a real item-level response matrix, that matrix needs
// items to be deliverable, and items could not be delivered until
// calibration had already happened. This walkthrough proves the fix against
// the SAME "real seed content" convention day35Walkthrough.test.js
// established (samples/*.json's Grade 6 Fractions worked example, run
// through the real, unmocked persistence layer, not synthetic unit-test
// fixtures) -- reusing that file's competency model, evidence model
// observables/warrants/evidenceRules, Task Model and item content
// wholesale, but with every calibrated parameterSet stripped out, so the
// only path an item can score through is the one Day 38 added.
//
// Three families, matching the plan's own "continuous, aggregate, DINA"
// scope for this day:
//   1. CONTINUOUS (irt): scores against the item's pilot
//      `psychometrics.irtParams` (Item Wizard Step 7) -- the day35 fixture,
//      recalibrated to pilot values instead of a real mirt fit.
//   2. AGGREGATE (sum, a RAW_SCORE family): never needed a calibrated
//      parameter set to begin with (`accumulateRawScoreFamily` reads only
//      Task Model weights) -- confirms it now delivers with NO parameter
//      set at all, tagged "not-applicable".
//   3. DINA: confirms the HONEST gap this day deliberately did not paper
//      over -- there is no item-level pilot slip/guess field the way IRT
//      has `irtParams`, so a DINA item with no calibrated parameter set is
//      still refused, with a message naming exactly why, rather than a
//      fabricated number. "No manual patching" cuts both ways: nothing here
//      invents a pilot DINA parameter that the schema does not declare.

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-day38-"));
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
// Family 1: CONTINUOUS (irt), pilot parameters.
//
// Identical to day35Walkthrough.test.js's fixture -- same competency
// model, same evidence model content (observables/warrants/evidenceRules),
// same Task Model and item -- EXCEPT the statistical model's
// parameterSets[] is empty (no calibration has happened yet, the ordinary
// state Day 38 is about) and the item now carries pilot
// `psychometrics.irtParams` the way the Item Wizard's Step 7 would author
// them for a brand-new item.
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

const evidenceModel = {
  id: "em-numerical-reasoning",
  name: "Numerical Reasoning Evidence Model",
  competencyId: "c-numerical-reasoning",
  competencyModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observables: [
    { id: "o1", statement: "The learner computes the correct final numeric answer to a multi-step arithmetic word problem within the given constraints.", type: "numeric_response", warrantId: "w1" },
  ],
  evidenceRules: [
    { id: "er_o1", observableId: "o1", direction: "supports", strengthLevel: 4, activationCondition: "Final numeric answer matches the expected value within rounding tolerance.", justification: "Direct evidence." },
  ],
  statisticalModels: [{
    id: "sm1",
    type: "irt",
    active: true,
    structureConfig: { observableIds: ["o1"], dimensions: 1, smvId: "smv-numerical-reasoning" },
    // Day 38: deliberately EMPTY -- no calibration run has happened yet.
    parameterSets: [],
  }],
};

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

// Pilot a/b values (Item Wizard Step 7) -- an author's best guess, not a
// calibration run: a > 0 and b finite is all itemParametersAreUsable()
// requires.
const item = {
  id: "item-equivalent-fractions",
  taskModelId: "tm-equivalent-fractions",
  taskModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observationId: "o1",
  evidenceModelId: "em-numerical-reasoning",
  evidenceModelVersion: 1,
  psychometrics: {
    statisticalModelType: "irt",
    irtParams: { a: 1.2, b: 0.4 },
    calibrationStatus: "pilot",
  },
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Which fraction is equivalent to 2/4?" }] },
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "opt_a", label: "1/2" },
      { id: "opt_b", label: "3/8" },
    ],
  },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Selecting 1/2 demonstrates recognition that 2/4 and 1/2 represent the same value." },
      { responsePattern: { selected: ["opt_b"] }, activatesObservable: false, rationale: "Distractor." },
    ],
  },
  exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500, maxReactivations: 2, reactivationCount: 0 },
};

function makeTasks(taskModelId, n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t-${taskModelId}-${i + 1}`,
    taskModelId,
    generatedObservationIds: [],
    generatedEvidenceIds: [],
  }));
}

const continuousTasks = makeTasks("tm-equivalent-fractions", 5);

// ---------------------------------------------------------------------
// Family 2: AGGREGATE (sum, a RAW_SCORE family) -- never reads a parameter
// set at all; Task Model weights carry the whole model.
// ---------------------------------------------------------------------

const sumCompetencyModel = {
  id: "cm-grade6-vocab",
  name: "Grade 6 Vocabulary",
  measurementIntent: "unidimensional",
  status: "operational",
  versionNumber: 1,
  smVariables: [{
    id: "smv-vocab-total",
    label: "Vocabulary Total",
    type: "continuous",
    priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
  }],
};

const sumCompetency = { id: "c-vocab-total", modelId: "cm-grade6-vocab" };

const sumEvidenceModel = {
  id: "em-vocab-total",
  name: "Vocabulary Total Evidence Model",
  competencyId: "c-vocab-total",
  competencyModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observables: [
    { id: "ov1", statement: "The learner selects the correct word meaning.", type: "selected_response", warrantId: "w1" },
  ],
  evidenceRules: [
    { id: "er_ov1", observableId: "ov1", direction: "supports", strengthLevel: 3, activationCondition: "Correct option selected.", justification: "Direct evidence." },
  ],
  statisticalModels: [{
    id: "sm-sum",
    type: "sum",
    active: true,
    structureConfig: { smvId: "smv-vocab-total" },
    // No parameter set here either -- and, unlike IRT, one was never
    // needed: a raw/sum score has no item response function to calibrate.
    parameterSets: [],
  }],
};

const sumTaskModel = {
  id: "tm-vocab",
  name: "Vocabulary Check",
  status: "operational",
  versionNumber: 1,
  evidenceModelIds: ["em-vocab-total"],
  primaryEvidenceModelId: "em-vocab-total",
  expectedObservations: [
    { observationId: "ov1", evidenceModelId: "em-vocab-total", required: true, weight: 1 },
  ],
};

const sumItem = {
  id: "item-vocab-1",
  taskModelId: "tm-vocab",
  taskModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observationId: "ov1",
  evidenceModelId: "em-vocab-total",
  evidenceModelVersion: 1,
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Which word means 'happy'?" }] },
  interaction: {
    type: "mcq",
    responseComponents: [{ id: "opt_a", label: "Joyful" }, { id: "opt_b", label: "Sad" }],
  },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 3, rationale: "Correct synonym." },
      { responsePattern: { selected: ["opt_b"] }, activatesObservable: false, rationale: "Distractor." },
    ],
  },
  exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500, maxReactivations: 2, reactivationCount: 0 },
};

const sumTasks = makeTasks("tm-vocab", 3);

// ---------------------------------------------------------------------
// Family 3: DINA -- was the honest gap; D53b gave 'dina' an item-level
// pilot field (psychometrics.dinaParams). This fixture deliberately seeds
// the item WITHOUT one, so the refusal below is now "no usable pilot
// parameters", not "no pilot path at all" -- the still-real gap is
// 'gdina', which has no pilot field (see attributeAccumulation.test.js /
// sessionRoutes.test.js for dedicated coverage of both the dina pilot
// SUCCESS path and the gdina refusal).
// ---------------------------------------------------------------------

const dinaCompetencyModel = {
  id: "cm-grade6-diagnostic",
  name: "Grade 6 Diagnostic Attributes",
  measurementIntent: "multidimensional",
  status: "operational",
  versionNumber: 1,
  smVariables: [{
    id: "smv-attr-a",
    label: "Attribute A Mastery",
    type: "binary",
    priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
  }],
};

const dinaCompetency = { id: "c-diagnostic", modelId: "cm-grade6-diagnostic" };

const dinaEvidenceModel = {
  id: "em-diagnostic",
  name: "Diagnostic Attribute Evidence Model",
  competencyId: "c-diagnostic",
  competencyModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observables: [
    { id: "od1", statement: "The learner applies Attribute A correctly.", type: "selected_response", warrantId: "w1" },
  ],
  evidenceRules: [
    { id: "er_od1", observableId: "od1", direction: "supports", strengthLevel: 3, activationCondition: "Correct option selected.", justification: "Direct evidence." },
  ],
  statisticalModels: [{
    id: "sm-dina",
    type: "dina",
    active: true,
    structureConfig: { qMatrixId: "qm-diagnostic" },
    parameterSets: [], // no calibration yet; this item also carries no psychometrics.dinaParams, so the pilot fallback has nothing to use either
  }],
};

const dinaTaskModel = {
  id: "tm-diagnostic",
  name: "Diagnostic Check",
  status: "operational",
  versionNumber: 1,
  evidenceModelIds: ["em-diagnostic"],
  primaryEvidenceModelId: "em-diagnostic",
  expectedObservations: [
    { observationId: "od1", evidenceModelId: "em-diagnostic", required: true, weight: 1 },
  ],
};

const dinaItem = {
  id: "item-diagnostic-1",
  taskModelId: "tm-diagnostic",
  taskModelVersion: 1,
  versionNumber: 1,
  status: "operational",
  observationId: "od1",
  evidenceModelId: "em-diagnostic",
  evidenceModelVersion: 1,
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Diagnostic item." }] },
  interaction: {
    type: "mcq",
    responseComponents: [{ id: "opt_a", label: "Correct" }, { id: "opt_b", label: "Incorrect" }],
  },
  scoring: {
    method: "dichotomous",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 3, rationale: "Correct." },
      { responsePattern: { selected: ["opt_b"] }, activatesObservable: false, rationale: "Incorrect." },
    ],
  },
  exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500, maxReactivations: 2, reactivationCount: 0 },
};

const dinaTasks = makeTasks("tm-diagnostic", 1);

function seedDb() {
  return seedActivePackages({
    sessions: [{
      id: "s-walkthrough",
      studentId: "student-1",
      taskIds: [
        ...continuousTasks.map((t) => t.id),
        ...sumTasks.map((t) => t.id),
        ...dinaTasks.map((t) => t.id),
      ],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "fixed",
      status: "in_progress",
      isCompleted: false,
    }],
    tasks: [...continuousTasks, ...sumTasks, ...dinaTasks],
    taskModels: [taskModel, sumTaskModel, dinaTaskModel],
    evidenceModels: [evidenceModel, sumEvidenceModel, dinaEvidenceModel],
    competencies: [competency, sumCompetency, dinaCompetency],
    competencyModels: [competencyModel, sumCompetencyModel, dinaCompetencyModel],
    items: [item, sumItem, dinaItem],
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

describe("Day 38 walkthrough — end-to-end accumulation on pilot parameters, real seed content", () => {
  it("CONTINUOUS: scores every response against pilot IRT parameters, no calibrated set, narrowing the posterior", async () => {
    const precisions = [];

    for (const task of continuousTasks) {
      const res = await request(app)
        .post("/api/sessions/s-walkthrough/submit")
        .send({ taskId: task.id, itemId: "item-equivalent-fractions", rawAnswer: "opt_a" });

      expect(res.status).toBe(200);
      const response = res.body.responses.at(-1);
      expect(response.parameterSource).toBe("pilot");
      expect(response.parameterSetId).toBeFalsy();
      expect(response.activated).toBe(true);

      const posterior = res.body.studentModel.smvPosteriors["smv-numerical-reasoning"];
      expect(posterior).toBeTruthy();
      expect(posterior.parameterSource).toBe("pilot");
      expect(posterior.parameterSetId).toBeFalsy();

      precisions.push(posterior.precision);
    }

    for (let i = 1; i < precisions.length; i += 1) {
      expect(precisions[i]).toBeLessThan(precisions[i - 1]);
    }
  });

  it("AGGREGATE (sum): delivers and accumulates with no parameter set at all", async () => {
    for (const task of sumTasks) {
      const res = await request(app)
        .post("/api/sessions/s-walkthrough/submit")
        .send({ taskId: task.id, itemId: "item-vocab-1", rawAnswer: "opt_a" });

      expect(res.status).toBe(200);
      const response = res.body.responses.at(-1);
      expect(response.parameterSource).toBe("not-applicable");
      expect(response.parameterSetId).toBeFalsy();
    }

    // Re-fetch the session directly for the persisted posterior, since the
    // loop above already consumed every sum task.
    const sessionRes = await request(app).get("/api/sessions/s-walkthrough");
    const posterior = sessionRes.body.studentModel.smvPosteriors["smv-vocab-total"];
    expect(posterior).toBeTruthy();
    expect(posterior.parameterSource).toBe("not-applicable");
    expect(posterior.parameterSetId).toBeFalsy();
    expect(posterior.responsesUsed).toBe(3);
    expect(posterior.estimate).toBe(1); // three straight correct, unweighted
  });

  it("DINA: still honestly refused when the item carries no pilot slip/guess either -- D53b gave 'dina' a pilot fallback (psychometrics.dinaParams), but this item was seeded without one, so no calibrated set STILL means no delivery", async () => {
    const res = await request(app)
      .post("/api/sessions/s-walkthrough/submit")
      .send({ taskId: dinaTasks[0].id, itemId: "item-diagnostic-1", rawAnswer: "opt_a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no active calibrated parameter set/);
    expect(res.body.error).toMatch(/no usable pilot DINA parameters/);
  });

  it("persisted every supported posterior to the real, unmocked db.json file on disk -- no manual patching", () => {
    const onDisk = JSON.parse(fs.readFileSync(scratchDbFile, "utf8"));
    const session = onDisk.sessions.find((s) => s.id === "s-walkthrough");

    const continuous = session.studentModel.smvPosteriors["smv-numerical-reasoning"];
    expect(Number.isFinite(continuous.estimate)).toBe(true);
    expect(continuous.parameterSource).toBe("pilot");

    const aggregate = session.studentModel.smvPosteriors["smv-vocab-total"];
    expect(Number.isFinite(aggregate.estimate)).toBe(true);
    expect(aggregate.parameterSource).toBe("not-applicable");

    // DINA never scored, so it correctly never appears.
    expect(session.studentModel.smvPosteriors["smv-attr-a"]).toBeUndefined();
  });
});
