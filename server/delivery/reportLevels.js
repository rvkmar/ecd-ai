// TU3 (T1). One place for the report level words.
//
// Continuous scores (theta, or a probability that is not standing in for
// a mastery class) use levelForScore. When that returns null, because
// nothing is authored, the scales differ, or the score sits below every
// cut, the historical cuts apply and levelSource is "default".
//
// Those cuts are the ones the report routes used to inline:
//   theta > 1 Advanced, theta > 0 Proficient, otherwise Needs Support
//   probability > 0.7 Strong, > 0.4 Developing, otherwise Needs Support
//
// Mastery is a separate call. classifyByRule still decides master /
// nonmaster / indeterminate. It does not replace the level word, so an
// unauthored report keeps today's words and labels them as a default cut.
//
// The descriptor, when the author wrote one, is levelText.

import { levelForScore } from "../../src/utils/performanceLevels.js";
import { taskIdsIncludingDelivered } from "./activitySelection.js";
import { classifyByRule, sourcesForPosterior } from "./attributeClassification.js";

const DEFAULT_THETA_ADVANCED_CUT = 1;
const DEFAULT_THETA_PROFICIENT_CUT = 0;
const DEFAULT_PROBABILITY_STRONG_CUT = 0.7;
const DEFAULT_PROBABILITY_DEVELOPING_CUT = 0.4;
const DEFAULT_LEVEL_NOTE = "default cut";

const MASTERY_METHOD = "attribute-mastery-posterior";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function indexById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row && row.id) map.set(row.id, row);
  }
  return map;
}

function packDefault(level, levelCut, levelBand) {
  return {
    level,
    levelText: level,
    descriptor: null,
    levelSource: "default",
    levelCut,
    levelNote: DEFAULT_LEVEL_NOTE,
    levelBand,
  };
}

function emptyLevel() {
  return {
    level: null,
    levelText: null,
    descriptor: null,
    levelSource: "default",
    levelCut: null,
    levelNote: DEFAULT_LEVEL_NOTE,
    levelBand: null,
  };
}

function bandForAuthored(competency, authored) {
  const levels = (competency?.performanceLevels || [])
    .filter((level) => level && finite(level.cut))
    .slice()
    .sort((a, b) => a.cut - b.cut);
  if (levels.length <= 1) return "high";
  if (authored.cut === levels[levels.length - 1].cut) return "high";
  if (authored.cut === levels[0].cut) return "low";
  return "middle";
}

/**
 * Historical theta words. Strict inequalities, matching the old route ternaries.
 * @param {number} value
 */
function defaultThetaLevel(value) {
  if (!finite(value)) return emptyLevel();
  if (value > DEFAULT_THETA_ADVANCED_CUT) {
    return packDefault("Advanced", DEFAULT_THETA_ADVANCED_CUT, "high");
  }
  if (value > DEFAULT_THETA_PROFICIENT_CUT) {
    return packDefault("Proficient", DEFAULT_THETA_PROFICIENT_CUT, "middle");
  }
  return packDefault("Needs Support", null, "low");
}

/**
 * Historical probability words. Strict inequalities, matching bnLevel.
 * @param {number} value
 */
function defaultProbabilityLevel(value) {
  if (!finite(value)) return emptyLevel();
  if (value > DEFAULT_PROBABILITY_STRONG_CUT) {
    return packDefault("Strong", DEFAULT_PROBABILITY_STRONG_CUT, "high");
  }
  if (value > DEFAULT_PROBABILITY_DEVELOPING_CUT) {
    return packDefault("Developing", DEFAULT_PROBABILITY_DEVELOPING_CUT, "middle");
  }
  return packDefault("Needs Support", null, "low");
}

/**
 * @param {{ value: number, scale: "theta"|"probability", competency?: object|null }} args
 */
export function resolveReportLevel({ value, scale, competency }) {
  const authored = levelForScore(competency, value, scale);
  if (authored) {
    const descriptor = typeof authored.descriptor === "string" ? authored.descriptor.trim() : "";
    return {
      level: authored.label,
      levelText: descriptor || authored.label,
      descriptor: descriptor || null,
      levelSource: "authored",
      levelCut: authored.cut,
      levelNote: null,
      levelBand: bandForAuthored(competency, authored),
    };
  }
  if (scale === "theta") return defaultThetaLevel(value);
  if (scale === "probability") return defaultProbabilityLevel(value);
  return emptyLevel();
}

function levelFields(value, scale, competency) {
  const resolved = resolveReportLevel({ value, scale, competency });
  const fields = {
    level: resolved.level,
    levelText: resolved.levelText,
    levelSource: resolved.levelSource,
    levelBand: resolved.levelBand,
  };
  if (resolved.levelCut != null) fields.levelCut = resolved.levelCut;
  if (resolved.levelNote) fields.levelNote = resolved.levelNote;
  if (resolved.descriptor) fields.descriptor = resolved.descriptor;
  return fields;
}

/**
 * Recommendation band for an unauthored theta mean.
 * mean < 0 is low, mean > 1 is high. mean === 0 stays middle, which is
 * the class and district sentence the routes already used.
 */
export function historicalIrtBand(mean) {
  if (!finite(mean)) return null;
  if (mean < 0) return "low";
  if (mean > 1) return "high";
  return "middle";
}

/**
 * Recommendation band for an unauthored probability mean.
 * mean > 0.7 is high, mean < 0.4 is low. The equalities stay middle,
 * matching the district sentences.
 */
export function historicalProbabilityBand(mean) {
  if (!finite(mean)) return null;
  if (mean > DEFAULT_PROBABILITY_STRONG_CUT) return "high";
  if (mean < DEFAULT_PROBABILITY_DEVELOPING_CUT) return "low";
  return "middle";
}

export function findCompetency(db, competencyId) {
  if (!competencyId || !db) return null;
  const flat = (db.competencies || []).find((row) => row && row.id === competencyId) || null;
  let nested = null;
  for (const model of db.competencyModels || []) {
    const hit = (model?.competencies || []).find((row) => row && row.id === competencyId);
    if (hit) {
      nested = hit;
      break;
    }
  }
  if (!flat && !nested) return null;
  const merged = { ...(nested || {}), ...(flat || {}) };
  const levels = Array.isArray(flat?.performanceLevels) && flat.performanceLevels.length
    ? flat.performanceLevels
    : nested?.performanceLevels;
  const scale = flat?.performanceLevelScale || nested?.performanceLevelScale || null;
  if (Array.isArray(levels) && levels.length) merged.performanceLevels = levels;
  else delete merged.performanceLevels;
  if (scale) merged.performanceLevelScale = scale;
  else delete merged.performanceLevelScale;
  return merged;
}

function competencyForEvidenceModels(db, evidenceModels) {
  const ids = [...new Set((evidenceModels || []).map((em) => em?.competencyId).filter(Boolean))];
  if (ids.length !== 1) return null;
  return findCompetency(db, ids[0]);
}

function claimFromEvidenceModel(evidenceModel) {
  if (!evidenceModel) return null;
  const text = typeof evidenceModel.claimStatement === "string"
    ? evidenceModel.claimStatement.trim()
    : "";
  if (!text) return null;
  return {
    evidenceModelId: evidenceModel.id || null,
    competencyId: evidenceModel.competencyId || null,
    claimStatement: text,
  };
}

function claimBundle(evidenceModels) {
  const claims = [];
  const seen = new Set();
  for (const evidenceModel of evidenceModels || []) {
    const claim = claimFromEvidenceModel(evidenceModel);
    if (!claim) continue;
    const key = claim.evidenceModelId || claim.claimStatement;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push(claim);
  }
  return {
    claims,
    claimStatement: claims.length === 1 ? claims[0].claimStatement : null,
  };
}

function claimFields(bundle) {
  const fields = {};
  if (!bundle) return fields;
  if (bundle.claims?.length) fields.claims = bundle.claims;
  if (bundle.claimStatement) fields.claimStatement = bundle.claimStatement;
  if (bundle.claims?.length === 1 && bundle.claims[0].competencyId) {
    fields.competencyId = bundle.claims[0].competencyId;
  }
  return fields;
}

function evidenceModelsByIds(db, ids) {
  const byId = indexById(db?.evidenceModels);
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const evidenceModel = byId.get(id);
    if (evidenceModel) out.push(evidenceModel);
  }
  return out;
}

function evidenceModelsForSession(db, session) {
  const ids = new Set();
  for (const posterior of Object.values(session?.studentModel?.smvPosteriors || {})) {
    if (posterior?.evidenceModelId) ids.add(posterior.evidenceModelId);
  }
  const tasks = indexById(db?.tasks);
  const taskModels = indexById(db?.taskModels);
  const items = indexById(db?.items);
  for (const taskId of taskIdsIncludingDelivered(session)) {
    const task = tasks.get(taskId);
    const taskModel = task ? taskModels.get(task.taskModelId) : null;
    for (const evidenceModelId of taskModel?.evidenceModelIds || []) ids.add(evidenceModelId);
    if (taskModel?.primaryEvidenceModelId) ids.add(taskModel.primaryEvidenceModelId);
    if (task?.evidenceModelId) ids.add(task.evidenceModelId);
  }
  for (const response of session?.responses || []) {
    if (response?.evidenceModelId) ids.add(response.evidenceModelId);
    const item = items.get(response?.itemId);
    if (item?.evidenceModelId) ids.add(item.evidenceModelId);
  }
  return evidenceModelsByIds(db, ids);
}

function evidenceModelForNode(db, nodeId, sessions) {
  const byId = indexById(db?.evidenceModels);
  for (const session of sessions || []) {
    const posterior = session?.studentModel?.smvPosteriors?.[nodeId];
    if (posterior?.evidenceModelId && byId.has(posterior.evidenceModelId)) {
      return byId.get(posterior.evidenceModelId);
    }
  }
  const models = (db?.competencyModels || []).filter((model) =>
    (model?.smVariables || []).some((smv) => smv && smv.id === nodeId)
  );
  if (models.length !== 1) return null;
  const model = models[0];
  const competencyIds = new Set();
  for (const competency of db?.competencies || []) {
    if (competency && competency.modelId === model.id && competency.id) {
      competencyIds.add(competency.id);
    }
  }
  for (const competency of model.competencies || []) {
    if (competency?.id) competencyIds.add(competency.id);
  }
  const matches = (db?.evidenceModels || []).filter(
    (evidenceModel) => evidenceModel && competencyIds.has(evidenceModel.competencyId)
  );
  return matches.length === 1 ? matches[0] : null;
}

function posteriorSdOf(posterior) {
  if (!posterior || typeof posterior !== "object") return null;
  if (finite(posterior.sem)) return posterior.sem;
  if (finite(posterior.precision)) return posterior.precision;
  return null;
}

function responseCountSe(session) {
  const n = Array.isArray(session?.responses) ? session.responses.length : 0;
  if (n > 0) return 1 / Math.sqrt(n);
  return null;
}

/**
 * Person theta SE. Prefer a stored irtSe, then an EAP posterior sem,
 * then the historical 1/sqrt(n) approximation.
 */
function thetaStandardError(session) {
  const studentModel = session?.studentModel;
  if (studentModel && finite(studentModel.irtSe)) return studentModel.irtSe;
  for (const row of Object.values(studentModel?.smvPosteriors || {})) {
    if (!row || row.supported === false) continue;
    const continuous = row.method === "eap"
      || row.method === "eap-joint"
      || row.modelFamily === "irt"
      || row.modelFamily === "rasch"
      || row.modelFamily === "grm";
    if (!continuous) continue;
    const sd = posteriorSdOf(row);
    if (sd != null) return sd;
  }
  return responseCountSe(session);
}

function meanOfFinite(values) {
  const xs = (values || []).filter(finite);
  if (!xs.length) return null;
  return xs.reduce((sum, value) => sum + value, 0) / xs.length;
}

/**
 * Standard error of a class or district mean.
 * When every value has its own SE, this is the SE of the mean of
 * independent estimates. Otherwise it is the SD of the values over sqrt(n),
 * using the same population SD the report already publishes.
 * A single value returns that person's SE when one was stored.
 */
function aggregateStandardError(values, individualSes) {
  const xs = (values || []).filter(finite);
  const n = xs.length;
  if (n === 0) return null;
  const ses = (individualSes || []).filter(finite);
  if (n === 1) return ses.length === 1 ? ses[0] : null;
  if (ses.length === n) {
    const meanVariance = ses.reduce((sum, se) => sum + se * se, 0) / (n * n);
    return Math.sqrt(meanVariance);
  }
  const mean = xs.reduce((sum, value) => sum + value, 0) / n;
  const variance = xs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  return Math.sqrt(variance / n);
}

function masteryFieldsForPosterior(posterior, db, session) {
  if (!posterior || posterior.method !== MASTERY_METHOD) return {};
  if (!finite(posterior.estimate)) return {};
  const classified = classifyByRule(
    posterior.estimate,
    sourcesForPosterior(posterior, db, { session })
  );
  if (!classified) return {};
  return {
    classification: classified.classification,
    expectedClassificationAccuracy: classified.expectedClassificationAccuracy,
    masteryThreshold: classified.threshold,
  };
}

function reportedScoreFields({
  value,
  scale,
  competency,
  evidenceModels,
  standardError,
  posteriorSd,
  mastery,
}) {
  const fields = {
    ...levelFields(value, scale, competency),
    ...claimFields(claimBundle(evidenceModels)),
  };
  if (scale === "theta") fields.standardError = finite(standardError) ? standardError : null;
  if (scale === "probability") fields.posteriorSd = finite(posteriorSd) ? posteriorSd : null;
  if (mastery && typeof mastery === "object") Object.assign(fields, mastery);
  return fields;
}

export function sessionThetaReport(db, session, theta) {
  const evidenceModels = evidenceModelsForSession(db, session);
  return reportedScoreFields({
    value: theta,
    scale: "theta",
    competency: competencyForEvidenceModels(db, evidenceModels),
    evidenceModels,
    standardError: thetaStandardError(session),
  });
}

export function sessionProbabilityReport(db, session, node, probability) {
  const posterior = session?.studentModel?.smvPosteriors?.[node] || null;
  const evidenceModel = evidenceModelForNode(db, node, session ? [session] : []);
  return reportedScoreFields({
    value: probability,
    scale: "probability",
    competency: evidenceModel ? findCompetency(db, evidenceModel.competencyId) : null,
    evidenceModels: evidenceModel ? [evidenceModel] : [],
    posteriorSd: posteriorSdOf(posterior),
    mastery: masteryFieldsForPosterior(posterior, db, session),
  });
}

export function attributeReportFields(posterior, db, session) {
  const direct = posterior?.evidenceModelId
    ? (db?.evidenceModels || []).find((row) => row && row.id === posterior.evidenceModelId)
    : null;
  const evidenceModel = direct || evidenceModelForNode(db, posterior?.smvId, session ? [session] : []);
  const estimate = posterior?.estimate;
  const level = finite(estimate)
    ? levelFields(
      estimate,
      "probability",
      evidenceModel ? findCompetency(db, evidenceModel.competencyId) : null
    )
    : {};
  return {
    ...claimFields(claimBundle(evidenceModel ? [evidenceModel] : [])),
    posteriorSd: posteriorSdOf(posterior),
    ...level,
  };
}

export function createMeasurementAccumulator() {
  return {
    irtValues: [],
    irtSes: [],
    irtEvidenceIds: new Set(),
    bnNodes: new Map(),
  };
}

export function accumulateSessionMeasurement(acc, db, session) {
  if (!acc || !session) return;
  if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
    const theta = session.studentModel.irtTheta;
    if (finite(theta)) {
      acc.irtValues.push(theta);
      const se = thetaStandardError(session);
      if (se != null) acc.irtSes.push(se);
      for (const evidenceModel of evidenceModelsForSession(db, session)) {
        if (evidenceModel.id) acc.irtEvidenceIds.add(evidenceModel.id);
      }
    }
  }
  if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
    for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
      if (!finite(prob)) continue;
      if (!acc.bnNodes.has(node)) {
        acc.bnNodes.set(node, { probs: [], sems: [], evidenceIds: new Set() });
      }
      const bucket = acc.bnNodes.get(node);
      bucket.probs.push(prob);
      const sd = posteriorSdOf(session.studentModel?.smvPosteriors?.[node]);
      if (sd != null) bucket.sems.push(sd);
      const evidenceModel = evidenceModelForNode(db, node, [session]);
      if (evidenceModel?.id) bucket.evidenceIds.add(evidenceModel.id);
    }
  }
}

function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

export function irtSummaryFromAccumulator(db, acc) {
  const values = acc?.irtValues || [];
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const evidenceModels = evidenceModelsByIds(db, acc.irtEvidenceIds);
  return {
    count: values.length,
    mean,
    stddev: Math.sqrt(variance),
    distribution: {
      below0: values.filter((value) => value < 0).length,
      between0and1: values.filter((value) => value >= 0 && value <= 1).length,
      above1: values.filter((value) => value > 1).length,
    },
    ...reportedScoreFields({
      value: mean,
      scale: "theta",
      competency: competencyForEvidenceModels(db, evidenceModels),
      evidenceModels,
      standardError: aggregateStandardError(values, acc.irtSes),
    }),
  };
}

export function bnSummariesFromAccumulator(db, acc) {
  const out = {};
  for (const [node, bucket] of acc?.bnNodes || []) {
    const probs = bucket.probs;
    const mean = probs.reduce((sum, value) => sum + value, 0) / probs.length;
    const meanEntropy = probs.reduce((sum, value) => sum + binaryEntropy(value), 0) / probs.length;
    const evidenceModels = evidenceModelsByIds(db, bucket.evidenceIds);
    out[node] = {
      count: probs.length,
      mean,
      meanEntropy,
      ...reportedScoreFields({
        value: mean,
        scale: "probability",
        competency: competencyForEvidenceModels(db, evidenceModels),
        evidenceModels,
        posteriorSd: meanOfFinite(bucket.sems),
      }),
    };
  }
  return out;
}
