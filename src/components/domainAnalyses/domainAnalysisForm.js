// Shared form shape for the Domain Analysis workspace and guided setup.
// The payload is the D142 correction form: seven { label } sections and an
// optional perspective. contentStandards is never written from here.

import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";

export const SECTION_HINT = {
  valuedWork: "Important things people do in this domain.",
  taskFeatures: "Features of situations that matter.",
  representationalForms: "Ways information is represented.",
  performanceOutcomes: "What good performance looks like.",
  valuedKnowledge: "Knowledge and skill the domain values. Not a curricular policy.",
  knowledgeStructure: "How that knowledge is organized.",
  knowledgeTaskRelationships: "How knowledge is brought to bear on tasks. Not a Q-matrix.",
};

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 caret-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-500 focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900/20";

export const WORKSPACE_TABS = [
  { id: "overview", label: "Overview" },
  ...DOMAIN_ANALYSIS_ENTITIES.map((section) => ({
    id: section.field,
    label: section.padi,
  })),
  { id: "curriculum", label: "Curriculum" },
  { id: "qmatrices", label: "Q-matrices" },
];

export function linesToRows(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => ({ label }));
}

export function rowsToLines(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => (row && row.label ? String(row.label) : ""))
    .filter(Boolean)
    .join("\n");
}

const IDENTIFIED_FIELDS = ["valuedKnowledge", "taskFeatures"];

function idsForRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && String(row.label || "").trim())
    .map((row) => (typeof row.id === "string" ? row.id : ""));
}

/**
 * Keep statement ids aligned with textarea lines.
 * Same line count keeps each id on its line, so editing the wording does
 * not mint a new id. A new or removed line matches the lines whose text
 * did not change and leaves a blank id on the new line.
 */
export function alignStatementIds(previousText, nextText, previousIds = []) {
  const prevLines = String(previousText ?? "").split("\n");
  const nextLines = String(nextText ?? "").split("\n");
  const ids = previousIds || [];
  if (prevLines.length === nextLines.length) {
    return nextLines.map((_, index) => ids[index] || "");
  }
  const pool = prevLines.map((line, index) => ({
    line,
    id: ids[index] || "",
    used: false,
  }));
  return nextLines.map((line) => {
    const match = pool.find((item) => !item.used && item.line === line);
    if (!match) return "";
    match.used = true;
    return match.id;
  });
}

export function emptyForm() {
  const sections = {};
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) sections[field] = "";
  return {
    name: "",
    psychologicalPerspective: "",
    ...sections,
    valuedKnowledgeIds: [],
    taskFeaturesIds: [],
  };
}

export function formFromRow(row) {
  const sections = {};
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) {
    sections[field] = rowsToLines(row[field]);
  }
  return {
    name: row.name || "",
    psychologicalPerspective: row.psychologicalPerspective || "",
    ...sections,
    valuedKnowledgeIds: idsForRows(row.valuedKnowledge),
    taskFeaturesIds: idsForRows(row.taskFeatures),
  };
}

export function payloadFromForm(form) {
  const payload = {
    name: form.name.trim(),
    psychologicalPerspective: form.psychologicalPerspective || undefined,
  };
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) {
    if (!IDENTIFIED_FIELDS.includes(field)) {
      payload[field] = linesToRows(form[field]);
      continue;
    }
    const ids = form[`${field}Ids`] || [];
    payload[field] = String(form[field] || "")
      .split("\n")
      .map((line, index) => {
        const label = line.trim();
        if (!label) return null;
        const id = String(ids[index] || "").trim();
        return id ? { id, label } : { label };
      })
      .filter(Boolean);
  }
  return payload;
}

export function formIsDirty(form) {
  if (String(form?.name || "").trim()) return true;
  if (form?.psychologicalPerspective) return true;
  return DOMAIN_ANALYSIS_ENTITIES.some((section) =>
    String(form?.[section.field] || "").trim()
  );
}

/**
 * Confirm requirements only: the seven sections plus perspective.
 * Done/needed is read off domainAnalysisReadiness errors. The name
 * error is a save rule and is not an item here.
 */
export function confirmRequirementItems(errors = []) {
  const list = Array.isArray(errors) ? errors : [];
  const perspectiveDone = !list.some((error) =>
    String(error).includes("psychologicalPerspective")
  );
  return [
    {
      id: "psychologicalPerspective",
      tab: "overview",
      label: "Psychological perspective",
      done: perspectiveDone,
    },
    ...DOMAIN_ANALYSIS_ENTITIES.map((section) => ({
      id: section.field,
      tab: section.field,
      label: section.padi,
      done: !list.some((error) => String(error).startsWith(section.field)),
    })),
  ];
}
