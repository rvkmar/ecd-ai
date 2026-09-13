// server/r/__tests__/rBoundaryGuard.test.js
// ADR 0001 / R architecture doc: R is never in a session request path.
// A boundary that only exists in a document is a boundary that erodes.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function liveCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

describe("R is never in a session request path", () => {
  it("no module under server/delivery imports the R client", () => {
    const files = walk(path.join(ROOT, "server/delivery"));
    const offenders = [];
    for (const file of files) {
      if (file.includes("__tests__") || file.includes(".test.")) continue;
      const src = liveCode(fs.readFileSync(file, "utf8"));
      if (
        src.includes("rClient") ||
        src.includes("server/r/") ||
        src.includes("R_BACKEND_URL") ||
        src.includes("postCalibration")
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no /api/sessions route file reaches the R client", () => {
    const sessionFiles = [
      path.join(ROOT, "server/routes/sessionRoutes.js"),
      path.join(ROOT, "server/utils/itemExposure.js"),
      path.join(ROOT, "server/utils/autoFinish.js"),
      path.join(ROOT, "server/utils/sessionDependencies.js"),
    ];
    const offenders = [];
    for (const file of sessionFiles) {
      const src = liveCode(fs.readFileSync(file, "utf8"));
      if (
        src.includes("rClient") ||
        src.includes("../r/") ||
        src.includes("server/r/") ||
        src.includes("R_BACKEND_URL") ||
        src.includes("postCalibration") ||
        src.includes("getRHealth")
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
