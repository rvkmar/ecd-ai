#!/usr/bin/env node
// D110 load rehearsal CLI — five recorded numbers + configs.
//
// Usage: npm run load:rehearsal
// Writes docs/ops/load-test-record.json

import fs from "fs";
import os from "os";
import path from "path";
import { performLoadRehearsal } from "../load/d110LoadRehearsal.js";

const recordPath = path.resolve(
  process.cwd(),
  "docs",
  "ops",
  "load-test-record.json"
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d110-"));

try {
  const result = await performLoadRehearsal({ recordPath, tmpDir });
  console.log(JSON.stringify({
    ok: result.ok,
    performedAt: result.performedAt,
    recordedNumbers: result.recordedNumbers,
    productionShaped: result.productionShaped,
  }, null, 2));
  for (const s of result.scenarios) {
    const n = s.recordedNumber;
    console.log(`[${s.id}] ${n.metric}=${n.value} ${n.unit}`);
  }
  console.log(`Wrote ${recordPath}`);
  if (!result.ok) process.exit(1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
