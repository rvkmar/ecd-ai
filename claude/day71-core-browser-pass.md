# D71 — Full core browser pass (W15)

**Status: DONE** as a four-role live walk on `http://localhost:6060`, with
ranked defects. Product fixes from this session are in the D71 commit.
**D68 mid-flight ingest was not walked** (no unstopped two-item session
in the deployment). Hub image publish and parameter-set diff UI were
not this unit.

The 2026-09-03 tasks said "first proof the chain exists." Calibration
rewrote that: admin+student IRT already moved a posterior on D50. This
unit is four-role sign-off plus the deferred walks (district/teacher
Play, D56 ranking on a live session, D59 reports).

## Exit check

| Plan exit check | What was actually executed |
|---|---|
| Author → deliver → score → accumulate → calibrate → rescore, in a browser, across all four roles; defect list produced | **Met as a walk, with holes named below.** Authoring: admin Competency/Evidence/Calibration. Deliver/score/accumulate: student Play on `s1789288355960` (BayesianNetwork; stop "Measurement target met"; attrA master 0.95). Calibrate: admin console job `job1789319022666002` ingested `ps1789319081640`; district Calibration is inspect-only (no Enqueue). Rescore / D68 freeze: **not** demonstrated mid-flight. |

Logins: `admin1` / `dist1` / `teach1` / `stud1` with the live walk password
on `:6060`. Stack: nginx `:6060`, R `:4000` (plink 1.5.1).

## Ranked defects (this walk)

**P0 — Session reports 404/500 on the live stack.** Two stacked defects:

1. A first pass switched session reports to `dbAdapter` (Mongo). Docker
   `DB_MODE=mongo` is for users; sessions still live in `ECD_DB_FILE`
   (`/data/db.json`) via `loadDB()`, same as `sessionRoutes`. Mongo had
   no session rows → 404 on all three report URLs. **Reverted** session
   reports to `loadDB()`.
2. After that, `/session/:id` and `/learner-feedback` returned **200**.
   `/teacher-report` still **500**: `em.constructs.length` when a bound
   Evidence Model has no `constructs` array (ECD models often don't).
   Guarded with `(em.constructs || [])`. Live check 2026-09-14:
   `s1789300812805` all three URLs **200** as `teach1`.

Player "Open Report (raw JSON)" was a bare `/api/reports/...` navigation
→ **Unauthorized** (no bearer). Now opens in-app `SessionReport`.
Client: `Promise.allSettled` so one endpoint cannot blank the others;
error state has Close. `dbAdapter.list` still `ensureMongoModel`s
unregistered collections (dashboard path / first Mongo 500 on
`students`).

**P1 — New Evidence Model hid operational competency models.**
`EvidenceModelBuilderPanel` filtered `status === "confirmed"` only. Live
CM `D56/D57 Diagnostic Walk` is **operational**; the banner said none
were confirmed and New EM was disabled. Same class as
`isLinkableEvidenceModel`. Added `isLinkableCompetencyModel`. **Verified
live after nginx rebuild:** New Evidence Model enabled, banner gone.

**P1 — Back to sessions dropped the Sessions tab.** `sessionListPath`
was `/district` / `/teacher` / `/student`; dashboards default to Item
Bank / My Sessions only if first tab. District Operate → player → Back
landed on Item Bank. Path is now `?tab=sessions` (student:
`mysessions`); `DashboardLayout` reads it. **Verified:**
`/teacher?tab=sessions` opens Sessions.

**P2 — Item-based tasks render as `No Q [C: ? , E: ?]`.** List and
player still use legacy question/competency/evidence labels. Not fixed
here (display, not scoring).

**P2 — Measurement-stop panel is `bg-green-50`.** Classification line
is in the a11y tree but nearly invisible on dark theme. Tokens applied
on the stop / no-more-tasks panels.

**P3 — District/teacher Item Bank shows 0** on the legacy questions
dashboard while admin ECD Item Bank shows 4 operational items. Two
banks; not a D71 product change.

## What the walk confirmed

- Four roles sign in and reach their dashboards.
- Admin calibration console: LSAT7 jobs, inspect ingested set.
- District Operate opens `/district/sessions/:id/player` (D50 leftover).
- District Calibration: jobs + Inspect, no Enqueue.
- Teacher Sessions: Pause / Operate / Report.
- Student My Sessions lists attendable rows; Play opens the player.
- D56: live BN session selected `t-d56-1` then `t-d56-3` and stopped on
  targetsMet (already persisted; ranking not re-run this session).

## Session-close verification (2026-09-14 IST)

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1369
  passed / 6 skipped** (90 files, 55.51s). Recorded as-run on close.
- `npm run build` — Vite 7.3.6, **✓ built in 12.72s**. Chunk warning
  remains (`index-ClvOCRR5.js` 2,276.74 kB) — D74.
- Docker: `node` and `nginx` rebuilt so the walk could see API + UI
  fixes. Teacher-report 200 verified against the rebuilt node.

## Honest remaining gaps

- D68 mid-flight ingest + second submit on `:6060`.
- D59 live UI click of Teacher Report was not re-walked in the locked
  browser (password fill blocked); HTTP as `teach1` is the live check.
- Parameter-set diff UI (D65 leftover).
- Hub `rvkmar/r-backend:latest` for GitHub live equating (D70 ops).
- CTT Evidence Model → `operational` (D77-class).
- D55 WCAG still never run in git (calendar ✅ is false).

## Next

Calendar **D72** — adversarial review of the whole core. Separate
agent. Do not start on a thin budget.
