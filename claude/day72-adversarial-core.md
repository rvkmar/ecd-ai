# D72 — Adversarial review across the whole core

**Exit check (never-compress list):** Findings ranked by severity; every
P0 fixed the same day with a regression test.

**Status: DONE.** Psychometric math was not refuted. The P0 that landed
was operational: a student could list, read, and submit on another
examinee's session.

Pattern: D39 / D60 — a context-isolated review prompted to REFUTE, then
this session fixes only P0 (plus the tests that pin it).

## Premise on contact

The 2026-09-03 tasks said: refute the delivery loop, accumulation,
selection/stopping, R pipeline, and W10 reachability; look for work that
exists, passes tests, and is never called.

That class is still the right hunt. What it is **not**: a first proof
the chain exists (D50/D71) or a re-run of D60's selection/stopping P0
(draft sibling AM). D61–D63 still hold: `/submit` does not call R;
ingest still refuses `converged: false`; student `GET …/teacher-report`
is still 403.

## Process

HEAD at start: `b9c6274` (D71). Two isolated reviewers:

- [Delivery and scoring](1087fdd1-baa2-406d-a7fe-8cee3d62a14a)
- [R pipeline and stores](f2045700-48cc-4bec-b697-d2255df92a7f)

Then this session verified the P0 in code and on `:6060`.

## Findings (ranked)

**P0 — a student can operate another examinee's session**

`sessionAssignedToStudent` existed and its tests passed. Production used
it only on `GET /mine`. That handler, when matching found **zero**
assigned rows, returned **every live session** so discovery would not
look empty. `GET /`, `GET /:id`, `/submit`, `/next-task`, play / pause /
finish, and `GET /api/reports/session/:id` had no owner check.

Confirmed live after the node rebuild: teacher created
`s1789403277647` for `stu-other-d72`; `stud1` `GET` → **403**; the id
is absent from `stud1`'s `GET /api/sessions`.

**P1 — deferred (not cheap, or a later unit)**

1. D39 collision refuse never clears the persisted posterior
   `applyPosteriorsToSession` already keeps a prior `supported: true`
   estimate. Stopping recomputes; CAT and reports read the stale map.
2. IRT/BN report summaries gate on `irtTheta` / `bnPosteriors`, which
   production never writes. Live EAP sits on `smvPosteriors`.
3. IRT ranking failure returns `{}`; the player shows "No more tasks."
4. Stop persists only on `/next-task`; a second `/submit` without that
   GET can still 200 (D60 only refuses after persist).
5. Selection can hand a later-suspended item that `/submit` 409s.
6. DIF/equating ingest writes `analysisArtefacts`; schema and UI never
   read it. Vocabulary still says analysis kinds ingest into nothing.
7. Named-fixture parameter keys (`Item.1`) cannot score live bank ids.
8. Shared `saveDB` JSON can clobber in-flight session writes.
9. `GET /api/students` is still authenticate-only (roster dump).
10. QuestionEditor `POST …/sync-irt` still calls missing `/irt-estimate`.
11. Teacher/student `/reports/dashboard` filters never match authored
    student rows (`teacherId` unset; student id ≠ username).

**P2 — deferred**

- `item-analysis` / `test-information` enqueueable with no R path.
- `capitalize("policies")` → `Policie` (no current `dbAdapter.list("policies")` caller).
- JSON `dbAdapter` ignores `ECD_DB_FILE`.
- `/calibrate/gdina` mounted, node always posts `/calibrate/dina`.
- `accumulationWarnings` returned by `/submit`, unread by SessionPlayer.

**Checked and found solid**

- D60 persist-stop and draft-sibling AM.
- D68 freeze / observableId IRT keying.
- D59 teacher-report 403.
- `/submit` does not call R; ingest refuses `converged: false`.
- No psychometric P0 (wrong EAP or mastery a user would trust).

## Fixes applied

P0 only, each with a regression test:

- `attendableSessionsForStudent` no longer falls back to every live
  session.
- `sessionsVisibleToUser` / `studentForbiddenFromSession` gate student
  `GET /`, `/active`, `/archived`, `GET /:id`, `/submit`, `/next-task`,
  play / pause / resume / finish / review, and session + learner
  reports.
- Staff lists and Operate are unchanged.

Tests: `sessionPlay.test.js`, `sessionMine.test.js`,
`d72StudentSessionOwnership.test.js`, `d59ReportsRoleSplit.test.js`
(own-session student still 200; foreign 403). Walkthrough mocks now use
the session's `studentId` so they still exercise `/submit`.

## Session-close verification (2026-09-14 IST)

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1379
  passed / 6 skipped** (91 files, 53.43s). Recorded as-run.
- `npm run build` — Vite 7.3.6, **✓ built in 14.28s**. Chunk warning
  remains (`index-ClvOCRR5.js` 2,276.74 kB) — D74.
- Live `:6060` after node rebuild: `stud1` GET of foreign session
  `s1789403277647` → 403.

D68 mid-flight ingest on `:6060`. Parameter-set diff UI. Hub image for
equating. D55 WCAG. P1 list above — do not treat as closed. D97/D98
still own row-level tenancy beyond sessions (students roster, items).

## Next

Calendar **D73** — accessibility audit (D55 was never actually run).
Do not start it on a thin budget if it is the real WCAG pass.
