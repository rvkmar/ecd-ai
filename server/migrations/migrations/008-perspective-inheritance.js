// D146. Perspective stays declared on the Domain Analysis.
// A Student Model inherits it when rebuilt. This migration does not
// copy a perspective onto a competency model and does not clear one
// that is already stored.

import { readRawDB } from "../../../src/utils/db-server.js";

export default {
  id: "008-perspective-inheritance",
  description:
    "Leave each Student Model's stored psychological perspective in place until that model is rebuilt from a Domain Analysis.",
  forwardOnly: true,
  rollback:
    "No Student Model perspective was rewritten. Nothing to restore.",

  async run({ dryRun }) {
    const db = readRawDB();
    const before = JSON.stringify(db);
    const models = db.competencyModels || [];
    const stored = models.filter((row) => row.psychologicalPerspective).length;

    if (dryRun && JSON.stringify(db) !== before) {
      throw new Error("Dry run wrote the database.");
    }
    if (!dryRun && JSON.stringify(db) !== before) {
      throw new Error("Perspective inheritance wrote the database.");
    }

    return {
      changed: [],
      summary: stored
        ? `${stored} Student Model perspective(s) stay stored until rebuilt. No Domain Analysis perspective was copied.`
        : "No stored Student Model perspectives. Nothing to keep.",
    };
  },
};
