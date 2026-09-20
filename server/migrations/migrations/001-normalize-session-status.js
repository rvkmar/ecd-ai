// server/migrations/migrations/001-normalize-session-status.js
// Rewrites the legacy "in-progress" (hyphen) session status to the
// canonical "in_progress" (underscore). See src/utils/sessionStatus.js
// for why underscore was chosen and what broke while both spellings
// were live on disk at once.
//
// Sessions live in src/utils/db-server.js's flat JSON file (not behind
// server/utils/dbAdapter.js -- see CONTRIBUTING.md/CLAUDE.md on the
// legacy delivery path), so this migration reads/writes that file
// directly rather than going through dbAdapter.

import { loadDB, saveDB } from "../../../src/utils/db-server.js";
import { SESSION_STATUS } from "../../../src/utils/sessionStatus.js";

const LEGACY_SPELLING = "in-progress";

export default {
  id: "001-normalize-session-status",
  description: `Rewrite session.status "${LEGACY_SPELLING}" to the canonical "${SESSION_STATUS.IN_PROGRESS}".`,
  forwardOnly: false,
  rollback:
    "Restore ECD JSON from backup taken before 001, or rewrite in_progress → in-progress only if a consumer still required the hyphen (none do after sessionStatus.js).",

  async run({ dryRun }) {
    const db = loadDB();
    const changed = [];

    for (const session of db.sessions || []) {
      if (session && session.status === LEGACY_SPELLING) {
        session.status = SESSION_STATUS.IN_PROGRESS;
        changed.push(session.id);
      }
    }

    if (!dryRun && changed.length) {
      saveDB(db);
    }

    return {
      changed,
      summary: changed.length
        ? `Normalized ${changed.length} session(s): ${changed.join(", ")}`
        : "No sessions used the legacy spelling; nothing to do.",
    };
  },
};
