// Full inferential audit for an Evidence Model.
// Step 7 displays this, and the confirmation step uses the same result
// whether or not Step 7 was opened in this sitting. stepValidity only
// records a step that has been mounted, so it cannot be the gate.

import { validateEntity } from "../../../utils/schema";

export const EVAL_METHODS = ["key", "rubric", "auto", "process_log"];
export const DIF_STATUSES = ["pending", "pass", "fail", "na"];

export const DEFAULT_DIF = [
  { id: "dif_gender", prompt: "Gender DIF review planned or completed for bound items?", status: "pending" },
  { id: "dif_language", prompt: "Language-load / translation review completed?", status: "pending" },
  { id: "dif_access", prompt: "Accessibility / sensory-motor demands reviewed?", status: "pending" },
];

export function computeEvidenceInferentialAudit({ draftModel, db } = {}) {
  const observables = draftModel?.observables || [];
  const warrants = draftModel?.warrants || [];
  const evidenceRules = draftModel?.evidenceRules || [];
  const models = draftModel?.statisticalModels || [];
  const evaluationProcedures = draftModel?.evaluationProcedures || [];
  const difReviewChecklist = draftModel?.difReviewChecklist?.length
    ? draftModel.difReviewChecklist
    : DEFAULT_DIF;

  const schemaAudit = draftModel
    ? validateEntity("evidenceModels", draftModel, db)
    : null;

  const inferentialIssues = [];
  observables.forEach((obs) => {
    const warrant = warrants.find((w) => w.id === obs.warrantId);
    const rule = evidenceRules.find((r) => r.observableId === obs.id);
    if (!warrant) inferentialIssues.push(`Observable ${obs.id} not linked to valid warrant`);
    if (!rule) {
      inferentialIssues.push(`Observable ${obs.id} missing EvidenceRule`);
      return;
    }
    if (!rule.justification?.includes("warrant") && !warrant) {
      inferentialIssues.push(`Observable ${obs.id} has weak inferential justification`);
    }
    if (rule.direction === "neutral") {
      inferentialIssues.push(`Observable ${obs.id} contributes no directional evidence`);
    }
  });
  const inferentialAudit = { valid: inferentialIssues.length === 0, issues: inferentialIssues };

  const modelIssues = [];
  evidenceRules.forEach((rule) => {
    if (rule.direction === "weakens" && models.some((m) => m.type === "irt")) {
      modelIssues.push(`IRT does not support 'weakens' directly (observable ${rule.observableId})`);
    }
    if (rule.direction === "neutral" && models.some((m) => m.type === "irt")) {
      modelIssues.push(`Neutral evidence ignored in IRT (observable ${rule.observableId})`);
    }
  });
  const modelAudit = { valid: modelIssues.length === 0, issues: modelIssues };

  const enterpriseIssues = [];
  const byObs = new Map();
  evaluationProcedures.forEach((p) => {
    if (!p?.observableId) return;
    byObs.set(p.observableId, (byObs.get(p.observableId) || 0) + 1);
  });
  observables.forEach((obs) => {
    const n = byObs.get(obs.id) || 0;
    if (n === 0) enterpriseIssues.push(`Observable ${obs.id} needs an evaluationProcedure (TR9 evaluation component).`);
  });
  evaluationProcedures.forEach((p) => {
    if (p.observableId && !observables.some((o) => o.id === p.observableId)) {
      enterpriseIssues.push(`evaluationProcedure ${p.id || "?"} cites unknown observable ${p.observableId}.`);
    }
    if (!p.method || !EVAL_METHODS.includes(p.method)) {
      enterpriseIssues.push(`evaluationProcedure ${p.id || "?"} needs method: key|rubric|auto|process_log.`);
    }
    if (!p.workProductType) {
      enterpriseIssues.push(`evaluationProcedure ${p.id || "?"} needs workProductType.`);
    }
    if (!p.description || String(p.description).trim().length < 10) {
      enterpriseIssues.push(`evaluationProcedure ${p.id || "?"} needs a meaningful description.`);
    }
    if (["key", "rubric", "auto"].includes(p.method)) {
      const hasRef = p.artifactRef && String(p.artifactRef).trim().length > 0;
      const art = p.artifact;
      const artifactOk =
        art &&
        typeof art === "object" &&
        ((art.kind === "key" && Array.isArray(art.correctPatterns) && art.correctPatterns.length > 0) ||
          (art.kind === "rubric" && Array.isArray(art.dimensions) && art.dimensions.length > 0) ||
          (art.kind === "auto" && (art.scorerId || art.config)));
      if (!hasRef && !artifactOk) {
        enterpriseIssues.push(`evaluationProcedure ${p.id || "?"} needs artifactRef or inline artifact for method '${p.method}'.`);
      }
    }
  });

  const activeSm = models.find((m) => m.active);
  const modelObs = new Set(activeSm?.structureConfig?.observableIds || []);
  observables.forEach((obs) => {
    const hasRule =
      evidenceRules.some((r) => r.observableId === obs.id) ||
      !!obs.evidenceRule;
    if (!hasRule) enterpriseIssues.push(`Observable ${obs.id}: pipeline missing evidenceRule.`);
    if (activeSm && modelObs.size > 0 && !modelObs.has(obs.id)) {
      enterpriseIssues.push(`Observable ${obs.id}: not in active statistical model observableIds.`);
    }
  });

  if (!draftModel?.fairnessNotes || String(draftModel.fairnessNotes).trim().length < 20) {
    enterpriseIssues.push("fairnessNotes must be at least 20 characters before leaving this step.");
  }
  if (difReviewChecklist.length < 3) {
    enterpriseIssues.push("difReviewChecklist needs at least 3 entries.");
  }
  const enterpriseAudit = { valid: enterpriseIssues.length === 0, issues: enterpriseIssues };

  const errors = [
    ...(schemaAudit?.errors || []),
    ...inferentialAudit.issues,
    ...modelAudit.issues,
    ...enterpriseAudit.issues,
  ];

  const isValid = Boolean(
    schemaAudit?.valid &&
      inferentialAudit.valid &&
      modelAudit.valid &&
      enterpriseAudit.valid
  );

  return {
    schemaAudit,
    inferentialAudit,
    modelAudit,
    enterpriseAudit,
    errors,
    isValid,
  };
}
