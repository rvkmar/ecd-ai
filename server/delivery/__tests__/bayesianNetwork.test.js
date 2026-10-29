// F24: exact discrete Bayesian network accumulation.
//
// The two-state and three-state updates below are hand-checked. A wrong
// but internally consistent implementation should fail these numbers.

import { describe, it, expect } from "vitest";
import {
  accumulateEvidence,
  applyPosteriorsToSession,
  refreshBayesianNetworkPosteriors,
} from "../evidenceAccumulation.js";
import { selectNextActivity } from "../activitySelection.js";
import { chooseSubmitParameterBinding } from "../parameterSourceResolution.js";
import {
  __testing__,
  bayesianNetworkAuthoringErrors,
  bayesianObservableError,
  expectedInformationGain,
} from "../bayesianNetwork.js";

const { MAX_BN_STATES, MAX_BN_JOINT_CONFIGS, discreteEntropy, updateDiscretePosterior, updateJointPosterior } = __testing__;
import { seedSessionStudentModel } from "../../../src/utils/studentModelRecord.js";
import { validateEntity } from "../../../src/utils/schema.js";

const STATES = ["not_mastered", "mastered"];

function binarySmv(overrides = {}) {
  return {
    id: "smv1",
    type: "binary",
    scale: { states: STATES },
    priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
    ...overrides,
  };
}

function pilotParams(cpt, prior = { not_mastered: 0.5, mastered: 0.5 }) {
  const pinned = { _kind: "bayesian-cpt", _prior: prior, _smvId: "smv1", _states: STATES };
  for (const [observableId, levels] of Object.entries(cpt)) {
    pinned[observableId] = { levels };
  }
  return pinned;
}

function bnDb({ smv = binarySmv(), cpt, prior, parameterSets = null, activeParameterSetId = null } = {}) {
  const structureConfig = {
    latentNodes: ["smv1"],
    smvId: "smv1",
    observableIds: Object.keys(cpt || { o1: { not_mastered: 0.2, mastered: 0.8 } }),
    edges: Object.keys(cpt || { o1: {} }).map((observableId) => ({ from: "smv1", to: observableId })),
    cpt: Object.fromEntries(
      Object.entries(cpt || { o1: { not_mastered: 0.2, mastered: 0.8 } }).map(([id, levels]) => [id, { levels }])
    ),
    ...(prior ? { prior } : {}),
  };
  return {
    competencyModels: [{ id: "cm1", versionNumber: 1, smVariables: [smv] }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [{
      id: "em1",
      competencyId: "c1",
      versionNumber: 1,
      status: "draft",
      observables: structureConfig.observableIds.map((id) => ({ id })),
      statisticalModels: [{
        id: "sm1",
        type: "bayesian_network",
        active: true,
        structureConfig,
        parameterSets: parameterSets || [],
        activeParameterSetId,
      }],
    }],
    items: [],
    tasks: [],
    taskModels: [],
    compositeLibrary: [],
  };
}

function response(overrides = {}) {
  return {
    taskId: "t1",
    itemId: "item1",
    evidenceModelId: "em1",
    observationId: "o1",
    observableId: "o1",
    activated: true,
    direction: "supports",
    parameterSource: "pilot",
    parameterSetId: null,
    pilotParams: pilotParams({ o1: { not_mastered: 0.2, mastered: 0.8 } }),
    ...overrides,
  };
}

describe("exact Bayes on a hand-checked network", () => {
  it("updates a fair binary prior with one observation", () => {
    const posterior = updateDiscretePosterior(
      { not_mastered: 0.5, mastered: 0.5 },
      [{ observableId: "o1", u: 1 }],
      { o1: { not_mastered: 0.2, mastered: 0.8 } }
    );
    expect(posterior.mastered).toBeCloseTo(0.8, 12);
    expect(posterior.not_mastered).toBeCloseTo(0.2, 12);
  });

  it("updates a second observable in the opposite direction", () => {
    const afterFirst = updateDiscretePosterior(
      { not_mastered: 0.5, mastered: 0.5 },
      [{ observableId: "o1", u: 1 }],
      { o1: { not_mastered: 0.2, mastered: 0.8 } }
    );
    const posterior = updateDiscretePosterior(
      afterFirst,
      [{ observableId: "o2", u: 0 }],
      {
        o1: { not_mastered: 0.2, mastered: 0.8 },
        o2: { not_mastered: 0.3, mastered: 0.9 },
      }
    );
    expect(posterior.mastered).toBeCloseTo(4 / 11, 12);
    expect(posterior.not_mastered).toBeCloseTo(7 / 11, 12);
  });

  it("updates three states without collapsing them to a binary", () => {
    const posterior = updateDiscretePosterior(
      { low: 0.2, mid: 0.5, high: 0.3 },
      [{ observableId: "o1", u: 1 }],
      { o1: { low: 0.1, mid: 0.5, high: 0.9 } }
    );
    expect(posterior.low).toBeCloseTo(1 / 27, 12);
    expect(posterior.mid).toBeCloseTo(25 / 54, 12);
    expect(posterior.high).toBeCloseTo(0.5, 12);
  });

  it("rules out a state whose likelihood is zero, and refuses when every state is impossible", () => {
    const ruledOut = updateDiscretePosterior(
      { not_mastered: 0.5, mastered: 0.5 },
      [{ observableId: "o1", u: 1 }],
      { o1: { not_mastered: 0, mastered: 1 } }
    );
    expect(ruledOut.mastered).toBe(1);
    expect(ruledOut.not_mastered).toBe(0);
    expect(updateDiscretePosterior(
      { not_mastered: 0.5, mastered: 0.5 },
      [{ observableId: "o1", u: 1 }],
      { o1: { not_mastered: 0, mastered: 0 } }
    )).toBeNull();
  });

  it("computes expected information gain from P(u), not from a flat 0.5 weight", () => {
    const prior = { not_mastered: 0.5, mastered: 0.5 };
    const row = { not_mastered: 0.2, mastered: 0.8 };
    const gain = expectedInformationGain(prior, row);
    expect(discreteEntropy({ mastered: 0.8, not_mastered: 0.2 })).toBeCloseTo(0.7219280948873623, 12);
    expect(gain).toBeCloseTo(0.2780719051126377, 12);
    const skewed = { not_mastered: 0.2, mastered: 0.8 };
    const weighted = expectedInformationGain(skewed, row);
    const flat = discreteEntropy(skewed) - discreteEntropy(updateDiscretePosterior(skewed, [{ observableId: "o1", u: 1 }], { o1: row }));
    expect(weighted).not.toBeCloseTo(flat, 3);
  });

  it("updates a two-latent tree and leaves the child's marginal mixed", () => {
    const latents = [
      { id: "smv1", states: STATES },
      { id: "smv2", states: STATES },
    ];
    const parentOf = { smv2: "smv1", o1: "smv1" };
    const rootPriors = { smv1: { not_mastered: 0.5, mastered: 0.5 } };
    const childCpts = {
      smv2: {
        not_mastered: { not_mastered: 0.8, mastered: 0.2 },
        mastered: { not_mastered: 0.2, mastered: 0.8 },
      },
    };
    const observableCpt = { o1: { not_mastered: 0.2, mastered: 0.8 } };
    const marginals = updateJointPosterior({
      latents,
      parentOf,
      rootPriors,
      childCpts,
      observations: [{ observableId: "o1", u: 1 }],
      observableCpt,
    });
    expect(marginals.smv1.mastered).toBeCloseTo(0.8, 12);
    expect(marginals.smv1.not_mastered).toBeCloseTo(0.2, 12);
    expect(marginals.smv2.mastered).toBeCloseTo(0.68, 12);
    expect(marginals.smv2.not_mastered).toBeCloseTo(0.32, 12);
  });
});

describe("accumulateEvidence writes the Bayesian network posterior", () => {
  it("stores bnPosteriors as a number and the distribution on the student model variable", () => {
    const db = bnDb({ cpt: { o1: { not_mastered: 0.2, mastered: 0.8 } } });
    const session = { id: "s1", status: "in_progress", responses: [response()] };
    const accumulation = accumulateEvidence(session, db);
    expect(accumulation.posteriors[0]).toMatchObject({
      supported: true,
      smvId: "smv1",
      modelFamily: "bayesian_network",
      method: "exact-bayes",
      parameterSource: "pilot",
      parameterSetId: null,
      priorSource: "pilot",
      positiveState: "mastered",
    });
    expect(accumulation.posteriors[0].estimate).toBeCloseTo(0.8, 12);
    expect(accumulation.posteriors[0].precision).toBeCloseTo(Math.sqrt(0.8 * 0.2), 12);

    applyPosteriorsToSession(session, accumulation, { now: "2026-10-27T00:00:00.000Z" });
    expect(session.studentModel.bnPosteriors.smv1).toBeCloseTo(0.8, 12);
    expect(session.studentModel.smvPosteriors.smv1.distribution.mastered).toBeCloseTo(0.8, 12);
    expect(validateEntity("sessions", { ...session, status: "ready", responses: [] }, db).valid).toBe(true);
  });

  it("refuses a continuous student model variable instead of scoring it", () => {
    const db = bnDb({
      smv: {
        id: "smv1",
        type: "continuous",
        scale: { min: -4, max: 4 },
        priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
      },
    });
    const { posteriors } = accumulateEvidence({ id: "s1", responses: [response()] }, db);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/continuous/);
    expect(posteriors[0]).not.toHaveProperty("estimate");
  });

  it("refuses a network with more states than the exact-inference limit", () => {
    const states = Array.from({ length: MAX_BN_STATES + 1 }, (_, index) => `s${index}`);
    const levels = Object.fromEntries(states.map((state) => [state, 0.5]));
    const db = bnDb({
      smv: {
        id: "smv1",
        type: "ordinal",
        scale: { states },
        priorDistribution: { family: "dirichlet", params: { alpha: states.map(() => 1) } },
      },
      cpt: { o1: levels },
    });
    const { posteriors } = accumulateEvidence({ id: "s1", responses: [response({ pilotParams: pilotParams({ o1: levels }) })] }, db);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/at most 8 states/);
  });

  it("refuses impossible data instead of clamping a posterior", () => {
    const cpt = { o1: { not_mastered: 0, mastered: 0 } };
    const db = bnDb({ cpt });
    const { posteriors } = accumulateEvidence({
      id: "s1",
      responses: [response({ pilotParams: pilotParams(cpt) })],
    }, db);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/impossible/);
    expect(posteriors[0]).not.toHaveProperty("estimate");
  });

  it("uses a carried-forward distribution as the prior for this occasion only", () => {
    const cpt = { o1: { not_mastered: 0.1, mastered: 0.9 } };
    const db = bnDb({ cpt });
    db.deliveryModels = [{ id: "dm1", competencyModelId: "cm1", administration: { carryForward: true } }];
    db.studentModelRecords = [{
      id: "smr1",
      studentId: "stud1",
      competencyModelId: "cm1",
      smvPosteriors: {
        smv1: {
          smvId: "smv1",
          modelFamily: "bayesian_network",
          estimate: 0.8,
          distribution: { not_mastered: 0.2, mastered: 0.8 },
          states: STATES,
        },
      },
    }];
    const session = {
      id: "s2",
      studentId: "stud1",
      deliveryModelId: "dm1",
      status: "in_progress",
      responses: [response({ pilotParams: pilotParams(cpt) })],
      studentModel: {},
    };
    seedSessionStudentModel(session, db);
    expect(session.studentModel.carriedForward.priors.smv1.mastered).toBe(0.8);

    const carried = accumulateEvidence(session, db);
    expect(carried.posteriors[0].priorSource).toBe("carried-forward");
    expect(carried.posteriors[0].estimate).toBeCloseTo(36 / 37, 12);

    const fresh = accumulateEvidence({
      id: "s3",
      status: "in_progress",
      responses: [response({ pilotParams: pilotParams(cpt) })],
    }, db);
    expect(fresh.posteriors[0].estimate).toBeCloseTo(0.9, 12);
  });

  it("refreshes a Bayesian network posterior on resume and leaves an IRT stamp alone", () => {
    const db = bnDb({ cpt: { o1: { not_mastered: 0.2, mastered: 0.8 } } });
    const session = {
      id: "s1",
      status: "paused",
      responses: [response()],
      studentModel: {
        bnPosteriors: { smv1: 0.5 },
        smvPosteriors: {
          smv1: {
            smvId: "smv1",
            smvType: "binary",
            evidenceModelId: "em1",
            parameterSource: "pilot",
            modelFamily: "bayesian_network",
            method: "exact-bayes",
            estimate: 0.5,
            precision: 0.5,
            responsesUsed: 0,
            responsesExcluded: 0,
            updatedAt: "2026-01-01T00:00:00.000Z",
            distribution: { not_mastered: 0.5, mastered: 0.5 },
          },
          theta: {
            smvId: "theta",
            smvType: "continuous",
            evidenceModelId: "em-irt",
            parameterSetId: "ps1",
            parameterSource: "calibrated",
            modelFamily: "irt",
            method: "eap",
            estimate: 0.2,
            precision: 0.4,
            responsesUsed: 1,
            responsesExcluded: 0,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    };
    refreshBayesianNetworkPosteriors(session, db, { now: "2026-10-27T12:00:00.000Z" });
    expect(session.studentModel.bnPosteriors.smv1).toBeCloseTo(0.8, 12);
    expect(session.studentModel.smvPosteriors.smv1.updatedAt).toBe("2026-10-27T12:00:00.000Z");
    expect(session.studentModel.smvPosteriors.theta.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(session.studentModel.smvPosteriors.theta.estimate).toBe(0.2);
  });
});

describe("Bayesian network authoring and parameter binding", () => {
  it("refuses a disconnected second latent, a non-star edge, and a probability outside 0 to 1", () => {
    const evidenceModel = { id: "em1", status: "draft", competencyId: "c1" };
    const many = bayesianNetworkAuthoringErrors({
      id: "sm1",
      type: "bayesian_network",
      structureConfig: { latentNodes: ["a", "b"], observableIds: ["o1"], edges: [] },
    }, evidenceModel, null, { strict: false });
    expect(many[0]).toMatch(/has no parent latent/);

    const edge = bayesianNetworkAuthoringErrors({
      id: "sm1",
      type: "bayesian_network",
      structureConfig: {
        latentNodes: ["smv1"],
        observableIds: ["o1"],
        edges: [{ from: "o1", to: "o2" }],
      },
    }, evidenceModel, null, { strict: false });
    expect(edge.some((message) => message.includes("not from latent node"))).toBe(true);

    const range = bayesianNetworkAuthoringErrors({
      id: "sm1",
      type: "bayesian_network",
      structureConfig: {
        latentNodes: ["smv1"],
        observableIds: ["o1"],
        cpt: { o1: { levels: { not_mastered: 1.2, mastered: 0.8 } } },
      },
    }, evidenceModel, null, { strict: false });
    expect(range.some((message) => message.includes("outside 0 to 1"))).toBe(true);

    const stored = validateEntity("evidenceModels", {
      ...evidenceModel,
      statisticalModels: [{
        id: "sm1",
        type: "bayesian_network",
        structureConfig: { latentNodes: ["a", "b"], observableIds: ["o1"] },
      }],
    }, { competencies: [], competencyModels: [] }, { strict: false });
    expect(stored.valid).toBe(false);
    expect(stored.errors.some((message) => message.includes("has no parent latent"))).toBe(true);
  });

  it("pins a pilot table and a calibrated parameter set", () => {
    const db = bnDb({ cpt: { o1: { not_mastered: 0.2, mastered: 0.8 } } });
    const evidenceModel = db.evidenceModels[0];
    const statisticalModel = evidenceModel.statisticalModels[0];
    const pilot = chooseSubmitParameterBinding({
      family: "bayesian_network",
      calibratedParameterSetId: null,
      item: { id: "item1", evidenceModelId: "em1" },
      statisticalModel,
      evidenceModel,
      db,
    });
    expect(pilot.parameterSource).toBe("pilot");
    expect(pilot.pilotParams.o1.levels.mastered).toBe(0.8);
    expect(pilot.parameterSetId).toBeNull();

    statisticalModel.activeParameterSetId = "ps-bn";
    statisticalModel.parameterSets = [{
      parameterSetId: "ps-bn",
      parameters: {
        _kind: "bayesian-cpt",
        _prior: { not_mastered: 0.4, mastered: 0.6 },
        o1: { levels: { not_mastered: 0.2, mastered: 0.8 } },
      },
    }];
    const calibrated = chooseSubmitParameterBinding({
      family: "bayesian_network",
      calibratedParameterSetId: "ps-bn",
      item: { id: "item1", evidenceModelId: "em1" },
      statisticalModel,
      evidenceModel,
      db,
    });
    expect(calibrated).toMatchObject({ parameterSource: "calibrated", parameterSetId: "ps-bn", pilotParams: null });
    expect(bayesianObservableError({
      statisticalModel,
      observableId: "missing",
      parameterSource: "calibrated",
      parameterSetId: "ps-bn",
    })).toMatch(/no conditional probability/);
  });
});

function selectionDb() {
  const cpt = {
    oSharp: { not_mastered: 0.1, mastered: 0.9 },
    oDull: { not_mastered: 0.45, mastered: 0.55 },
  };
  const db = bnDb({ cpt });
  db.taskModels = [{ id: "tm1", versionNumber: 1, evidenceModelIds: ["em1"] }];
  db.items = [
    { id: "itemSharp", taskModelId: "tm1", observationId: "oSharp", evidenceModelId: "em1", status: "operational" },
    { id: "itemDull", taskModelId: "tm1", observationId: "oDull", evidenceModelId: "em1", status: "operational" },
  ];
  db.tasks = [
    { id: "tSharp", taskModelId: "tm1", itemId: "itemSharp" },
    { id: "tDull", taskModelId: "tm1", itemId: "itemDull" },
  ];
  db.compositeLibrary = [{
    id: "cl1",
    taskModelId: "tm1",
    taskModelVersion: 1,
    active: true,
    items: [
      { itemId: "itemSharp", observationId: "oSharp", evidenceModelId: "em1", evidenceModelVersion: 1 },
      { itemId: "itemDull", observationId: "oDull", evidenceModelId: "em1", evidenceModelVersion: 1 },
    ],
  }];
  return db;
}

describe("BayesianNetwork selection ranks a real network", () => {
  it("picks the more informative conditional probability table from the model prior", () => {
    const result = selectNextActivity({
      id: "s1",
      taskIds: ["tDull", "tSharp"],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "BayesianNetwork",
    }, selectionDb());
    expect(result.taskId).toBe("tSharp");
    expect(result.debug.fallback).toBeUndefined();
    expect(result.debug.priorSource).toBe("model");
    expect(result.debug.smvId).toBe("smv1");
    expect(result.debug.totalGain).toBeCloseTo(
      expectedInformationGain(
        { not_mastered: 0.5, mastered: 0.5 },
        { not_mastered: 0.1, mastered: 0.9 }
      ),
      12
    );
  });

  it("uses the live posterior when one is stored", () => {
    const live = { not_mastered: 0.01, mastered: 0.99 };
    const result = selectNextActivity({
      id: "s1",
      taskIds: ["tSharp"],
      currentTaskIndex: 0,
      responses: [],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        bnPosteriors: { smv1: 0.99 },
        smvPosteriors: {
          smv1: {
            smvId: "smv1",
            modelFamily: "bayesian_network",
            distribution: live,
            estimate: 0.99,
          },
        },
      },
    }, selectionDb());
    expect(result.debug.priorSource).toBe("posterior");
    expect(result.debug.totalGain).toBeCloseTo(
      expectedInformationGain(live, { not_mastered: 0.1, mastered: 0.9 }),
      12
    );
    expect(result.debug.totalGain).toBeLessThan(0.2);
  });

  it("keeps the pool-order fallback when the table cannot be ranked", () => {
    const db = selectionDb();
    delete db.evidenceModels[0].statisticalModels[0].structureConfig.cpt.oSharp;
    delete db.evidenceModels[0].statisticalModels[0].structureConfig.cpt.oDull;
    const result = selectNextActivity({
      id: "s1",
      taskIds: ["tDull", "tSharp"],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "BayesianNetwork",
    }, db);
    expect(result.taskId).toBe("tDull");
    expect(result.debug.fallback).toBe("pool-order");
    expect(result.warnings.join(" ")).toMatch(/pool order/);
  });

  it("still cannot rank G-DINA, so it falls back to pool order", () => {
    const db = selectionDb();
    db.evidenceModels[0].statisticalModels[0].type = "gdina";
    db.evidenceModels[0].statisticalModels[0].structureConfig = { qMatrixId: "missing" };
    const result = selectNextActivity({
      id: "s1",
      taskIds: ["tDull", "tSharp"],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "BayesianNetwork",
    }, db);
    expect(result.debug.fallback).toBe("pool-order");
    expect(result.taskId).toBe("tDull");
  });
});

function treePilotParams() {
  return {
    _kind: "bayesian-cpt",
    _tree: true,
    _prior: { smv1: { not_mastered: 0.5, mastered: 0.5 } },
    _parentOf: { smv2: "smv1", o1: "smv1" },
    _latentIds: ["smv1", "smv2"],
    o1: { levels: { not_mastered: 0.2, mastered: 0.8 } },
    smv2: {
      not_mastered: { not_mastered: 0.8, mastered: 0.2 },
      mastered: { not_mastered: 0.2, mastered: 0.8 },
    },
  };
}

function treeDb() {
  const db = bnDb({ cpt: { o1: { not_mastered: 0.2, mastered: 0.8 } } });
  db.competencyModels[0].smVariables = [binarySmv({ id: "smv1" }), binarySmv({ id: "smv2" })];
  db.evidenceModels[0].observables = [{ id: "o1" }];
  db.evidenceModels[0].statisticalModels[0].structureConfig = {
    latentNodes: ["smv1", "smv2"],
    observableIds: ["o1"],
    edges: [
      { from: "smv1", to: "smv2" },
      { from: "smv1", to: "o1" },
    ],
    cpt: {
      o1: { levels: { not_mastered: 0.2, mastered: 0.8 } },
      smv2: {
        not_mastered: { not_mastered: 0.8, mastered: 0.2 },
        mastered: { not_mastered: 0.2, mastered: 0.8 },
      },
    },
  };
  return db;
}

describe("small latent tree", () => {
  it("stores a two-latent tree and scores both student model variables", () => {
    const db = treeDb();
    const evidenceModel = db.evidenceModels[0];
    const statisticalModel = evidenceModel.statisticalModels[0];
    expect(bayesianNetworkAuthoringErrors(statisticalModel, evidenceModel, db, { strict: true })).toEqual([]);

    const stored = validateEntity("evidenceModels", {
      id: "em1",
      competencyId: "c1",
      status: "draft",
      statisticalModels: [statisticalModel],
    }, db, { strict: false });
    expect(stored.errors.filter((message) => /parent latent|cycle|more than one parent|joint has/.test(message))).toEqual([]);

    const session = { id: "s1", status: "in_progress", responses: [response({ pilotParams: treePilotParams() })] };
    const accumulation = accumulateEvidence(session, db);
    expect(accumulation.posteriors).toHaveLength(2);
    const byId = Object.fromEntries(accumulation.posteriors.map((posterior) => [posterior.smvId, posterior]));
    expect(byId.smv1).toMatchObject({ supported: true, method: "exact-bayes", parameterSource: "pilot" });
    expect(byId.smv1.estimate).toBeCloseTo(0.8, 12);
    expect(byId.smv2.estimate).toBeCloseTo(0.68, 12);

    applyPosteriorsToSession(session, accumulation, { now: "2026-10-29T00:00:00.000Z" });
    expect(session.studentModel.bnPosteriors.smv1).toBeCloseTo(0.8, 12);
    expect(session.studentModel.bnPosteriors.smv2).toBeCloseTo(0.68, 12);
    expect(session.studentModel.smvPosteriors.smv2.distribution.mastered).toBeCloseTo(0.68, 12);
  });

  it("pins a tree snapshot for a pilot response", () => {
    const db = treeDb();
    const evidenceModel = db.evidenceModels[0];
    const statisticalModel = evidenceModel.statisticalModels[0];
    const pilot = chooseSubmitParameterBinding({
      family: "bayesian_network",
      calibratedParameterSetId: null,
      item: { id: "item1", evidenceModelId: "em1" },
      statisticalModel,
      evidenceModel,
      db,
    });
    expect(pilot.parameterSource).toBe("pilot");
    expect(pilot.pilotParams._tree).toBe(true);
    expect(pilot.pilotParams.smv2.mastered.mastered).toBe(0.8);
    expect(pilot.pilotParams._prior.smv1.mastered).toBe(0.5);
  });

  it("refuses a cycle, two parents, and a joint larger than the exact-inference cap", () => {
    const db = treeDb();
    const evidenceModel = db.evidenceModels[0];
    const statisticalModel = evidenceModel.statisticalModels[0];

    statisticalModel.structureConfig.edges = [
      { from: "smv1", to: "smv2" },
      { from: "smv2", to: "smv1" },
      { from: "smv1", to: "o1" },
    ];
    const cycle = accumulateEvidence({
      id: "s1",
      responses: [response({ pilotParams: treePilotParams() })],
    }, db);
    expect(cycle.posteriors[0].supported).toBe(false);
    expect(cycle.posteriors[0].reason).toMatch(/cycle/);

    statisticalModel.structureConfig.edges = [
      { from: "smv1", to: "o1" },
      { from: "smv2", to: "o1" },
      { from: "smv1", to: "smv2" },
    ];
    const twoParents = accumulateEvidence({
      id: "s1",
      responses: [response({ pilotParams: treePilotParams() })],
    }, db);
    expect(twoParents.posteriors[0].supported).toBe(false);
    expect(twoParents.posteriors[0].reason).toMatch(/more than one parent/);

    const states = ["s0", "s1", "s2", "s3", "s4"];
    const bulky = (id) => ({
      id,
      type: "ordinal",
      scale: { states },
      priorDistribution: { family: "dirichlet", params: { alpha: states.map(() => 1) } },
    });
    db.competencyModels[0].smVariables = [bulky("smv1"), bulky("smv2"), bulky("smv3")];
    statisticalModel.structureConfig = {
      latentNodes: ["smv1", "smv2", "smv3"],
      observableIds: ["o1"],
      edges: [
        { from: "smv1", to: "smv2" },
        { from: "smv2", to: "smv3" },
        { from: "smv1", to: "o1" },
      ],
    };
    const large = accumulateEvidence({
      id: "s1",
      responses: [response()],
    }, db);
    expect(5 ** 3).toBeGreaterThan(MAX_BN_JOINT_CONFIGS);
    expect(large.posteriors[0].supported).toBe(false);
    expect(large.posteriors[0].reason).toMatch(/at most 64/);
  });

  it("ranks an observable from its parent student model variable, not from the root", () => {
    const db = treeDb();
    db.evidenceModels[0].observables = [{ id: "oRoot" }, { id: "oChild" }];
    db.evidenceModels[0].statisticalModels[0].structureConfig = {
      latentNodes: ["smv1", "smv2"],
      observableIds: ["oRoot", "oChild"],
      edges: [
        { from: "smv1", to: "smv2" },
        { from: "smv1", to: "oRoot" },
        { from: "smv2", to: "oChild" },
      ],
      cpt: {
        oRoot: { levels: { not_mastered: 0.05, mastered: 0.95 } },
        oChild: { levels: { not_mastered: 0.3, mastered: 0.7 } },
        smv2: {
          not_mastered: { not_mastered: 0.8, mastered: 0.2 },
          mastered: { not_mastered: 0.2, mastered: 0.8 },
        },
      },
    };
    db.taskModels = [{ id: "tm1", versionNumber: 1, evidenceModelIds: ["em1"] }];
    db.items = [
      { id: "itemRoot", taskModelId: "tm1", observationId: "oRoot", evidenceModelId: "em1", status: "operational" },
      { id: "itemChild", taskModelId: "tm1", observationId: "oChild", evidenceModelId: "em1", status: "operational" },
    ];
    db.tasks = [
      { id: "tRoot", taskModelId: "tm1", itemId: "itemRoot" },
      { id: "tChild", taskModelId: "tm1", itemId: "itemChild" },
    ];
    db.compositeLibrary = [{
      id: "cl1",
      taskModelId: "tm1",
      taskModelVersion: 1,
      active: true,
      items: [
        { itemId: "itemRoot", observationId: "oRoot", evidenceModelId: "em1", evidenceModelVersion: 1 },
        { itemId: "itemChild", observationId: "oChild", evidenceModelId: "em1", evidenceModelVersion: 1 },
      ],
    }];

    const fromPrior = selectNextActivity({
      id: "s1",
      taskIds: ["tRoot", "tChild"],
      currentTaskIndex: 0,
      responses: [],
      studentModel: {},
      selectionStrategy: "BayesianNetwork",
    }, db);
    expect(fromPrior.taskId).toBe("tRoot");
    expect(fromPrior.debug.smvId).toBe("smv1");

    const peaked = { not_mastered: 0.01, mastered: 0.99 };
    const uncertain = { not_mastered: 0.5, mastered: 0.5 };
    const fromLive = selectNextActivity({
      id: "s1",
      taskIds: ["tRoot", "tChild"],
      currentTaskIndex: 0,
      responses: [],
      selectionStrategy: "BayesianNetwork",
      studentModel: {
        bnPosteriors: { smv1: 0.99, smv2: 0.5 },
        smvPosteriors: {
          smv1: { smvId: "smv1", modelFamily: "bayesian_network", distribution: peaked, estimate: 0.99 },
          smv2: { smvId: "smv2", modelFamily: "bayesian_network", distribution: uncertain, estimate: 0.5 },
        },
      },
    }, db);
    expect(fromLive.taskId).toBe("tChild");
    expect(fromLive.debug.smvId).toBe("smv2");
    expect(fromLive.debug.priorSource).toBe("posterior");
    expect(fromLive.debug.totalGain).toBeCloseTo(
      expectedInformationGain(uncertain, { not_mastered: 0.3, mastered: 0.7 }),
      12
    );
  });
});
