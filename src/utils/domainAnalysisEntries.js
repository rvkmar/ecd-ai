// Stable ids for Domain Analysis valued knowledge and task features.
// A missing id stays valid so a label-only row still loads. Save and the
// backfill migration assign an id when one is absent, and reuse an existing
// id when the label still matches. Other Layer-1 sections stay labels.

const IDENTIFIED = Object.freeze([
  { field: "valuedKnowledge", prefix: "vk" },
  { field: "taskFeatures", prefix: "tf" },
]);

export const DOMAIN_ANALYSIS_IDENTIFIED_FIELDS = Object.freeze(
  IDENTIFIED.map((row) => row.field)
);

function trimmedId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function mintDomainEntryId(prefix, used) {
  let id;
  do {
    const rand = Math.random().toString(36).slice(2, 8);
    id = `${prefix}${Date.now().toString(36)}${rand}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

export function collectDomainEntryIds(db) {
  const used = new Set();
  for (const analysis of db?.domainAnalyses || []) {
    for (const { field } of IDENTIFIED) {
      for (const entry of analysis?.[field] || []) {
        const id = trimmedId(entry?.id);
        if (id) used.add(id);
      }
    }
  }
  return used;
}

/**
 * Give valuedKnowledge and taskFeatures stable ids.
 * An id on the incoming row is kept. A blank id reuses the existing row
 * with the same label. Anything else receives a new id.
 * `used` collects ids so a new one does not collide with another analysis.
 */
export function assignDomainAnalysisEntryIds(record, existing = null, used = new Set()) {
  if (!record || typeof record !== "object") return record;
  for (const { field, prefix } of IDENTIFIED) {
    if (!Array.isArray(record[field])) continue;
    const prior = Array.isArray(existing?.[field]) ? existing[field] : [];
    const consumed = new Set();
    record[field] = record[field].map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      let id = trimmedId(row.id);
      if (id && consumed.has(id)) return { ...row, id };
      if (!id) {
        const label = String(row.label || "").trim();
        const match = prior.find((item) => {
          const priorId = trimmedId(item?.id);
          if (!priorId || consumed.has(priorId)) return false;
          return label !== "" && String(item?.label || "").trim() === label;
        });
        if (match) id = trimmedId(match.id);
      }
      if (!id) id = mintDomainEntryId(prefix, used);
      else used.add(id);
      consumed.add(id);
      return { ...row, id };
    });
  }
  return record;
}

/** Mutates db. Returns the analysis ids that gained at least one entry id. */
export function backfillDomainAnalysisEntryIds(db) {
  const used = collectDomainEntryIds(db);
  const changed = [];
  for (const analysis of db?.domainAnalyses || []) {
    if (!analysis || typeof analysis !== "object") continue;
    const before = JSON.stringify({
      valuedKnowledge: analysis.valuedKnowledge,
      taskFeatures: analysis.taskFeatures,
    });
    assignDomainAnalysisEntryIds(analysis, null, used);
    const after = JSON.stringify({
      valuedKnowledge: analysis.valuedKnowledge,
      taskFeatures: analysis.taskFeatures,
    });
    if (before !== after && analysis.id) changed.push(analysis.id);
  }
  return changed;
}

export function domainAnalysisEntryIdErrors(rows, field) {
  const errors = [];
  if (!DOMAIN_ANALYSIS_IDENTIFIED_FIELDS.includes(field) || !Array.isArray(rows)) return errors;
  const seen = new Set();
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    if (!Object.prototype.hasOwnProperty.call(row, "id") || row.id == null || row.id === "") return;
    const where = `${field}[${index}].id`;
    if (typeof row.id !== "string" || !row.id.trim()) {
      errors.push(`${where} must be a non-empty string.`);
      return;
    }
    const id = row.id.trim();
    if (seen.has(id)) errors.push(`${where} '${id}' is duplicated.`);
    else seen.add(id);
  });
  return errors;
}

export function duplicateDomainEntryIdErrors(record, db) {
  const errors = [];
  if (!db) return errors;
  for (const { field } of IDENTIFIED) {
    (record?.[field] || []).forEach((row, index) => {
      const id = trimmedId(row?.id);
      if (!id) return;
      const clash = (db.domainAnalyses || []).find(
        (analysis) =>
          analysis &&
          analysis.id !== record.id &&
          (analysis[field] || []).some((entry) => trimmedId(entry?.id) === id)
      );
      if (clash) {
        errors.push(
          `${field}[${index}].id '${id}' is already used on domain analysis '${clash.id}'.`
        );
      }
    });
  }
  return errors;
}

function citationPath(where, field) {
  return where ? `${where}.${field}` : field;
}

/**
 * Optional citation of one valued-knowledge or task-feature id.
 * When domainAnalysisId is set, the entry must be on that analysis.
 * When it is not set, the id must exist on exactly one analysis.
 * A blank citation is valid. Existence is not checked when db is absent.
 */
export function domainEntryCitationErrors({
  entry,
  field,
  section,
  where = "",
  domainAnalysisId = "",
  db = null,
} = {}) {
  const errors = [];
  if (!entry || typeof entry !== "object") return errors;
  if (!Object.prototype.hasOwnProperty.call(entry, field)) return errors;
  const raw = entry[field];
  if (raw == null || raw === "") return errors;
  const path = citationPath(where, field);
  if (typeof raw !== "string") {
    errors.push(`${path} must be a string.`);
    return errors;
  }
  const id = raw.trim();
  if (!id || !db) return errors;

  const scoped = trimmedId(domainAnalysisId);
  const analyses = db.domainAnalyses || [];
  if (scoped) {
    const analysis = analyses.find((row) => row && row.id === scoped);
    if (!analysis) {
      errors.push(
        `${path} '${id}' cannot be checked because domain analysis '${scoped}' was not found.`
      );
      return errors;
    }
    const found = (analysis[section] || []).some((row) => trimmedId(row?.id) === id);
    if (!found) {
      errors.push(`${path} '${id}' is not on domain analysis '${scoped}'.`);
    }
    return errors;
  }

  const hits = analyses.filter((row) =>
    (row?.[section] || []).some((item) => trimmedId(item?.id) === id)
  );
  if (hits.length === 0) {
    errors.push(`${path} '${id}' was not found.`);
  } else if (hits.length > 1) {
    errors.push(
      `${path} '${id}' appears on more than one Domain Analysis. Set domainAnalysisId.`
    );
  }
  return errors;
}

export function taskModelVariableDomainErrors(obj = {}, db = null) {
  const errors = [];
  const domainAnalysisId = obj.domainAnalysisId;
  if (domainAnalysisId != null && domainAnalysisId !== "") {
    if (typeof domainAnalysisId === "string" && db) {
      const id = domainAnalysisId.trim();
      if (id && !(db.domainAnalyses || []).some((row) => row && row.id === id)) {
        errors.push(`Invalid domainAnalysisId: ${id}`);
      }
    }
  }
  if (obj.taskFeatureId == null || obj.taskFeatureId === "" || typeof obj.taskFeatureId === "string") {
    errors.push(
      ...domainEntryCitationErrors({
        entry: obj,
        field: "taskFeatureId",
        section: "taskFeatures",
        where: "",
        domainAnalysisId: typeof domainAnalysisId === "string" ? domainAnalysisId : "",
        db,
      })
    );
  }
  return errors;
}

export function domainEntryChoices(analyses, section, domainAnalysisId) {
  const scoped = trimmedId(domainAnalysisId);
  const rows = (analyses || []).filter((row) => !scoped || row?.id === scoped);
  const choices = [];
  for (const analysis of rows) {
    for (const entry of analysis?.[section] || []) {
      const id = trimmedId(entry?.id);
      if (!id) continue;
      const label = String(entry.label || id).trim() || id;
      const prefix = scoped ? "" : `${analysis.name || analysis.id}: `;
      choices.push({ id, label: `${prefix}${label}` });
    }
  }
  return choices;
}

function pushHit(hits, kind, row) {
  if (!row) return;
  hits.push({ kind, id: row.id, name: row.name || row.id });
}

function citesId(rows, field, entryId) {
  return (rows || []).some((row) => trimmedId(row?.[field]) === entryId);
}

export function recordsCitingValuedKnowledge(db, entryId) {
  if (!entryId) return [];
  const hits = [];
  for (const pattern of db?.designPatterns || []) {
    const cited =
      citesId(pattern?.focalKsas, "valuedKnowledgeId", entryId) ||
      citesId(pattern?.additionalKsas, "valuedKnowledgeId", entryId);
    if (cited) pushHit(hits, "designPattern", pattern);
  }
  for (const model of db?.evidenceModels || []) {
    if (citesId(model?.seededFrom?.valuedKnowledge, "valuedKnowledgeId", entryId)) {
      pushHit(hits, "evidenceModel", model);
    }
  }
  for (const model of db?.taskModels || []) {
    if (citesId(model?.seededFrom?.valuedKnowledge, "valuedKnowledgeId", entryId)) {
      pushHit(hits, "taskModel", model);
    }
  }
  return hits;
}

export function recordsCitingTaskFeature(db, entryId) {
  if (!entryId) return [];
  const hits = [];
  for (const pattern of db?.designPatterns || []) {
    const cited =
      citesId(pattern?.characteristicFeatures, "taskFeatureId", entryId) ||
      citesId(pattern?.variableFeatures, "taskFeatureId", entryId);
    if (cited) pushHit(hits, "designPattern", pattern);
  }
  for (const variable of db?.taskModelVariables || []) {
    if (trimmedId(variable?.taskFeatureId) === entryId) pushHit(hits, "taskModelVariable", variable);
  }
  for (const model of db?.taskModels || []) {
    const blueprint = citesId(
      model?.blueprintConstraints?.characteristicFeatures,
      "taskFeatureId",
      entryId
    );
    const accepted = citesId(
      model?.seededFrom?.accepted?.characteristicFeatures,
      "taskFeatureId",
      entryId
    );
    const declined = citesId(
      model?.seededFrom?.declined?.characteristicFeatures,
      "taskFeatureId",
      entryId
    );
    const acceptedVariable = citesId(
      model?.seededFrom?.accepted?.variableFeatures,
      "taskFeatureId",
      entryId
    );
    const declinedVariable = citesId(
      model?.seededFrom?.declined?.variableFeatures,
      "taskFeatureId",
      entryId
    );
    if (blueprint || accepted || declined || acceptedVariable || declinedVariable) {
      pushHit(hits, "taskModel", model);
    }
  }
  for (const model of db?.evidenceModels || []) {
    const accepted = citesId(
      model?.seededFrom?.accepted?.characteristicFeatures,
      "taskFeatureId",
      entryId
    );
    const declined = citesId(
      model?.seededFrom?.declined?.characteristicFeatures,
      "taskFeatureId",
      entryId
    );
    const acceptedVariable = citesId(
      model?.seededFrom?.accepted?.variableFeatures,
      "taskFeatureId",
      entryId
    );
    const declinedVariable = citesId(
      model?.seededFrom?.declined?.variableFeatures,
      "taskFeatureId",
      entryId
    );
    if (accepted || declined || acceptedVariable || declinedVariable) {
      pushHit(hits, "evidenceModel", model);
    }
  }
  return hits;
}

function citersFor(db, section, entryId) {
  return section === "valuedKnowledge"
    ? recordsCitingValuedKnowledge(db, entryId)
    : recordsCitingTaskFeature(db, entryId);
}

export function citedEntryRemovals(existing, next, db) {
  const removals = [];
  for (const { field } of IDENTIFIED) {
    const before = new Set((existing?.[field] || []).map((row) => trimmedId(row?.id)).filter(Boolean));
    const after = new Set((next?.[field] || []).map((row) => trimmedId(row?.id)).filter(Boolean));
    for (const id of before) {
      if (after.has(id)) continue;
      const citers = citersFor(db, field, id);
      if (citers.length) removals.push({ section: field, id, citers });
    }
  }
  return removals;
}

function citerPhrase(kinds) {
  const labels = [];
  if (kinds.has("designPattern")) labels.push("a design pattern");
  if (kinds.has("taskModelVariable")) labels.push("a task model variable");
  if (kinds.has("taskModel")) labels.push("a task model");
  if (kinds.has("evidenceModel")) labels.push("an evidence model");
  if (labels.length === 0) return "another record";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

export function removalConflict(removals) {
  if (!removals?.length) return null;
  const messages = [];
  for (const { field } of IDENTIFIED) {
    const rows = removals.filter((row) => row.section === field);
    if (!rows.length) continue;
    const kinds = new Set(rows.flatMap((row) => row.citers.map((citer) => citer.kind)));
    const noun = field === "valuedKnowledge" ? "valued knowledge" : "a task feature";
    messages.push(`Cannot remove ${noun} referenced by ${citerPhrase(kinds)}.`);
  }
  return {
    error: messages.join(" "),
    details: removals.map((row) => row.id),
  };
}

export function domainAnalysisDeleteConflict(analysis, db) {
  const removals = citedEntryRemovals(
    analysis,
    { valuedKnowledge: [], taskFeatures: [] },
    db
  );
  if (!removals.length) return null;
  const kinds = new Set(removals.flatMap((row) => row.citers.map((citer) => citer.kind)));
  return {
    error: `Cannot delete Domain Analysis referenced by ${citerPhrase(kinds)}.`,
    details: removals.map((row) => row.id),
  };
}
