// D143. A curricular policy stays a goal tree. The Domain Analysis
// holds that tree as contentStandards. valuedKnowledge stays labels.

import { DOMAIN_ANALYSIS_ENTITIES } from "../../src/utils/schema.js";

function contentStandardsFromPolicy(policy) {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description || "",
    version: policy.version || "",
    issuingBody: policy.issuingBody || "",
    subject: policy.subject || "",
    stage: policy.stage || "",
    curricularGoals: policy.curricularGoals,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

function findAnalysisForPolicy(db, policyId) {
  if (!policyId) return undefined;
  return (db.domainAnalyses || []).find((row) => row?.contentStandards?.id === policyId);
}

function shellIdForPolicy(policyId) {
  return `dacs${policyId}`;
}

function emptySections() {
  const sections = {};
  for (const { field } of DOMAIN_ANALYSIS_ENTITIES) sections[field] = [];
  return sections;
}

function analysisSectionsEmpty(row) {
  return DOMAIN_ANALYSIS_ENTITIES.every(({ field }) => {
    const rows = row?.[field];
    if (!Array.isArray(rows) || rows.length === 0) return true;
    return rows.every((item) => !item || String(item.label || "").trim() === "");
  });
}

function shellForPolicy(policy, now = new Date().toISOString()) {
  return {
    id: shellIdForPolicy(policy.id),
    name: policy.name,
    status: "draft",
    ...emptySections(),
    contentStandards: contentStandardsFromPolicy(policy),
    createdAt: policy.createdAt || now,
    updatedAt: now,
  };
}

/**
 * Copy each curricular policy onto a Domain Analysis when none already
 * holds that policy id. Does not delete the collection and does not
 * write valuedKnowledge labels.
 */
export function migrateContentStandards(db, { dryRun = false, now = new Date().toISOString() } = {}) {
  const changed = [];
  for (const policy of db.curricularPolicies || []) {
    if (!policy?.id) continue;
    if (findAnalysisForPolicy(db, policy.id)) continue;
    changed.push(policy.id);
    if (!dryRun) {
      db.domainAnalyses = db.domainAnalyses || [];
      db.domainAnalyses.push(shellForPolicy(policy, now));
    }
  }
  return changed;
}

export function upsertContentStandards(db, policy, now = new Date().toISOString()) {
  const existing = findAnalysisForPolicy(db, policy.id);
  if (!existing) {
    db.domainAnalyses = db.domainAnalyses || [];
    const shell = shellForPolicy(policy, now);
    db.domainAnalyses.push(shell);
    return shell;
  }
  existing.contentStandards = contentStandardsFromPolicy(policy);
  existing.updatedAt = now;
  return existing;
}

export function detachContentStandards(db, policyId) {
  const existing = findAnalysisForPolicy(db, policyId);
  if (!existing) return;
  if (existing.status === "draft" && analysisSectionsEmpty(existing) && existing.id === shellIdForPolicy(policyId)) {
    db.domainAnalyses = (db.domainAnalyses || []).filter((row) => row.id !== existing.id);
    return;
  }
  delete existing.contentStandards;
}

/** Step 3 reads this list. A Domain Analysis copy wins over the collection row. */
export function listCurricularPolicies(db) {
  const listed = [];
  const seen = new Set();
  for (const row of db.domainAnalyses || []) {
    const standards = row?.contentStandards;
    if (!standards?.id || seen.has(standards.id)) continue;
    seen.add(standards.id);
    listed.push(standards);
  }
  for (const policy of db.curricularPolicies || []) {
    if (!policy?.id || seen.has(policy.id)) continue;
    seen.add(policy.id);
    listed.push(policy);
  }
  return listed;
}
