// server/r/calibrationContract.js
// ADR 0002 request/response envelope. Twin of r-backend/app/modules/contract.R.
// Keep the version string and required fields in lockstep; both sides'
// contract tests read r-backend/app/tests/fixtures/*.json.

import { CALIBRATION_JOB_KIND_VALUES } from "../../src/utils/ecdVocabulary.js";

export const CALIBRATION_CONTRACT_VERSION = "1.0";

const CALIBRATION_MODEL_FAMILIES = ["irt", "dina", "gdina", "ctt"];
const CALIBRATION_IRT_SUBTYPES = ["2PL", "3PL", "Rasch"];

const KIND_TO_R_PATH = {
  "irt-parameters": "/calibrate/irt",
  "dina-parameters": "/calibrate/dina",
  "ctt-statistics": "/calibrate/ctt",
};

export function rPathForJobKind(kind) {
  return KIND_TO_R_PATH[kind] || null;
}

export function validateCalibrationRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["Request body must be a JSON object"];
  }

  if (body.contractVersion !== CALIBRATION_CONTRACT_VERSION) {
    errors.push(`contractVersion must be '${CALIBRATION_CONTRACT_VERSION}'`);
  }
  if (!body.jobId || typeof body.jobId !== "string") {
    errors.push("jobId is required");
  }

  const model = body.model;
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    errors.push("model is required");
  } else {
    if (!CALIBRATION_MODEL_FAMILIES.includes(model.family)) {
      errors.push(`model.family must be one of: ${CALIBRATION_MODEL_FAMILIES.join(", ")}`);
    }
    if (model.family === "irt" && !CALIBRATION_IRT_SUBTYPES.includes(model.subtype)) {
      errors.push(`model.subtype must be one of: ${CALIBRATION_IRT_SUBTYPES.join(", ")}`);
    }
    if (!Array.isArray(model.itemIds) || model.itemIds.length < 2) {
      errors.push("model.itemIds must name at least two items");
    }
  }

  const rm = body.responseMatrix;
  if (!rm || typeof rm !== "object" || Array.isArray(rm)) {
    errors.push("responseMatrix is required");
  } else {
    if (!Array.isArray(rm.personIds) || rm.personIds.length < 2) {
      errors.push("responseMatrix.personIds must name at least two persons");
    }
    if (!Array.isArray(rm.itemIds) || rm.itemIds.length < 2) {
      errors.push("responseMatrix.itemIds must name at least two items");
    }
    if (Array.isArray(model?.itemIds) && Array.isArray(rm.itemIds)) {
      const same =
        model.itemIds.length === rm.itemIds.length &&
        model.itemIds.every((id, i) => id === rm.itemIds[i]);
      if (!same) {
        errors.push("model.itemIds must match responseMatrix.itemIds in order");
      }
    }
    if (!Array.isArray(rm.data) || rm.data.length === 0) {
      errors.push("responseMatrix.data is required");
    } else if (Array.isArray(rm.personIds) && rm.data.length !== rm.personIds.length) {
      errors.push("responseMatrix.data row count must match personIds");
    } else if (Array.isArray(rm.itemIds)) {
      rm.data.forEach((row, i) => {
        if (!Array.isArray(row) || row.length !== rm.itemIds.length) {
          errors.push(`responseMatrix.data[${i}] must have one cell per itemId`);
        }
      });
    }
  }

  if (body.options?.seed === undefined || body.options?.seed === null) {
    errors.push("options.seed is required (reproducibility is provenance)");
  }

  if (body.qMatrix !== undefined && body.qMatrix !== null) {
    if (typeof body.qMatrix !== "object" || Array.isArray(body.qMatrix)) {
      errors.push("qMatrix should be object");
    }
  }

  return errors;
}

// jsonlite/plumber without auto_unbox serializes length-1 vectors as
// JSON arrays ("healthy" -> ["healthy"]). Unwrap those scalars so the
// ADR 0002 fields stay strings/numbers/booleans. Do not collapse a
// length-1 object/array cell — that could be real data.
export function unboxPlumberScalars(value) {
  if (Array.isArray(value)) {
    if (value.length === 1 && (value[0] === null || typeof value[0] !== "object")) {
      return value[0];
    }
    return value.map(unboxPlumberScalars);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = unboxPlumberScalars(child);
    }
    return out;
  }
  return value;
}

export function validateCalibrationResponse(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["Response body must be a JSON object"];
  }
  if (body.contractVersion !== CALIBRATION_CONTRACT_VERSION) {
    errors.push(`contractVersion must be '${CALIBRATION_CONTRACT_VERSION}'`);
  }
  if (!body.jobId || typeof body.jobId !== "string") {
    errors.push("jobId is required");
  }
  if (typeof body.converged !== "boolean") {
    errors.push("converged must be a boolean");
  }
  if (body.converged === true) {
    if (!body.packageVersion) {
      errors.push("packageVersion is required when converged is true");
    }
    if (typeof body.sampleSize !== "number" || body.sampleSize <= 0) {
      errors.push("sampleSize must be a positive number when converged is true");
    }
    if (!body.calibratedAt) {
      errors.push("calibratedAt is required when converged is true");
    }
    if (!body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) {
      errors.push("parameters is required when converged is true");
    }
    if (body.standardErrors !== undefined && body.standardErrors !== null) {
      if (typeof body.standardErrors !== "object" || Array.isArray(body.standardErrors)) {
        errors.push("standardErrors should be object");
      }
    }
    if (body.fitStatistics !== undefined && body.fitStatistics !== null) {
      if (typeof body.fitStatistics !== "object" || Array.isArray(body.fitStatistics)) {
        errors.push("fitStatistics should be object");
      }
    }
  }
  return errors;
}

// Build the parameterSets[] entry stored on ingest. Maps 1:1 from the R
// response -- no reshaping of parameters / SEs / fit (ADR 0002).
export function parameterSetFromCalibrationResponse(response, extras = {}) {
  return {
    parameterSetId: extras.parameterSetId,
    parameters: response.parameters,
    standardErrors: response.standardErrors ?? undefined,
    fitStatistics: response.fitStatistics ?? undefined,
    packageVersion: response.packageVersion,
    converged: response.converged,
    sampleSize: response.sampleSize,
    calibratedAt: response.calibratedAt,
    calibrationKind: extras.calibrationKind,
    calibrationJobId: extras.calibrationJobId,
    calibratedBy: extras.calibratedBy || "r-backend",
    calibrationMethod: extras.calibrationMethod || "r-job",
    notes: extras.notes || "",
  };
}

export function isDeclaredJobKind(kind) {
  return CALIBRATION_JOB_KIND_VALUES.includes(kind);
}
