// src/utils/jointPrior.js
//
// D128 / W26 / G14 (schema half) and R10 (design limit). A Competency
// Model may declare a joint prior over two or more *continuous* Student
// Model Variables — a multivariate normal with an authored covariance or
// correlation matrix.
//
// This is deliberately NOT the DINA/G-DINA attribute-profile joint
// (server/delivery/attributeAccumulation.js), which already maintains a
// discrete distribution over 2^K binary mastery profiles. Mixing the two
// is how the highest-risk accumulation code gets confused; binary SMVs
// are refused here.
//
// Scoring (D129, never-compress) consumes this field for continuous
// IRT/Rasch with at most one correlated partner. A full multivariate EAP
// is out of scope and is not a reopen of D129. BN, DINA, and CTT do not
// read this field. An n-dimensional matrix of disjoint pairs is still
// valid; an SMV with two or more non-zero off-diagonals is refused at
// confirm and at scoring rather than dropping a dimension.

export const JOINT_PRIOR_FAMILIES = Object.freeze(["multivariate_normal"]);
export const JOINT_PRIOR_PARAMETERIZATIONS = Object.freeze([
  "covariance",
  "correlation",
]);

/** Scoring and confirm share this cap so they cannot drift. */
export const JOINT_PRIOR_MAX_CORRELATED_PARTNERS = 1;
export const JOINT_PRIOR_ZERO_COVARIANCE = 1e-12;

const SYMMETRY_EPS = 1e-9;
const PSD_EPS = 1e-10;
const DIAG_ONE_EPS = 1e-9;

/**
 * Continuous SMVs that can participate in a multivariate_normal joint.
 */
export function continuousSmVariables(smVariables) {
  return (smVariables || []).filter(
    (smv) => smv && typeof smv === "object" && smv.type === "continuous" && smv.id
  );
}

/**
 * Default independent joint: diagonal covariance from each continuous
 * SMV's normal prior sd² (falls back to 1 when the marginal is missing or
 * not normal). Authors who want correlation must replace this matrix;
 * leaving jointPrior absent means the same independent-marginals behaviour
 * delivery already has today.
 */
export function defaultIndependentJointPrior(smVariables) {
  const continuous = continuousSmVariables(smVariables);
  if (continuous.length < 2) return null;

  const smvIds = continuous.map((smv) => smv.id);
  const n = smvIds.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const prior = continuous[i].priorDistribution;
    let variance = 1;
    if (
      prior?.family === "normal" &&
      typeof prior.params?.sd === "number" &&
      Number.isFinite(prior.params.sd) &&
      prior.params.sd > 0
    ) {
      variance = prior.params.sd * prior.params.sd;
    }
    matrix[i][i] = variance;
  }
  return {
    family: "multivariate_normal",
    parameterization: "covariance",
    smvIds,
    matrix,
  };
}

/**
 * Validate jointPrior against the model's smVariables. Returns an array of
 * human-readable errors (empty ⇒ well-formed). Called from schema.js so
 * the confirm path and unit tests share one gate.
 */
export function jointPriorErrors(jointPrior, smVariables) {
  const errors = [];
  if (jointPrior === undefined || jointPrior === null) return errors;

  if (typeof jointPrior !== "object" || Array.isArray(jointPrior)) {
    errors.push("jointPrior must be an object.");
    return errors;
  }

  const { family, parameterization, smvIds, matrix } = jointPrior;

  if (!JOINT_PRIOR_FAMILIES.includes(family)) {
    errors.push(
      `jointPrior.family must be one of: ${JOINT_PRIOR_FAMILIES.join(", ")} (continuous SMVs only; binary attribute-profile joints live in DINA accumulation, not here).`
    );
  }

  if (!JOINT_PRIOR_PARAMETERIZATIONS.includes(parameterization)) {
    errors.push(
      `jointPrior.parameterization must be one of: ${JOINT_PRIOR_PARAMETERIZATIONS.join(", ")}.`
    );
  }

  if (!Array.isArray(smvIds)) {
    errors.push("jointPrior.smvIds must be an array of continuous SMV ids.");
    return errors;
  }
  if (smvIds.length < 2) {
    errors.push(
      "jointPrior.smvIds must name at least two continuous Student Model Variables."
    );
  }

  const byId = new Map(
    (smVariables || [])
      .filter((smv) => smv && typeof smv === "object" && smv.id)
      .map((smv) => [smv.id, smv])
  );
  const seen = new Set();
  for (let i = 0; i < smvIds.length; i++) {
    const id = smvIds[i];
    const tag = `jointPrior.smvIds[${i}]`;
    if (typeof id !== "string" || id.trim() === "") {
      errors.push(`${tag} must be a non-empty string.`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${tag} duplicates smvId '${id}'.`);
    }
    seen.add(id);
    const smv = byId.get(id);
    if (!smv) {
      errors.push(
        `${tag} '${id}' is not declared on this competency model's smVariables.`
      );
      continue;
    }
    if (smv.type !== "continuous") {
      errors.push(
        `${tag} '${id}' is type '${smv.type}'; multivariate_normal joint priors admit continuous SMVs only (binary attributes use the DINA profile joint).`
      );
    }
  }

  const n = smvIds.length;
  if (!Array.isArray(matrix)) {
    errors.push("jointPrior.matrix must be a square numeric array.");
    return errors;
  }
  if (matrix.length !== n) {
    errors.push(
      `jointPrior.matrix has ${matrix.length} rows but smvIds has length ${n}; dimensions must match.`
    );
  }

  let numericOk = true;
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length !== matrix.length) {
      errors.push(
        `jointPrior.matrix must be square; row ${i} has length ${Array.isArray(row) ? row.length : "non-array"} (expected ${matrix.length}).`
      );
      numericOk = false;
      continue;
    }
    for (let j = 0; j < row.length; j++) {
      const v = row[j];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        errors.push(`jointPrior.matrix[${i}][${j}] must be a finite number.`);
        numericOk = false;
      }
    }
  }

  if (!numericOk || matrix.length !== n || n < 2) {
    return errors;
  }

  if (!isSymmetric(matrix, SYMMETRY_EPS)) {
    errors.push(
      "jointPrior.matrix must be symmetric (covariance / correlation matrices are symmetric by definition)."
    );
  }

  if (parameterization === "correlation") {
    for (let i = 0; i < n; i++) {
      if (Math.abs(matrix[i][i] - 1) > DIAG_ONE_EPS) {
        errors.push(
          `jointPrior.matrix[${i}][${i}] must be 1 for a correlation parameterization (got ${matrix[i][i]}).`
        );
      }
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const r = matrix[i][j];
        if (r < -1 - DIAG_ONE_EPS || r > 1 + DIAG_ONE_EPS) {
          errors.push(
            `jointPrior.matrix[${i}][${j}] = ${r} is outside [-1, 1] for a correlation matrix.`
          );
        }
      }
    }
  } else if (parameterization === "covariance") {
    for (let i = 0; i < n; i++) {
      if (!(matrix[i][i] > 0)) {
        errors.push(
          `jointPrior.matrix[${i}][${i}] must be a positive variance for a covariance parameterization (got ${matrix[i][i]}).`
        );
      }
    }
  }

  if (!isPositiveSemiDefinite(matrix, PSD_EPS)) {
    errors.push(
      "jointPrior.matrix is not positive semi-definite; a malformed covariance / correlation would produce nonsense posteriors later and is refused here."
    );
  }

  return errors;
}

/**
 * Off-diagonal indexes whose absolute value exceeds the zero cutoff.
 * Used on the authored matrix (schema) and on the converted covariance
 * (scoring); zeros stay zeros under correlation → covariance.
 */
export function correlatedPartnerIndexes(
  matrix,
  idx,
  eps = JOINT_PRIOR_ZERO_COVARIANCE
) {
  const partners = [];
  if (!Array.isArray(matrix) || !Array.isArray(matrix[idx])) return partners;
  for (let j = 0; j < matrix.length; j += 1) {
    if (j === idx) continue;
    const v = matrix[idx][j];
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > eps) {
      partners.push(j);
    }
  }
  return partners;
}

export function jointPriorPartnerLimitMessage(smvId, partnerIds) {
  const names = Array.isArray(partnerIds) ? partnerIds.join(", ") : "";
  const n = Array.isArray(partnerIds) ? partnerIds.length : 0;
  return `Student Model Variable '${smvId}' is correlated with ${n} other continuous SMVs (${names}). Joint accumulation updates one partner; refusing rather than dropping a dimension.`;
}

/**
 * R10 design limit. Empty when every SMV has at most one correlated
 * partner (including a larger matrix of disjoint pairs). Shape errors
 * stay in jointPriorErrors so a draft can still hold a well-formed
 * three-way joint while it is being edited; confirm (strict) and scoring
 * refuse it.
 */
export function jointPriorPartnerLimitErrors(jointPrior) {
  const errors = [];
  if (!jointPrior || typeof jointPrior !== "object" || Array.isArray(jointPrior)) {
    return errors;
  }
  const { smvIds, matrix } = jointPrior;
  if (!Array.isArray(smvIds) || !Array.isArray(matrix) || matrix.length !== smvIds.length) {
    return errors;
  }
  for (let i = 0; i < smvIds.length; i += 1) {
    const partners = correlatedPartnerIndexes(matrix, i);
    if (partners.length > JOINT_PRIOR_MAX_CORRELATED_PARTNERS) {
      errors.push(
        jointPriorPartnerLimitMessage(
          smvIds[i],
          partners.map((j) => smvIds[j])
        )
      );
    }
  }
  return errors;
}

function isSymmetric(matrix, eps) {
  const n = matrix.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[i][j] - matrix[j][i]) > eps) return false;
    }
  }
  return true;
}

/**
 * Cholesky with a small diagonal jitter for numerical PSD checks.
 * Fails closed on non-PSD input (including indefinite correlation matrices
 * like [[1, 0.9], [0.9, 1]]'s known-good counterpart vs [[1, 0.99],[0.99,1]]
 * near singularity — those still pass; [[1, 2],[2, 1]] fails).
 */
export function isPositiveSemiDefinite(matrix, eps = PSD_EPS) {
  const n = matrix.length;
  if (n === 0) return false;
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (sum < -eps) return false;
        L[i][j] = Math.sqrt(Math.max(sum, 0));
      } else {
        if (L[j][j] <= eps) {
          if (Math.abs(sum) > eps) return false;
          L[i][j] = 0;
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
  }
  return true;
}
