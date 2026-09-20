// server/migrations/migrations/003-backfill-lifecycle-audit.js
// D102: copy ad hoc lifecycle timestamps (activatedAt / suspendedAt /
// reviewMeta.* / deactivation.*) into auditLog as reconstructed history.
//
// The source fields STAY on the entities — UI and routes still read them.
// Removal is a later migration; 004 only dry-runs what that would delete.
//
// ECD authoring entities live in the JSON store (loadDB/saveDB), same as
// auditLog (D101). Uses readRawDB so tenancy ALS cannot hide rows.

import { readRawDB, saveDB } from "../../../src/utils/db-server.js";
import { pendingReconstructedEntries } from "../lifecycleMetaAudit.js";

export default {
  id: "003-backfill-lifecycle-audit",
  description:
    "Backfill auditLog with reconstructed lifecycle history from operationalMeta / reviewMeta / deactivation (fields retained).",
  forwardOnly: false,
  rollback:
    "Delete auditLog rows whose detail.reconstructed === true (stable ids aud-recon-*). Source entity fields are unchanged by this migration.",

  async run({ dryRun }) {
    const db = readRawDB();
    const pending = pendingReconstructedEntries(db);

    if (!dryRun && pending.length) {
      db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
      for (const entry of pending) {
        db.auditLog.push(entry);
      }
      // skipAudit: we are writing the reconstructed rows ourselves; do not
      // also invent entity.create noise from the same snapshot.
      saveDB(db, { skipAudit: true });
    }

    return {
      changed: pending.map((e) => e.id),
      summary: pending.length
        ? `${dryRun ? "Would backfill" : "Backfilled"} ${pending.length} reconstructed audit entr${
            pending.length === 1 ? "y" : "ies"
          } (source fields retained).`
        : "No ad hoc lifecycle history left to backfill; nothing to do.",
    };
  },
};
