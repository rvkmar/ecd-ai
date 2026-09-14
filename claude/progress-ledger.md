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
| Last completed unit | **D66** — sim10GDINA through R. Handoff: `claude/day66-sim10gdina.md`. Prior: D65 console (`claude/day65-calibration-console.md`); D64 LSAT7 (`claude/day64-lsat7-pipeline.md`). |
| Next queued | Calendar **D67** — CTT through R (endpoint is still 501). Never-compress. |
| Block | **W14** — diagnostics calibration, CTT live, DIF, equating |
| Block gate | ~~Administrator can start, watch, inspect and ingest a calibration without a shell (D65).~~ ~~LSAT7 in CI (D64).~~ D66: sim10GDINA through R in tests/CI. |
| Gate status | D61 live `/health` met. D62/D63 met in tests. D64 live CI + local `test:lsat7` green (restated a/b check — see units revised). **D65 met in UI + tests + coordinator live walk 2026-09-13** (`job1789319022666002` → `ps1789319081640`). **D66** always-run tests in this PR; live GDINA is CI (`lsat7-pipeline` now also runs sim10GDINA). |
| HEAD at D60 | `bdc88dc` |
| HEAD at D61–D63 | `fc0da07` (#17) + `1b56720` (#18) + `edea9f5` / `85b43fa` (live `/health` close). |
| HEAD at D64 | `d27d21b` (#19) |
| HEAD at D65 | `ce4c71b` (#20) + `3045ff0` (#21 fixture path). W13 close: `claude/day65-w13-close.md`. |
| HEAD at D66 | this PR |

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
| 2026-09-13 | D65 | 2 | Calibration console at `/admin/calibration` + Admin tab. District read-only. Process hook added (autorun is compose-only). Tests cover start → process → watch → ingest and non-converged 409. Suite 1311 passed / 1 skipped. Live operator walk not run here. |
| 2026-09-13 | bugfix | — | LSAT7 named-fixture ENOENT in the compose node image (`Dockerfile.node` does not ship `r-backend/`). Node now loads `server/r/fixtures/lsat7-frequency-table.json`. Handoff: `claude/lsat7-fixture-node-image.md`. |
| 2026-09-13 | close | — | W13 close at `3045ff0`. Suite 1313 passed / 1 skipped; live `test:lsat7` 8/8 on `:4000`; CI `lsat7-pipeline` green. D64 a/b check restated (no published coefficient table). D65 live walk + param-set diff not done. Next: D66. |
| 2026-09-13 | D65 walk | — | Coordinator live operator walk on localhost:6060 (`admin1` / WalkPass!2026). Job `job1789319022666002` converged and ingested `ps1789319081640`. Recorded on D66 close; was left open in the W13 ledger. Parameter-set diff UI still not built. |
| 2026-09-14 | D66 | 1, alone | sim10GDINA (`GDINA::sim10GDINA`, 1000×10, simQ 10×3) through enqueue → R `/calibrate/dina`/`gdina` → ingest. Always-run contract stub + live CI on the same `lsat7-pipeline` job. Console binds DINA/G-DINA. CTT still 501. |

## Compression debt

| Unit | What was compressed | Why | Discharge by | Status |
|---|---|---|---|---|
| D50 | District/teacher browser pass skipped | Human logins | D71 | open |
| D55 | Entire W11 accessibility audit skipped | Never scheduled after Q-matrix/Assembly shipped | Re-date at W12 close or before D73 | **open, past two block closes → standing risk** |
| D56 | Adaptive selection not live-browser | Tests only | D71 | open |
| D58 | Live diagnostic-session ending screen not walked at first close | Walked later 2026-09-13 on `s1789288381307` | D58 | **closed** |
| D57 | Author UI said accuracy was unevaluated | Folded into D58 | D58 | **closed** |
| D59 | Live report-surface browser walk skipped | Component + route tests; no running TLS stack this session | D71 | open |
| D62/D63 | Live enqueue → process → ingest against running R | Admin token / D65 console; `/health` only that close | D64 CI + D65 | D64 covers scripted LSAT7 in CI; D65 console walked 2026-09-13 (`job1789319022666002`). |
| D64 | Live mirt LSAT7 not executed in the authoring environment (no Docker/R here) | CI job `lsat7-pipeline` is the acceptance | this PR's CI | **closed** — live job green (`mirt 1.47`, `converged: true`, 1000×5) |
| D46 | Phase-2 `apiFetch` | — | — | **closed** (`e533a77` / PRs #5–#6) |
| D54 | Wizard readiness mirror has no agreement test | Token | W12 close | **open, past two block closes → standing risk** |
| D65 | Live operator walk + parameter-set diff UI skipped | Tests + routes; seed password; diff never built | D71 / follow-on | **walk closed 2026-09-13** (coordinator, `job1789319022666002` → `ps1789319081640`). Parameter-set diff UI still open. |
| D66 | Live GDINA sim10GDINA not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `sim10gdinaPipeline.test.js` | this PR's CI | **open until that CI job is green** |

Debt against the never-compress list is not permitted. **D60** (this file's real unit) is closed.

## Units revised on contact

| Unit | Plan assumed | Code actually was | Became |
|---|---|---|---|
| D58 | Write `sessionOrchestrator.js`; stop on accuracy, length, or coverage | Stop already in `activitySelection.js`; no coverage field | Persist `{ stopped }` on the session; player shows the reason; do not add a second orchestrator |
| D59 | Split reports by role; attribute-profile UI; close teacher-report leak | One stack (`reportsRoutes` + `SessionReport`); teacher-report was authenticate-only; classification already computed, not shown on reports | Gate teacher routes with `authorizeRole`; stop the client fetching them as a student; attach `stopped` + `attributeProfile` to existing payloads/surfaces |
| D61 | Posit-dated Dockerfile + committed `renv.lock` | Published `rvkmar/r-backend:latest`; `renv.lock` absent | Pin via live `/health` on that image; Dockerfile is a thin overlay only |
| D64 | Pin published mirt LSAT7 *a* and *b* in the test with a numeric tolerance | Live path does not pin published coefficient tables. It runs the published **1000×5** matrix through enqueue → `postCalibration` → ingest and asserts `converged: true`, `packageVersion` `/^mirt /`, `sampleSize: 1000`, every `a > 0`, and Item.5 `b` **lower** than Item.4 `b` because p(Item.5)=0.843 and p(Item.4)=0.606 | Restated live check; coefficient-table pin left for a later benchmark tightening (D88) |
| D66 | Pin recovered G-DINA probabilities to package `simItempar` | Live path asserts `2^k` table lengths from published `simQ`, values in `[0,1]`, and P(all mastered) > P(none) — true of every generating row, not a recovered-vs-generating tolerance | Restated live check; `simItempar` is documented on the fixture and is not the expected output |

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
