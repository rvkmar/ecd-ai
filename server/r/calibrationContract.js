// server/r/calibrationContract.js
// ADR 0002 request/response envelope. Twin of r-backend/app/modules/contract.R.
// Keep the version string and required fields in lockstep; both sides'
// contract tests read r-backend/app/tests/fixtures/*.json.

import { CALIBRATION_JOB_KIND_VALUES } from "../../src/utils/ecdVocabulary.js";

export const CALIBRATION_CONTRACT_VERSION = "1.0";

const CALIBRATION_MODEL_FAMILIES = [
  "irt",
  "dina",
  "gdina",
  "ctt",
  "dif",
  "equating",
  "item-analysis",
  "test-information",
  "attribute-profile",
];
const CALIBRATION_IRT_SUBTYPES = ["2PL", "3PL", "Rasch"];

const KIND_TO_R_PATH = {
  "irt-parameters": "/calibrate/irt",
  "dina-parameters": "/calibrate/dina",
  "ctt-statistics": "/calibrate/ctt",
  "dif-analysis": "/calibrate/dif",
  equating: "/calibrate/equating",
  "item-analysis": "/calibrate/item-analysis",
  "test-information": "/calibrate/test-information",
  // attribute-profile-summary is Node-only (D79); no R path on purpose.
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
    return errors;
  }

  if (!CALIBRATION_MODEL_FAMILIES.includes(model.family)) {
    errors.push(`model.family must be one of: ${CALIBRATION_MODEL_FAMILIES.join(", ")}`);
  }

  // D79: cohort posteriors, not a response matrix. Node worker only.
  if (model.family === "attribute-profile") {
    if (!Array.isArray(model.attributeIds) || model.attributeIds.length < 1) {
      errors.push("model.attributeIds must name at least one attribute");
    }
    const cohort = body.cohort;
    if (!cohort || typeof cohort !== "object" || Array.isArray(cohort)) {
      errors.push("cohort is required for family attribute-profile");
    } else if (!Array.isArray(cohort.members) || cohort.members.length < 2) {
      errors.push("cohort.members must name at least two persons");
    } else {
      cohort.members.forEach((member, i) => {
        if (!member || typeof member !== "object" || Array.isArray(member)) {
          errors.push(`cohort.members[${i}] must be an object`);
          return;
        }
        if (!member.personId || typeof member.personId !== "string") {
          errors.push(`cohort.members[${i}].personId is required`);
        }
        if (
          !member.posteriors ||
          typeof member.posteriors !== "object" ||
          Array.isArray(member.posteriors)
        ) {
          errors.push(`cohort.members[${i}].posteriors is required`);
        }
      });
    }
    if (body.options?.seed === undefined || body.options?.seed === null) {
      errors.push("options.seed is required (reproducibility is provenance)");
    }
    if (body.scope !== undefined && body.scope !== null) {
      if (typeof body.scope !== "object" || Array.isArray(body.scope)) {
        errors.push("scope must be an object when present");
      }
    }
    return errors;
  }

  if (model.family === "irt" && !CALIBRATION_IRT_SUBTYPES.includes(model.subtype)) {
    errors.push(`model.subtype must be one of: ${CALIBRATION_IRT_SUBTYPES.join(", ")}`);
  }
  if (!Array.isArray(model.itemIds) || model.itemIds.length < 2) {
    errors.push("model.itemIds must name at least two items");
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

  if (model?.family === "dif") {
    const groups = body.groups;
    if (!groups || typeof groups !== "object" || Array.isArray(groups)) {
      errors.push("groups is required for family dif");
    } else {
      if (!groups.reference || typeof groups.reference !== "string") {
        errors.push("groups.reference is required");
      }
      if (!groups.focal || typeof groups.focal !== "string") {
        errors.push("groups.focal is required");
      }
      if (groups.reference && groups.focal && groups.reference === groups.focal) {
        errors.push("groups.reference and groups.focal must differ");
      }
      if (!Array.isArray(groups.labels) || groups.labels.length < 2) {
        errors.push("groups.labels must name at least two persons");
      }
      const rmIds = body.responseMatrix?.personIds;
      if (Array.isArray(rmIds) && Array.isArray(groups.labels)) {
        if (groups.labels.length !== rmIds.length) {
          errors.push("groups.labels length must match responseMatrix.personIds");
        }
        if (Array.isArray(groups.personIds) && groups.personIds.length !== rmIds.length) {
          errors.push("groups.personIds must match responseMatrix.personIds in length");
        }
        if (Array.isArray(groups.personIds)) {
          const same =
            groups.personIds.length === rmIds.length &&
            groups.personIds.every((id, i) => id === rmIds[i]);
          if (!same) {
            errors.push("groups.personIds must match responseMatrix.personIds in order");
          }
        }
      }
      if (Array.isArray(groups.labels) && groups.reference && groups.focal) {
        const nRef = groups.labels.filter((g) => g === groups.reference).length;
        const nFoc = groups.labels.filter((g) => g === groups.focal).length;
        if (nRef < 2) errors.push("groups.labels must include at least two reference persons");
        if (nFoc < 2) errors.push("groups.labels must include at least two focal persons");
      }
    }
  }

  if (model?.family === "equating") {
    const forms = body.forms;
    if (!forms || typeof forms !== "object" || Array.isArray(forms)) {
      errors.push("forms is required for family equating");
    } else {
      if (!forms.formX || typeof forms.formX !== "string") {
        errors.push("forms.formX is required");
      }
      if (!forms.formY || typeof forms.formY !== "string") {
        errors.push("forms.formY is required");
      }
      if (forms.formX && forms.formY && forms.formX === forms.formY) {
        errors.push("forms.formX and forms.formY must differ");
      }
      if (!Array.isArray(forms.labels) || forms.labels.length < 2) {
        errors.push("forms.labels must name at least two persons");
      }
      if (!Array.isArray(forms.commonItemIds) || forms.commonItemIds.length < 2) {
        errors.push("forms.commonItemIds must name at least two common items");
      }
      const rmIds = body.responseMatrix?.personIds;
      if (Array.isArray(rmIds) && Array.isArray(forms.labels)) {
        if (forms.labels.length !== rmIds.length) {
          errors.push("forms.labels length must match responseMatrix.personIds");
        }
      }
      if (Array.isArray(forms.labels) && forms.formX && forms.formY) {
        const nX = forms.labels.filter((g) => g === forms.formX).length;
        const nY = forms.labels.filter((g) => g === forms.formY).length;
        if (nX < 2) errors.push("forms.labels must include at least two form-X persons");
        if (nY < 2) errors.push("forms.labels must include at least two form-Y persons");
      }
      const itemIds = model?.itemIds;
      if (Array.isArray(itemIds) && Array.isArray(forms.commonItemIds)) {
        const missing = forms.commonItemIds.filter((id) => !itemIds.includes(id));
        if (missing.length) {
          errors.push("forms.commonItemIds must be a subset of model.itemIds");
        }
      }
    }
  }

  const diagnosticFamily = model?.family === "dina" || model?.family === "gdina";
  if (diagnosticFamily && (body.qMatrix === undefined || body.qMatrix === null)) {
    errors.push("qMatrix is required for dina/gdina");
  }
  if (body.qMatrix !== undefined && body.qMatrix !== null) {
    if (typeof body.qMatrix !== "object" || Array.isArray(body.qMatrix)) {
      errors.push("qMatrix should be object");
    } else {
      const qm = body.qMatrix;
      if (!Array.isArray(qm.attributeIds) || qm.attributeIds.length < 1) {
        errors.push("qMatrix.attributeIds must name at least one attribute");
      }
      if (!Array.isArray(qm.itemIds) || qm.itemIds.length < 2) {
        errors.push("qMatrix.itemIds must name at least two items");
      }
      if (Array.isArray(model?.itemIds) && Array.isArray(qm.itemIds)) {
        const same =
          model.itemIds.length === qm.itemIds.length &&
          model.itemIds.every((id, i) => id === qm.itemIds[i]);
        if (!same) {
          errors.push("qMatrix.itemIds must match model.itemIds in order");
        }
      }
      if (!Array.isArray(qm.data) || qm.data.length === 0) {
        errors.push("qMatrix.data is required");
      } else if (Array.isArray(qm.itemIds) && qm.data.length !== qm.itemIds.length) {
        errors.push("qMatrix.data row count must match itemIds");
      } else if (Array.isArray(qm.attributeIds)) {
        qm.data.forEach((row, i) => {
          if (!Array.isArray(row) || row.length !== qm.attributeIds.length) {
            errors.push(`qMatrix.data[${i}] must have one cell per attributeId`);
          }
        });
      }
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
