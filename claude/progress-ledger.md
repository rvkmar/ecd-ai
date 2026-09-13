# ECD progress ledger

Restored 2026-09-13 at D58 close from `git log`, `CHANGELOG.md`, and the day handoffs then in `claude/`. D51–D57 contemporaneous notes were cited (CHANGELOG / commit messages) but never committed; they were reconstructed into `claude/` on 2026-09-13 from those same sources. Git remains the authority for what those units shipped.

Restored D51–D57 notes (each marked “Restored 2026-09-13”):

- `claude/day51-w11-calibration-and-qmatrix-editor.md`
- `claude/day52-w11-live-browser-walkthrough.md`
- `claude/day52b-qmatrix-route-decision.md`
- `claude/day52c-qmatrix-item-row-premise.md`
- `claude/day53-w11-dina-gdina-authoring.md`
- `claude/day54-assembly-model-wizard.md`
- `claude/day55-w11-accessibility-audit-not-run.md` (honest skip; no audit invented)
- `claude/day56-w12-activity-selection.md`
- `claude/day57-classification-accuracy-stopping.md`

## Current position

| | |
|---|---|
| Last completed unit | **D64** — LSAT7 through the full calibration pipeline in CI. Fixture is published `mirt::LSAT7` (section 7: 1000×5). Always-run contract path in `npm test`; live mirt path when `R_BACKEND_URL` is set / CI job `lsat7-pipeline`. Handoff: `claude/day64-lsat7-pipeline.md`. |
| Next queued | Calendar **D65** — calibration console (hooks exist, no UI). |
| Block | W13 — R Plumber service and the calibration job queue |
| Block gate | Administrator can start, watch, inspect and ingest a calibration without a shell (D65). ~~LSAT7 in CI (D64).~~ |
| Gate status | D61 live `/health` met. D62/D63 met in tests. **D64 live CI green** (`lsat7-pipeline` + `build-and-test`): enqueue → mirt 1.47 → `converged: true` → ingest. D65 remains. |
| HEAD at D60 | `bdc88dc` |
| HEAD at D61–D63 | `fc0da07` (#17) + `1b56720` (#18) + `edea9f5` / `85b43fa` (live `/health` close). |
| HEAD at D64 | this branch (see PR) |

## Session log

| Date (IST) | Units | Tier mix | Notes |
|---|---|---|---|
| 2026-09-13 | D58 | 2, alone | Premise rewritten: no new orchestrator. Persist `session.stopped`; player reads `data.stopped`. Live player walk later the same day: `s1789288381307` showed "Measurement target met" / attrA master 0.95. Walk Playwright/seed scripts gitignored (`0efe535`), not committed. |
| 2026-09-13 | D59 | 2, alone | Closed examinee leak on `teacher-report`. Role-split `SessionReport` / `reportsRoutes`. Classification + stop on report header, learner/teacher tabs, session list badge, session-player header. D60 not started. |
| 2026-09-13 | docs | — | Restored missing D51–D57 handoffs under `claude/` (see file list in that PR). No product code. D55 remains the skipped WCAG audit. |
| 2026-09-13 | D50 leftover | 2 | Staff Play no longer bounces to `/login`; Pause on the player; student My Sessions lists attendable sessions (`GET /api/sessions/mine`). Handoff: `day60-staff-play-and-student-discovery.md` (not the never-compress D60). |
| 2026-09-13 | D50 leftover | 2 | Staff list Play/Pause persist (exclusive) + Operate/Back; student/cohort assignment; /mine never 404s as "Session not found". Handoff: `day61-staff-session-operate-and-assignment.md`. |
| 2026-09-13 | close | — | Working tree clean at `f518bc9`. Additional walk scripts gitignored (`scripts-login-dump.cjs`, `scripts-new-session-walk.cjs`, `scripts-ui-walk.cjs`). Plan **D60** (adversarial review) not started, calendar unmarked. |
| 2026-09-13 | D60 | 1, alone | Never-compress adversarial review of selection/stopping. P0: draft/archived sibling AM made `targetsMet` inert — fixed. Cheap P1s: AM-resolution warning surface; `/submit` after stop refused. Dual-attribute *stopping* confirmed closed; *selection* hole (unmeasured attr unrankable) deferred. |
| 2026-09-13 | D61–D63 | 2 | R Plumber scaffold (`/health` versions, compose re-enabled, scoring neutralized). `calibrationJobs` seven-artefact queue. ADR 0002 contract both sides; ingest refuses `converged: false`. `/submit` no longer calls R. |
| 2026-09-13 | ops | — | Compose `r-backend` uses published `rvkmar/r-backend:latest` + `./r-backend/app` mount. Do not `docker compose build r-backend` as the default path. |
| 2026-09-13 | close | — | Live D61 `/health` on `:4000` (R 4.6.1, mirt 1.47, …). Suite 1287/1287, build green, tree clean at `edea9f5`. `/admin` → login; seed `admin123` is not the live password. Enqueue/ingest not walked. |
| 2026-09-13 | D64 | 1, alone | LSAT7 fixture (1000×5, Bock & Lieberman) + `{ fixture: "lsat7" }` enqueue. Always-run path uses a labeled contract stub. CI starts `rvkmar/r-backend:latest` + app mount for the live mirt run. Suite 1293 passed / 1 skipped (live describe). D65 not started. |

## Compression debt

| Unit | What was compressed | Why | Discharge by | Status |
|---|---|---|---|---|
| D50 | District/teacher browser pass skipped | Human logins | D71 | open |
| D55 | Entire W11 accessibility audit skipped | Never scheduled after Q-matrix/Assembly shipped | Re-date at W12 close or before D73 | **open, past one block close → standing risk** |
| D56 | Adaptive selection not live-browser | Tests only | D71 | open |
| D58 | Live diagnostic-session ending screen not walked at first close | Walked later 2026-09-13 on `s1789288381307` | D58 | **closed** |
| D57 | Author UI said accuracy was unevaluated | Folded into D58 | D58 | **closed** |
| D59 | Live report-surface browser walk skipped | Component + route tests; no running TLS stack this session | D71 | open |
| D62/D63 | Live enqueue → process → ingest against running R | Admin token / D65 console; `/health` only that close | D64 CI + D65 | D64 covers scripted LSAT7 in CI; console still D65 |
| D64 | Live mirt LSAT7 not executed in the authoring environment (no Docker/R here) | CI job `lsat7-pipeline` is the acceptance | this PR's CI | **closed** — live job green (`mirt 1.47`, `converged: true`, 1000×5) |
| D46 | Phase-2 `apiFetch` | — | — | **closed** (`e533a77` / PRs #5–#6) |
| D54 | Wizard readiness mirror has no agreement test | Token | W12 close | open |

Debt against the never-compress list is not permitted. **D60** (this file's real unit) is closed.

## Units revised on contact

| Unit | Plan assumed | Code actually was | Became |
|---|---|---|---|
| D58 | Write `sessionOrchestrator.js`; stop on accuracy, length, or coverage | Stop already in `activitySelection.js`; no coverage field | Persist `{ stopped }` on the session; player shows the reason; do not add a second orchestrator |
| D59 | Split reports by role; attribute-profile UI; close teacher-report leak | One stack (`reportsRoutes` + `SessionReport`); teacher-report was authenticate-only; classification already computed, not shown on reports | Gate teacher routes with `authorizeRole`; stop the client fetching them as a student; attach `stopped` + `attributeProfile` to existing payloads/surfaces |
| D61 | Posit-dated Dockerfile + committed `renv.lock` | Published `rvkmar/r-backend:latest`; `renv.lock` absent | Pin via live `/health` on that image; Dockerfile is a thin overlay only |

## Carried-forward gaps

- ~~F4 — `buildCompositeLibrary()` has no caller~~ closed D49a + D49c
- ~~F3 — client computes the score~~ closed D47
- ~~Classification accuracy visible but unevaluated~~ closed D57; persist/show closed D58
- ~~Classification on reports~~ closed D59
- ~~Examinee can GET teacher-report~~ closed D59
- Mastery cut fixed at 0.5 — still true
- `gdina` has no pilot path; BayesianNetwork selection for `gdina` is first-unanswered with a warning (D60 P1-5)
- Session not bound to a specific Assembly Model (two *governing* matches → none applied, now warned). A draft/archived sibling no longer vetoes the unique governing model (D60 P0).
- Adaptive selection: nearest difficulty, not max information (held for benchmark work; D60 characterisation test pins it)
- Dual-attribute *targetsMet* early stop ("1 of 1") — **closed** (D57 join + D60 re-run)
- Dual-attribute *selection*: items for an attribute with no persisted posterior stay unrankable while measured-attribute items remain (D60 P1-4)
- Chunk >500 kB — D74
- ~~Student My Sessions placeholder~~ closed D60
- Dead-export guard can miss unused exports that share a name
- Session ownership-scoping (a student may only read their own session) — still open; D59 closed the role leak only
