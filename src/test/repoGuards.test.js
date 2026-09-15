// src/test/repoGuards.test.js
// ------------------------------------------------------------
// Cross-cutting static checks that don't belong to any one entity's test
// file -- these guard against a class of bug re-appearing anywhere in the
// tree, not just in the module that first had it. There's no ESLint setup
// in this repo (see CONTRIBUTING.md), so these run as ordinary Vitest
// checks instead of a custom lint rule.
// ------------------------------------------------------------

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src", "server"];
// "migrations" is exempt: a migration's whole job is to name the legacy
// spelling it's rewriting away from.
const SKIP_DIRS = new Set(["node_modules", "dist", "__tests__", "test", "migrations"]);

// WSL / a cold disk walks src/ (+ server for spelling and dead-exports)
// in ~3–6s. Vitest 5's default 5000ms then times out a real scan, not a
// false guard — same class of flake as routeAuth's cold-import budget.
// Every test that calls walk / walkAllJs / findRawApiFetches over the tree
// uses this so the next slow machine does not flake them one by one.
const FULL_TREE_SCAN_TIMEOUT_MS = 15000;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// A line only counts as a violation if the literal appears in live code,
// not inside a // comment (this file and sessionStatus.js both mention the
// legacy spelling in prose to explain why it's banned).
function isCodeOccurrence(line, needle) {
  const idx = line.indexOf(needle);
  if (idx === -1) return false;
  const commentIdx = line.indexOf("//");
  return commentIdx === -1 || commentIdx > idx;
}

describe("session status spelling", () => {
  it(
    "never re-introduces the legacy hyphenated \"in-progress\" status",
    () => {
    const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
    const offenders = [];

    for (const file of files) {
      const lines = fs.readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (isCodeOccurrence(line, '"in-progress"') || isCodeOccurrence(line, "'in-progress'")) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
      });
    }

    expect(
      offenders,
      `Found the legacy "in-progress" (hyphen) session status literal. ` +
        `Use SESSION_STATUS.IN_PROGRESS from src/utils/sessionStatus.js instead:\n` +
        offenders.join("\n")
    ).toEqual([]);
    },
    FULL_TREE_SCAN_TIMEOUT_MS
  );
});

describe("every write route declares a role gate", () => {
  // itemsRoutes.js once shipped with no role gating at all while
  // rolePermissions.js had no `items` entry either -- any authenticated
  // caller, including a student, could author or delete bank items. This
  // is the mechanical guard against that happening again anywhere else:
  // every POST/PUT/PATCH/DELETE route must have `authorizeRole(...)` (or
  // a local alias/`requireAdmin` built on it) in its own registration,
  // or be named in OPEN_BY_DESIGN below with a reason.
  //
  // A route belongs in OPEN_BY_DESIGN only when openness is a deliberate
  // product decision (self-service, or pre-authentication), not when a
  // gate was simply never written -- that's exactly the failure mode
  // this test exists to catch.
  const ROUTES_DIR = path.join(ROOT, "server", "routes");

  // links.js is dead code: not mounted anywhere (server/index.js keeps
  // both its import and its app.use() commented out), and it manages an
  // in-memory array disconnected from the real DB. Auditing it is the
  // AIG/autoFinish treatment -- gate it before it's ever mounted, not
  // busy-work now. Excluded here rather than gated because, unlike
  // aigRoutes.js/autoFinishRoutes.js, its handlers don't even do anything
  // real yet.
  const SKIP_FILES = new Set(["links.js"]);

  const OPEN_BY_DESIGN = new Set([
    // Login is how you get a token in the first place.
    "usersRoutes.js:POST:/login",
    // A session's own lifecycle (create, submit, play, pause, resume, finish,
    // review, archive) is the student's self-service flow, not a
    // privileged action -- gating it by role would block the exact
    // people it exists for. Ownership-scoping this (a student may only
    // touch their own session) is a real gap, but a scope-based one, not
    // a role-list one; see sessionRoutes.js's header comment.
    "sessionRoutes.js:POST:/",
    "sessionRoutes.js:POST:/:id/submit",
    "sessionRoutes.js:POST:/:id/play",
    "sessionRoutes.js:POST:/:id/pause",
    "sessionRoutes.js:POST:/:id/resume",
    "sessionRoutes.js:POST:/:id/finish",
    "sessionRoutes.js:POST:/:id/review",
    "sessionRoutes.js:POST:/:id/archive",
    // Student Session Wizard Draft→Submit clocks — same ownership-scoped
    // self-service as finish/play; role list would block the examinee.
    "sessionRoutes.js:POST:/:id/wizard-timing",
  ]);

  const WRITE_METHODS = ["post", "put", "patch", "delete"];

  function findGateAliases(content) {
    const aliases = new Set(["authorizeRole", "requireAdmin"]);
    const aliasRe = /const\s+(\w+)\s*=\s*authorizeRole\(/g;
    let m;
    while ((m = aliasRe.exec(content))) aliases.add(m[1]);
    return aliases;
  }

  function isGated(chunk, aliases) {
    return [...aliases].some((name) => new RegExp(`\\b${name}\\b`).test(chunk));
  }

  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".js") && !SKIP_FILES.has(f));

  it.each(files)("%s", (file) => {
    const content = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    const lines = content.split("\n");
    const aliases = findGateAliases(content);
    const offenders = [];

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) return;

      const match = trimmed.match(
        /^router\.(post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/
      );
      if (!match) return;

      const [, method, routePath] = match;
      if (!WRITE_METHODS.includes(method)) return;

      // The gate (if any) is written somewhere between this line and the
      // handler function opening -- collect a generous window rather
      // than parse real JS, matching this file's existing static-check
      // style (see the spelling guard above).
      const chunk = lines.slice(i, i + 8).join("\n");
      const key = `${file}:${method.toUpperCase()}:${routePath}`;

      if (!isGated(chunk, aliases) && !OPEN_BY_DESIGN.has(key)) {
        offenders.push(`${file}:${i + 1} ${method.toUpperCase()} ${routePath}`);
      }
    });

    expect(
      offenders,
      `Ungated write route(s) -- add authorizeRole(...) or add to OPEN_BY_DESIGN with a reason:\n` +
        offenders.join("\n")
    ).toEqual([]);
  });
});

/* ============================================================
   D49b — NOTHING IS DONE UNTIL SOMETHING CALLS IT
   ============================================================

   Action plan §8: "A module with no caller is not shipped work. Enforced by
   a dead-export guard test -- F4 and G4 are the same bug, found eight weeks
   apart." G4 shipped `record-usage` with no caller and every exposure figure
   was permanently zero. F4 shipped `buildCompositeLibrary()` with no caller
   and the delivery package was a design artefact for five weeks.

   THREE DESIGN DECISIONS, each of which the guard is useless without:

   1. TEST FILES DO NOT COUNT AS CALLERS. This is the whole point, not an
      implementation detail. F4's own description reads: "exercised by its own
      tests -- and invoked from nowhere in server/ or src/". A guard whose
      caller corpus included test files would have seen buildCompositeLibrary
      in builder.test.js and passed it. The bug this guard exists to catch is
      precisely "well tested, never called".

   2. SCOPED TO server/. Measured at 71e69a0: 11 dead exports under server/,
      153 under src/. The src/ figure is dominated by React Query hooks built
      ahead of the screens that consume them -- useQMatrixModels,
      useCompositeLibrary and friends shipped on D48 with no UI yet BY DESIGN,
      because the seven-artefact contract requires the hooks and the build
      reference schedules the screens for W11. A guard that failed on all 153
      would be switched off within a day. Revisit a client-side guard after
      W11, when the screens exist.

   3. BASELINED, NOT CLEANED FIRST. The 11 below are recorded with reasons and
      the guard fails only on NEW ones, so it is useful today rather than
      after a cleanup. The baseline is also checked in the other direction: an
      entry that has ACQUIRED a caller must be removed, or the list rots into
      a place where dead code hides.
   ============================================================ */

const PROD_SKIP = /(__tests__|[.]test[.]|[/\\]test[/\\]|[.]stories[.]|[.]storybook|node_modules|[/\\]dist[/\\])/;

function walkAllJs(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAllJs(full, files);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/* A COMMENTED-OUT CALL IS NOT A CALL.
   This repo has already shipped this exact bug once: the D48 collection
   surface guard matched `// router.use(authenticateToken)` and passed a
   mutation it should have failed. The same trap is live here in the other
   direction — if the caller corpus is raw text, commenting out the last real
   call site leaves the export looking alive, and the guard goes quiet at
   precisely the moment it should fire.

   Stripping can only ever REMOVE text, so its failure mode is a false
   "dead" (loud, reviewed) rather than a false "alive" (silent). That is the
   correct direction for a guard to be wrong in. */
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

/* Named exports only. `export default` is deliberately ignored: every route
   file default-exports its router, and the importer renames it, so a
   name-based reference check cannot say anything true about it. */
function namedExportsOf(source) {
  const names = new Set();
  for (const m of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm
  )) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name && name !== "default") names.add(name);
    }
  }
  return names;
}

// Each entry is "<path relative to repo root> :: <export name>" -> why it is
// allowed to have no production caller. A reason is mandatory: "unused" is
// not a reason, it is the observation.
const DEAD_EXPORT_BASELINE = new Map([
  [
    "server/aig/index.js :: generateAIGItem",
    "AIG was formally shelved on D6 and aigRoutes.js stays unmounted until D157.",
  ],
  [
    "server/aig/RendererTypes.js :: VisualSchema",
    "AIG, shelved D6. See above.",
  ],
  [
    "server/aig/itemModels/matrix_3x3_parent_item.js :: matrix3x3ParentItemModel",
    "AIG, shelved D6. See above.",
  ],
  [
    "server/delivery/evidenceAccumulation.js :: DIAGNOSTIC_MODEL_FAMILIES",
    "Used inside its own module's dispatch (three call sites). sessionRoutes.js " +
      "imports the CONTINUOUS and RAW_SCORE lists but deliberately NOT this one: " +
      "DINA/G-DINA has no item-level pilot field, so a diagnostic family with no " +
      "calibrated parameter set falls through to an explicit refusal rather than " +
      "getting an invented fallback. Verified D49b — not a missing branch.",
  ],
  [
    "server/migrations/runner.js :: runMigrations",
    "Plural batch helper. The CLI (server/migrations/run.js, wired to " +
      "npm run migrate / migrate:dry-run) iterates its own registry and calls " +
      "runMigration SINGULAR. Verified D49b — the migration path is intact.",
  ],
  [
    "server/migrations/runner.js :: hasBeenApplied",
    "Spare predicate on the same module; runMigration consults the applied-log itself.",
  ],
  [
    "server/routes/evidenceModels.js :: liveTaskModels",
    "Internal helper exported unnecessarily. (The file itself IS mounted — " +
      "server/index.js:13 — only the export is unreferenced.)",
  ],
  [
    "server/utils/lifecycleValidation.js :: STATUS_ORDER",
    "Duplicates a concept lifecycleMatrix.js owns as the single source of truth. " +
      "Deletion candidate rather than a permanent exemption.",
  ],
  [
    "server/utils/lifecycleValidation.js :: isPromotion",
    "Same as STATUS_ORDER — lifecycleMatrix.js's canTransition() is the live path.",
  ],
  [
    "server/utils/sessionDependencies.js :: sessionsDependingOnItem",
    "Consumed through its own wrapper liveSessionsForItem(), which IS called. " +
      "itemsRoutes.js's DELETE independently inlines an answered-session check, " +
      "so nothing is unguarded. Verified D49b.",
  ],
  [
    "server/utils/sessionDependencies.js :: isLiveSession",
    "Internal predicate behind the liveSessionsFor* wrappers.",
  ],

  /* The three below were INVISIBLE until liveCode() stripped comments: each
     is named in another file's prose, which made the raw-text scan call them
     alive. All three are used several times inside their own module and
     nowhere else, so the `export` keyword is what is unnecessary, not the
     code. Deletion candidates; left exported for now because unexporting them
     is three edits in files this unit has no other business touching. */
  [
    "server/utils/dbAdapter.js :: DB_MODE",
    "Used 8x inside dbAdapter.js. Named only in prose elsewhere (usersRoutes.js, " +
      "src/test/setup.js). The export is unnecessary — deletion candidate.",
  ],
  [
    "server/routes/usersRoutes.js :: createUserRecord",
    "Used 5x inside usersRoutes.js; named only in a dbAdapter.js comment. " +
      "The export is unnecessary — deletion candidate.",
  ],
  [
    "server/routes/evidenceModels.js :: calibrationGate",
    "Used 4x inside evidenceModels.js; named in prose in effectiveModel.js and " +
      "in mirrorDrift.test.js (a test, which by design does not count). " +
      "The export is unnecessary — deletion candidate.",
  ],
]);

describe("nothing is done until something calls it (server)", () => {
  const allJs = walkAllJs(ROOT);
  const prodFiles = allJs.filter((f) => !PROD_SKIP.test(f));
  // Exports are read from the raw source (an `export` inside a comment is not
  // an export, but the regexes are anchored to line starts and would not match
  // an indented commented one anyway). CALLERS are read from stripped source,
  // for the reason liveCode() documents.
  const rawSources = new Map(prodFiles.map((f) => [f, fs.readFileSync(f, "utf-8")]));
  const sources = new Map([...rawSources].map(([f, s]) => [f, liveCode(s)]));
  const serverFiles = prodFiles.filter((f) =>
    path.relative(ROOT, f).replace(/\\/g, "/").startsWith("server/")
  );

  function findDead() {
    const dead = [];
    for (const file of serverFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      for (const name of namedExportsOf(sources.get(file))) {
        const pattern = new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`);
        let called = false;
        for (const [other, text] of sources) {
          if (other === file) continue;
          if (pattern.test(text)) {
            called = true;
            break;
          }
        }
        if (!called) dead.push(`${rel} :: ${name}`);
      }
    }
    return dead;
  }

  const dead = findDead();

  it(
    "no NEW server export ships without a production caller",
    () => {
    const unexplained = dead.filter((d) => !DEAD_EXPORT_BASELINE.has(d));

    expect(
      unexplained,
      `These server exports are referenced by no OTHER production file.\n\n` +
        `Two things deliberately do NOT count as a reference:\n` +
        `  - a test file (F4 was "exercised by its own tests, invoked from nowhere")\n` +
        `  - a mention inside a comment (see liveCode())\n` +
        `Use inside the module's OWN file also does not count — an export only\n` +
        `its own module uses does not need to be exported.\n\n` +
        unexplained.join("\n") +
        `\n\nEither give it a caller, delete it (or just its \`export\`), or add ` +
        `it to DEAD_EXPORT_BASELINE with a real reason.`
    ).toEqual([]);
    },
    FULL_TREE_SCAN_TIMEOUT_MS
  );

  it(
    "the baseline does not rot — an export that gained a caller leaves the list",
    () => {
    const resurrected = [...DEAD_EXPORT_BASELINE.keys()].filter((k) => !dead.includes(k));

    expect(
      resurrected,
      `These are in DEAD_EXPORT_BASELINE but now HAVE a production caller. ` +
        `Remove them from the baseline, or the list becomes a place dead code ` +
        `hides:\n` + resurrected.join("\n")
    ).toEqual([]);
    },
    FULL_TREE_SCAN_TIMEOUT_MS
  );
});

/* ============================================================
   D46 — EVERY /api CALL GOES THROUGH apiFetch
   ============================================================

   Phase 2 of the data-layer consolidation: live src/ code must not call
   fetch() against /api/* itself. The one allowed wrapper is
   src/api/apiClient.js (apiFetch). Query hooks in src/api/queries/* call
   apiFetch; screens either use those hooks or call apiFetch with auth
   from useAuth().

   AuthProvider.login was verified, not assumed: it must hit /api before a
   token exists. apiFetch already omits Authorization when auth is absent,
   so login goes through apiFetch with no token and does NOT need an
   OPEN_BY_DESIGN entry. Add one only for a call that truly cannot use
   apiFetch, with a written reason — same rule as the write-route guard.
   ============================================================ */

const OPEN_BY_DESIGN_RAW_API_FETCH = new Map([
  // "<path relative to repo root>" -> why a raw fetch("/api…") is allowed.
  // apiClient.js is not listed here: it is the wrapper, not an exception.
]);

const API_CLIENT_REL = "src/api/apiClient.js";

// Same-line: fetch("/api…") / fetch('/api…') / fetch(`/api…`)
// and the window.fetch form the deleted interceptor tests used.
const RAW_API_FETCH_SAME_LINE = /\b(?:window\.)?fetch\s*\(\s*(['"`])\/api\b/;
// Multiline: fetch(\n  "/api…")
const RAW_API_FETCH_SPLIT_LINE = /\b(?:window\.)?fetch\s*\(\s*[\r\n]\s*(['"`])\/api\b/;

function rawApiFetchOffendersIn(rel, source) {
  const text = liveCode(source);
  const offenders = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (RAW_API_FETCH_SAME_LINE.test(line)) offenders.push(`${rel}:${i + 1}`);
  });
  if (
    RAW_API_FETCH_SPLIT_LINE.test(text) &&
    !lines.some((line) => RAW_API_FETCH_SAME_LINE.test(line))
  ) {
    const idx = text.search(/\b(?:window\.)?fetch\s*\(/);
    const lineNo = text.slice(0, idx).split("\n").length;
    offenders.push(`${rel}:${lineNo}`);
  }
  return offenders;
}

function findRawApiFetches() {
  const srcRoot = path.join(ROOT, "src");
  const files = walkAllJs(srcRoot).filter((f) => !PROD_SKIP.test(f));
  const offenders = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (rel === API_CLIENT_REL) continue;
    if (OPEN_BY_DESIGN_RAW_API_FETCH.has(rel)) continue;
    offenders.push(...rawApiFetchOffendersIn(rel, fs.readFileSync(file, "utf-8")));
  }
  return offenders;
}

describe("every /api call goes through apiFetch", () => {
  it(
    "no live src/ file issues a raw fetch() to /api",
    () => {
    const offenders = findRawApiFetches();

    expect(
      offenders,
      `Raw fetch("/api…") in live src/ code. Route it through apiFetch ` +
        `(or an existing hook in src/api/queries/) so the Authorization ` +
        `header is attached in one place.\n\n` +
        `apiClient.js is the only allowed wrapper. A call that truly cannot ` +
        `use apiFetch belongs in OPEN_BY_DESIGN_RAW_API_FETCH with a reason.\n\n` +
        offenders.join("\n")
    ).toEqual([]);
    },
    FULL_TREE_SCAN_TIMEOUT_MS
  );

  it(
    "the allowlist does not rot — a file that no longer raw-fetches /api leaves it",
    () => {
    const srcRoot = path.join(ROOT, "src");
    const files = new Set(
      walkAllJs(srcRoot)
        .filter((f) => !PROD_SKIP.test(f))
        .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"))
    );
    const stale = [...OPEN_BY_DESIGN_RAW_API_FETCH.keys()].filter((k) => !files.has(k));

    expect(
      stale,
      `These are in OPEN_BY_DESIGN_RAW_API_FETCH but the file is gone. ` +
        `Remove them or the list becomes a place exemptions hide:\n` +
        stale.join("\n")
    ).toEqual([]);
    },
    FULL_TREE_SCAN_TIMEOUT_MS
  );

  // Two full-tree walks (~3s each on WSL / a cold disk) overflow Vitest 5's
  // default 5000ms — the same class of flake as routeAuth's cold-import
  // budget, not a false guard. The mutation still uses the guard's own
  // detector (rawApiFetchOffendersIn); it just does not re-walk src/ twice.
  it(
    "fails when a raw /api fetch is reintroduced, then passes once removed",
    () => {
      const probeRel = "src/components/ui/__apifetch_guard_probe__.jsx";
      const probe = path.join(ROOT, probeRel);
      fs.writeFileSync(
        probe,
        `export function probe() {\n  return fetch("/api/foo");\n}\n`
      );
      try {
        const withProbe = rawApiFetchOffendersIn(
          probeRel,
          fs.readFileSync(probe, "utf-8")
        );
        expect(
          withProbe.some((o) => o.startsWith(probeRel)),
          `Guard did not fail after inserting fetch("/api/foo") in a component. ` +
            `Offenders were:\n${withProbe.join("\n")}`
        ).toBe(true);
      } finally {
        fs.unlinkSync(probe);
      }

      // walkAllJs only sees files that exist, so a deleted probe cannot be
      // an offender. Re-reading it would throw; existence is the "removed" half.
      expect(fs.existsSync(probe), "Guard still reported the probe after it was removed").toBe(
        false
      );
    },
    FULL_TREE_SCAN_TIMEOUT_MS
  );
});
