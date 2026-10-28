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
// Mongo is disconnected before exit so `npm run migrate` does not hang
// after 011 opens a connection.

import path from "path";
import { pathToFileURL } from "url";
import { MIGRATION_REGISTRY } from "./registry.js";
import { runMigration, shutdownMigrationConnections } from "./runner.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const onlyId = args.find((arg) => !arg.startsWith("--"));

const toRun = onlyId
  ? MIGRATION_REGISTRY.filter((migration) => migration.id === onlyId)
  : MIGRATION_REGISTRY;

async function main() {
  let code = 0;
  try {
    if (onlyId && toRun.length === 0) {
      console.error(`No migration named "${onlyId}". Known migrations:`);
      MIGRATION_REGISTRY.forEach((migration) => console.error(`  - ${migration.id}`));
      code = 1;
    } else {
    for (const migration of toRun) {
      const result = await runMigration(migration, { dryRun, force });

      if (result.skipped) {
        console.log(`[${result.id}] skipped (${result.reason})`);
        continue;
      }

      console.log(`[${result.id}]${result.dryRun ? " DRY RUN" : ""} ${result.description}`);
      console.log(`  ${result.summary}`);
    }
    }
  } catch (err) {
    console.error(err);
    code = 1;
  } finally {
    try {
      await shutdownMigrationConnections();
    } catch (err) {
      console.error(err);
      code = 1;
    }
  }
  process.exit(code);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main();
}
