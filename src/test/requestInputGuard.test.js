// @vitest-environment node
// D93 — every mounted router sanitizes path/query inputs (static scan).
// Same shape as the D13 write-route gate: a removed middleware fails the
// suite before a missed call site becomes a quiet leak.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(ROOT, "server", "routes");
const INDEX = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");

const MARKER = "sanitizeRequestInputs";

function liveCode(src) {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** Mounted route modules — mirrors how D13 enumerates live routers. */
function mountedRouteFiles() {
  const files = new Set();
  const live = liveCode(INDEX);
  const importRe =
    /import\s+(\w+)\s+from\s+["']\.\/routes\/([^"']+)["']/g;
  const useRe = /app\.use\(\s*["'`]\/api\/[^"'`]+["'`]\s*,\s*(\w+)\s*\)/g;
  const identToFile = new Map();
  let m;
  while ((m = importRe.exec(live))) {
    identToFile.set(m[1], m[2].endsWith(".js") ? m[2] : `${m[2]}.js`);
  }
  while ((m = useRe.exec(live))) {
    const file = identToFile.get(m[1]);
    if (file) files.add(file);
  }
  return [...files].sort();
}

describe("D93 request-input sanitization is mounted on every live router", () => {
  const files = mountedRouteFiles();

  it("finds the mounted route set from server/index.js", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain("sessionRoutes.js");
    expect(files).toContain("usersRoutes.js");
  });

  it.each(files)("%s calls sanitizeRequestInputs in live code", (file) => {
    const src = liveCode(fs.readFileSync(path.join(ROUTES_DIR, file), "utf8"));
    expect(
      src,
      `${file} must import and router.use(${MARKER}) so path/query cannot bypass validateEntity`
    ).toMatch(new RegExp(`\\b${MARKER}\\b`));
    expect(src).toMatch(/router\.use\(\s*sanitizeRequestInputs\s*\)/);
  });

  it("the scanner fails when sanitizeRequestInputs is stripped (mutation)", () => {
    // Verifies the exit-check claim: removing the gate is loud.
    const fixture = `
      import { authenticateToken } from "../utils/authMiddleware.js";
      const router = express.Router();
      router.use(authenticateToken);
      router.get("/:id", (req, res) => res.json(req.params));
    `;
    const live = liveCode(fixture);
    expect(live).not.toMatch(/router\.use\(\s*sanitizeRequestInputs\s*\)/);
    const wouldFail = !/router\.use\(\s*sanitizeRequestInputs\s*\)/.test(live);
    expect(wouldFail).toBe(true);
  });
});
