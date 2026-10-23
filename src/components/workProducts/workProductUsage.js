// Shared readers for the Work Product dashboard, structure table, and
// manage list. A work product is used when an item, an evidence model,
// or a design pattern cites its id. Readiness is the strict client mirror.

import { WORK_PRODUCT_TYPES } from "@/utils/ecdVocabulary";
import { workProductReadiness } from "@/utils/workProductReadiness";

export function consumersForWorkProduct(items, workProductId) {
  if (!workProductId) return [];
  return (items || []).filter(
    (item) => item?.interaction?.workProductId === workProductId
  );
}

export function evidenceModelsUsingWorkProduct(evidenceModels, workProductId) {
  if (!workProductId) return [];
  return (evidenceModels || []).filter((model) =>
    (model?.evaluationProcedures || []).some(
      (proc) => proc?.workProductId === workProductId
    )
  );
}

export function designPatternsUsingWorkProduct(patterns, workProductId) {
  if (!workProductId) return [];
  return (patterns || []).filter((pattern) =>
    (pattern?.potentialWorkProducts || []).some(
      (entry) => entry?.workProductId === workProductId
    )
  );
}

export function usageCounts(record, context = {}) {
  const id = record?.id;
  return {
    items: consumersForWorkProduct(context.items, id),
    evidenceModels: evidenceModelsUsingWorkProduct(context.evidenceModels, id),
    designPatterns: designPatternsUsingWorkProduct(context.designPatterns, id),
  };
}

export function isWorkProductUsed(record, context) {
  const counts = usageCounts(record, context);
  return (
    counts.items.length + counts.evidenceModels.length + counts.designPatterns.length > 0
  );
}

export function workProductTypeText(value) {
  if (!value) return "No type";
  return WORK_PRODUCT_TYPES.find((row) => row.value === value)?.label || String(value);
}

export function workProductReadinessValue(record) {
  return workProductReadiness(record, { strict: true }).ready ? "ready" : "not-ready";
}

export function readinessText(record) {
  return workProductReadinessValue(record) === "ready" ? "Ready" : "Not ready";
}

export function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function usageSummary(record, context) {
  const counts = usageCounts(record, context);
  return [
    countLabel(counts.items.length, "item", "items"),
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

/**
 * Names are unique case-insensitively. The first free name is
 * "<name> (copy)", then "<name> (copy 2)", and so on.
 */
export function uniqueWorkProductCopyName(name, records = []) {
  const taken = new Set(
    (records || [])
      .map((row) => String(row?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const base = String(name || "").trim() || "Work Product";
  let candidate = `${base} (copy)`;
  if (!taken.has(candidate.toLowerCase())) return candidate;
  let n = 2;
  do {
    candidate = `${base} (copy ${n})`;
    n += 1;
  } while (taken.has(candidate.toLowerCase()));
  return candidate;
}

export function workProductDeleteBlockedMessage(items) {
  const bound = items || [];
  const names = bound
    .map((item) => item.name || item.id)
    .slice(0, 8)
    .join(", ");
  const more = bound.length > 8 ? ", ..." : "";
  return `Cannot delete: bound by ${bound.length} item(s): ${names}${more}. Unbind them first.`;
}

export function ingredientGroupsForWorkProduct(record, context) {
  const description = String(record?.description || "").trim();
  const counts = usageCounts(record, context);
  return [
    {
      key: "description",
      label: "Description",
      items: description ? [{ primary: description }] : [],
    },
    {
      key: "items",
      label: "Items",
      items: counts.items.map((item) => ({
        id: item.id,
        primary: recordLabel(item),
        ...(item.interaction?.type ? { secondary: item.interaction.type } : {}),
      })),
    },
    {
      key: "evidenceModels",
      label: "Evidence models",
      items: counts.evidenceModels.map((model) => {
        const procedures = (model.evaluationProcedures || [])
          .filter((proc) => proc?.workProductId === record.id)
          .map((proc) => proc.id)
          .filter(Boolean);
        return {
          id: model.id,
          primary: recordLabel(model),
          ...(procedures.length ? { secondary: procedures.join(", ") } : {}),
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
