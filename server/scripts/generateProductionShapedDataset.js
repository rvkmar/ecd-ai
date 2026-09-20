#!/usr/bin/env node
// Write a production-shaped ECD db.json for migration / load rehearsals.
//
// Usage:
//   node server/scripts/generateProductionShapedDataset.js [outPath]
//   npm run generate:production-shaped
//
// Default out: ./fixtures/production-shaped/db.json (gitignored dump;
// the generator source is what we commit).

import fs from "fs";
import path from "path";
import {
  DEFAULTS,
  generateProductionShapedDataset,
} from "../fixtures/productionShaped/generate.js";

const args = process.argv.slice(2);
const outArg = args.find((a) => !a.startsWith("-"));
const outPath = path.resolve(
  outArg || path.join(process.cwd(), "fixtures", "production-shaped", "db.json")
);

const { db, manifest } = generateProductionShapedDataset(DEFAULTS);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(db));
const manifestPath = path.join(path.dirname(outPath), "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`Wrote ${outPath}`);
console.log(`Wrote ${manifestPath}`);
console.log(JSON.stringify(manifest.counts, null, 2));
console.log(`legacy: ${JSON.stringify(manifest.legacy)}`);
