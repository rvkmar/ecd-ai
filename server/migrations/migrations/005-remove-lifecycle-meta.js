// server/migrations/migrations/005-remove-lifecycle-meta.js
// D109: actually strip reviewMeta / operationalMeta / deactivation after
// 003 backfilled them into auditLog and 004 previewed the removal.
//
// Forward-only: these fields are denormalized copies of audit history.
// Rollback = restore from a D107 encrypted backup taken before this
// migration ran (see docs/ops/migration-policies.md). Re-running 003
// cannot recreate the blobs once they are gone.

import { readRawDB, saveDB } from "../../../src/utils/db-server.js";
import {
  collectRemovableLifecycleFields,
  stripLifecycleMetaFields,
} from "../lifecycleMetaAudit.js";

export default {
  id: "005-remove-lifecycle-meta",
  description:
    "Remove reviewMeta / operationalMeta / deactivation after audit backfill (forward-only).",
  forwardOnly: true,
  rollback:
    "Restore ECD JSON from a D107 encrypted backup taken before 005 applied. " +
    "Fields are denormalized copies of auditLog; do not invent blobs from audit.",

  async run({ dryRun }) {
    const db = readRawDB();
    const removable = collectRemovableLifecycleFields(db);

    const lines = removable.map(
      (r) => `${r.collection}/${r.id}.${r.path}[${(r.valuePreview || []).join(",")}]`
    );

    if (!dryRun && removable.length) {
      const stripped = stripLifecycleMetaFields(db);
      saveDB(stripped, { skipAudit: true });
    }

    return {
      changed: lines,
      summary: removable.length
        ? `${dryRun ? "Would remove" : "Removed"} ${removable.length} lifecycle meta field group(s). ` +
          `Samples: ${lines.slice(0, 8).join("; ")}${
            lines.length > 8 ? `; …(+${lines.length - 8} more)` : ""
          }`
        : "No ad hoc lifecycle field groups present; nothing to do.",
    };
  },
};
