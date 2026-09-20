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
import { MIGRATION_REGISTRY } from "./registry.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const onlyId = args.find((a) => !a.startsWith("--"));

const toRun = onlyId
  ? MIGRATION_REGISTRY.filter((m) => m.id === onlyId)
  : MIGRATION_REGISTRY;

if (onlyId && toRun.length === 0) {
  console.error(`No migration named "${onlyId}". Known migrations:`);
  MIGRATION_REGISTRY.forEach((m) => console.error(`  - ${m.id}`));
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
