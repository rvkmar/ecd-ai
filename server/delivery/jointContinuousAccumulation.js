// server/delivery/jointContinuousAccumulation.js
//
// D129 / W26. Continuous SMVs that share a D128 jointPrior are updated
// together: evidence about the measured variable moves a correlated
// partner. This is not the DINA 2^K attribute-profile joint.
//
// Scope is one correlated partner (a 2×2 block). A measured SMV correlated
// with two or more others is refused — dropping a dimension would look
// like a posterior and be wrong. Zero off-diagonal covariance is not
// handled here; the caller keeps the existing one-dimensional EAP so a
// diagonal joint prior is byte-identical to independent marginals.

import { jointPriorErrors } from "../../src/utils/jointPrior.js";

const ZERO_COVARIANCE = 1e-12;
const P_EPSILON = 1e-12;

/**
 * Decide whether this measured SMV should take the joint path.
 * `independent` means "call the existing 1D estimator".
 */
export function decideJointContinuousUpdate(competencyModel, measuredSmvId) {
  const joint = competencyModel?.jointPrior;
  if (joint == null) return { action: "independent" };

  if (typeof joint !== "object" || Array.isArray(joint) || !Array.isArray(joint.smvIds)) {
    return {
      action: "refuse",
      reason: `Competency model '${competencyModel?.id}' has a jointPrior that is not a usable object, so no posterior is reported.`,
    };
  }

  if (!joint.smvIds.includes(measuredSmvId)) return { action: "independent" };

  const shapeErrors = jointPriorErrors(joint, competencyModel.smVariables || []);
  if (shapeErrors.length > 0) {
    return {
      action: "refuse",
      reason: `Competency model '${competencyModel.id}' jointPrior is refused: ${shapeErrors[0]}`,
    };
  }

  const cov = covarianceForJoint(joint, competencyModel.smVariables || []);
  if (cov.error) {
    return { action: "refuse", reason: cov.error };
  }

  const idx = joint.smvIds.indexOf(measuredSmvId);
  const partnerIndexes = [];
  for (let j = 0; j < joint.smvIds.length; j += 1) {
    if (j === idx) continue;
    if (Math.abs(cov.matrix[idx][j]) > ZERO_COVARIANCE) partnerIndexes.push(j);
  }

  if (partnerIndexes.length === 0) return { action: "independent" };

  if (partnerIndexes.length > 1) {
    const names = partnerIndexes.map((j) => joint.smvIds[j]).join(", ");
    return {
      action: "refuse",
      reason: `Student Model Variable '${measuredSmvId}' is correlated with ${partnerIndexes.length} other continuous SMVs (${names}). Joint accumulation updates one partner; refusing rather than dropping a dimension.`,
    };
  }

  const p = partnerIndexes[0];
  const partnerId = joint.smvIds[p];
  const measured = (competencyModel.smVariables || []).find((smv) => smv.id === measuredSmvId);
  const partner = (competencyModel.smVariables || []).find((smv) => smv.id === partnerId);
  const meanMeasured = normalMean(measured);
  const meanPartner = normalMean(partner);
  if (meanMeasured.error) return { action: "refuse", reason: meanMeasured.error };
  if (meanPartner.error) return { action: "refuse", reason: meanPartner.error };

  return {
    action: "joint",
    partner,
    mean: [meanMeasured.mean, meanPartner.mean],
    covariance: [
      [cov.matrix[idx][idx], cov.matrix[idx][p]],
      [cov.matrix[p][idx], cov.matrix[p][p]],
    ],
  };
}

/**
 * Bivariate EAP on a product grid. Likelihood depends only on the measured
 * axis (index 0). `nodes` is the shared axis; omit it to size a grid from
 * the marginal standard deviations.
 *
 * Weights are prior densities at the nodes, renormalised — the same
 * discrete convention as estimateContinuousPosterior's hand fixture, not
 * a step-scaled integral.
 */
export function estimateBivariateJoint({
  scoredObservations,
  itemProbability,
  mean,
  covariance,
  nodes,
}) {
  const [m1, m2] = mean;
  const v11 = covariance[0][0];
  const c = covariance[0][1];
  const v22 = covariance[1][1];
  const det = v11 * v22 - c * c;
  if (!(det > 1e-15) || !(v11 > 0) || !(v22 > 0)) return null;

  const inv11 = v22 / det;
  const inv22 = v11 / det;
  const inv12 = -c / det;
  const axis = Array.isArray(nodes)
    ? { measured: nodes, partner: nodes }
    : nodes || {
        measured: axisFromMarginal(m1, Math.sqrt(v11)),
        partner: axisFromMarginal(m2, Math.sqrt(v22)),
      };
  if (!axis?.measured?.length || !axis?.partner?.length) return null;

  const logLik = axis.measured.map((theta) => logLikelihood(theta, scoredObservations, itemProbability));

  let maxLogJoint = -Infinity;
  const logJoint = [];
  for (let i = 0; i < axis.measured.length; i += 1) {
    const row = [];
    for (let j = 0; j < axis.partner.length; j += 1) {
      const x = axis.measured[i];
      const y = axis.partner[j];
      const dx = x - m1;
      const dy = y - m2;
      const quad = inv11 * dx * dx + 2 * inv12 * dx * dy + inv22 * dy * dy;
      const lp = -0.5 * quad - 0.5 * Math.log(det) - Math.log(2 * Math.PI);
      const lj = logLik[i] + lp;
      row.push(lj);
      if (lj > maxLogJoint) maxLogJoint = lj;
    }
    logJoint.push(row);
  }
  if (!Number.isFinite(maxLogJoint)) return null;

  let total = 0;
  const weight = logJoint.map((row) =>
    row.map((lj) => {
      const w = Math.exp(lj - maxLogJoint);
      total += w;
      return w;
    })
  );
  if (!(total > 0) || !Number.isFinite(total)) return null;

  let ex = 0;
  let ey = 0;
  for (let i = 0; i < axis.measured.length; i += 1) {
    for (let j = 0; j < axis.partner.length; j += 1) {
      const p = weight[i][j] / total;
      ex += axis.measured[i] * p;
      ey += axis.partner[j] * p;
    }
  }
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < axis.measured.length; i += 1) {
    for (let j = 0; j < axis.partner.length; j += 1) {
      const p = weight[i][j] / total;
      vx += (axis.measured[i] - ex) ** 2 * p;
      vy += (axis.partner[j] - ey) ** 2 * p;
    }
  }

  const measuredSd = Math.sqrt(Math.max(vx, 0));
  const partnerSd = Math.sqrt(Math.max(vy, 0));
  if (![ex, ey, measuredSd, partnerSd].every((n) => Number.isFinite(n))) return null;

  return {
    measured: { estimate: ex, sd: measuredSd },
    partner: { estimate: ey, sd: partnerSd },
  };
}

function covarianceForJoint(joint, smVariables) {
  const n = joint.smvIds.length;
  const byId = new Map(smVariables.filter((smv) => smv?.id).map((smv) => [smv.id, smv]));

  if (joint.parameterization === "covariance") {
    return { matrix: joint.matrix };
  }

  if (joint.parameterization !== "correlation") {
    return { error: `jointPrior.parameterization '${joint.parameterization}' cannot be accumulated.` };
  }

  const sds = [];
  for (const id of joint.smvIds) {
    const smv = byId.get(id);
    const sd = smv?.priorDistribution?.params?.sd;
    if (smv?.priorDistribution?.family !== "normal" || !(typeof sd === "number" && sd > 0)) {
      return {
        error: `Student Model Variable '${id}' needs a normal prior with sd > 0 before a correlation jointPrior can be turned into a covariance.`,
      };
    }
    sds.push(sd);
  }

  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      matrix[i][j] = sds[i] * joint.matrix[i][j] * sds[j];
    }
  }
  return { matrix };
}

function normalMean(smv) {
  const prior = smv?.priorDistribution;
  if (prior?.family !== "normal") {
    return {
      error: `Student Model Variable '${smv?.id}' must carry a normal marginal prior to be updated under a multivariate-normal jointPrior.`,
    };
  }
  const mean = prior.params?.mean;
  if (mean !== undefined && !Number.isFinite(mean)) {
    return { error: `Student Model Variable '${smv.id}' has a non-finite normal prior mean.` };
  }
  return { mean: Number.isFinite(mean) ? mean : 0 };
}

function logLikelihood(theta, scoredObservations, itemProbability) {
  return scoredObservations.reduce((acc, obs) => {
    const p = itemProbability(theta, obs.params);
    const clamped = Math.min(Math.max(p, P_EPSILON), 1 - P_EPSILON);
    return acc + (obs.u === 1 ? Math.log(clamped) : Math.log(1 - clamped));
  }, 0);
}

function axisFromMarginal(mean, sd) {
  if (!(sd > 0)) return null;
  const half = 5 * sd;
  const step = sd / 8;
  let points = Math.ceil((2 * half) / step) + 1;
  points = Math.min(81, Math.max(41, points));
  if (points % 2 === 0) points += 1;
  const min = mean - half;
  const max = mean + half;
  const span = max - min;
  const nodes = [];
  for (let i = 0; i < points; i += 1) {
    nodes.push(i === points - 1 ? max : min + (i * span) / (points - 1));
  }
  return nodes;
}
