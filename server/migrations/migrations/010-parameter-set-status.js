// Stamp parameterSets that predate the candidate status.
// The set named by activeParameterSetId becomes "active". Every other
// set becomes "candidate". The pointer itself is not moved, so scoring
// keeps using the same set. A second run changes nothing.

import { readRawDB, saveDB } from "../../../src/utils/db-server.js";
import { backfillParameterSetStatus } from "../../../src/utils/parameterSetStatus.js";

export default {
  id: "010-parameter-set-status",
  description:
    "Mark the live parameter set active and every other stored set a candidate, without moving activeParameterSetId.",
  forwardOnly: true,
  rollback:
    "Statuses can stay. Removing them would hide which stored sets are candidates, and the active pointer is unchanged.",

  async run({ dryRun }) {
    const db = readRawDB();
    const source = dryRun ? JSON.parse(JSON.stringify(db)) : db;
    const changed = backfillParameterSetStatus(source);

    if (!dryRun && changed.length) {
      saveDB(db, { skipAudit: true });
    }

    return {
      changed,
      summary: changed.length
        ? `${dryRun ? "Would stamp" : "Stamped"} status on ${changed.length} parameter set${changed.length === 1 ? "" : "s"}.`
        : "Every parameter set already has a candidate or active status.",
    };
  },
};
