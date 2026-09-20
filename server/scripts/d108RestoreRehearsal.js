#!/usr/bin/env node
/**
 * D108 — run the timed restore rehearsal and write the record used by the
 * handoff / DR runbook (D110).
 *
 *   node server/scripts/d108RestoreRehearsal.js
 */
import path from "path";
import { fileURLToPath } from "url";
import { performRestoreRehearsal } from "../backup/restoreRehearsal.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const recordPath =
  process.env.ECD_RESTORE_REHEARSAL_RECORD ||
  path.join(here, "../../docs/ops/restore-rehearsal-record.json");

const result = await performRestoreRehearsal({ recordPath });
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
console.log(`Wrote ${recordPath}`);
