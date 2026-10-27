// Labels, readiness, and ingredient groups for the delivery model screens.
// Readiness is deliveryModelReadiness, the same check confirm runs.

import { deliveryModelReadiness } from "@/utils/deliveryModelReadiness";
import { PRESENTATION_FEEDBACK_TIMINGS } from "@/utils/ecdVocabulary";

export function statusText(record) {
  return record?.status === "confirmed" ? "confirmed" : "draft";
}

export function dbForDeliveryModel(record, lists = {}) {
  const models = lists.deliveryModels || [];
  const withSelf = models.some((row) => row.id === record?.id)
    ? models
    : record?.id
      ? [...models, record]
      : models;
  return {
    deliveryModels: withSelf,
    competencyModels: lists.competencyModels || [],
    assemblyModels: lists.assemblyModels || [],
    policies: lists.policies || [],
    presentationModels: lists.presentationModels || [],
    sessions: lists.sessions || [],
  };
}

export function readinessOf(record, lists) {
  return deliveryModelReadiness(record, dbForDeliveryModel(record, lists)).ready
    ? "ready"
    : "not-ready";
}

export function readinessText(record, lists) {
  return readinessOf(record, lists) === "ready" ? "Ready" : "Not ready";
}

export function readinessErrors(record, lists) {
  return deliveryModelReadiness(record, dbForDeliveryModel(record, lists)).errors;
}

export function labelOf(list, id) {
  if (!id) return "";
  const row = (list || []).find((item) => item && item.id === id);
  return row?.name || id;
}

export function sessionsCiting(record, sessions) {
  if (!record?.id) return [];
  return (sessions || []).filter((session) => session && session.deliveryModelId === record.id);
}

export function isDeliveryModelInUse(record, sessions) {
  return sessionsCiting(record, sessions).length > 0;
}

export function feedbackLabel(value) {
  const match = PRESENTATION_FEEDBACK_TIMINGS.find((row) => row.value === value);
  return match?.label || value || "Unset";
}

export function administrationSummary(admin = {}) {
  const minutes =
    admin.timeLimitMinutes == null || admin.timeLimitMinutes === ""
      ? "no time limit"
      : `${admin.timeLimitMinutes} min`;
  const attempts =
    admin.attempts == null || admin.attempts === ""
      ? "attempts unset"
      : `${admin.attempts} ${Number(admin.attempts) === 1 ? "attempt" : "attempts"}`;
  const review =
    admin.allowedReview === true
      ? "review allowed"
      : admin.allowedReview === false
        ? "review off"
        : "review unset";
  const carry = admin.carryForward === true ? "carry forward on" : "carry forward off";
  return `${minutes}, ${attempts}, ${review}, ${feedbackLabel(admin.feedbackMode)}, ${carry}`;
}

export function uniqueDeliveryCopyName(name, records) {
  const source = String(name || "Delivery model").trim() || "Delivery model";
  const taken = new Set(
    (records || []).map((row) => String(row?.name || "").trim().toLowerCase())
  );
  const first = `${source} (copy)`;
  if (!taken.has(first.toLowerCase())) return first;
  let n = 2;
  while (taken.has(`${source} (copy ${n})`.toLowerCase())) n += 1;
  return `${source} (copy ${n})`;
}

export function ingredientGroups(record, lists) {
  const admin = record.administration || {};
  const citing = sessionsCiting(record, lists.sessions);
  const time =
    admin.timeLimitMinutes == null || admin.timeLimitMinutes === ""
      ? "No time limit"
      : `${admin.timeLimitMinutes} minutes`;
  return [
    {
      key: "description",
      label: "Description",
      items: [
        {
          id: "description",
          primary: String(record.description || "").trim() || "No description yet.",
        },
      ],
    },
    {
      key: "student",
      label: "Student model",
      items: record.competencyModelId
        ? [
            {
              id: record.competencyModelId,
              primary: labelOf(lists.competencyModels, record.competencyModelId),
            },
          ]
        : [],
    },
    {
      key: "assembly",
      label: "Assembly model",
      items: record.assemblyModelId
        ? [
            {
              id: record.assemblyModelId,
              primary: labelOf(lists.assemblyModels, record.assemblyModelId),
            },
          ]
        : [],
    },
    {
      key: "policy",
      label: "Selection policy",
      items: record.policyId
        ? [{ id: record.policyId, primary: labelOf(lists.policies, record.policyId) }]
        : [],
    },
    {
      key: "presentation",
      label: "Presentation model",
      items: record.presentationModelId
        ? [
            {
              id: record.presentationModelId,
              primary: labelOf(lists.presentationModels, record.presentationModelId),
            },
          ]
        : [],
    },
    {
      key: "administration",
      label: "Administration",
      items: [
        { id: "time", primary: `Time limit: ${time}` },
        {
          id: "attempts",
          primary: `Attempts: ${admin.attempts == null ? "unset" : admin.attempts}`,
        },
        {
          id: "review",
          primary: `Review: ${
            admin.allowedReview === true ? "allowed" : admin.allowedReview === false ? "off" : "unset"
          }`,
        },
        { id: "feedback", primary: `Feedback: ${feedbackLabel(admin.feedbackMode)}` },
        {
          id: "carry",
          primary: `Carry estimates forward: ${admin.carryForward === true ? "on" : "off"}`,
        },
      ],
    },
    {
      key: "sessions",
      label: "Sessions",
      items: citing.map((session) => ({
        id: session.id,
        primary: session.studentId ? `${session.id} (${session.studentId})` : session.id,
      })),
    },
  ];
}

export function deleteBlockedMessage(count) {
  const noun = count === 1 ? "session cites" : "sessions cite";
  return `Remove the citation before deleting. ${count} ${noun} this delivery model.`;
}
