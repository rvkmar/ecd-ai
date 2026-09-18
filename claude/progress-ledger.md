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
| Last completed unit | **D94** — security headers, CI scanners, git-history audit. Handoff: `claude/day94-security-headers-scanners-history-audit.md`. |
| Off-calendar (2026-09-15) | Session delivery UX + Home announcements. Product `e9e01ff`…`6f09fde` + close gate fix. Handoff: `claude/day73c-session-delivery-home.md`. **Not D74.** |
| Off-calendar (2026-09-16) | Newtonian enterprise EMs + TR9 EM gap-fix (G1–G6/G8). Product `e3d6595` + `28fd9f0` + close-gate fixes. Handoff: `claude/day79-offcal-em-enterprise-gap-fix.md`. **Not D79.** Residual EM-R1…EM-R5 later closed same day. |
| Off-calendar (2026-09-16 evening) | **EM-R1** — executable rubric / process_log / auto in Identification. Handoff: `claude/day80b-em-r1-executable-evaluation.md`. **Not D81.** |
| Off-calendar (2026-09-16 late) | **EM-R2…EM-R5** residual closeout. Handoff: `claude/day80c-em-r2-r5-residual-closeout.md`. **Not D81.** |
| Off-calendar (2026-09-17) | EM remaining-gap inventory after residual close. No product code. Handoff: `claude/day81-offcal-em-remaining-gap-inventory.md`. **Not D81.** Next EM substance = W25 (workProducts/rubrics), not another EM-R*. |
| Next queued | Calendar **D95** — SSO evaluation ADR + W19 handoff. |
| Block | **W19** — Security (D91–D94 done; D95 remains). |
| Block gate | ~~Administrator can start, watch, inspect and ingest a calibration without a shell (D65).~~ ~~LSAT7 in CI (D64).~~ ~~D66: sim10GDINA through R in tests/CI.~~ ~~D67: CTT through R in tests/CI.~~ ~~D69: planted DIF unique-item flag in CI.~~ ~~D70: known-equating recovered locally (`plink` 1.5.1).~~ ~~Hub `latest` includes plink (D88).~~ ~~D89: R crash degrades calibration only; session delivery unaffected (live kill).~~ ~~D90: adversarial R track + D54 discharged.~~ ~~D91: written threat model, every threat dispositioned.~~ |
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
| HEAD at D73 | `ff71b21` + D73 close. Close: `claude/day73-accessibility-backfills.md`. |
| HEAD at 2026-09-15 follow-on | `55d4514` (archive + parent gates) + close `c1b2f62`. |
| HEAD at D73b | product `6ba447d` + close `12dbca2`. nginx earlier `index-DZ0ps72F.js`; close build `index-CWS7Hg6h.js` 2,280.50 kB. Close: `claude/day73b-padi-tr9-admin-ia.md`. |
| HEAD at 2026-09-15 day73c | product `e9e01ff`…`6f09fde` + close (gates + handoff). Close: `claude/day73c-session-delivery-home.md`. Build chunk `index-ND7fdpsk.js` 2,269.52 kB. |
| HEAD at D74 | product `3a6415a` + this close. Close: `claude/day74-performance-bundle-split.md`. Largest JS chunk `recharts` 446.89 kB; entry `index-DVkk4-Lz.js` 31.23 kB. Suite close re-run **1439 passed / 6 skipped**. |
| HEAD at D75 | product+handoff `4d56191` + this close. Close: `claude/day75-w15-core-sign-off.md`. Suite close re-run **1439 passed / 6 skipped**; CI [34960900031](https://github.com/rvkmar/ecd-ai/actions/runs/34960900031) LSAT7+sim10GDINA green. |
| HEAD at D76 | product + `claude/day76-analysis-artefacts.md`. Suite **1447 passed / 6 skipped**; live `:6060` GET 200 / PUT 405 / student 403. |
| HEAD at D77 | product + `claude/day77-item-analysis.md`. Suite **1456 passed / 7 skipped**; live TAM item-analysis + both R path aliases. |
| HEAD at D78 | product + `claude/day78-test-information.md`. Suite **1468 passed / 9 skipped**; live analytic Fisher known-2pl + LSAT7 structural. |
| HEAD at 2026-09-16 W16 close | this close at session end. Suite re-run **1468 passed / 9 skipped**; build green (max recharts 446.89 kB). Units D76–D78 done; next D79. |
| HEAD at 2026-09-16 off-cal EM | product `e3d6595` + `28fd9f0` + this close. Suite **1498 passed / 9 skipped**; build green (recharts 446.89 kB). Handoff: `claude/day79-offcal-em-enterprise-gap-fix.md`. |
| HEAD at D79 | product + `claude/day79-attribute-profile-cohort-summaries.md`. Suite **1504 passed / 9 skipped**; Node-only known cohort hand rates; tenancy scope shaped. |
| HEAD at D80 | product + `claude/day80-scheduled-recalibration.md`. Suite **1510 passed / 9 skipped**; enqueue-only cron; W16 gate closed. |
| HEAD at EM-R1 | product + `claude/day80b-em-r1-executable-evaluation.md`. Suite **1523 passed / 9 skipped**; empty-map rubric/process_log/auto. |
| HEAD at EM-R2…R5 | product + `claude/day80c-em-r2-r5-residual-closeout.md`. Suite **1536 passed / 9 skipped**; residual stack closed. |
| HEAD at 2026-09-17 EM inventory | analysis-only close at `7330a41` + handoff `b3d224b`. Suite **1536 passed / 9 skipped**; build green (recharts 446.89 kB). Handoff: `claude/day81-offcal-em-remaining-gap-inventory.md`. |
| HEAD at D81 | product + `claude/day81-psychometric-dashboard-shell.md`. Suite **1544 passed / 9 skipped**; build green (recharts 446.89 kB). |
| HEAD at D82 | product + `claude/day82-item-analysis-dashboard.md`. Suite **1549 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at D83 | product + `claude/day83-test-information-dashboard.md`. Suite **1557 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at D84 | product + `claude/day84-attribute-profile-dif-dashboards.md`. Suite **1563 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at D85 / W17 close | product `2a7c2f0` + `claude/day85-export-w17-handoff.md` + `claude/day85-w17-close.md`. Suite **1570 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at 2026-09-17 W17 session close | this close. Suite re-run **1570 passed / 9 skipped**; build 13.02s (recharts 451.37 kB). Tree clean at product `2a7c2f0` then this close. Calendar W17 block ✅. Next: D86. |
| HEAD at D86 | product + `claude/day86-job-timeouts-process-kill.md`. Suite **1577 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at D87 | product `f51c7a5` + `claude/day87-concurrency-backpressure-queue-alarm.md`. Suite **1585 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at 2026-09-17 W18 session close (D86–D87) | this close. Close re-run had 2×5s timeout flakes (isolation green); build green. Calendar D86–D87 ✅. Next: D88. |
| HEAD at D88 | product + `claude/day88-benchmark-suite-ci-perturbation.md`. Suite **1605 passed / 9 skipped** (close re-run 1×5s flake, isolation green); build green (recharts 451.37 kB). |
| HEAD at D89 | live-proof handoff `claude/day89-kill-r-mid-session.md` (no product code). Suite **1605 passed / 9 skipped**; build green (recharts 451.37 kB). |
| HEAD at 2026-09-17 W18 session close (D88–D89) | this close. Suite re-run **1605 passed / 9 skipped**; build green. Calendar D88–D89 ✅. W18 gate closed. Next: D90. |
| HEAD at 2026-09-17 W18 block close (D90) | this close. Suite **1611 passed / 9 skipped**; build green. Calendar D90 + W18 ✅. D54 closed. Next: D91. |
| HEAD at 2026-09-17 D91 | this close. Threat model only. Suite **1611 passed / 9 skipped**; build green. Calendar D91 ✅. Next: D92. |
| HEAD at 2026-09-17 W19 session close (D91) | this close. Suite re-run **1611 passed / 9 skipped**; build green. W19 gate met. Next: D92. |
| HEAD at 2026-09-18 D92 | product + `claude/day92-session-policy.md`. Suite **1620 passed / 9 skipped**; build green; live `:6060` logout/role/replay exit checks. |
| HEAD at 2026-09-18 D93 | product + `claude/day93-input-validation-submit-rate-limit.md`. Suite **1648 passed / 9 skipped**; build green. |
| HEAD at 2026-09-18 D94 | product + `claude/day94-security-headers-scanners-history-audit.md`. Suite **1661 passed / 9 skipped**; build green; live `:6060` headers + no prod CORS. |

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
| 2026-09-15 | decision + fix | — | PADI TR9: CM is Student Model, not a delivery object. No CM Activate/Suspend. Assembly/Q-matrix activation accepts confirmed+locked parents. Archive for confirmed CMs (`55d4514`). `AGENTS.md` left as behavior rules only. Doc: `claude/student-model-lifecycle.md`. D74 not started. |
| 2026-09-15 | close | — | Follow-on close. Suite **1392 passed / 6 skipped** (82.06s). Build 18.32s, chunk 2,277.50 kB (D74 still open). Live `:6060` archive not walked. Next: D74. |
| 2026-09-15 | D73b plan | 1 (queued) | Full PADI TR9 read + Admin walk on `:6060`. IA decided: Models nest (Student, Evidence, Task, Assembly, Q-Matrix, Calibration); Item Bank stays implementation; Delivery workspace planned (not a CAF “Delivery Model”); Analytics → Reports. No tab code. Next: D73b then D74. |
| 2026-09-15 | D73b | 1 | Nested Admin chrome live on `:6060`. Assembly tab; Student Model label; Reports under Delivery; EA inspector; Presentation stub. District unchanged *in the first wiring pass*. Operate has no admin player. Chunk ~2,281 kB. |
| 2026-09-15 | D73b close | 1 | Staff/student chrome aligned to the same TR9 groups (no Q-Matrix/Calibration on district/teacher). Suite **1399 passed / 6 skipped**; build `index-CWS7Hg6h.js` 2,280.50 kB. Live `dist1` / `teach1` / `stud1`. Next: D74. |
| 2026-09-15 | off-cal day73c | 2 | Teacher Review/View/Report; student Reports + wizard timings (server); Home announcements. Suite **1439 passed / 6 skipped**; build `index-ND7fdpsk.js` 2,269.52 kB. Live Home walk not done. Next: D74. |
| 2026-09-15 | D74 | 1, alone | Route + tab `lazyPanel` splits; vendor `manualChunks`. Chunk warning cleared (max 446.89 kB). Live dashboard median 15 ms @ 4 items; rebuild `tm-d56` 28 ms; synthetic library/dashboard through N=1000 recorded. Product `3a6415a`. Close re-run **1439 passed / 6 skipped**. Next: D75 (never-compress). |
| 2026-09-15 | D75 | 3, alone | W15 never-compress sign-off. Five claims held on `:6060` + CI. Ingest misalignment: calibrated set now becomes `activeParameterSetId`. Four-role walk. Product+handoff `4d56191`. Close re-run **1439 passed / 6 skipped**. Next: W16. |
| 2026-09-16 | D76 | 2, alone | W16 start. Premise rewritten: nested EM artefacts already existed. Top-level `analysisArtefacts` collection + migrate DIF/equating ingest; immutable HTTP surface. Suite **1447 passed / 6 skipped**. Live GET 200 / PUT 405 / stud 403. Next: D77. |
| 2026-09-16 | D77 | 2, alone | Item-analysis via TAM::tam.ctt2 → analysisArtefacts. Authority vs CTT parameter sets in diagnostics; distractors null on dichotomous LSAT7. Fixture `lsat7-item-analysis`; routes `/calibrate/item-analysis` + `/analyse/item`. Suite **1456 passed / 7 skipped**. Live TAM 4.3.25. Next: D78. |
| 2026-09-16 | D78 | 2, alone | Test-information via analytic Fisher (irtEngine parity) → analysisArtefacts. Known 2PL hand I(θ) at −1/0/1; KR-20 overlap with CTT stated in diagnostics. Fixtures `known-2pl-testinfo` + `lsat7-test-information`. Suite **1468 passed / 9 skipped**. Next: D79. |
| 2026-09-16 | close | — | W16 session close (D76–D78). Suite re-run **1468 passed / 9 skipped**; build green, no >500 kB warning. Tree clean at product `76cb112` then this close. No half-applied work; no new compression debt. Next: D79. |
| 2026-09-16 | off-cal EM | 1–2 | Newtonian enterprise pack + TR9 EM gap-fix G1–G6/G8. Product `e3d6595` + `28fd9f0`. Not D79. |
| 2026-09-16 | close | — | Off-cal EM close. Suite **1498 passed / 9 skipped**; build green. Close-gate: unexport `resolveEvaluationProcedure`; soften eval-proc warn; d49c fields; QMatrix “Diagnostic design” test label. Handoff: `day79-offcal-em-enterprise-gap-fix.md`. Residual EM-R1…EM-R5. Next: D79 or EM-R1. |
| 2026-09-16 | D79 | 2, alone | Attribute-profile cohort summaries (Node-only) → analysisArtefacts. Premise rewritten: not an R path. Both estimands labelled; tenancy scope shaped. Fixture `known-attribute-profile-cohort`. Suite **1504 passed / 9 skipped**. Next: D80. |
| 2026-09-16 | D80 | 2, alone | Scheduled calibration enqueue (never ingest). Min-sample gate; opt-in cron; W16 gate closed. Suite **1510 passed / 9 skipped**. Next: W17 / D81. |
| 2026-09-16 | EM-R1 | 3, alone (off-cal) | Executable rubric / process_log / auto in Identification when activation map empty. Suite **1523 passed / 9 skipped**. Residual EM-R2…EM-R5. |
| 2026-09-16 | EM-R2…R5 | 2+1+2 (off-cal) | Console ingest smoke; prereq gating; Assembly confirm floors; Force attribute-split Q. Handoff `day80c-em-r2-r5-residual-closeout.md`. |
| 2026-09-16 | close | — | Off-cal EM residual close (EM-R1…EM-R5). Suite **1536 passed / 9 skipped**; build green; `2157b3a` ≡ `main/master`. No half-applied work; no new compression debt. Calendar D81 left unmarked. Next: D81. |
| 2026-09-17 | analysis | — | Off-cal EM remaining-gap inventory. Confirmed EM-core closed; file list for W25/W23/W27. Suite **1536 passed / 9 skipped**; build green; tree was clean at `7330a41`. Handoff: `day81-offcal-em-remaining-gap-inventory.md`. Next: D81. |
| 2026-09-17 | D81 | 2, alone | W17 shell: ProvenanceStamp + PsychometricFigure compose guard; recharts chartTheme; Delivery tab + `/admin/psychometrics`; Storybook stamp + reference chart. Suite **1544 passed / 9 skipped**. Next: D82+. |
| 2026-09-17 | D82 | 1, alone | Item-analysis dashboard on D77 artefacts: EM/TM filters, stamped charts, actionable flags (threshold + next action). Suite **1549 passed / 9 skipped**. Next: D83. |
| 2026-09-17 | D83 | 1–2, alone | Test-information dashboard: I(θ)+SEM curves, Assembly requiredSEM overlay, never-meets banner, labelled KR-20 vs marginal reliability. Suite **1557 passed / 9 skipped**. Next: D84. |
| 2026-09-17 | D84 | 1, alone | Attribute-profile (both estimands labelled) + DIF (on-screen flag framing, ETS band). Suite **1563 passed / 9 skipped**. Next: D85. |
| 2026-09-17 | D85 | 1, alone | CSV/PDF export with mandatory provenance across all four W17 views; W17 gate closed. Suite **1570 passed / 9 skipped**. Next: W18 / D86. |
| 2026-09-17 | close | — | W17 session close (D81–D85). Suite re-run **1570 passed / 9 skipped**; build green, recharts 451.37 kB. No half-applied work; no new compression debt. D54 re-dated to W18 close. Calendar D81–D85 + W17 block ✅. Next: D86. |
| 2026-09-17 | D86 | 2, alone | Per-kind timeouts; kill R on Timeout (not fetch-abort alone); next queued job starts. Suite **1577 passed / 9 skipped**. Next: D87. |
| 2026-09-17 | D87 | 2, alone | Compose cpus/mem limits; maxConcurrent=1 dispatcher; queue-depth metric/alarm; R_WORKERS pin. Suite **1585 passed / 9 skipped**. Next: D88. |
| 2026-09-17 | close | — | W18 session close (D86–D87 only; gate D89 not due). Close re-run 2×5s flakes (isolation green). No half-applied work; no new compression debt. Calendar D87 ✅. Next: D88. |
| 2026-09-17 | D88 | 2, alone | Perturbation-fail for five CI benchmarks + Hub plink package gate. Premise: pipelines already in CI. |
| 2026-09-17 | D89 | 3, alone | Never-compress live kill of `r-backend` mid-session. Delivery continued; calib failed with reason; queue drained after restart. |
| 2026-09-17 | close | — | W18 session close (D88–D89; gate D89 met). Suite re-run **1605 passed / 9 skipped**; build green. No half-applied work; no new compression debt. D54 still open → due at W18 block close (D90). Calendar D88–D89 ✅. Next: D90. |
| 2026-09-17 | D90 | 3, alone | Adversarial R track (separate Agents); P0 provenance/activate/attach fixes; D54 discharged; W18 block closed. Suite **1611 passed / 9 skipped**. |
| 2026-09-17 | D91 | 3, alone | Threat model dispositioned (`docs/security/threat-model.md`); no fixes. Premise: F3 closed, login already rate-limited. Suite **1611 passed / 9 skipped**. |
| 2026-09-17 | close | — | W19 session close (D91; gate met). Suite re-run **1611 passed / 9 skipped**; build green. No half-applied work; no new compression debt. Calendar D91 ✅. Next: D92. |
| 2026-09-18 | D92 | 2, alone | Premise rewritten: login limiter already existed. Short access + refresh rotation + revocation + password policy; fixed dead users validateEntity. Live exit checks on `:6060`. |
| 2026-09-18 | D93 | 3, alone | Never-compress. sanitizeRequestInputs on all mounted routers; submit 60/user/min; filter hardening; static scan + mutation. |
| 2026-09-18 | D94 | 2, alone | Calendar owns headers+scanners+history (threat-model D95 map drifted). nginx CSP/HSTS/…; CI npm audit+Gitleaks; Dependabot; history audit no rotations. |

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
| D54 | Wizard readiness mirror has no agreement test | Token | W12 close | **closed D90** — `assemblyModelReadiness.js` + agreement test; lifecycle refuses empty `stoppingRules: {}` |
| D65 | Live operator walk + parameter-set diff UI skipped | Tests + routes; seed password; diff never built | D71 / follow-on | **walk closed 2026-09-13** (coordinator, `job1789319022666002` → `ps1789319081640`). Parameter-set diff UI still open. |
| D66 | Live GDINA sim10GDINA not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `sim10gdinaPipeline.test.js` | this PR's CI | **closed** — live job green (`GDINA 2.9.12`, `converged: true`, 1000×10; first CI keyed `"Item 1"`, then keyed by request `itemIds`) |
| D67 | Live TAM LSAT7 CTT not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `cttPipeline.test.js` | this PR's CI | **closed** — live job green (`TAM 4.3.25`, `converged: true`, 1000×5, `TAM::tam.ctt2`; observed KR-20 0.4542 recorded, not pinned) |
| D68 | Live mid-flight ingest + second submit on `:6060` | HTTP switchover tests; player regression only | D71 | **open** — no unstopped two-item session in the deployment this walk |
| D69 | Live difR planted-item flags not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `difPipeline.test.js` | this PR's CI | **closed** — live job green (`difR 6.1.0`, unique ETS C on Item.5; first two live runs failed the unique-item rule, recorded in the handoff) |
| D70 | Live known-equating not executed against Hub `rvkmar/r-backend:latest` | Local `:4000` has equate 2.0.9 / plink 1.5.1; CI still pulls Hub | Docker Hub push of the rebuilt image | **closed D88** — Hub `latest` reports plink 1.5.1; CI package gate fails loudly if missing |
| CM archive live walk | Archive UI/API in source; not demonstrated on `:6060` | Image not rebuilt this session | next live admin walk | **open** |
| Admin CAF IA | Live tabs do not match TR9 CAF/delivery | Walk 2026-09-15; wiring is D73b | D73b | **closed** — Admin nested Models / Implementation / Delivery on `:6060`; District/Teacher/Student chrome aligned same session |

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
| D74 next | After D73 close, D74 is the next product unit | TR9 walk showed Admin IA is a loud UI defect that will change `AdminPage` (and therefore the main chunk) | Insert **D73b** (nested Models / Implementation / Delivery) before D74. D74 exit check unchanged. |
| D73b District | Calendar: District tabs unchanged unless a one-line note | Same TR9 reading made Q-Matrix/Calibration Admin-only; Activities ≠ Presentation | District/Teacher Implementation+Delivery; Student Delivery only. Bookmark q-matrix/calibration URLs may remain. |
| day73c Operate | Staff list “Operate” opens player finish flow | Teachers must not submit/finish examinee sessions | Review (active) / View + Report (closed); read-only staff player |
| day73c timing | Client sessionStorage for wizard clocks | User required server persistence | `session.wizardPhaseTimings` + `POST /wizard-timing` |
| D74 AdminPage | App-only route split would clear the warning | AdminPage (and staff dashboards) static-imported every heavy builder/tab | Lazy tab panels + active-leaf mount in RoleWorkbench; vendor manualChunks |
| D75 | Plan row: Sonnet/low “handoff + update actuals” | Calendar exit check is five behavioural milestone claims (never-compress) | Assemble evidence for all five on `:6060` + CI; fix ingest→active misalignment; core handoff. Docs-only would be PARTIAL |
| D76 | New top-level `analysisArtefacts` collection (greenfield seven-artefact contract) | DIF/equating already wrote nested `evidenceModels[].analysisArtefacts[]` with no schema/routes/immutability | Promote to collection; migrate ingest off the nested array; refuse mutation; D48 guard |
| D77 | Item analysis via mirt `/analyse/item` as a greenfield analytics path | Kind already declared; CTT already owns the classical TAM engine; D76 owns the artefact collection; vocabulary bind list was empty; jsonlite default `null="list"` turns R NULL into JSON `{}` | Reuse TAM CTT helpers; remap to `{ pValue, pointBiserial, n, distractors: null }`; primary `/calibrate/item-analysis` + alias `/analyse/item`; bind `ctt|irt|rasch` for provenance; plumber `null="null"`; authority/overlap/distractors diagnostics required |
| D78 | Test information curves + conditional SE + reliability as remaining W16 analytics | Kind already declared with empty bind list; no R path; no fixture; D76 owns artefacts; D64 forbids inventing LSAT7 a/b | Synthetic known 2PL fixture with hand I(θ); analytic Fisher (irtEngine parity) from `model.parameters`; LSAT7 structural mirt-then-formula without pinning I(θ); KR-20 via `.kr20`; bind `irt|rasch`; plumber `digits=16` |
| off-cal EM G3 | Scoring artifacts close TR9 evaluation at delivery | Artifacts author + bake; Identification only executes `key` when activation map empty | Residual **EM-R1** (rubric/process_log/auto). Pilot seeds ≠ live R (**EM-R2**). |
| EM-R1 | Executable rubric / process_log / auto in Identification | Confirmed: only key fallback ran; maps still preferred | `evaluationArtifacts.js` + empty-map fallback; Newtonian process_log configs gain activateOnFirstMove |
| EM-R2 | Console/live calibration for Newtonian Theta | attach-seed only; Accumulation on ecd-pilot | Console ingest smoke + README bridge vs ingest |
| EM-R4 | prerequisiteGating at delivery | Authored on policy; unused in activitySelection | Filter candidates when mastery unmet |
| EM-R5 | Assembly sufficiency hard confirm gate | Step 7 warn-only | Shared floors; confirm/strict errors |
| EM-R3 | Force attribute-level SMVs + Q-matrix | Single Force Concept Mastery column | 3 binary attrs + multi-column Q |
| D79 | Attribute-profile cohort summaries as remaining W16 R analytics | No job kind; no R path needed; D57/`classifyAttributeProfile` already owns the rule; scope lacked tenancy fields | Node-only job kind `attribute-profile-summary` via worker branch; both estimands labelled; scope gains tenant/district/school/cohort; population CA explicitly not claimed |
| D80 | Cron enqueues recalibration/analysis; artefact produced on schedule | Only autoFinishCron existed (unmounted); no scheduled calibration; live session matrices not built | `calibrationPlan.scheduledEnqueue` + enqueue-only cron (opt-in); fixture-backed sample gate; never ingest; W16 gate closed |
| D81 | `/admin/psychometrics` path + greenfield chart library + invent provenance fields | Nested Admin Delivery tabs; recharts already in use; analysisArtefacts already have job/package/sample/computedAt; hooks exist; Reports is separate mock-fallback analytics | Delivery Psychometrics tab + `/admin/psychometrics`; adopt recharts chartTheme; ProvenanceStamp from artefact fields; PsychometricFigure refuse incomplete stamp |
| D82 | Greenfield item-analysis UI | D81 stamp + chart chrome exist; D77 payload is `parameters[itemId].{pValue,pointBiserial,n,distractors}` | ItemAnalysisDashboard on shell; advisory flags with threshold + action; EM/TM artefact filters |
| D83 | Test-info UI + invent SEM math | D78 curve arrays + Assembly `requiredSEM` already exist; SEM = artefact conditionalSEM | Overlay requiredSEM; never-meets banner when all SEM above target; label KR-20 vs marginal |
| D84 | Attribute-profile + DIF dashboards | D79/D69 payloads already labelled; stamp shell exists | Dual estimand UI; DIF investigation framing on screen (not docs-only) |
| D85 | PDF/CSV export + invent chart raster PDF | No jspdf in tree; stamp contract already exists | Text PDF + CSV builders refuse missing provenance; toolbar on four views; cross-view test |
| D86 | Add 15‑min timeouts + kill R (greenfield) | Node already aborted fetch at 15m; abort ≠ kill; Plumber single-threaded | Timeout → `killRBackend` → job `failed`/`Timeout` → next queued job; per-kind overrides; hang endpoint gated |
| D87 | Fix multisession/availableCores overprovision; compose CPU limits | R already sequential workers=1; compose had no limits; concurrent kickQueue could double-dispatch | Compose cpus 2.0 / mem 4G; `R_WORKERS=1`; Node maxConcurrent + depth alarm; no availableCores for workers |
| D88 | Wire five benchmarks into CI as one suite | Five already on `lsat7-pipeline`; no perturbation-fail; Hub already had plink 1.5.1 | Shared acceptance predicates + always-run perturbation tests; CI Hub package gate; live paths call same predicates; no invented coefficient pins |
| D91 | Readiness brief still says client posts score; login unthrottled; write greenfield model | Item path F3/D47 closed; loginLimiter + lockout exist; JWT 8h/no revocation and viewScope gap remain | Dispositioned model against live code; scheduled D92–D95 / W20–W22; no fixes in D91 |
| D92 | JWT 8h / no revocation; D93 builds login rate limiter; password policy absent | Login limiter + lockout already live; PUT users blocked by validateEntity("users") unknown collection | Keep throttle; access 15m + refresh rotation + revocation + authEpoch; stated password policy; remove dead users validateEntity; submit rate-limit design noted for D93 |
| D93 | Rate-limit auth (greenfield) + submit; sweep path/query; updateWhere filters | Auth throttle already live; `/submit` unlimited; validateEntity body-only; filters caller-built but unguarded | Keep auth throttle; per-user submit limiter; sanitizeRequestInputs on every mounted router (path segments + query); assertSafeEqualityFilter in dbAdapter; D13-style static scan |
| D94 | Threat-model map: headers+CORS only; scanners on D95 | Calendar D94 = headers + npm audit/Dependabot/Gitleaks + history audit; D95 = SSO ADR | Implemented calendar scope; rewrote threat-model D94/D95 map; fixed local override that forced NODE_ENV=development (re-enabled CORS on walk stack) |

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
- ~~Chunk >500 kB — D74~~ closed D74 (warning cleared; max JS chunk 446.89 kB recharts)
- ~~Admin CAF/delivery chrome — Assembly URL-only; Q-Matrix/Calibration/Analytics are CAF peers; Student Model unlabeled; Evidence Accumulation has no inspector~~ closed D73b (Admin + District/Teacher/Student chrome; wizard copy still says Competency Model)
- Competency Model Operational/Suspended **not required** (PADI TR9; `claude/student-model-lifecycle.md`) — closed as a false requirement 2026-09-15
- ~~Student My Sessions placeholder~~ closed D60
- Dead-export guard can miss unused exports that share a name
- ~~Session ownership-scoping (a student may only read their own session)~~ closed D72 on session + session-report routes; `GET /api/students` roster dump still open (D97-class)
- ~~Staff Operate mislabeled / teachers could Finish student sessions~~ closed day73c (Review/View/Report + read-only teacher player)
- Home announcements live `:6060` create/visibility walk — **open** (tests only this close)
- Student wizard timing Continue across devices — **open** (API tests only this close)
- ~~W15 five-claim core sign-off~~ closed D75 (`4d56191`)
- ~~EM Identification non-key evaluation (rubric / process_log / auto)~~ closed EM-R1 (`claude/day80b-em-r1-executable-evaluation.md`)
- ~~EM-R2 console-ingest Accumulation path~~ closed EM-R2
- ~~Policy `prerequisiteGating` at activitySelection~~ closed EM-R4
- ~~Assembly sufficiency hard confirm gate~~ closed EM-R5
- ~~Force Q-matrix still single-attribute~~ closed EM-R3
- Newtonian live promote on `:6060` (confirm → attach-seed → operational) — **open**
- Live Newtonian console walk beyond suite ingest fixture — **open**
- Work Products / Rubrics as first-class objects + multi-phase eval + human rating (W25 / G11–G12) — **open**; file inventory in `claude/day81-offcal-em-remaining-gap-inventory.md`
- Presentation Model authoring (W23) — stub only (`PresentationModelStub.jsx`)
- Design Patterns (W27 / G7) — absent; Additional KSAs still notes-only on EMs
- ~~W17 psychometric dashboard shell + mandatory provenance stamp~~ closed D81 (`claude/day81-psychometric-dashboard-shell.md`)
- ~~W17 item-analysis dashboard~~ closed D82 (`claude/day82-item-analysis-dashboard.md`)
- ~~W17 test-information + requiredSEM overlay~~ closed D83 (`claude/day83-test-information-dashboard.md`)
- ~~W17 attribute-profile + DIF dashboards~~ closed D84 (`claude/day84-attribute-profile-dif-dashboards.md`)
- ~~W17 PDF/CSV export + provenance-in-export~~ closed D85 (`claude/day85-export-w17-handoff.md`); W17 closed (`claude/day85-w17-close.md`)
- ~~W18 job timeout + R process kill on breach~~ closed D86 (`claude/day86-job-timeouts-process-kill.md`)
- ~~W18 concurrency bound + queue-depth alarm~~ closed D87 (`claude/day87-concurrency-backpressure-queue-alarm.md`)
