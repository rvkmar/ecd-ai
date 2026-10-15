// D143. Move each curricularPolicies document onto a Domain Analysis
// as contentStandards. Dry-run writes nothing. The collection stays,
// because Competency Wizard Step 3 and Settings still read the policy
// id. valuedKnowledge is not filled from the goal tree.

import { readRawDB, saveDB } from "../../../src/utils/db-server.js";
import { migrateContentStandards } from "../contentStandards.js";

export default {
  id: "006-domain-analysis-content-standards",
  description:
    "Copy each curricular policy onto a Domain Analysis as content standards, keeping goals, competencies, and learning outcomes.",
  forwardOnly: true,
  rollback:
    "Remove Domain Analysis rows whose id starts with dacs and whose sections are still empty. Leave curricularPolicies and competency-model snapshots untouched.",

  async run({ dryRun }) {
    const db = readRawDB();
    const before = JSON.stringify(db);
    const changed = migrateContentStandards(db, { dryRun });

    if (!dryRun && changed.length) {
      saveDB(db, { skipAudit: true });
    }

    if (dryRun && JSON.stringify(db) !== before) {
      throw new Error("Dry run wrote the database.");
    }

    return {
      changed,
      summary: changed.length
        ? `${dryRun ? "Would copy" : "Copied"} ${changed.length} curricular polic${changed.length === 1 ? "y" : "ies"} onto Domain Analysis content standards: ${changed.join(", ")}`
        : "Every curricular policy is already reachable through a Domain Analysis; nothing to do.",
    };
  },
};
