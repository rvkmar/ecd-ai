// Assign a stable id to each valued knowledge and task feature statement
// that does not already have one. Labels are left as they are. A second
// run finds the ids and changes nothing.

import { readRawDB, saveDB } from "../../../src/utils/db-server.js";
import { backfillDomainAnalysisEntryIds } from "../../../src/utils/domainAnalysisEntries.js";

export default {
  id: "009-domain-analysis-entry-ids",
  description:
    "Give each valued knowledge and task feature statement a stable id when it does not have one.",
  forwardOnly: true,
  rollback:
    "Ids added to valued knowledge and task features can stay. Removing them would break citations made after this migration.",

  async run({ dryRun }) {
    const db = readRawDB();
    const source = dryRun ? JSON.parse(JSON.stringify(db)) : db;
    const changed = backfillDomainAnalysisEntryIds(source);

    if (!dryRun && changed.length) {
      saveDB(db, { skipAudit: true });
    }

    return {
      changed,
      summary: changed.length
        ? `${dryRun ? "Would assign" : "Assigned"} statement ids on ${changed.length} Domain Analys${changed.length === 1 ? "is" : "es"}: ${changed.join(", ")}`
        : "Every valued knowledge and task feature statement already has an id.",
    };
  },
};
