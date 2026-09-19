// src/test/mirrorDrift.test.js
// ------------------------------------------------------------
// The four "keep this in step by hand" mirrors this codebase documents,
// converted into tests that fail on drift instead of relying on a human
// noticing. Each pair below is two independently-written implementations
// of the same rule -- one authoritative (schema.js / lifecycleValidation.js
// / the server's calibrationGate), one a live/advisory client mirror -- and
// a rule added to one side and not the other has already caused a real bug
// here (schema.js rejecting a valid item the client believed was fine).
//
// These tests don't assert the two sides produce identical text (that's
// not the contract -- see each mirror's own header comment) -- they assert
// AGREEMENT: whenever the authoritative side flags a problem, the mirror
// flags the same one, and vice versa.
// ------------------------------------------------------------

import { describe, it, expect } from "vitest";

import { validateEntity } from "../utils/schema.js";
import { itemCompatibilityNotes, operationalReadiness } from "../components/itemBank/itemConstants.js";
import { evidenceCompatibilityNotes } from "../components/taskModels/taskModelConstants.js";
import { resolveCalibrationWindow } from "../components/evidences/calibration/engines/effectiveModel.js";
import { interactionTypesForObservable, deriveAllowedScoringMethods } from "../utils/ecdVocabulary.js";

import { validateItemLifecycle } from "../../server/utils/lifecycleValidation.js";
import { calibrationGate } from "../../server/routes/evidenceModels.js";

import { BLOOM_LEVELS as CANONICAL_BLOOM_LEVELS, REASONING_TYPES as CANONICAL_REASONING_TYPES } from "../utils/ecdVocabulary.js";
import { BLOOM_LEVELS as TASK_MODEL_BLOOM_LEVELS, REASONING_TYPES as TASK_MODEL_REASONING_TYPES } from "../components/taskModels/taskModelConstants.js";
import { BLOOM_LEVELS as ITEM_BLOOM_LEVELS, REASONING_TYPES as ITEM_REASONING_TYPES } from "../components/itemBank/itemConstants.js";
import { rolePermissions } from "../config/rolePermissions.js";
import { viewScopeForRole } from "../../server/utils/tenancy.js";

/* =====================================================
   Shared fixtures -- one valid baseline per entity, mutated per test.
===================================================== */

const observable = {
  id: "o1",
  statement: "Selects the correct equation",
  type: "selected_response",
  evidenceRule: { direction: "supports", strengthLevel: 4 },
};

function makeEvidenceModel(overrides = {}) {
  return {
    id: "em1",
    name: "EM One",
    status: "operational",
    locked: true,
    versionNumber: 1,
    competencyId: "c1",
    observables: [observable],
    statisticalModels: [{ id: "sm1", type: "irt", subtype: "2pl", active: true }],
    ...overrides,
  };
}

function makeTaskModel(overrides = {}) {
  return {
    id: "tm1",
    name: "TM One",
    status: "operational",
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em1"],
    primaryEvidenceModelId: "em1",
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
    ],
    taskStructure: { responseFormat: "selected", stimulusPolicy: "parameterized" },
    blueprintConstraints: {},
    ...overrides,
  };
}

function makeItem(overrides = {}) {
  return {
    id: "it1",
    taskModelId: "tm1",
    taskModelVersion: 1,
    observationId: "o1",
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    stimulus: { layout: "single", blocks: [{ id: "b1", type: "text", text: "…" }] },
    interaction: { type: "mcq", responseComponents: [{ id: "r1" }], config: {} },
    scoring: {
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        {
          responsePattern: { equalsCorrect: true },
          score: 1,
          activatesObservable: true,
          rationale: "The correct selection is the observable.",
        },
      ],
    },
    learningDomain: "cognitive",
    cognitiveDemand: { bloomLevel: "apply" },
    metadata: { subject: "Maths" },
    psychometrics: {
      statisticalModelType: "irt",
      calibrationStatus: "pilot",
      irtParams: { a: 1, b: 0 },
    },
    equivalenceGroupId: "grp1",
    exposureControl: {
      usageCount: 0,
      maxUsageBeforeRetire: 100,
      reactivationCount: 0,
      maxReactivations: 0,
    },
    ...overrides,
  };
}

function makeDB({ item, taskModel, evidenceModel } = {}) {
  return {
    items: item ? [item] : [],
    taskModels: [taskModel || makeTaskModel()],
    evidenceModels: [evidenceModel || makeEvidenceModel()],
    sessions: [],
    tasks: [],
  };
}

/* Builds the ctx object ItemWizardContext.jsx computes for
   itemCompatibilityNotes() -- same derivation, done here so the mirror is
   exercised exactly as the wizard exercises it. */
function contextFor(item, evidenceModel) {
  const obs = evidenceModel.observables.find((o) => o.id === item.observationId);
  const activeStatisticalModel = evidenceModel.statisticalModels.find((sm) => sm.active);
  return {
    observable: obs,
    activeStatisticalModel,
    allowedInteractionTypes: interactionTypesForObservable(obs?.type),
    allowedScoringMethods: deriveAllowedScoringMethods(activeStatisticalModel),
  };
}

/* =====================================================
   1. itemCompatibilityNotes() <-> schema.js's `items` block
===================================================== */
describe("mirror: itemCompatibilityNotes() <-> schema.js items block", () => {
  it("agree that an interaction incompatible with the observable is a problem", () => {
    const em = makeEvidenceModel();
    const item = makeItem({ interaction: { type: "numeric", responseComponents: [], config: {} } });
    const db = makeDB({ item, evidenceModel: em });

    const { errors } = validateEntity("items", item, db);
    const notes = itemCompatibilityNotes(item, contextFor(item, em));

    expect(errors.some((e) => /elicit|compatib/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking")).toBe(true);
  });

  it("agree that a non-activating rule on a 'supports'-only observable is a problem", () => {
    const em = makeEvidenceModel();
    const item = makeItem({
      scoring: {
        method: "dichotomous",
        maxScore: 1,
        evidenceActivationMap: [
          { responsePattern: { equalsCorrect: false }, score: 0, activatesObservable: false, rationale: "x" },
        ],
      },
    });
    const db = makeDB({ item, evidenceModel: em });

    const { errors } = validateEntity("items", item, db);
    const notes = itemCompatibilityNotes(item, contextFor(item, em));

    expect(errors.some((e) => /counter-evidence/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /counter-evidence/i.test(n.message))).toBe(true);
  });

  it("agree that IRT parameters on a non-IRT model are a problem", () => {
    const em = makeEvidenceModel({
      statisticalModels: [{ id: "sm1", type: "ctt", subtype: "classical", active: true }],
    });
    const item = makeItem({ psychometrics: { statisticalModelType: "ctt", irtParams: { a: 1, b: 0 } } });
    const db = makeDB({ item, evidenceModel: em });

    const { errors } = validateEntity("items", item, db);
    const notes = itemCompatibilityNotes(item, contextFor(item, em));

    expect(errors.some((e) => /IRT parameters are present/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /IRT parameters are present/i.test(n.message))).toBe(true);
  });

  it("agree that a declared statisticalModelType disagreeing with the active model is a problem", () => {
    const em = makeEvidenceModel(); // active model is "irt"
    const item = makeItem({ psychometrics: { statisticalModelType: "ctt", irtParams: { a: 1, b: 0 } } });
    const db = makeDB({ item, evidenceModel: em });

    const { errors } = validateEntity("items", item, db);
    const notes = itemCompatibilityNotes(item, contextFor(item, em));

    expect(errors.some((e) => /declares statistical model/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /disagrees with/i.test(n.message))).toBe(true);
  });

  // D53b: the DINA analogue of the "IRT parameters on a non-IRT model" pair
  // above -- dinaParams is the new field, so it gets the same mirror.
  it("agree that DINA pilot parameters on a non-DINA model are a problem", () => {
    const em = makeEvidenceModel({
      statisticalModels: [{ id: "sm1", type: "ctt", subtype: "classical", active: true }],
    });
    const item = makeItem({ psychometrics: { statisticalModelType: "ctt", dinaParams: { slip: 0.1, guess: 0.2 } } });
    const db = makeDB({ item, evidenceModel: em });

    const { errors } = validateEntity("items", item, db);
    const notes = itemCompatibilityNotes(item, contextFor(item, em));

    expect(errors.some((e) => /DINA pilot parameters are present/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /DINA pilot parameters are present/i.test(n.message))).toBe(true);
  });
});

/* =====================================================
   1b. schema.js strict (confirm-time) gate for psychometrics.dinaParams
   (D53b) -- the DINA analogue of the pre-existing implicit IRT gate
   ("An IRT-scored item must carry at least discrimination (a) and
   difficulty (b) before it can be confirmed"), reusing the same proven
   strict-valid fixture chain as section 1 above rather than a
   hand-assembled db that risks tripping an unrelated chain-integrity
   check (taskModelId, observationId-declared-on-Task-Model, etc.).
===================================================== */
describe("schema.js — DINA pilot parameter strict-confirm gate", () => {
  function dinaFixtures(dinaParams) {
    const em = makeEvidenceModel({
      statisticalModels: [{ id: "sm1", type: "dina", active: true, structureConfig: { qMatrixId: "qm1" } }],
    });
    const tm = makeTaskModel();
    const item = makeItem({
      psychometrics: { statisticalModelType: "dina", ...(dinaParams !== undefined ? { dinaParams } : {}) },
    });
    const db = makeDB({ item, taskModel: tm, evidenceModel: em });
    return { item, db };
  }

  it("refuses to confirm a dina item with no dinaParams at all", () => {
    const { item, db } = dinaFixtures(undefined);
    const { errors } = validateEntity("items", item, db); // strict defaults true
    expect(errors.some((e) => /must carry usable pilot slip\/guess parameters/i.test(e))).toBe(true);
  });

  it("refuses to confirm a dina item with an out-of-range or non-monotonic slip/guess pair", () => {
    const { item, db } = dinaFixtures({ slip: 0.6, guess: 0.5 }); // guess >= 1 - slip
    const { errors } = validateEntity("items", item, db);
    expect(errors.some((e) => /must carry usable pilot slip\/guess parameters/i.test(e))).toBe(true);
  });

  it("accepts a usable pilot slip/guess pair at confirm time", () => {
    const { item, db } = dinaFixtures({ slip: 0.1, guess: 0.2 });
    const { errors } = validateEntity("items", item, db);
    expect(errors.some((e) => /must carry usable pilot slip\/guess parameters/i.test(e))).toBe(false);
  });

  it("does not require dinaParams while merely drafting (strict: false)", () => {
    const { item, db } = dinaFixtures(undefined);
    const { errors } = validateEntity("items", item, db, { strict: false });
    expect(errors.some((e) => /must carry usable pilot slip\/guess parameters/i.test(e))).toBe(false);
  });
});

/* =====================================================
   2. operationalReadiness() <-> validateItemLifecycle()'s `operational` block
===================================================== */
describe("mirror: operationalReadiness() <-> validateItemLifecycle() operational block", () => {
  it("agree that a missing equivalenceGroupId blocks activation", () => {
    const em = makeEvidenceModel();
    const tm = makeTaskModel();
    const item = makeItem({ status: "operational", equivalenceGroupId: "" });
    const db = makeDB({ item, taskModel: tm, evidenceModel: em });

    const errors = validateItemLifecycle(item, db);
    const checks = operationalReadiness(item, { evidenceModel: em });

    expect(errors.some((e) => /equivalenceGroupId/i.test(e))).toBe(true);
    expect(checks.find((c) => c.id === "equivalenceGroup").ok).toBe(false);
  });

  it("agree that a missing exposure ceiling blocks activation", () => {
    const em = makeEvidenceModel();
    const tm = makeTaskModel();
    const item = makeItem({
      status: "operational",
      exposureControl: { usageCount: 0, maxUsageBeforeRetire: 0, reactivationCount: 0, maxReactivations: 0 },
    });
    const db = makeDB({ item, taskModel: tm, evidenceModel: em });

    const errors = validateItemLifecycle(item, db);
    const checks = operationalReadiness(item, { evidenceModel: em });

    expect(errors.some((e) => /maxUsageBeforeRetire/i.test(e))).toBe(true);
    expect(checks.find((c) => c.id === "exposureCeiling").ok).toBe(false);
  });

  it("agree that a non-operational Evidence Model blocks activation", () => {
    const em = makeEvidenceModel({ status: "suspended" });
    const tm = makeTaskModel();
    const item = makeItem({ status: "operational" });
    const db = makeDB({ item, taskModel: tm, evidenceModel: em });

    const errors = validateItemLifecycle(item, db);
    const checks = operationalReadiness(item, { evidenceModel: em });

    expect(errors.some((e) => /not operational/i.test(e))).toBe(true);
    expect(checks.find((c) => c.id === "evidenceLive").ok).toBe(false);
  });
});

/* =====================================================
   3. evidenceCompatibilityNotes() <-> schema.js's adaptive coherence layer
===================================================== */
describe("mirror: evidenceCompatibilityNotes() <-> schema.js adaptive coherence layer", () => {
  it("agree that IRT evidence needs a selected/hybrid response format", () => {
    const em = makeEvidenceModel();
    const tm = makeTaskModel({ taskStructure: { responseFormat: "constructed", stimulusPolicy: "parameterized" } });
    const db = makeDB({ taskModel: tm, evidenceModel: em });

    const { errors } = validateEntity("taskModels", tm, db, { strict: true });
    const notes = evidenceCompatibilityNotes(tm, [em]);

    expect(errors.some((e) => /selected or hybrid response format/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking")).toBe(true);
  });

  it("agree that IRT-adaptive tasks reject a fully static stimulus policy", () => {
    const em = makeEvidenceModel();
    const tm = makeTaskModel({ taskStructure: { responseFormat: "selected", stimulusPolicy: "static" } });
    const db = makeDB({ taskModel: tm, evidenceModel: em });

    const { errors } = validateEntity("taskModels", tm, db, { strict: true });
    const notes = evidenceCompatibilityNotes(tm, [em]);

    expect(errors.some((e) => /static/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /static/i.test(n.message))).toBe(true);
  });

  it("agree that Bayesian network evidence needs at least two observables", () => {
    const em = makeEvidenceModel({
      id: "em-bn",
      statisticalModels: [{ id: "sm1", type: "bayesian_network", active: true }],
    });
    const tm = makeTaskModel({
      evidenceModelIds: ["em-bn"],
      primaryEvidenceModelId: "em-bn",
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em-bn", required: true, weight: 1 }],
    });
    const db = makeDB({ taskModel: tm, evidenceModel: em });

    const { errors } = validateEntity("taskModels", tm, db, { strict: true });
    const notes = evidenceCompatibilityNotes(tm, [em]);

    expect(errors.some((e) => /Bayesian network evidence requires/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /Bayesian network evidence requires/i.test(n.message))).toBe(true);
  });

  it("agree that Classical Test Theory evidence needs at least two observables", () => {
    const em = makeEvidenceModel({
      id: "em-ctt",
      statisticalModels: [{ id: "sm1", type: "ctt", active: true }],
    });
    const tm = makeTaskModel({
      evidenceModelIds: ["em-ctt"],
      primaryEvidenceModelId: "em-ctt",
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em-ctt", required: true, weight: 1 }],
    });
    const db = makeDB({ taskModel: tm, evidenceModel: em });

    const { errors } = validateEntity("taskModels", tm, db, { strict: true });
    const notes = evidenceCompatibilityNotes(tm, [em]);

    expect(errors.some((e) => /Classical Test Theory evidence requires/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /Classical Test Theory evidence requires/i.test(n.message))).toBe(true);
  });

  it("agree that a threshold model needs differing observable weights", () => {
    const em = makeEvidenceModel({
      id: "em-th",
      observables: [observable, { ...observable, id: "o2" }],
      statisticalModels: [{ id: "sm1", type: "threshold", active: true }],
    });
    const tm = makeTaskModel({
      evidenceModelIds: ["em-th"],
      primaryEvidenceModelId: "em-th",
      expectedObservations: [
        { observationId: "o1", evidenceModelId: "em-th", required: true, weight: 0.5 },
        { observationId: "o2", evidenceModelId: "em-th", required: true, weight: 0.5 },
      ],
    });
    const db = makeDB({ taskModel: tm, evidenceModel: em });

    const { errors } = validateEntity("taskModels", tm, db, { strict: true });
    const notes = evidenceCompatibilityNotes(tm, [em]);

    expect(errors.some((e) => /Threshold model requires/i.test(e))).toBe(true);
    expect(notes.some((n) => n.severity === "blocking" && /Threshold model requires/i.test(n.message))).toBe(true);
  });
});

/* =====================================================
   4. resolveCalibrationWindow() (client) <-> calibrationGate() (server)
   -----------------------------------------------------
   Exhaustive over every status the lifecycle matrix declares, crossed
   with locked true/false -- the two must agree on OPEN vs BLOCKED for
   every combination, not just the ones someone thought to hand-test.
===================================================== */
describe("mirror: resolveCalibrationWindow() <-> calibrationGate()", () => {
  const STATUSES = ["draft", "reviewed", "confirmed", "operational", "suspended", "archived"];

  it.each(STATUSES.flatMap((status) => [
    { status, locked: true },
    { status, locked: false },
  ]))("agree on the calibration window for status=$status locked=$locked", ({ status, locked }) => {
    const model = { status, locked };

    const clientOpen = resolveCalibrationWindow(model).open;
    const serverOpen = calibrationGate(model, "Recalibration") === null;

    expect(clientOpen).toBe(serverOpen);
  });
});

/* =====================================================
   5. BLOOM_LEVELS / REASONING_TYPES -- one canonical source, two
      re-export hops
   -----------------------------------------------------
   Day 22 (vocabulary consolidation). Unlike the four pairs above, there is
   no authoritative-server-function-vs-advisory-client-mirror here to test
   for AGREEMENT -- schema.js just imports the same arrays taskModelConstants.js
   and itemConstants.js re-export, so the drift risk is simpler: "one list,
   reached two different ways, must actually BE the same list." This is
   exactly the failure mode that motivated the move -- an item used to carry
   its own 4-value REASONING_TYPES while the Task Model blueprint declared 7,
   three of which no item could ever record. Asserting reference equality
   (not just deep equality) proves the re-export chain hasn't quietly forked
   back into two copies.
===================================================== */
describe("mirror: BLOOM_LEVELS / REASONING_TYPES canonical source", () => {
  it("taskModelConstants.js re-exports the exact ecdVocabulary.js array", () => {
    expect(TASK_MODEL_BLOOM_LEVELS).toBe(CANONICAL_BLOOM_LEVELS);
    expect(TASK_MODEL_REASONING_TYPES).toBe(CANONICAL_REASONING_TYPES);
  });

  it("itemConstants.js re-exports the exact ecdVocabulary.js array", () => {
    expect(ITEM_BLOOM_LEVELS).toBe(CANONICAL_BLOOM_LEVELS);
    expect(ITEM_REASONING_TYPES).toBe(CANONICAL_REASONING_TYPES);
  });
});

/* =====================================================
   6. rolePermissions.restrictions.viewScope <-> viewScopeForRole (server)
   -----------------------------------------------------
   D98 / W20. Client UI scope and server ALS binding must stay in step.
   A change on one side without the other is the D13-class drift that
   left viewScope as UI-only until D96-D97. This is the sixth mirror.
===================================================== */
describe("mirror: rolePermissions.viewScope <-> viewScopeForRole (server)", () => {
  const ROLES = ["admin", "district", "teacher", "student"];

  it("agrees for every role (client undefined <-> server null)", () => {
    for (const role of ROLES) {
      const client = rolePermissions[role]?.restrictions?.viewScope ?? null;
      expect(viewScopeForRole(role)).toBe(client);
    }
  });

  it("covers exactly the roles rolePermissions declares", () => {
    expect(Object.keys(rolePermissions).sort()).toEqual([...ROLES].sort());
  });

  it("would fail the build if client scope drifted without the server table", () => {
    const driftedClient = {
      ...rolePermissions.district.restrictions,
      viewScope: "school",
    };
    const server = viewScopeForRole("district");
    expect(server).not.toBe(driftedClient.viewScope);
    expect(viewScopeForRole("district")).toBe(
      rolePermissions.district.restrictions.viewScope
    );
  });
});

