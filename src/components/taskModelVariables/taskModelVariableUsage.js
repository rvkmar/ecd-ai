// Shared readers for the Task Model Variable dashboard, structure table,
// and manage list. A variable is in use when a task model lists its id
// or a design pattern cites it under variable features. Readiness is the
// strict client mirror. Levels for a named value set come from
// ecdVocabulary.js; this file does not copy those lists.

import {
  TMV_VALUE_SET_KEYS,
  taskModelVariableValueIds,
  tmvTypeLabel,
} from "@/utils/ecdVocabulary";
import { taskModelVariableReadiness } from "@/utils/taskModelVariableReadiness";

export function consumersForVariable(taskModels, variableId) {
  if (!variableId) return [];
  return (taskModels || []).filter(
    (tm) =>
      Array.isArray(tm?.taskModelVariableIds) &&
      tm.taskModelVariableIds.includes(variableId)
  );
}

export function designPatternsUsingVariable(patterns, variableId) {
  if (!variableId) return [];
  return (patterns || []).filter((pattern) =>
    (pattern?.variableFeatures || []).some(
      (entry) => entry?.taskModelVariableId === variableId
    )
  );
}

export function usageCounts(record, context = {}) {
  const id = record?.id;
  return {
    taskModels: consumersForVariable(context.taskModels, id),
    designPatterns: designPatternsUsingVariable(context.designPatterns, id),
  };
}

export function isVariableInUse(record, context) {
  const counts = usageCounts(record, context);
  return counts.taskModels.length + counts.designPatterns.length > 0;
}

export function variableTypeText(value) {
  if (!value) return "No type";
  return tmvTypeLabel(value);
}

export function valueSetKind(record) {
  if (record?.valueSet && TMV_VALUE_SET_KEYS.includes(record.valueSet)) {
    return record.valueSet;
  }
  if (record?.valueSet) return "other";
  return "author-supplied";
}

export function valueSetKindText(record) {
  const kind = valueSetKind(record);
  if (kind === "author-supplied") return "Author-supplied";
  if (kind === "other") return "Other";
  return kind;
}

export function variableReadinessValue(record) {
  return taskModelVariableReadiness(record, { strict: true }).ready ? "ready" : "not-ready";
}

export function readinessText(record) {
  return variableReadinessValue(record) === "ready" ? "Ready" : "Not ready";
}

export function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function usageSummary(record, context) {
  const counts = usageCounts(record, context);
  return [
    countLabel(counts.taskModels.length, "task model", "task models"),
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
export function uniqueTaskModelVariableCopyName(name, records = []) {
  const taken = new Set(
    (records || [])
      .map((row) => String(row?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const base = String(name || "").trim() || "Task Model Variable";
  let candidate = `${base} (copy)`;
  if (!taken.has(candidate.toLowerCase())) return candidate;
  let n = 2;
  do {
    candidate = `${base} (copy ${n})`;
    n += 1;
  } while (taken.has(candidate.toLowerCase()));
  return candidate;
}

export function variableDeleteBlockedMessage(record, context) {
  const counts = usageCounts(record, context);
  const names = [
    ...counts.taskModels.map((row) => recordLabel(row)),
    ...counts.designPatterns.map((row) => recordLabel(row)),
  ];
  const shown = names.slice(0, 8).join(", ");
  const more = names.length > 8 ? ", ..." : "";
  return `Cannot delete: used by ${names.length} record(s): ${shown}${more}. Unbind them first.`;
}

export function levelsSummary(record) {
  if (record?.valueSet) return `Vocabulary value set ${record.valueSet}`;
  if (record?.type === "numeric") {
    const min = record.range?.min;
    const max = record.range?.max;
    if (typeof min !== "number" || typeof max !== "number") return "Numeric range not set";
    return `Range ${min} to ${max}`;
  }
  if (record?.type === "boolean") return "Levels true and false";
  const ids = taskModelVariableValueIds(record);
  if (!ids.length) return "No levels yet";
  return `Levels ${ids.join(", ")}`;
}

export function levelItems(record) {
  if (record?.valueSet) {
    const ids = taskModelVariableValueIds(record);
    if (!ids.length) return [{ primary: String(record.valueSet) }];
    return ids.map((value) => ({ primary: value, secondary: record.valueSet }));
  }
  if (record?.type === "numeric" && record.range && typeof record.range === "object") {
    const { min, max } = record.range;
    if (typeof min === "number" && typeof max === "number") {
      return [{ primary: `${min} to ${max}` }];
    }
    return [];
  }
  if (record?.type === "boolean") {
    return [{ primary: "true" }, { primary: "false" }];
  }
  return taskModelVariableValueIds(record).map((value) => ({ primary: value }));
}

export function ingredientGroupsForVariable(record, context) {
  const description = String(record?.description || "").trim();
  const counts = usageCounts(record, context);
  return [
    {
      key: "description",
      label: "Description",
      items: description ? [{ primary: description }] : [],
    },
    {
      key: "levels",
      label: "Levels",
      items: levelItems(record),
    },
    {
      key: "taskModels",
      label: "Task models",
      items: counts.taskModels.map((model) => ({
        id: model.id,
        primary: recordLabel(model),
        ...(model.status ? { secondary: model.status } : {}),
      })),
    },
    {
      key: "designPatterns",
      label: "Design patterns",
      items: counts.designPatterns.map((pattern) => {
        const labels = (pattern.variableFeatures || [])
          .filter((entry) => entry?.taskModelVariableId === record.id)
          .map((entry) => entry.label)
          .filter(Boolean);
        return {
          id: pattern.id,
          primary: recordLabel(pattern),
          ...(labels.length ? { secondary: labels.join(", ") } : {}),
        };
      }),
    },
  ];
}
