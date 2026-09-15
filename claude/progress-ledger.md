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
| Last completed unit | **D73** — accessibility backfills F-A1–F-A6. Handoff: `claude/day73-accessibility-backfills.md`. Prior: D72. |
| Next queued | Calendar **D74** — bundle split (>500 kB). Then **D75** W15 close (never-compress). |
| Off-calendar (2026-09-15) | Student Model lifecycle: Competency Models stay draft ↔ reviewed → confirmed (locked). Assembly/Q-matrix activation uses `isLinkableCompetencyModel`, not `cm.status === "operational"`. Decision: `claude/student-model-lifecycle.md` (PADI TR9). |
| Block | **W15** — Core sign-off (D71–D73 done; D74–D75 remain) |
| Block gate | ~~Administrator can start, watch, inspect and ingest a calibration without a shell (D65).~~ ~~LSAT7 in CI (D64).~~ ~~D66: sim10GDINA through R in tests/CI.~~ ~~D67: CTT through R in tests/CI.~~ ~~D69: planted DIF unique-item flag in CI.~~ ~~D70: known-equating recovered locally (`plink` 1.5.1).~~ Hub `latest` still needs the rebuilt image for GitHub live equating. |
| Gate status | D61 live `/health` met. D62/D63 met in tests. D64 live CI + local `test:lsat7` green (restated a/b check — see units revised). **D65 met in UI + tests + coordinator live walk 2026-09-13** (`job1789319022666002` → `ps1789319081640`). **D66** always-run + live CI (`lsat7-pipeline` sim10GDINA step green on `dca6c31`); recovered-vs-`simItempar` and classification **restated**, not pinned. **D67** always-run + live CI (`lsat7-pipeline` CTT step green on `45de56f`; `TAM 4.3.25`, `converged: true`, 1000×5). Difficulty asserted against published LSAT7 item means; KR-20 / rpb **restated**, not pinned. **D68** met in tests (in-flight freeze; new sessions take the active set; D50 IRT keying = observable with itemId fallback). Live mid-flight ingest on `:6060` not walked. **D69** always-run + live CI (`lsat7-pipeline` planted DIF step green on `56de11d`; `difR 6.1.0`, unique ETS C on Item.5). |
| HEAD at D60 | `bdc88dc` |
| HEAD at D61–D63 | `fc0da07` (#17) + `1b56720` (#18) + `edea9f5` / `85b43fa` (live `/health` close). |
| HEAD at D64 | `d27d21b` (#19) |
| HEAD at D65 | `ce4c71b` (#20) + `3045ff0` (#21 fixture path). W13 close: `claude/day65-w13-close.md`. |
| HEAD at D66 | `dca6c31` (#22). Close: `claude/day66-sim10gdina.md`. |
| HEAD at D67 | `4e8881a` (#23) + close `6dd7357`. Close: `claude/day67-ctt-calibration.md`. Live CI: [lsat7-pipeline `45de56f`](https://github.com/rvkmar/ecd-ai/actions/runs/34802897124). |
| HEAD at D68 | product `c4e5d77` + close `8a5ff65` + D68 completed verification commit. Close: `claude/day68-calibrated-supersedes-pilot.md`. |
| HEAD at D69 | product `a66c475` + ETS-C `2d602bb` + `alphaMH` delta `56de11d` + this close. Close: `claude/day69-dif-analysis.md`. Live CI: [lsat7-pipeline `56de11d`](https://github.com/rvkmar/ecd-ai/actions/runs/34810924755). |
| HEAD at D70 | first pass `0a2ff01` (hand Mean/Sigma) + plink `b96511a` + this close. Close: `claude/day70-equating.md`. Live path: local `:4000` (`plink` 1.5.1), not Hub CI. |
| HEAD at D71 | `b9c6274`. Close: `claude/day71-core-browser-pass.md`. Live path: nginx `:6060` + node rebuilt that session. |
| HEAD at D72 | `c2f387b`. Close: `claude/day72-adversarial-core.md`. |
| HEAD at D73 | `ff71b21` + this close. Close: `claude/day73-accessibility-backfills.md`. |

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
| 2026-09-14 | close | — | D66 close at `dca6c31`. Suite 1323 passed / 3 skipped; build green. Live GDINA is CI (not local). Calendar marked. Classification half of the plan exit check restated as not in this pipeline (D79). Next: D67. |
| 2026-09-14 | D67 | 1, alone | LSAT7 CTT (`{ fixture: "lsat7-ctt" }`, same Bock & Lieberman 1000×5) through enqueue → R `/calibrate/ctt` (`TAM::tam.ctt`) → ingest. Always-run contract stub + live CI on `lsat7-pipeline`. Console binds CTT. No published KR-20 table; difficulty is the published item mean. Suite **1332 passed / 4 skipped**; build green. Live TAM CI green (`TAM 4.3.25`, `converged: true`). |
| 2026-09-14 | close | — | D67 close at `4e8881a`. Suite re-run **1332 passed / 4 skipped**; build green. Calendar marked. G6 operational lifecycle walk not executed. `classicalCalibration.js` still IRT-shaped. Next: D68. |
| 2026-09-14 | D68 | 3, alone | Never-compress switchover. In-flight freeze to opening source / parameterSetId. New sessions still take the active calibrated set. D50: IRT keyed by observableId (itemId fallback). Schema no longer requires pointer == current active set. D49c same-session flip test restated. Suite **1350 passed / 4 skipped**. Player regression on `:6060` (`s1789288355960`). |
| 2026-09-14 | close | — | D68 close verification. Suite re-run **1349 passed / 4 skipped** (one fewer than product-commit 1350; recorded as-run). Build green 30.45s. Calendar already ✅. Live mid-flight ingest still D71. Next: D69. |
| 2026-09-14 | D69 | 1, alone | Premise rewritten: job kind already existed. Wired `/calibrate/dif`, groups, artefact ingest, planted-dif CI. First live CI overflagged at MH p < 0.05; ETS C with missing `deltaMH` field underflagged; unique C from `-2.35 * log(alphaMH)` passed. |
| 2026-09-14 | close | — | D69 close. Suite **1357 passed / 5 skipped**; build 28.50s. Live planted DIF green on `56de11d`. Calendar marked. Next: D70. |
| 2026-09-14 | D70 | 1, alone | Premise rewritten twice: job kind existed; Hub lacked equate/plink so first pass was mirt Mean/Sigma; local rebuild then `plink::plink`. Known-equating recovered locally. |
| 2026-09-14 | close | — | D70 close. Suite **1371 passed**; build 37.55s. Live plink on `:4000`. Calendar marked. Next: D71. Hub image publish still open. |
| 2026-09-14 | D71 | 3, alone | Four-role live walk on `:6060`. Reports: keep `loadDB` (sessions are JSON); teacher-report 500 on missing `constructs`. D68 mid-flight not walked. Suite **1369 passed / 6 skipped**. |
| 2026-09-14 | D72 | 3, alone | Whole-core adversarial. No psychometric P0. P0: `/mine` fallback + ungated `GET /:id` `/submit`. Live 403 on foreign session. Suite **1379 passed / 6 skipped**. |
| 2026-09-14 | D73 | 1, alone | Calendar D55 findings recovered (git never had the audit file). F-A1 Modal→Radix Dialog; F-A2 contrast; F-A3 cards; F-A4 labels; F-A5 scroll; F-A6 24px checkboxes. Suite **1382 passed / 6 skipped**. |
| 2026-09-14 | close | — | D73 close verification. Suite re-run **1382 passed / 6 skipped** (53.85s). Build 12.97s. Tree clean at `ff71b21`. Next: D74. |
| 2026-09-15 | decision + fix | — | PADI TR9: CM is Student Model, not a delivery object. No CM Activate/Suspend. Assembly/Q-matrix activation accepts confirmed+locked parents. `AGENTS.md` left as behavior rules only. Doc: `claude/student-model-lifecycle.md`. D74 not started. |

## Compression debt

| Unit | What was compressed | Why | Discharge by | Status |
|---|---|---|---|---|
| D50 | District/teacher browser pass skipped | Human logins | D71 | **closed** — district Operate + teacher Sessions walked 2026-09-14 |
| D55 | Entire W11 accessibility audit skipped | Never scheduled after Q-matrix/Assembly shipped | Re-date at W12 close or before D73 | **closed as backfill** — D73 source-verified calendar F-A1–F-A6 and fixed them. No new axe report invented. |
| D56 | Adaptive selection not live-browser | Tests only | D71 | **closed as inspection** — live BN session `s1789288355960` already ranked t-d56-1 / t-d56-3 and stopped; ranking not re-run |
| D58 | Live diagnostic-session ending screen not walked at first close | Walked later 2026-09-13 on `s1789288381307` | D58 | **closed** |
| D57 | Author UI said accuracy was unevaluated | Folded into D58 | D58 | **closed** |
| D59 | Live report-surface browser walk skipped | Component + route tests; no running TLS stack this session | D71 | **closed as HTTP** — `teach1` GET `/session/s1789300812805` + learner-feedback + teacher-report all 200 after constructs guard. UI click not repeated this close. |
| D62/D63 | Live enqueue → process → ingest against running R | Admin token / D65 console; `/health` only that close | D64 CI + D65 | D64 covers scripted LSAT7 in CI; D65 console walked 2026-09-13 (`job1789319022666002`). |
| D64 | Live mirt LSAT7 not executed in the authoring environment (no Docker/R here) | CI job `lsat7-pipeline` is the acceptance | this PR's CI | **closed** — live job green (`mirt 1.47`, `converged: true`, 1000×5) |
| D46 | Phase-2 `apiFetch` | — | — | **closed** (`e533a77` / PRs #5–#6) |
| D54 | Wizard readiness mirror has no agreement test | Token | W12 close | **open, past two block closes → standing risk** |
| D65 | Live operator walk + parameter-set diff UI skipped | Tests + routes; seed password; diff never built | D71 / follow-on | **walk closed 2026-09-13** (coordinator, `job1789319022666002` → `ps1789319081640`). Parameter-set diff UI still open. |
| D66 | Live GDINA sim10GDINA not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `sim10gdinaPipeline.test.js` | this PR's CI | **closed** — live job green (`GDINA 2.9.12`, `converged: true`, 1000×10; first CI keyed `"Item 1"`, then keyed by request `itemIds`) |
| D67 | Live TAM LSAT7 CTT not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `cttPipeline.test.js` | this PR's CI | **closed** — live job green (`TAM 4.3.25`, `converged: true`, 1000×5, `TAM::tam.ctt2`; observed KR-20 0.4542 recorded, not pinned) |
| D68 | Live mid-flight ingest + second submit on `:6060` | HTTP switchover tests; player regression only | D71 | **open** — no unstopped two-item session in the deployment this walk |
| D69 | Live difR planted-item flags not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `difPipeline.test.js` | this PR's CI | **closed** — live job green (`difR 6.1.0`, unique ETS C on Item.5; first two live runs failed the unique-item rule, recorded in the handoff) |
| D70 | Live known-equating not executed against Hub `rvkmar/r-backend:latest` | Local `:4000` has equate 2.0.9 / plink 1.5.1; CI still pulls Hub | Docker Hub push of the rebuilt image | **open** — local exit check closed; GitHub live equating waits on Hub |

Debt against the never-compress list is not permitted. **D60** (this file's real unit) is closed.

## Units revised on contact

| Unit | Plan assumed | Code actually was | Became |
|---|---|---|---|
| D58 | Write `sessionOrchestrator.js`; stop on accuracy, length, or coverage | Stop already in `activitySelection.js`; no coverage field | Persist `{ stopped }` on the session; player shows the reason; do not add a second orchestrator |
| D59 | Split reports by role; attribute-profile UI; close teacher-report leak | One stack (`reportsRoutes` + `SessionReport`); teacher-report was authenticate-only; classification already computed, not shown on reports | Gate teacher routes with `authorizeRole`; stop the client fetching them as a student; attach `stopped` + `attributeProfile` to existing payloads/surfaces |
| D61 | Posit-dated Dockerfile + committed `renv.lock` | Published `rvkmar/r-backend:latest`; `renv.lock` absent | Pin via live `/health` on that image; Dockerfile is a thin overlay only |
| D64 | Pin published mirt LSAT7 *a* and *b* in the test with a numeric tolerance | Live path does not pin published coefficient tables. It runs the published **1000×5** matrix through enqueue → `postCalibration` → ingest and asserts `converged: true`, `packageVersion` `/^mirt /`, `sampleSize: 1000`, every `a > 0`, and Item.5 `b` **lower** than Item.4 `b` because p(Item.5)=0.843 and p(Item.4)=0.606 | Restated live check; coefficient-table pin left for a later benchmark tightening (D88) |
| D66 | Pin recovered G-DINA probabilities **and** attribute-profile classification to published sim10GDINA | Live path asserts `2^k` table lengths from published `simQ`, values in `[0,1]`, and P(all mastered) > P(none); no examinee-class table exists in the package object as used here | Restated item-parameter check; classification left for ADR 0004 / D79 (not dropped). `simItempar` is documented on the fixture and is not the expected output |
| D67 | Rewrite `classicalCalibration.js` to native CTT; wire the file kind through the import panel; first CTT Evidence Model reaches `operational` | Real calibration path is R jobs. `/calibrate/ctt` was a contract-shaped 501. `ctt-statistics` was already a declared job kind (TAM). `classicalCalibration.js` still emits provisional IRT. `readinessErrorsFor` already only requires *some* parameter set. | TAM `POST /calibrate/ctt` on published LSAT7 as `{ fixture: "lsat7-ctt" }`. Ingest native `{ difficulty, discrimination, n }` + KR-20. Enqueue refuses an IRT bind. File-import rewrite and the operational lifecycle POST were **not** this unit (held for D71 / D77). |
| D67 | Pin published CTT coefficients (KR-20, point-biserial) for a classical dataset | No published KR-20 / rpb table for LSAT7 is in this pipeline. CTT difficulty **is** the published item mean (definitional). Live path asserts those means, Item.5 p > Item.4 p, rpb in (0,1), KR-20 in (0,1), `packageVersion` `/^TAM /` | Restated reliability / discrimination check; difficulty identity kept. Tightening is D88-class if a table is later sourced |
| D68 | Wire calibrated values through Item Wizard Step 7; re-verify D39 P0-3 on switchover | Calibrated already won on submit/selection for new work. The hole was the *next* submit on an in-flight session mixing sources/sets. Schema required `parameterSetId === activeParameterSetId`, which itself blocked a frozen historical pointer. D49c required the mix. | Freeze per EM to opening source + opening set. New sessions still prefer calibrated. IRT keyed by observableId (itemId fallback). Schema: set must still exist, need not be active. D49c restated to a new session. |
| D69 | Wire `difR` as a job kind; unique planted-item flag in CI at a stated tolerance | `dif-analysis` / package `difR` already declared. No `/calibrate/dif`, no groups, no artefact ingest. Unadjusted MH p < 0.05 is not unique on this 8-item matrix. `difR` stores `alphaMH`, not `deltaMH`. | R path + groups + artefact ingest. Stated tolerance is ETS C from `-2.35 * log(alphaMH)`. Unique Item.5 in CI on `56de11d`. |
| D70 | Wire equate / plink as a job kind; recover a known transformation in CI | `equating` already declared. No `/calibrate/equating`, no `forms`, no fixture. Hub image lacked `equate` and `plink`. | Seeded NEAT fixture + R path + artefact ingest. First pass hand Mean/Sigma on mirt (`0a2ff01`). After local image rebuild, operational constants from `plink::plink` Mean/Sigma (`b96511a`). Tolerance slope 1 ± 0.2, intercept −0.5 ± 0.3. Live check executed on local `:4000`, not Hub. |
| D71 | First proof author → deliver → score → accumulate → calibrate → rescore even exists | Admin+student IRT already moved a posterior (D50). District/teacher Play, reports, and D68 freeze were the holes. `DB_MODE=mongo` does not mean sessions live in Mongo. | Four-role live sign-off. Session reports stay on `loadDB` (`ECD_DB_FILE`). Teacher-report must tolerate Evidence Models without `constructs`. |
| D72 | Refute delivery, accumulation, selection, R pipeline, W10 reachability | Those surfaces exist and D60/D68/D39 hold. The uncalled production path was `sessionAssignedToStudent` (tests only + `/mine` leak-fallback). | Ranked findings. P0: student may not list/read/submit another examinee's session. P1s recorded, not all fixed. |
| D73 | Execute only D55 numbered required backfills | `claude/day56-accessibility-audit.md` was never in git. Calendar D55 listed F-A1–F-A6. | Recover those six, re-verify in source, backfill only still-present defects. |
| CM operational | Shared `lifecycleMatrix` + Assembly/Q-matrix activation required `cm.status === "operational"`; D71 treated that as a missing CM state | PADI TR9: Student Model is claim schema; delivery uses the task/evidence library. CM routes never offered Activate/Suspend. | Confirmed+locked remains the CM freeze. Linkable parent = locked non-archived. Activation gates use `isLinkableCompetencyModel`. No CM operational UI. |

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
- Competency Model Operational/Suspended **not required** (PADI TR9; `claude/student-model-lifecycle.md`) — closed as a false requirement 2026-09-15
- ~~Student My Sessions placeholder~~ closed D60
- Dead-export guard can miss unused exports that share a name
- ~~Session ownership-scoping (a student may only read their own session)~~ closed D72 on session + session-report routes; `GET /api/students` roster dump still open (D97-class)
