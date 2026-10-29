// server/delivery/jointContinuousAccumulation.js
//
// D129 / W26 / R10. Continuous SMVs that share a D128 jointPrior are
// updated together: evidence about the measured variable moves a
// correlated partner. This is not the DINA 2^K attribute-profile joint.
//
// Scope is one correlated partner (a 2×2 block) — a recorded design
// limit, not a full multivariate EAP, and not a reopen of D129. A
// measured SMV correlated with two or more others is refused — dropping
// a dimension would look like a posterior and be wrong. The partner cap
// is JOINT_PRIOR_MAX_CORRELATED_PARTNERS in jointPrior.js, shared with
// schema confirm. Zero off-diagonal covariance is not handled here; the
// caller keeps the existing one-dimensional EAP so a diagonal joint
// prior is byte-identical to independent marginals.

import {
  correlatedPartnerIndexes,
  jointPriorErrors,
  jointPriorPartnerLimitMessage,
  JOINT_PRIOR_MAX_CORRELATED_PARTNERS,
} from "../../src/utils/jointPrior.js";

const P_EPSILON = 1e-12;

/* Same coverage rules as evidenceAccumulation's one-dimensional grid.
   A fixed ±5 SD rectangle truncates a long run of hard items and reports
   the cut edge as a precise EAP (boundaryLimited was hardcoded false).
   Measured: 50 correct Rasch items at b = 3, ρ = 0.5, came back
   4.79 ± 0.21 against a covering grid's 5.22 ± 0.43. */
const PRIOR_SPREAD_FACTOR = 5;
const MAX_ABSOLUTE_HALF_WIDTH = 100;
const STEPS_PER_PRIOR_SD = 8;
const MIN_GRID_POINTS = 41;
const MAX_GRID_POINTS = 801;
const EDGE_MASS_TOLERANCE = 1e-4;
const MAX_WIDENING_ATTEMPTS = 10;
const FLAT_LIKELIHOOD_EPSILON = 1e-9;
const MIN_STEPS_PER_POSTERIOR_SD = 8;
const POSTERIOR_REFINEMENT_SPREAD = 10;

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
  const partnerIndexes = correlatedPartnerIndexes(cov.matrix, idx);

  if (partnerIndexes.length === 0) return { action: "independent" };

  if (partnerIndexes.length > JOINT_PRIOR_MAX_CORRELATED_PARTNERS) {
    return {
      action: "refuse",
      reason: jointPriorPartnerLimitMessage(
        measuredSmvId,
        partnerIndexes.map((j) => joint.smvIds[j])
      ),
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
 * a step-scaled integral. Pass `nodes` to pin the grid (the hand fixture).
 * Production calls estimateJointContinuousPosterior, which widens this
 * grid when the posterior sits on the edge.
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
  let modeI = 0;
  let modeJ = 0;
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
      if (lj > maxLogJoint) {
        maxLogJoint = lj;
        modeI = i;
        modeJ = j;
      }
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
  let measuredEdgeMass = 0;
  let partnerEdgeMass = 0;
  const lastI = axis.measured.length - 1;
  const lastJ = axis.partner.length - 1;
  for (let i = 0; i < axis.measured.length; i += 1) {
    for (let j = 0; j < axis.partner.length; j += 1) {
      const p = weight[i][j] / total;
      vx += (axis.measured[i] - ex) ** 2 * p;
      vy += (axis.partner[j] - ey) ** 2 * p;
      if (i === 0 || i === lastI) measuredEdgeMass += p;
      if (j === 0 || j === lastJ) partnerEdgeMass += p;
    }
  }

  const measuredSd = Math.sqrt(Math.max(vx, 0));
  const partnerSd = Math.sqrt(Math.max(vy, 0));
  if (![ex, ey, measuredSd, partnerSd].every((n) => Number.isFinite(n))) return null;

  let likMin = Infinity;
  let likMax = -Infinity;
  for (const ll of logLik) {
    if (ll < likMin) likMin = ll;
    if (ll > likMax) likMax = ll;
  }

  return {
    measured: { estimate: ex, sd: measuredSd },
    partner: { estimate: ey, sd: partnerSd },
    measuredEdgeMass,
    partnerEdgeMass,
    modeOnMeasuredBoundary: modeI === 0 || modeI === lastI,
    modeOnPartnerBoundary: modeJ === 0 || modeJ === lastJ,
    logLikelihoodRange: Number.isFinite(likMax - likMin) ? likMax - likMin : 0,
    measuredStep: uniformStep(axis.measured),
    partnerStep: uniformStep(axis.partner),
  };
}

/**
 * Production bivariate EAP. Widens each axis while posterior mass or the
 * mode sits on that edge, and refuses a flat likelihood instead of
 * returning the prior as a measurement. `boundaryLimited` stays false
 * only when a covering grid was found.
 */
export function estimateJointContinuousPosterior({
  scoredObservations,
  itemProbability,
  mean,
  covariance,
}) {
  const sd1 = Math.sqrt(covariance[0][0]);
  const sd2 = Math.sqrt(covariance[1][1]);
  if (!(sd1 > 0) || !(sd2 > 0)) return null;

  let spreadM = PRIOR_SPREAD_FACTOR;
  let spreadP = PRIOR_SPREAD_FACTOR;
  let last = null;

  for (let attempt = 0; attempt < MAX_WIDENING_ATTEMPTS; attempt += 1) {
    const nodes = {
      measured: axisFromMarginal(mean[0], sd1, spreadM),
      partner: axisFromMarginal(mean[1], sd2, spreadP),
    };
    const result = estimateBivariateJoint({
      scoredObservations,
      itemProbability,
      mean,
      covariance,
      nodes,
    });
    if (!result) return null;
    last = result;

    const flat =
      scoredObservations.length > 0 &&
      result.logLikelihoodRange < FLAT_LIKELIHOOD_EPSILON;
    const measuredTight =
      result.measuredEdgeMass > EDGE_MASS_TOLERANCE || result.modeOnMeasuredBoundary || flat;
    const partnerTight =
      result.partnerEdgeMass > EDGE_MASS_TOLERANCE || result.modeOnPartnerBoundary;

    if (!measuredTight && !partnerTight) {
      return refineJointPosterior({
        scoredObservations,
        itemProbability,
        mean,
        covariance,
        result,
      });
    }

    const nextM = measuredTight ? growSpread(spreadM, sd1) : spreadM;
    const nextP = partnerTight ? growSpread(spreadP, sd2) : spreadP;
    const stuck = nextM === spreadM && nextP === spreadP;
    spreadM = nextM;
    spreadP = nextP;

    if (stuck) {
      if (flat) return null;
      return { ...result, boundaryLimited: true, refined: false };
    }
  }

  if (
    last &&
    scoredObservations.length > 0 &&
    last.logLikelihoodRange < FLAT_LIKELIHOOD_EPSILON
  ) {
    return null;
  }
  return last ? { ...last, boundaryLimited: true, refined: false } : null;
}

function refineJointPosterior({
  scoredObservations,
  itemProbability,
  mean,
  covariance,
  result,
}) {
  const needMeasured =
    result.measured.sd > 0 &&
    result.measuredStep > 0 &&
    result.measured.sd / result.measuredStep < MIN_STEPS_PER_POSTERIOR_SD;
  const needPartner =
    result.partner.sd > 0 &&
    result.partnerStep > 0 &&
    result.partner.sd / result.partnerStep < MIN_STEPS_PER_POSTERIOR_SD;

  if (!needMeasured && !needPartner) {
    return { ...result, boundaryLimited: false, refined: false };
  }

  const nodes = {
    measured: needMeasured
      ? axisAround(
          result.measured.estimate,
          Math.max(result.measured.sd * POSTERIOR_REFINEMENT_SPREAD, result.measuredStep),
          result.measured.sd / STEPS_PER_PRIOR_SD
        )
      : axisFromMarginal(mean[0], Math.sqrt(covariance[0][0])),
    partner: needPartner
      ? axisAround(
          result.partner.estimate,
          Math.max(result.partner.sd * POSTERIOR_REFINEMENT_SPREAD, result.partnerStep),
          result.partner.sd / STEPS_PER_PRIOR_SD
        )
      : axisFromMarginal(mean[1], Math.sqrt(covariance[1][1])),
  };

  const remeasured = estimateBivariateJoint({
    scoredObservations,
    itemProbability,
    mean,
    covariance,
    nodes,
  });
  if (!remeasured) return { ...result, boundaryLimited: false, refined: false };
  return { ...remeasured, boundaryLimited: false, refined: true };
}

function growSpread(spread, sd) {
  const maxSpread = MAX_ABSOLUTE_HALF_WIDTH / sd;
  if (spread >= maxSpread - 1e-12) return spread;
  return Math.min(spread * 2, maxSpread);
}

function uniformStep(nodes) {
  if (!nodes || nodes.length < 2) return 0;
  return (nodes[nodes.length - 1] - nodes[0]) / (nodes.length - 1);
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

function axisFromMarginal(mean, sd, spreadFactor = PRIOR_SPREAD_FACTOR) {
  if (!(sd > 0) || !Number.isFinite(mean)) return null;
  const half = Math.min(spreadFactor * sd, MAX_ABSOLUTE_HALF_WIDTH);
  return axisBetween(mean - half, mean + half, sd / STEPS_PER_PRIOR_SD);
}

function axisAround(center, halfWidth, targetStep) {
  if (!Number.isFinite(center) || !(halfWidth > 0) || !(targetStep > 0)) return null;
  const half = Math.min(halfWidth, MAX_ABSOLUTE_HALF_WIDTH);
  return axisBetween(center - half, center + half, targetStep);
}

function axisBetween(min, max, targetStep) {
  const span = max - min;
  if (!(span > 0) || !(targetStep > 0) || !Number.isFinite(span)) return null;
  let points = Math.ceil(span / targetStep) + 1;
  points = Math.min(MAX_GRID_POINTS, Math.max(MIN_GRID_POINTS, points));
  if (points % 2 === 0) points += 1;
  if (points > MAX_GRID_POINTS) points = MAX_GRID_POINTS;
  const nodes = [];
  for (let i = 0; i < points; i += 1) {
    nodes.push(i === points - 1 ? max : min + (i * span) / (points - 1));
  }
  return nodes;
}
