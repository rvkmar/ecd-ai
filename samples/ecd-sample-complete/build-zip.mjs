// Rebuild samples/ecd-sample-complete.zip from the JSON files in this folder.
// Run from the repository root: node samples/ecd-sample-complete/build-zip.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { zipFiles } from "../../server/utils/safeZip.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const entries = {};
for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
  entries[name] = fs.readFileSync(path.join(dir, name));
}
const zip = zipFiles(entries);
const out = path.join(dir, "..", "ecd-sample-complete.zip");
fs.writeFileSync(out, zip);
console.log(`Wrote ${out} (${zip.length} bytes, ${Object.keys(entries).length} files).`);
