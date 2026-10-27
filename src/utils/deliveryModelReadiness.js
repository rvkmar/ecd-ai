// Delivery model binding checks.
//
// A delivery model is the CAF deliverable: one student model, one assembly
// model, one selection policy, an optional presentation override, and the
// administration rules for that assessment. status is draft or confirmed.
// Confirm is the only promotion. There is no operational state here.
//
// Confirm requires each cited model to exist, and to be confirmed or
// operational where that collection has a status. A selection policy has
// no status, so existence is enough. Draft saves may cite draft parents.
// The same function feeds validateEntity and the screen's readiness chip.

import { PRESENTATION_FEEDBACK_TIMING_VALUES } from "./ecdVocabulary.js";

export const DELIVERY_MODEL_STATUS_VALUES = Object.freeze(["draft", "confirmed"]);

// "Active" in this product is operational. Suspended and archived are not
// a legal parent for a newly confirmed delivery model.
export const ACTIVE_BINDING_STATUSES = Object.freeze(["confirmed", "operational"]);

function blank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function administrationErrors(admin, required) {
  const errors = [];
  if (admin == null) {
    if (required) errors.push("administration rules are required.");
    return errors;
  }
  if (typeof admin !== "object" || Array.isArray(admin)) {
    errors.push("administration must be an object.");
    return errors;
  }

  if (admin.timeLimitMinutes != null && admin.timeLimitMinutes !== "") {
    const minutes = admin.timeLimitMinutes;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
      errors.push("administration.timeLimitMinutes must be a positive number or null.");
    }
  }

  const attemptsPresent = admin.attempts != null && admin.attempts !== "";
  if (!attemptsPresent) {
    if (required) errors.push("administration.attempts is required.");
  } else if (!Number.isInteger(admin.attempts) || admin.attempts < 1) {
    errors.push("administration.attempts must be an integer of at least 1.");
  }

  if (admin.allowedReview == null || admin.allowedReview === "") {
    if (required) errors.push("administration.allowedReview is required.");
  } else if (typeof admin.allowedReview !== "boolean") {
    errors.push("administration.allowedReview must be a boolean.");
  }

  if (blank(admin.feedbackMode)) {
    if (required) errors.push("administration.feedbackMode is required.");
  } else if (!PRESENTATION_FEEDBACK_TIMING_VALUES.includes(admin.feedbackMode)) {
    errors.push(
      `Invalid administration.feedbackMode '${admin.feedbackMode}'. Must be one of: ${PRESENTATION_FEEDBACK_TIMING_VALUES.join(", ")}.`
    );
  }

  return errors;
}

function parentStatusError(label, id, record) {
  const found = record?.status || "unknown";
  return `${label} '${id}' must be confirmed or operational to confirm this delivery model (found '${found}').`;
}

/**
 * Structural and referential errors for one delivery model.
 * requireReadyParents is true on confirm (and on the readiness probe).
 */
export function deliveryModelBindingErrors(obj, db = null, options = {}) {
  const errors = [];
  const requireReadyParents = options.requireReadyParents === true;
  const row = obj || {};

  if (blank(row.name)) {
    errors.push("Delivery model name is required.");
  }

  if (blank(row.status)) {
    errors.push("status is required.");
  } else if (!DELIVERY_MODEL_STATUS_VALUES.includes(row.status)) {
    errors.push(
      `Invalid delivery model status '${row.status}'. Must be draft or confirmed.`
    );
  }

  const pointers = [
    ["competencyModelId", row.competencyModelId],
    ["assemblyModelId", row.assemblyModelId],
    ["policyId", row.policyId],
    ["presentationModelId", row.presentationModelId],
  ];
  for (const [key, value] of pointers) {
    if (value == null || value === "") continue;
    if (typeof value !== "string") errors.push(`${key} must be a string.`);
  }

  const cmId = typeof row.competencyModelId === "string" ? row.competencyModelId.trim() : "";
  const amId = typeof row.assemblyModelId === "string" ? row.assemblyModelId.trim() : "";
  const policyId = typeof row.policyId === "string" ? row.policyId.trim() : "";
  const pmId = typeof row.presentationModelId === "string" ? row.presentationModelId.trim() : "";

  if (requireReadyParents) {
    if (!cmId) errors.push("competencyModelId is required.");
    if (!amId) errors.push("assemblyModelId is required.");
    if (!policyId) errors.push("policyId is required.");
  }

  errors.push(...administrationErrors(row.administration, requireReadyParents));

  if (db && !blank(row.name)) {
    const needle = String(row.name).trim().toLowerCase();
    const clash = (db.deliveryModels || []).find(
      (other) =>
        other &&
        other.id !== row.id &&
        String(other.name || "").trim().toLowerCase() === needle
    );
    if (clash) {
      errors.push(`Delivery model name '${row.name}' is already used by '${clash.id}'.`);
    }
  }

  if (!db) return errors;

  const cm = cmId ? (db.competencyModels || []).find((model) => model.id === cmId) : null;
  if (cmId && !cm) errors.push(`Invalid competencyModelId: ${cmId}`);
  if (cm && requireReadyParents && !ACTIVE_BINDING_STATUSES.includes(cm.status)) {
    errors.push(parentStatusError("Student model", cmId, cm));
  }

  const am = amId ? (db.assemblyModels || []).find((model) => model.id === amId) : null;
  if (amId && !am) errors.push(`Invalid assemblyModelId: ${amId}`);
  if (am && cmId && am.competencyModelId !== cmId) {
    errors.push(
      `assemblyModelId '${amId}' belongs to competency model '${am.competencyModelId}', not '${cmId}'.`
    );
  }
  if (am && requireReadyParents && !ACTIVE_BINDING_STATUSES.includes(am.status)) {
    errors.push(parentStatusError("Assembly model", amId, am));
  }

  if (policyId && !(db.policies || []).some((policy) => policy.id === policyId)) {
    errors.push(`Invalid policyId: ${policyId}`);
  }

  if (pmId) {
    const pm = (db.presentationModels || []).find((model) => model.id === pmId);
    if (!pm) errors.push(`Invalid presentationModelId: ${pmId}`);
    else if (requireReadyParents && !ACTIVE_BINDING_STATUSES.includes(pm.status)) {
      errors.push(parentStatusError("Presentation model", pmId, pm));
    }
  }

  return errors;
}

/**
 * Ready means confirm would accept this record. Status is probed as
 * confirmed so a finished draft can show Ready before the author confirms.
 */
export function deliveryModelReadiness(record, db) {
  const errors = deliveryModelBindingErrors(
    { ...(record || {}), status: "confirmed" },
    db,
    { requireReadyParents: true }
  );
  return { ready: errors.length === 0, errors };
}

export function sessionsCitingDeliveryModel(db, id) {
  if (!id) return [];
  return (db?.sessions || []).filter((session) => session && session.deliveryModelId === id);
}
