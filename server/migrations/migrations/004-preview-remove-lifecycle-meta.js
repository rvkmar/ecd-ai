// server/migrations/migrations/004-preview-remove-lifecycle-meta.js
// D102: dry-run / report what a future removal of ad hoc lifecycle fields
// would delete. THIS MIGRATION NEVER DELETES — even when run without
// --dry-run — because callers (UI panels, confirm gates) still read
// reviewMeta / operationalMeta / deactivation. Actual stripping waits
// until those readers are gone (tracked for a later unit / D109 chain).
//
// Exit check: a dry run reports exactly what removal would delete, and
// nothing is deleted yet.

import { readRawDB } from "../../../src/utils/db-server.js";
import { collectRemovableLifecycleFields } from "../lifecycleMetaAudit.js";

export default {
  id: "004-preview-remove-lifecycle-meta",
  description:
    "Preview (never apply) removal of reviewMeta / operationalMeta / deactivation after audit backfill.",

  async run({ dryRun }) {
    const db = readRawDB();
    const removable = collectRemovableLifecycleFields(db);

    const lines = removable.map(
      (r) => `${r.collection}/${r.id}.${r.path}[${(r.valuePreview || []).join(",")}]`
    );

    // Intentionally no writes — dryRun and apply both report only.
    void dryRun;

    return {
      changed: lines,
      summary: removable.length
        ? `Removal preview: ${removable.length} field group(s) would be deleted in a future migration; ` +
          `none deleted this run. Samples: ${lines.slice(0, 8).join("; ")}${
            lines.length > 8 ? `; …(+${lines.length - 8} more)` : ""
          }`
        : "Removal preview: no ad hoc lifecycle field groups present.",
    };
  },
};
