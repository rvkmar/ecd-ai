// D144. A Q-matrix stays on qMatrixModels. DINA still resolves
// structureConfig.qMatrixId there. This migration does not mint a
// Domain Analysis and does not write domainAnalysisId. An author sets
// that optional id later, and only toward an analysis that already exists.

import { readRawDB } from "../../../src/utils/db-server.js";

export default {
  id: "007-qmatrix-domain-analysis-link",
  description:
    "Leave every Q-matrix id and competencyModelId on /api/qMatrixModels. Do not mint a Domain Analysis.",
  forwardOnly: true,
  rollback:
    "No Q-matrix fields are rewritten. Nothing to restore.",

  async run({ dryRun }) {
    const db = readRawDB();
    const before = JSON.stringify(db);
    const rows = db.qMatrixModels || [];

    if (dryRun && JSON.stringify(db) !== before) {
      throw new Error("Dry run wrote the database.");
    }
    if (!dryRun && JSON.stringify(db) !== before) {
      throw new Error("Q-matrix re-home wrote the database.");
    }

    return {
      changed: [],
      summary: rows.length
        ? `${rows.length} Q-matrix id(s) stay on /api/qMatrixModels with their competencyModelId. No Domain Analysis was created.`
        : "No Q-matrices in this store. Nothing to re-home.",
    };
  },
};
