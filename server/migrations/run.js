#!/usr/bin/env node
// server/migrations/run.js
// CLI entry point for the migration runner.
//
// Usage:
//   node server/migrations/run.js               run every unapplied migration
//   node server/migrations/run.js --dry-run      preview every migration, write nothing
//   node server/migrations/run.js 001-normalize-session-status [--dry-run]
//                                                 run (or preview) just that one migration
//   node server/migrations/run.js --force ...    re-run even if already applied
//
// A dry run always previews (ignores the applied-log) since it writes
// nothing; a real run skips anything already applied unless --force is given.

import { runMigration } from "./runner.js";
import normalizeSessionStatus from "./migrations/001-normalize-session-status.js";
import normalizeToolsAllowed from "./migrations/002-normalize-tools-allowed.js";
import backfillLifecycleAudit from "./migrations/003-backfill-lifecycle-audit.js";
import previewRemoveLifecycleMeta from "./migrations/004-preview-remove-lifecycle-meta.js";

const REGISTRY = [
  normalizeSessionStatus,
  normalizeToolsAllowed,
  backfillLifecycleAudit,
  previewRemoveLifecycleMeta,
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const onlyId = args.find((a) => !a.startsWith("--"));

const toRun = onlyId ? REGISTRY.filter((m) => m.id === onlyId) : REGISTRY;

if (onlyId && toRun.length === 0) {
  console.error(`No migration named "${onlyId}". Known migrations:`);
  REGISTRY.forEach((m) => console.error(`  - ${m.id}`));
  process.exit(1);
}

for (const migration of toRun) {
  const result = await runMigration(migration, { dryRun, force });

  if (result.skipped) {
    console.log(`[${result.id}] skipped (${result.reason})`);
    continue;
  }

  console.log(`[${result.id}]${result.dryRun ? " DRY RUN" : ""} ${result.description}`);
  console.log(`  ${result.summary}`);
}
