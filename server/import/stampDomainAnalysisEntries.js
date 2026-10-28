// Gives valuedKnowledge and taskFeatures rows ids during zip import, and
// records old id to new id so later collections can rewrite citations.
// A row with no id is given one and is not registered: nothing could cite it.

import { mintDomainEntryId } from "../../src/utils/domainAnalysisEntries.js";
import { TASK_FEATURE_ENTRIES, VALUED_KNOWLEDGE_ENTRIES } from "./idCatalog.js";

const ENTRY_FIELDS = [
  ["valuedKnowledge", VALUED_KNOWLEDGE_ENTRIES, "vk"],
  ["taskFeatures", TASK_FEATURE_ENTRIES, "tf"],
];

function entryId(entry) {
  return entry && typeof entry.id === "string" ? entry.id.trim() : "";
}

export function stampDomainAnalysisPlans(plans, ctx) {
  const used = new Set();
  for (const analysis of ctx.db?.domainAnalyses || []) {
    for (const [field] of ENTRY_FIELDS) {
      for (const entry of analysis?.[field] || []) {
        const id = entryId(entry);
        if (id) used.add(id);
      }
    }
  }

  for (const plan of plans || []) {
    if (plan.invalid || !plan.clean) continue;
    for (const [field, collection, prefix] of ENTRY_FIELDS) {
      const rows = plan.clean[field];
      if (!Array.isArray(rows)) continue;
      plan.clean[field] = rows.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
        const sourceId = entryId(entry);
        const keep = ctx.keepOriginalIds && sourceId && !used.has(sourceId);
        const nextId = keep ? sourceId : mintDomainEntryId(prefix, used);
        if (keep) used.add(sourceId);
        if (sourceId) ctx.catalog.add(collection, sourceId, nextId, plan.sources);
        return { ...entry, id: nextId };
      });
    }
  }
}
