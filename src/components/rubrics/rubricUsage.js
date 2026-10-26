// Shared readers for the Rubric dashboard, structure table, and manage
// list. A rubric is in use when an evidence model cites it on an
// evaluation procedure or on a phase, or a design pattern lists it.
// Readiness is the strict client mirror.
//
// The delete route only rejects evaluationProcedures[].rubricId. The
// manage button also stays disabled for a phase citation or a design
// pattern citation, so those links are not dropped by a delete the
// route would allow.

import { exemplarCount } from "@/utils/rubricDelivery";
import { rubricReadiness } from "@/utils/rubricReadiness";

export function procedureEvidenceModels(evidenceModels, rubricId) {
  if (!rubricId) return [];
  return (evidenceModels || []).filter((model) =>
    (model?.evaluationProcedures || []).some((proc) => proc?.rubricId === rubricId)
  );
}

export function phaseEvidenceModels(evidenceModels, rubricId) {
  if (!rubricId) return [];
  return (evidenceModels || []).filter((model) =>
    (model?.evaluationProcedures || []).some((proc) =>
      (proc?.phases || []).some((phase) => phase?.rubricId === rubricId)
    )
  );
}

export function evidenceModelsUsingRubric(evidenceModels, rubricId) {
  const seen = new Set();
  const combined = [];
  for (const model of [
    ...procedureEvidenceModels(evidenceModels, rubricId),
    ...phaseEvidenceModels(evidenceModels, rubricId),
  ]) {
    const key = model?.id || model;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(model);
  }
  return combined;
}

/** Procedure citations only. Matches the delete route's check. */
export function consumersForRubric(evidenceModels, rubricId) {
  return procedureEvidenceModels(evidenceModels, rubricId);
}

export function designPatternsUsingRubric(patterns, rubricId) {
  if (!rubricId) return [];
  return (patterns || []).filter((pattern) =>
    (pattern?.potentialRubrics || []).some((entry) => entry?.rubricId === rubricId)
  );
}

function procedureIds(model, rubricId) {
  return (model?.evaluationProcedures || [])
    .filter((proc) => proc?.rubricId === rubricId)
    .map((proc) => proc.id)
    .filter(Boolean);
}

function phaseLabels(model, rubricId) {
  const labels = [];
  for (const proc of model?.evaluationProcedures || []) {
    (proc?.phases || []).forEach((phase, index) => {
      if (phase?.rubricId !== rubricId) return;
      const order = phase.order ?? index + 1;
      labels.push(proc?.id ? `phase ${order} on ${proc.id}` : `phase ${order}`);
    });
  }
  return labels;
}

export function usageCounts(record, context = {}) {
  const id = record?.id;
  return {
    procedures: procedureEvidenceModels(context.evidenceModels, id),
    phases: phaseEvidenceModels(context.evidenceModels, id),
    evidenceModels: evidenceModelsUsingRubric(context.evidenceModels, id),
    designPatterns: designPatternsUsingRubric(context.designPatterns, id),
  };
}

export function isRubricInUse(record, context) {
  const counts = usageCounts(record, context);
  return counts.evidenceModels.length + counts.designPatterns.length > 0;
}

export function rubricReadinessValue(record) {
  return rubricReadiness(record, { strict: true }).ready ? "ready" : "not-ready";
}

export function readinessText(record) {
  return rubricReadinessValue(record) === "ready" ? "Ready" : "Not ready";
}

export function criteriaCount(record) {
  return Array.isArray(record?.dimensions) ? record.dimensions.length : 0;
}

export function levelCount(record) {
  return (record?.dimensions || []).reduce(
    (widest, dimension) =>
      Math.max(widest, Array.isArray(dimension?.levels) ? dimension.levels.length : 0),
    0
  );
}

export function hasExemplar(record) {
  return exemplarCount(record) > 0;
}

export function criteriaBucket(record) {
  const count = criteriaCount(record);
  if (count <= 0) return "0";
  if (count >= 4) return "4+";
  return String(count);
}

export function levelBucket(record) {
  const count = levelCount(record);
  if (count === 2 || count === 4) return String(count);
  if (count <= 0) return "0";
  return "other";
}

export function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function shapeSummary(record) {
  return [
    countLabel(criteriaCount(record), "criterion", "criteria"),
    countLabel(levelCount(record), "level", "levels"),
  ].join(" · ");
}

export function usageSummary(record, context) {
  const counts = usageCounts(record, context);
  return [
    countLabel(counts.evidenceModels.length, "evidence model", "evidence models"),
    countLabel(counts.designPatterns.length, "design pattern", "design patterns"),
  ].join(" · ");
}

export function recordLabel(row) {
  return row?.name || row?.title || row?.id || "Untitled";
}

export function nameList(rows) {
  if (!rows?.length) return "none";
  return rows.map((row) => recordLabel(row)).join("; ");
}

export function statusText(record) {
  return record?.status || "draft";
}

/**
 * Names are unique case-insensitively. The first free name is
 * "<name> (copy)", then "<name> (copy 2)", and so on.
 */
export function uniqueRubricCopyName(name, records = []) {
  const taken = new Set(
    (records || [])
      .map((row) => String(row?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const base = String(name || "").trim() || "Rubric";
  let candidate = `${base} (copy)`;
  if (!taken.has(candidate.toLowerCase())) return candidate;
  let n = 2;
  do {
    candidate = `${base} (copy ${n})`;
    n += 1;
  } while (taken.has(candidate.toLowerCase()));
  return candidate;
}

export function rubricDeleteBlockedMessage(contextLabel) {
  return `Cannot delete: this rubric is in use (${contextLabel}). Remove those citations first.`;
}

function levelLabel(level) {
  if (level == null) return "";
  if (typeof level === "object") return level.label || String(level.value ?? "");
  return String(level);
}

export function ingredientGroupsForRubric(record, context) {
  const description = String(record?.description || "").trim();
  const counts = usageCounts(record, context);
  const dimensions = Array.isArray(record?.dimensions) ? record.dimensions : [];

  const exemplarItems = [];
  dimensions.forEach((dimension) => {
    (dimension?.levels || []).forEach((level) => {
      if (!level || typeof level !== "object") return;
      const text = String(level.exemplar || "").trim();
      if (!text) return;
      exemplarItems.push({
        id: `${dimension.id || dimension.name}-${level.value}`,
        primary: [dimension.name || dimension.id, levelLabel(level)].filter(Boolean).join(", "),
        secondary: text,
      });
    });
  });

  return [
    {
      key: "description",
      label: "Description",
      items: description ? [{ primary: description }] : [],
    },
    {
      key: "criteria",
      label: "Criteria",
      items: dimensions.map((dimension) => ({
        id: dimension.id,
        primary: dimension.name || dimension.id || "Criterion",
        secondary: (dimension.levels || []).map(levelLabel).filter(Boolean).join(", "),
      })),
    },
    {
      key: "exemplars",
      label: "Exemplars",
      items: exemplarItems,
    },
    {
      key: "evidenceModels",
      label: "Evidence models",
      items: counts.evidenceModels.map((model) => {
        const procedures = procedureIds(model, record.id).map((id) => `procedure ${id}`);
        const phases = phaseLabels(model, record.id);
        const secondary = [...procedures, ...phases].join("; ");
        return {
          id: model.id,
          primary: recordLabel(model),
          ...(secondary ? { secondary } : {}),
        };
      }),
    },
    {
      key: "designPatterns",
      label: "Design patterns",
      items: counts.designPatterns.map((pattern) => ({
        id: pattern.id,
        primary: recordLabel(pattern),
      })),
    },
  ];
}
