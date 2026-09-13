// src/test/collectionSurfaceGuard.test.js
// ------------------------------------------------------------
// D48. Guards artefacts 4 and 6 of the seven-artefact contract at the
// COLLECTION level: every collection declared in schema.js must have a
// mounted HTTP surface and a declared role permission.
//
// The bug this exists to prevent has already happened three times over.
// `assemblyModels` (Day 17), `qMatrixModels` (Day 18) and
// `compositeLibrary` (Day 19) each shipped with a full schema block,
// referential-integrity checks and — for two of them — a lifecycle
// validator, and then sat for weeks with no route file, no
// rolePermissions entry and no query hooks. They could be validated but
// not reached. Nothing failed, because nothing was looking.
//
// It is the same shape as the Day 13 finding (itemsRoutes.js shipped
// with no role gating at all while rolePermissions.js had no `items`
// entry), one level up: there, a surface existed with no declared
// permission; here, a declared entity had no surface at all.
//
// Like every other guard in this repo, this must be verified to FAIL
// when the thing it protects is removed — delete a route file, or an
// app.use() line, and this test should go red.
// ------------------------------------------------------------

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { schema } from "../utils/schema.js";
import { rolePermissions } from "../config/rolePermissions.js";

const ROOT = path.resolve(__dirname, "../..");
const INDEX = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
const ROUTES_DIR = path.join(ROOT, "server/routes");

// Collections whose HTTP surface is served under a DIFFERENT path than
// their collection name. Each entry is a deliberate, explained
// exception — an unexplained one is how a guard rots into a rubber
// stamp.
const PATH_ALIASES = {
  // competencyModels.js serves both: the router is mounted at
  // /api/competencies and owns the competencyModels collection. The
  // naming predates this guard; recording it here rather than renaming
  // a live route.
  competencyModels: "competencies",
  competencies: "competencies",
};

// Collections deliberately without their own rolePermissions entry.
const PERMISSION_ALIASES = {
  // `competencies` is governed by the competencyModels entry — one
  // router, one permission, two schema keys.
  competencies: "competencyModels",
};

const collections = Object.keys(schema);

// Every app.use("/api/<name>", ...) actually mounted in server/index.js,
// ignoring commented-out lines (aigRoutes and links are both parked
// behind comments and must NOT count as mounted).
function mountedApiPaths() {
  const mounted = new Set();
  for (const rawLine of INDEX.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("//")) continue;
    const m = line.match(/app\.use\(\s*["'`]\/api\/([A-Za-z0-9_-]+)["'`]/);
    if (m) mounted.add(m[1]);
  }
  return mounted;
}

describe("every schema collection has a reachable HTTP surface", () => {
  it("mounts a router for each declared collection", () => {
    const mounted = mountedApiPaths();
    const unreachable = collections.filter((c) => {
      const apiPath = PATH_ALIASES[c] || c;
      return !mounted.has(apiPath);
    });

    expect(
      unreachable,
      `These collections are declared in schema.js but no router is mounted for them in ` +
        `server/index.js. A collection that can be validated but not reached is artefact 4 ` +
        `of the seven-artefact contract missing — the exact gap D48 closed for ` +
        `assemblyModels, qMatrixModels and compositeLibrary. Add a route file and mount it, ` +
        `or add a documented PATH_ALIASES entry saying which path serves it.`
    ).toEqual([]);
  });

  it("declares a role permission for each collection", () => {
    const declared = new Set();
    for (const role of Object.values(rolePermissions)) {
      for (const key of ["canView", "canEdit", "canDelete", "canApprove", "canCreate"]) {
        for (const entity of role[key] || []) declared.add(entity);
      }
    }

    const ungoverned = collections.filter((c) => {
      const permName = PERMISSION_ALIASES[c] || c;
      return !declared.has(permName);
    });

    expect(
      ungoverned,
      `These collections appear in no role's permission lists in rolePermissions.js, so ` +
        `can(role, action, entity) denies for every role by omission rather than by design — ` +
        `the Day 13 finding, which shipped a route with no declared permission. Declare the ` +
        `intended access, or add a documented PERMISSION_ALIASES entry.`
    ).toEqual([]);
  });
});

// Resolve which route FILES are actually mounted, by matching the
// identifier in each live app.use() back to its live import. Doing it by
// identifier rather than by filename substring matters: `links.js` and
// `aigRoutes.js` both appear in server/index.js inside commented-out
// import lines, and a substring check reports them as mounted when they
// are deliberately parked.
function mountedRouteFiles() {
  const liveLines = INDEX.split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("//"));

  const identToFile = new Map();
  for (const line of liveLines) {
    const m = line.match(/^import\s+(\w+)\s+from\s+["'`]\.\/routes\/([\w.-]+\.js)["'`]/);
    if (m) identToFile.set(m[1], m[2]);
  }

  const files = new Set();
  for (const line of liveLines) {
    const m = line.match(/app\.use\(\s*["'`]\/api\/[\w-]+["'`]\s*,\s*(\w+)\s*\)/);
    if (m && identToFile.has(m[1])) files.add(identToFile.get(m[1]));
  }
  return files;
}

// Routes that legitimately take no token, because they are how a caller
// obtains one. Anything else ungated is a finding.
const UNAUTHENTICATED_BY_DESIGN = new Set(["usersRoutes.js::/login"]);

// Strip // line comments before looking for a gate. Without this, a gate
// that has been COMMENTED OUT still matches the regex looking for it, and
// the guard reports a disabled gate as present — which is exactly what a
// mutation test caught this file doing on its first pass. Same reasoning
// as isCodeOccurrence() in repoGuards.test.js.
function liveCode(src) {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const HAS_ROUTER_GATE = /router\.use\(\s*authenticateToken\s*\)/;

describe("every mounted router applies authentication", () => {
  // The other half of the Day 13 sweep, kept honest here: a route file is
  // only safe if it gates itself, because server/index.js has no global
  // auth middleware.
  //
  // Two gating styles are both legal and both accepted. Most routers call
  // router.use(authenticateToken) once. usersRoutes.js instead names
  // authenticateToken + authorizeRole on each individual handler, which is
  // stricter per route but easier to forget on a new one — so that style
  // is checked route by route rather than waved through.
  it("gates every mounted route, or exempts it explicitly", () => {
    const offenders = [];

    for (const file of mountedRouteFiles()) {
      const src = liveCode(fs.readFileSync(path.join(ROUTES_DIR, file), "utf8"));

      if (HAS_ROUTER_GATE.test(src)) continue;

      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^router\.(get|post|put|delete|patch)\(\s*["'`]?([^"'`,)]*)/);
        if (!m) continue;
        const routePath = (m[2] || "").trim() || "(inline)";
        const window = lines.slice(i, i + 6).join("\n");
        if (/authenticateToken/.test(window)) continue;
        const key = `${file}::${routePath}`;
        if (UNAUTHENTICATED_BY_DESIGN.has(key)) continue;
        offenders.push(key);
      }
    }

    expect(
      offenders,
      `These mounted routes are reachable without a token. There is no global auth gate in ` +
        `server/index.js, so a route that does not gate itself is open to any caller — the ` +
        `Day 13 finding. Gate it, or add it to UNAUTHENTICATED_BY_DESIGN with a reason.`
    ).toEqual([]);
  });
});

describe("calibrationJobs (D62) specifically", () => {
  it("has a route file, is mounted, and is gated", () => {
    const file = "calibrationJobsRoutes.js";
    const full = path.join(ROUTES_DIR, file);
    expect(fs.existsSync(full), `${file} should exist`).toBe(true);
    const src = liveCode(fs.readFileSync(full, "utf8"));
    expect(src, `${file} should apply authenticateToken in LIVE code`).toMatch(
      HAS_ROUTER_GATE
    );
    expect(src, `${file} should import authorizeRole for its write gates`).toContain(
      "authorizeRole"
    );
    expect(INDEX, "calibrationJobs should be mounted in server/index.js").toContain(
      `app.use("/api/calibrationJobs"`
    );
  });
});

describe("the three D48 collections specifically", () => {
  // Named explicitly as well as covered generically: the generic checks
  // above would keep passing if someone added a PATH_ALIASES entry to
  // silence them instead of building the surface.
  it.each(["qMatrixModels", "assemblyModels", "compositeLibrary"])(
    "%s has a route file, is mounted, and is gated",
    (collection) => {
      const file = `${collection}Routes.js`;
      const full = path.join(ROUTES_DIR, file);

      expect(fs.existsSync(full), `${file} should exist`).toBe(true);

      const src = liveCode(fs.readFileSync(full, "utf8"));
      expect(src, `${file} should apply authenticateToken in LIVE code`).toMatch(
        HAS_ROUTER_GATE
      );
      expect(src, `${file} should import authorizeRole for its write gates`).toContain(
        "authorizeRole"
      );
      expect(INDEX, `${collection} should be mounted in server/index.js`).toContain(
        `app.use("/api/${collection}"`
      );
    }
  );

  it("compositeLibrary exposes no generic create or update route", () => {
    // Not an oversight: schema.js declares it as a build artifact with
    // no lifecycle ("not an authored entity a human drafts/reviews/
    // revises"), and ADR 0003 puts the compile boundary at structural
    // facts. A hand-authored delivery package that no Task Model
    // compiles to would contradict both. Rebuild-from-builder is the
    // only mutation, and it takes no body.
    const src = liveCode(
      fs.readFileSync(path.join(ROUTES_DIR, "compositeLibraryRoutes.js"), "utf8")
    );
    expect(src).not.toMatch(/router\.post\(\s*["'`]\/["'`]/);
    expect(src).not.toMatch(/router\.put\(/);
    expect(src).toMatch(/router\.post\(\s*["'`]\/rebuild\/:taskModelId["'`]/);
  });
});
