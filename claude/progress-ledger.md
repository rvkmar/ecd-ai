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

| Last completed unit | **D150** (W30 closed; W29 open). The trait/DINA advisory holds and confirm is not blocked. No P0. Deleting a Design Pattern can drop a seed back-link (`02b1c91`, `claude/day150-adversarial-w30.md`, `claude/day150-w30-session-close.md`). |

| Off-calendar (2026-09-18) | TN 38-district roster seed + EMIS/UDISE login (`a8c4e7b`); hardened `rvkmar/ecd-node` + `ecd-nginx` digest pins (`7639477`). Close-gate: unexport dead TN helpers / resurrect `createUserRecord` baseline. **Not D96.** |

| Off-calendar (2026-09-15) | Session delivery UX + Home announcements. Product `e9e01ff`…`6f09fde` + close gate fix. Handoff: `claude/day73c-session-delivery-home.md`. **Not D74.** |

| Off-calendar (2026-09-16) | Newtonian enterprise EMs + TR9 EM gap-fix (G1–G6/G8). Product `e3d6595` + `28fd9f0` + close-gate fixes. Handoff: `claude/day79-offcal-em-enterprise-gap-fix.md`. **Not D79.** Residual EM-R1…EM-R5 later closed same day. |

| Off-calendar (2026-09-16 evening) | **EM-R1** — executable rubric / process_log / auto in Identification. Handoff: `claude/day80b-em-r1-executable-evaluation.md`. **Not D81.** |

| Off-calendar (2026-09-16 late) | **EM-R2…EM-R5** residual closeout. Handoff: `claude/day80c-em-r2-r5-residual-closeout.md`. **Not D81.** |

| Off-calendar (2026-09-17) | EM remaining-gap inventory after residual close. No product code. Handoff: `claude/day81-offcal-em-remaining-gap-inventory.md`. **Not D81.** Next EM substance = W25 (workProducts/rubrics), not another EM-R*. |

| Off-calendar (2026-10-16) | Five authoring screens after the second walk. Product `de9fe77`…`e306279`. Handoff: `claude/day145b-offcal-authoring-fixes.md`. **Not D146.** Live `:6060` was not rebuilt. |
| Next queued | **D151**, alone. Tier 2. A `taskSpecs` collection with the D48 surface. Authored POST is refused. A spec without `templateId` and `tmvAssignment` fails validation. Template change marks existing specs stale. Family generation is D152. W29 stays open. |

| Block | **W30 closed** 2026-10-17 (D146–D150). Gate held as restated: a trait Student Model scored with DINA or G-DINA raises an advisory sourced from the Domain Analysis, and confirm is not blocked. “Visible at every layer” was not the gate. **W29 open** (D141–D145 done; D145 is a walk, not the gate). Gate not held: an author cannot yet start at a Domain Analysis and reach a Competency Model. **W28 closed** 2026-10-14 (D136–D140). Gate held in the component test and the descendants query: a seeded model traces to its pattern, and a chain of 24 stays at four nodes. Live `:6060` showed the kind-of neighbourhood and had no seeded models. **W27 closed** 2026-10-14 (D131–D135). Gate held: a design pattern was authored and confirmed. **W26 closed** 2026-10-13 (D126–D130). **W25 closed** 2026-09-22 (D121–D125). **W24 closed** 2026-09-22. **W23 closed** 2026-09-21. **W22** closed 2026-09-20. |

| Block gate | ~~Administrator can start, watch, inspect and ingest a calibration without a shell (D65).~~ ~~LSAT7 in CI (D64).~~ ~~D66: sim10GDINA through R in tests/CI.~~ ~~D67: CTT through R in tests/CI.~~ ~~D69: planted DIF unique-item flag in CI.~~ ~~D70: known-equating recovered locally (`plink` 1.5.1).~~ ~~Hub `latest` includes plink (D88).~~ ~~D89: R crash degrades calibration only; session delivery unaffected (live kill).~~ ~~D90: adversarial R track + D54 discharged.~~ ~~D91: written threat model, every threat dispositioned.~~ ~~W20: district cannot read another district’s data (D96–D100).~~ ~~W21: “who promoted this Task Model to operational, when, and on what evidence” is one query (D105).~~ ~~W22: a restore from backup is performed and timed (D108).~~ ~~W23: Changing a Presentation Model changes what an examinee sees, without touching item content (D115).~~ |

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

| HEAD at 2026-09-18 D95 / W19 close | ADR 0005 + `claude/day95-sso-hosting-residency-adr.md` + `claude/day95-w19-block-close.md`. Docs only; suite **1662 passed / 9 skipped**; build green. |

| HEAD at 2026-09-18 off-cal TN + Docker | product `a8c4e7b` (TN seed in D95 commit) + `7639477` (hardened bases). |

| HEAD at 2026-09-18 W19 session close | this close. Suite re-run **1665 passed / 6 failed (load flakes) / 9 skipped**; isolation of failing files green; build green. Calendar W19 block ✅. Next: D96. |

| HEAD at D96 | product `80afcfe` + `claude/day96-tenancy-adr-jwt-claims.md`. Suite close re-run **1677 passed / 9 skipped**; build green (~17s). Live `:6060` JWT claims (`tn-chennai` on dist1/teach1/stud1; admin omits). |

| HEAD at D111 | product `daac216` + `claude/day111-taskwizard-shared-shell.md`. Suite **1821 passed / 9 skipped**. Convention B. |

| HEAD at D112 | product `f44f222` + `claude/day112-itemwizard-shared-shell.md`. Suite **1850 passed / 9 skipped**. Convention C. |

| HEAD at D113 | product `416d99d` + boot fix `3010a09` + `claude/day113-presentation-model-authoring.md`. Suite **1894 passed / 9 skipped**. |

| HEAD at 2026-09-21 W23 session close (D111–D113) | this close. Suite re-verify **1894 passed / 9 skipped**; build green (21.21s). Tip **`5d747ac`** ≡ `main/master`. Calendar D111–D113 ✅. Next: D114. |

| HEAD at D114 | product + `claude/day114-presentation-pointer-storybook.md`. Suite **1905 passed / 9 skipped**. Pointer bake + live `/next-task` overlay; Storybook. Next: D115 (never-compress). |

| HEAD at D115 / W23 close | product + `claude/day115-sessionplayer-presentation-w23.md`. Suite **1909 passed / 9 skipped**. W23 gate met. |

| HEAD at 2026-09-21 W23 session close (D114–D115) | this close. Suite re-verify **1909 passed / 9 skipped**; build green (13.52s). Tip **`28bce01`** ≡ `main/master`. Calendar D114–D115 + W23 ✅. Next: D116. |

| HEAD at D115 live debt | product **`17ce5c2`** + this close. Suite **1913 passed / 9 skipped**; build green (11.55s). Live dual-PM walk closed. D115b outlined. |

| HEAD at D115b | product + `claude/day115b-instantiated-tasks.md`. Suite **1936 passed / 9 skipped**; build green (10.04s). Instantiated-task schema + item bind; no CAF lifecycle. |

| HEAD at D116 | product **`5d0717c`** + `claude/day116-task-model-variables.md`. Suite **1980 passed / 9 skipped**; build green (7.18s). One TMV consumed by two Task Models. No CAF lifecycle. Next: D117. |

| HEAD at 2026-09-21 D116 session close | this close. Suite re-verify **1980 passed / 9 skipped** (176 files, 30.69s); build green (7.01s). Tip **`c97b3f7`** ≡ `main`. No new screen. Next: D117. |

| HEAD at D117 | product **`61018ee`** + pin **`64ae908`** + `claude/day117-tmv-authoring-ui.md`. Suite **1983 passed / 9 skipped**; build green. Library + wizard Variables step; no D119. Calendar ✅ (premise rewrite). Next: D118 residuals. |

| HEAD at 2026-09-22 D117 session close | this close. Suite re-verify **1983 passed / 9 skipped** (178 files, 86.98s); build green (1m 20s). Tip after this commit ≡ `main/master`. Calendar D117 ✅; D118 annotated. |

| HEAD at D118 | product **`85f2582`** + `claude/day118-tmv-registry-residuals.md`. Suite **1987 passed / 9 skipped**; build green. Consumers before edit; valueSet read-only; Storybook. Next: D120 (re-calibrate); D119 alone later. |

| HEAD at D120 | product **`f5b3d5c`** + `claude/day120-tmv-family-settings.md` + worked example. Suite **1993 passed / 9 skipped**; build green. fixed/varying settings + ten-spec family. Next: D119 alone. |

| HEAD at D119 | product **`99c4d85`** + close **`f2973b9`** ≡ `main/master` + `claude/day119-design-feature-registry-repoint.md`. Suite **1996 passed / 9 skipped** (re-verified at session close); build green. Design features via TMV valueSet path; D22 floor held. W24 calendar + block ✅ complete. |

| HEAD at D121 | product **`5ecb5bc`** + `claude/day121-work-product-as-object.md`. Suite **2016 passed / 9 skipped**; build green. workProducts library; one WP × two interactions identical score. Next: D122 alone. |

| HEAD at D122 | product **`e0a463a`** + `claude/day122-rubric-objects-exemplars.md`. Suite **2030 passed / 9 skipped**; build green. rubrics + exemplars; shared across EMs; .backup deleted. Next: D123 alone (never-compress). |

| HEAD at D123 | product **`687c382`** + pin **`9b1c336`** + session close on tip ≡ `main/master` + `claude/day123-multi-phase-evaluation.md` + `claude/day123-w25-session-close.md`. Suite **2039 passed / 9 skipped** (re-verified at session close); build green. phases + pending_human pause + human-rating route; Accumulation skips provisional. Next: D124 alone. |

| HEAD at D124 | product tip ≡ `main/master` + `claude/day124-human-rating-queue.md`. Suite **2043 passed / 9 skipped**; build green. Blinded rating queue + audit + Delivery UI. Next: D125 alone. |

| HEAD at D125 | product **`0f9c5db`** + session close tip ≡ `main/master` + `claude/day125-performance-wp-dispositions.md` + `claude/day125-w25-block-close.md` + `claude/day125-w25-session-close.md`. Suite **2047 passed / 9 skipped** (re-verified at session close); build green. Four performance WP dispositions; W25 gate met. Next: re-calibrate before D126. |

| HEAD at D126 | product tip ≡ `main/master` + `claude/day126-templates-schema.md`. Suite **2067 passed / 9 skipped**; build green. templates seven-artefact; four-binding coherence; D48 guard green. Next: D127 alone. |

| HEAD at D127 | product tip ≡ `main/master` + `claude/day127-template-builder-ui.md`. Suite **2073 passed / 9 skipped**; build green. Template builder; live family size from TM settings; server binding errors. Next: D128 alone. |

| HEAD at D128 | product tip ≡ `main/master` + `claude/day128-joint-smv-prior-schema.md`. Suite **2085 passed / 9 skipped**; build green. Continuous MVN jointPrior + PSD gate; DINA binary joint untouched. Next: D129 alone (never-compress). |

| HEAD at D128 session close | tip **`02fe2ea`** ≡ `main/master` + `claude/day128-w26-session-close.md` (includes author AdminPage subtitle `12f4713` after D128 pin). Suite re-verify **2085 passed / 9 skipped**; build green. W26 mid-block; D129 not started. |

| HEAD at D129 | product tip ≡ `main/master` + `claude/day129-correlated-smv-accumulation.md`. Suite **2093 passed / 9 skipped**; build green. Bivariate EAP from D128 jointPrior; zero correlation stays on the 1D path. Next: D130 alone. |

| HEAD at D129 session close | tip ≡ `main/master` + `claude/day129-w26-session-close.md`. Suite re-verify **2093 passed / 9 skipped**; build green. Live container reproduced the hand grid. W26 still open. Next: D130 alone. |

| HEAD at D130 / W26 close | product **`8009741`** ≡ `main/master` + `claude/day130-adversarial-joint-w26.md` + `claude/day130-w26-session-close.md`. Suite re-verify **2098 passed / 9 skipped**; build green. Joint grid widens past ±5 SD; collision clears the stale posterior. W26 gate held. Next: re-calibrate D131. |

| HEAD at D141 | product **`686f328`** + calibration **`9addd9e`** + `claude/day141-domain-analysis-schema.md`. Suite at product **2159 passed / 9 skipped**. Seven Layer-1 fields on one record; model name DomainAnalyse; minimum gated route. Next: D142. |

| HEAD at D142 | product **`97e9a45`** ≡ `main/master` before this close + `claude/day142-domain-analysis-upload.md`. Suite close re-run **2164 passed / 9 skipped** (216 files, 160.51s); build green (45.66s). Live draft `da1792032778751000` stored as draft. W29 still open. Next: D143 alone. |

| HEAD at D143 | product **`2d64b38`** ≡ `main/master` before this close + `claude/day143-content-standards.md`. Suite close re-run **2170 passed / 9 skipped** (219 files, 244.02s); build green (1m 16s). Live dry-run found 0 policies; migration log `006` at `2026-10-15T03:57:26Z`. W29 still open. Next: D144 alone. |

| HEAD at D144 | product **`2a2a5c7`** ≡ `main/master` before this close + `claude/day144-qmatrix-stays-dina-store.md`. Suite close re-run **2177 passed / 9 skipped** (222 files, 179.91s); build green (1m 2s). Live dry-run found 0 Q-matrices; migration log `007` at `2026-10-15T15:18:16Z`. W29 still open. Next: D145 alone. |
| HEAD at 2026-10-16 off-cal | product **`e306279`** ≡ `main/master` before this close + `claude/day145b-offcal-authoring-fixes.md`. Suite close re-run **2240 passed / 9 skipped** (235 files, 96.27s); build green (21.71s; largest chunk EvidenceModelBuilder 371.25 kB). D145 calendar marked, date not moved. Live `:6060` not rebuilt. Next: D146 after calibration. |
| HEAD at D146 | product **`a8abc57`** ≡ `main/master` before this close + `claude/day146-perspective-inheritance.md`. Suite close re-run **2256 passed / 9 skipped** (237 files, 97.22s); build green (21.31s; largest chunk EvidenceModelBuilder 371.57 kB). Calendar marked, date not moved. Live `:6060` not opened. W30 gate still open. Next: D147 alone. |
| HEAD at D147 | product **`ea1dedf`** ≡ `main/master` before this close + `claude/day147-coherence-advisory.md`. Suite close re-run **2264 passed / 9 skipped** (238 files, 88.74s); build green (24.46s; largest chunk EvidenceModelBuilder 371.17 kB). Calendar marked, date not moved. Live `:6060` not opened. W30 gate still open. Next: D148 alone. |
| HEAD at D148 | product **`8fdf732`** ≡ `main/master` before this close + `claude/day148-perspective-at-decision.md`. Suite close re-run **2267 passed / 9 skipped** (239 files, 96.79s); build green (19.31s; largest chunk EvidenceModelBuilder 371.31 kB). Calendar marked, date not moved. Live `:6060` not opened. W30 gate still open. Next: D149 alone. |
| HEAD at D149 | product **`bcfc71a`**, then dependency bumps through **`3039c0e`** ≡ `main/master` before this close + `claude/day149-additional-ksa-relationship.md`. Suite close re-run **2272 passed / 9 skipped** (241 files, 114.60s); build green (19.89s; largest chunk EvidenceModelBuilder 371.31 kB). Calendar marked, date not moved. Live `:6060` not opened. W30 gate still open. Next: D150 alone, never-compress. |
| HEAD at D150 / W30 close | review **`02b1c91`**, warrants **`0c27cb2`**, scoring **`c3ac300`** ≡ `main/master` before this close + `claude/day150-adversarial-w30.md` + `claude/day150-w30-session-close.md`. Suite close re-run **2277 passed / 9 skipped** (242 files, 101.46s); build green (19.17s; largest chunk EvidenceModelBuilder 371.35 kB). Calendar marked, dates not moved. Live `:6060` walked. W30 gate held as restated. W29 stays open. Next: re-calibrate before D151. |
| HEAD at 2026-10-26 calibrate | **`f7ec896`** ≡ `main/master`. Off-calendar model-screen shells and zip import after D150 (`e14e226`…`f7ec896`). Latest off-cal suite **2417 passed / 9 skipped** (`claude/day145q-offcal-rubric-levels.md`). This calibration did not re-run the suite. Tree clean. Next: D151 alone. |



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

| 2026-09-18 | D95 | 2, alone | ADR 0005: local accounts remain; interim single-host compose; residency working assumption + open owners. W19 block closed. No SSO code. |

| 2026-09-18 | off-cal TN + Docker | 2 | TN 38-district seed + EMIS/UDISE login + authProvider seam; Hub `ecd-node`/`ecd-nginx` Scout-clean digests pinned in app Dockerfiles. |

| 2026-09-18 | close | — | W19 session close (D94–D95 + off-cal). Close-gate fixed dead TN exports / `createUserRecord` baseline. Full suite load flakes (isolation green). Calendar W19 block ✅. Next: D96. |

| 2026-09-19 | D96 | 2, alone | Tenancy ADR 0006; JWT `districtId`/`schoolId`; initMongo profile backfill for pre-TN walk users. Live `:6060` claims verified. |

| 2026-09-19 | close | ? | D96 session close. Suite re-run **1677 passed / 9 skipped**; build green. No half-applied work; no new compression debt. Next: D97 (never-compress). |
| 2026-09-19 | D97 | 3, alone | Storage-boundary tenancy: ALS + loadDB/dbAdapter filters + merge-on-save; path-param district 403. Suite **1688 passed / 9 skipped**. Live `:6060` after node rebuild. |
| 2026-09-19 | close | — | D97 session close. Suite re-run **1688 passed / 9 skipped**; build green. No half-applied work; no new compression debt. Next: D98 (never-compress). |
| 2026-09-19 | D98 | 3, alone | Row-level HTTP negatives (19) + sixth mirrorDrift; sync JWT + `runWithTenancy` around `next`. Suite **1710 passed / 9 skipped**. Live foreign-district report 403. |
| 2026-09-19 | close | — | D98 session close. Suite **1710 passed / 9 skipped**; build green. No half-applied work; no new compression debt. Next: D99 (never-compress). |
| 2026-09-19 | D99 | 3, alone | Aggregate leakage: named scope + MIN_CELL_SIZE=5; dashboard/class/district/item exposure/artefacts/jobs fixed. Suite **1722 passed / 9 skipped**. |
| 2026-09-19 | close | — | D99 session close. Suite **1722 passed / 9 skipped**; build green. No half-applied work; no new compression debt. Next: D100 (never-compress). |
| 2026-09-19 | D100 | 3, alone | Scope inspector API/UI; W20 gate test (inspector ≡ students API; foreign district 403). Suite **1728 passed / 9 skipped**. W20 closed. |
| 2026-09-19 | close | — | D100 / W20 session close. Suite **1728 passed / 9 skipped**; build green. No half-applied work; no new compression debt. |
| 2026-09-19 | close | — | W20 session-close re-verify: suite **1728 passed / 9 skipped**; build green; tip **`7ff7586`** ≡ `main/master`. Exit checks already executed (D100 gate). Next: D101. |

| 2026-09-20 | D101 | 2, alone | auditLog via saveDB chokepoint; auth/user events; admin GET; suite **1742 passed / 9 skipped**. Next: D102 (never-compress). |

| 2026-09-20 | D102 | 3, alone | Reconstructed lifecycle audit backfill (003) + removal preview never-deletes (004). Suite **1747 passed / 9 skipped**. Next: D103. |

| 2026-09-20 | D103 | 2, alone | Structured JSON logs + redaction; request-id through submit and R client; suite **1750 passed / 9 skipped**. Next: D104. |

| 2026-09-20 | D104 | 2, alone | Health≠readiness endpoints + client error tracking/sourcemaps; suite **1757 passed / 9 skipped**. Next: D105 (W21 gate). |

| 2026-09-20 | D105 | 2, alone | Audit viewer + four alerts + W21 gate (TM→operational one query). Suite **1767 passed / 9 skipped**. W21 closed. Next: D106. |

| 2026-09-20 | close | — | W21 session close (D101–D105). Suite re-verify **1767 passed / 9 skipped**; build green; tip **`c55340f`** ≡ `main/master`. No half-applied work; no new compression debt. Next: D106. |

| 2026-09-20 | D106 | 2, alone | ADR 0007: Mongo production / JSON harness; boot refuse + compose pin. Two-store premise rewritten. Suite **1775 passed / 9 skipped**. Next: D107. |

| 2026-09-20 | D107 | 2, alone | Scheduled AES-256-GCM full backup + inventory (jobs/artefacts in ECD JSON); compose key-from-env. Suite **1784 passed / 9 skipped**. Next: D108 (never-compress). |

| 2026-09-20 | D108 | 3, alone | Timed restore rehearsal; four checks pass; RPO 24h / RTO 60m met (restore 3 ms). W22 gate met. Suite **1787 passed / 9 skipped**. Next: D109. |

| 2026-09-20 | D109 | 3, alone | Production-shaped generator + full migration chain (005 strip); rollback/forward-only docs; rehearsal 1000 items / 480 sessions. Suite **1793 passed / 9 skipped**. Next: D110. |

| 2026-09-20 | D110 | 3, alone | Five load numbers + DR runbook from D108; W22 closed. Suite **1794 passed / 9 skipped**. Next: D111. |

| 2026-09-20 | close | — | W22 session close (D109–D110; D106–D108 already landed). Suite re-verify **1794 passed / 9 skipped**; build green; tip **`0e5b0fa`** ≡ `main/master`. No half-applied work; no new compression debt. Next: D111. |

| 2026-09-21 | D111 | 1, alone | TaskWizard onto shared `src/components/wizard/` shell as convention B (rail gating, amber-dots, named blocking toasts, promote/save). CM/EM stay convention A. Suite **1821 passed / 9 skipped** (+27 D111 tests; skips unchanged). Next: D112. |

| 2026-09-21 | D112 | 1, alone | ItemWizard onto shared `src/components/wizard/` shell as convention C (real completion ticks, named Next-blocker banner, extra lifecycle transitions). CM/EM stay A; TaskWizard stays B. Suite **1850 passed / 9 skipped** (+29 D112 tests; skips unchanged). Next: D113. |

| 2026-09-21 | D113 | 1, alone | Presentation Model authoring (W23 G8 first slice): collection + lifecycle + HTTP/RBAC + convention-A wizard replacing the stub. SessionPlayer obedience out of scope. Suite **1894 passed / 9 skipped** (+44 tests / +4 files; skips unchanged). Next: D114. |

| 2026-09-21 | close | — | W23 session close (D111–D113; not full block). Suite re-verify **1894 passed / 9 skipped**; build green; tip **`5d747ac`** ≡ `main/master`. No half-applied work; no new compression debt. Next: D114. |

| 2026-09-21 | D114 | 2, alone | Premise rewritten: wizard already D113. Pointer `presentationModelId` on composite library + live resolve on `/next-task` + Storybook. Suite **1905 passed / 9 skipped**. Next: D115 (never-compress). |

| 2026-09-21 | D115 | 3, alone | SessionPlayer + ItemPresenter obey Presentation overlay; live-select operational PM; two-PM / one-item exit check in tests. **W23 gate met.** Suite **1909 passed / 9 skipped**. |

| 2026-09-21 | close | — | W23 session close (D114–D115; D111–D113 earlier same day). Suite re-verify **1909 passed / 9 skipped**; build green; tip **`28bce01`** ≡ `main/master`. No half-applied work. Compression debt: D115 live dual-PM `:6060` walk. Next: D116. |

| 2026-09-21 | D115 debt | — | Live `:6060` dual-PM walk closed. Root cause: student tenancy hid tasks (no `districtId`) so `/next-task` omitted presentation and `/api/tasks/:id` 404'd. Fixed attach via `readRawDB` + rostered task GET; student player chrome wrapper. Session `s1789988990327`; PMs `pm1789988809911001` / `pm1789988810055002`. Product `17ce5c2`. |

| 2026-09-21 | close | — | D115 live-debt session close. Suite **1913 passed / 9 skipped**; build green. Tip pin after this commit. D115b Instantiated-tasks unit outlined (schema + item bind; no CAF lifecycle). Next: D115b or D116. |

| 2026-09-21 | D115b | 2–3, alone | Instantiated tasks schema + item bind. `validateEntity("tasks")` can pass; TasksManager binds instantiable TM + itemId; author tenancy stamped. No CAF status machine. Suite **1936 passed / 9 skipped**. Next: D116. |

| 2026-09-21 | D116 | 2, alone | Task Model Variables (`taskModelVariables` / G13). Typed library records; one id consumed by two Task Models; vocabulary stays `ecdVocabulary.js`. No CAF status. Suite **1980 passed / 9 skipped**. Next: D117. |

| 2026-09-21 | close | 2, alone | D116 session close (Tier 2 alone). Suite re-verify **1980 passed / 9 skipped** (176 files, 30.69s); build green (7.01s); TasksManager chunk 5.27 kB. Tip **`c97b3f7`** ≡ `main`. No half-applied work; no new compression debt. Gate verified by schema + HTTP tests, not a live UI walk. Next: D117. |

| 2026-09-22 | D117 | 2, alone | TMV authoring UI. Models → Task Model Variables library; Task Model Wizard Variables step binds ids + settings. Suite **1983 passed / 9 skipped**. No D119. Calendar premise rewrite: original D117 routes/hooks already in D116; this slot = authoring UI. ✅ marked. Next: D118 residuals. |

| 2026-09-22 | close | 2, alone | D117 session close. Suite re-verify **1983 passed / 9 skipped** (178 files, 86.98s); build green (1m 20s). Calendar D117 ✅ (premise rewrite); D118 residual note. No half-applied work; no new compression debt. Next: D118 residuals. |

| 2026-09-22 | D118 | 1, alone | TMV registry residuals. Consumers visible before edit/delete; valueSet levels read-only; Storybook light/dark. Suite **1987 passed / 9 skipped**. No D119. Next: D120 (re-calibrate). |

| 2026-09-22 | D120 | 2, alone | Per-TM fixed/varying TMV settings + family projection; W24 ten-spec worked example. Suite **1993 passed / 9 skipped**. Skipped D119 (never-compress). Live :6060 admin TMV tab smoke. Next: D119 alone. |

| 2026-09-22 | D119 | 3, alone | Never-compress. Task Model structure/blueprint design features via TMV valueSet registry path; D22 value floor; mirror-drift green. Suite **1996 passed / 9 skipped**. W24 calendar D116–D120 done. Next: re-calibrate W25. |

| 2026-09-22 | D121 | 2, alone | Work Product as object. Collection + library UI; item.interaction.workProductId; mcq/likert identical Identification via same EM. Suite **2016 passed / 9 skipped**. No D122/D123. Next: D122 alone. |

| 2026-09-22 | D122 | 2, alone | Rubrics with exemplars; EM rubricId; bake into composite library; .backup deleted. Suite **2030 passed / 9 skipped**. No D123. Next: D123 alone (never-compress). |

| 2026-09-22 | D123 | 3, alone | Never-compress. Multi-phase eval onto existing procedures; Identification holds pending_human; staff human-rating completes; honest pendingHumanRatings. Suite **2039 passed / 9 skipped**. No D124 UI. Next: D124 alone. |

| 2026-09-22 | close | 3→1 session | W25 session close D121–D123. Suite re-verify **2039 passed / 9 skipped**; build green; tip `9b1c336` ≡ `main/master`. No half-applied work; no new compression debt. Next: D124 alone. |

| 2026-09-22 | D124 | 2, alone | Blinded human-rating queue + adjudication UI; audit on saveDB; Delivery tab. Suite **2043 passed / 9 skipped**. Live rating-queue API on rebuilt :6060. No D125. Next: D125 alone. |

| 2026-09-22 | D125 | 2, alone | Performance WP dispositions (all four supported); W25 block close. Suite **2047 passed / 9 skipped**. No W26. Next: re-calibrate D126. |

| 2026-09-22 | close | 2, alone | W25 session close D124–D125 (block). Suite re-verify **2047 passed / 9 skipped**; build green; tip ≡ `main/master`. No half-applied work; no new compression debt. Calendar D124–D125 ✅; W25 block ✅. Next: re-calibrate D126. |

| 2026-09-22 | calibrate | — | W26 start calibration. Tip `ae2b653`. D126–D128 premises rewritten (templates still absent; TM settings on Task Models; D48 = collectionSurfaceGuard; DINA joint ≠ continuous joint). D129 never-compress flagged. Work order: D126 alone. Handoff: `claude/day126-w26-calibration.md`. |

| 2026-09-22 | D126 | 2, alone | templates collection + four-binding coherence (PM↔TM); D48 guard; no UI/generation. Suite **2067 passed / 9 skipped**. No D127/D128/D129. Next: D127 alone. |

| 2026-09-22 | D127 | 1, alone | Template builder UI; live family size from bound TM settings; server errors on confirm. Suite **2073 passed / 9 skipped**. No D128/D129. Next: D128 alone. |

| 2026-09-22 | D128 | 2, alone | Continuous jointPrior (MVN covariance/correlation); PSD + dimension refusal; binary SMVs refused. Suite **2085 passed / 9 skipped**. No D129. Next: D129 alone (never-compress). |

| 2026-09-23 | close | 1+2 session | W26 session close D127–D128. Suite re-verify **2085 passed / 9 skipped**; build green; tip `02fe2ea` ≡ `main/master`. No half-applied work; no new compression debt. D129 never-compress flagged. Next: D129 alone when budget fits. |

| 2026-10-13 | calibrate | — | Cold start. Tip `de9b964` (UI/tooling after the D128 close). Suite **2085 passed / 9 skipped**. D129 premise held. Work order: do not start D129 on the calibration pass. |

| 2026-10-13 | D129 | 3, alone | Never-compress. Bivariate continuous EAP; hand 3×3 fixture; zero-correlation byte-identical to 1D; reproducibility after active parameter-set change. Suite **2093 passed / 9 skipped**. Live `:6060` login only (no joint-prior screen). No D130. Next: D130 alone. |

| 2026-10-13 | close | 3, alone | D129 session close. Suite re-verify **2093 passed / 9 skipped**; build green. Hand grid reproduced inside rebuilt `ecd-node`. No half-applied work; no new compression debt. Calendar D129 ✅. Next: D130 alone. |

| 2026-10-13 | D130 | 3, alone | Never-compress adversarial. P0: truncated joint grid (50× b=3 reported 4.79±0.21 vs covering 5.22±0.43) now widens; collision clears the stale partner. W26 gate held. Suite **2098 passed / 9 skipped**; build green. D68 and CM-archive walks escalated as standing risks. Next: re-calibrate D131. |

| 2026-10-13 | close | 3, alone | D130 / W26 session close. Suite re-verify **2098 passed / 9 skipped**; build green; tip `8009741` ≡ `main/master`. No half-applied work; no new compression debt. Calendar D130 and W26 already ✅. Next: re-calibrate D131. |

| 2026-10-14 | D131 | 2, alone | designPatterns collection (ADR 0009). PADI attributes; draft may omit rationale; confirm refuses empty rationale and operational. Routes + permissions + hooks + readiness. No wizard. Suite **2109 passed / 9 skipped**; build green. D132 routes absorbed. Next: re-calibrate D132. |

| 2026-10-14 | D133 | 1, alone | Narrative wizard on Admin → Models. Draft from a title; confirm needs summary and rationale; focal and additional KSAs are labelled rows. Suite **2116 passed / 9 skipped**; build green. No browser (dev server down). No D134. Next: D134. |

| 2026-10-14 | close | 2 + 1 | D131/D132 done (routes absorbed; reduced lifecycle). D133 **partial**: screen persists in tests; PADI guidance and `:6060` walk open. Close re-run **2116 passed / 9 skipped** after two load timeouts were widened; build green. Debt discharged by W27 close. Next: D133 guidance, then D134. |

| 2026-10-14 | D133 guidance | 1 | Each narrative attribute explains its PADI role on the existing screen. Suite **2117 passed / 9 skipped**. `:6060` still serves `index-CQCUHCB8.js`, so the walk stays open. No D134. |

| 2026-10-14 | close | 1 | D133 guidance in source and in live `DesignPatternBuilder-I3Xp7B1W.js`. Suite re-verify **2117 passed / 9 skipped**; build green. Login reached `/admin?tab=home` with an empty React root. Click-through still open. Next: that walk, then D134. |

| 2026-10-14 | D133 walk | 1 | Admin Models Design Patterns on `:6060` as `admin1`. All five PADI sentences present. Empty form: Create draft and Confirm disabled. Tab click intercepted by Student Model panel; opened via `?tab=designpatterns`. Empty-root login state did not recur. No D134. |

| 2026-10-14 | D134 | 2, alone | Menus of possibilities. WP/rubric/TMV rows require collection ids; observations optional existing observable; characteristic features labels. Empty menus still confirm. Suite **2123 passed / 9 skipped**; build green. No D135. No W28. |

| 2026-10-14 | D135 / W27 | 2, alone | Bulk on existing route; download/upload cards; sample placeholders. Suite **2124 passed / 9 skipped**. nginx+node rebuilt. Live confirm of Explain a labelled diagram (empty library menus). No W28. |

| 2026-10-14 | D136 | 2, alone | Optional `designPatternId` on templates. Pattern lists citers. Unpatterned confirm is a route result; live mongo has no Student Model, so a four-binding confirm was not clicked. Suite close re-run **2131 passed / 9 skipped**. No D137. |

| 2026-10-14 | D137 | 2, alone | Seed drafts from one confirmed pattern. Declined rows on `seededFrom`. Existing confirm rules are the substance gate. Suite **2135 passed / 9 skipped**. Live seed button disabled: no competency. No D138. |

| 2026-10-14 | D138 | 2, alone | Descendants listed from `seededFrom`. Drift is the snapshot, not Focal KSAs. Advisory. Suite **2138 passed / 9 skipped**. Live list empty: no seeded models. No D139. |

| 2026-10-14 | D139 | 2, alone | Child cites parent. Menus are not copied. Cycle including a self-link is refused. Suite **2141 passed / 9 skipped**. Live kind-of link plus a label. Seed still disabled: no competency. No D140. |

| 2026-10-14 | calibrate | — | D140 premise rewritten. React Flow already draws competency graphs. `GET /descendants` is the trace query. Work order: D140 alone, including the D135 Settings bulk click-through. No D141. |

| 2026-10-14 | D140 / W28 | 2, alone | Depth-1 neighbourhood on the existing descendants query. Diverged is a word and a dashed border. Suite close re-run **2143 passed / 9 skipped**. Live kind-of neighbourhood; seeded node was the component test. Settings upload created **D140 bulk check**. No D141. |

| 2026-10-15 | calibrate | — | D141 premise checked. Collection still absent. The D48 guard cannot wait for D142. Work order: D141 alone, schema plus the minimum gated surface. No D142. D143, D144, D145, D150 stay never-compress. |

| 2026-10-15 | D141 | 2, alone | Seven Layer-1 fields on one `domainAnalyses` record. Lifecycle `draft` \| `confirmed`. Model name DomainAnalyse. Minimum gated route so the D48 guard passes. Product suite **2159 passed / 9 skipped**. No bulk. No D142 in that commit. |

| 2026-10-15 | D142 | 1–2, alone | Bulk force-draft plus the correction form. Routes and lifecycle were already D141. Close re-run **2164 passed / 9 skipped**. Live POST 207 stored `da1792032778751000` as draft; form saved the valued-knowledge label. File input on the Settings card was not clicked. No D143. |

| 2026-10-15 | calibrate | — | D143 premise checked against Step 3, the policy schema, and ADR 0010. Work order: D143 alone. Do not flatten a policy into valued-knowledge labels. Dry-run first. No D144. |

| 2026-10-15 | D143 | 3, alone | Content standards on a Domain Analysis. Goal tree kept. Collection kept. Close re-run **2170 passed / 9 skipped**. Live dry-run found 0 policies; migration `006` recorded and did not change `da1792032778751000`. Settings still reads the route. No D144. |

| 2026-10-15 | calibrate | — | D144 premise checked. Q-matrices stay the DINA store. Knowledge–task rows stay labels. No Domain Analysis parent on competency models, so do not mint one analysis per model. Live `/data/db.json` at 14:28Z is an empty default (0 Q-matrices, 0 analyses, no migration log). Work order: D144 alone. No D145. |

| 2026-10-15 | D144 | 3, alone | Q-matrices stay `/api/qMatrixModels`. Optional `domainAnalysisId` only when the analysis exists. Close re-run **2177 passed / 9 skipped**. Live dry-run found 0 Q-matrices; migration `007` recorded and rewrote nothing. Diagnostic design stayed. No D145. |

| 2026-10-15 | calibrate | — | D145 premise checked at `1b90e99`. Domain Analysis does not cite a Design Pattern. A pattern does not cite an analysis. Seeding requires an existing `competencyId` and writes draft Evidence and Task Models, not a Competency Model. Work order: D145 alone, a live walk that records the missing chain. Do not build the link. No D146. |
| 2026-10-15 | D145 | 3, alone | Walk recorded the missing chain. Unpatterned Student Model still opened. Gate stays open. `b273d3f`. Calendar mark waited until 2026-10-16. No D146. |
| 2026-10-16 | off-calendar | — | Five authoring screens: wizard save, rubric starter, worked examples, Libraries and Results, copied curriculum on the analysis. Suite close re-run **2240 passed / 9 skipped**. Not a schema change. Live `:6060` not rebuilt. No D146. |
| 2026-10-17 | calibrate | — | D146 premise checked at `67ef113`. Inheritance already copies onto an empty Student Model and leaves a stored perspective until rebuild. Evidence, Task, and Design Pattern do not carry the field. Work order: D146 alone. No D147. D150 stays never-compress. |
| 2026-10-17 | D146 | 2, alone | Perspective stays on the Domain Analysis. Evidence and Task read the Student Model. A Design Pattern cites the analysis and stores no perspective. Override stays visible until rebuild. Suite close re-run **2256 passed / 9 skipped**. Live `:6060` not opened. No D147. |
| 2026-10-17 | calibrate | — | D147 premise checked at `5b4ee38`. The trait/DINA note already renders in `DINAConfigPanel` and reads `competencyModel.psychologicalPerspective`. It does not read the Domain Analysis, and proceeding writes no audit row. Work order: D147 alone. No D148. D150 stays never-compress. Suite not re-run. |
| 2026-10-17 | D147 | 2, alone | Advisory uses the effective perspective and names the Domain Analysis or the Student Model override. Confirm still succeeds. A new save writes `coherence.proceed`. Suite close re-run **2264 passed / 9 skipped**. Live `:6060` not opened. No D148. |
| 2026-10-17 | calibrate | — | D148 premise checked at `e78e2fb`. The DINA panel now uses the reader, and only when the choice already conflicts. Step 6's model selector and the Template builder still show no perspective. D146 already reads on four other screens. Work order: D148 alone. No D149. D150 stays never-compress. Suite not re-run. |
| 2026-10-17 | D148 | 1, alone | Effective perspective on the statistical-model choice and on the template's Student Model binding. Storybook `Inherited` and `Override`. Suite close re-run **2267 passed / 9 skipped**. Live `:6060` not opened. No D149. |
| 2026-10-17 | calibrate | — | D149 premise checked at `a2a977d`. Additional KSAs are `{ label }` entries on the Design Pattern. Focal KSAs are the same shape. Competencies have no Focal KSA field. Seeding does not copy the list. Task Model Step 7 is fairness notes. Work order: D149 alone. No D150. Suite not re-run. |
| 2026-10-17 | D149 | 2, alone | Additional KSA keeps its label and gains a relationship. Confirm refuses a missing one. A match to another pattern's Focal KSA warns and still saves. Suite close re-run **2272 passed / 9 skipped**. Live `:6060` not opened. No D150. |
| 2026-10-17 | calibrate | — | D150 premise checked at `c669fd8`. The review targets are narrower than the calendar. W29 does not produce a Competency Model. The W30 gate is the trait/diagnostic advisory, which D147 already raises. D143 and D144 did not migrate live rows. Work order: D150 alone, a separate refuting agent. Suite not re-run; the product tree is the D149 close re-run. |
| 2026-10-17 | off-calendar | — | Design Pattern authoring on the shared wizard shell, convention C. Nine steps, ungated rail, draft/confirmed toolbar. Suite **2247 passed / 9 skipped** (236 files). Not a schema change. **Not D146.** Handoff: `claude/day145c-offcal-design-pattern-wizard.md`. |
| 2026-10-17 | off-calendar | — | Domain Analysis workspace and optional guided setup. Not a schema change. Suite **2246 passed / 9 skipped**. Not D146. Handoff: `claude/day145d-offcal-domain-analysis-workspace.md`. |
| 2026-10-17 | off-calendar | — | Live `:6060` authoring. Student Model **Plant part naming** confirmed (same-author ack). Evidence Model **Part naming evidence** saved as draft with DINA; the trait advisory is on the configuration panel. Template **Name the plant part** saved as draft and shows the perspective line under the Student Model select. Task Model cannot start until that Evidence Model is confirmed. Warrants (Evidence step 3) throws React #185 on mount, so confirm was not reached. Assembly cannot be saved: the store has no selection policy. Presentation needs a Task Model. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Warrants no longer loops. `handleValidityChange` keeps the previous validity array when the flag is unchanged (`EvidenceWizard.jsx`). Mount test passes. Live `:6060` serves the rebuilt bundle. **Part naming evidence** now has a warrant, an observable, an evidence rule, a seeded key, fairness notes, and DIF rows set to `na`. The audit has one remaining failure: the DINA model needs a confirmed Q-matrix, and a Q-matrix needs an item, and an item needs a Task Model, and a Task Model needs this Evidence Model confirmed. Task, Presentation, and Assembly are still empty. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | **Part naming evidence** (`em1792239691400`) is confirmed and locked on `:6060`. The active statistical model is Rasch 1PL, mapped to observable `o1792241707663`. DINA stayed unconfirmable until a Q-matrix exists, so the measurement model was changed before Save for Review and Lock & Confirm. The trait/DINA advisory was already seen on the earlier configuration panel. Calibration is Not Calibrated. Task, Presentation, and Assembly are still empty. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Task Model **Name the plant part** (`tm1792246638176000`) confirmed and locked, bound to Part naming evidence. Three items confirmed against it (`it_mvchl6kb_000`, `it_mvchuuop_003`, `it_mvchuuqr_004`). Composite library rebuilt with 3 items and no Presentation Model. LSAT7 calibration job `job1792247505926000` succeeded (mirt, converged) and ingested as parameter set `ps1792247574731` after a mastery decision rule was saved. Q-matrix **Part naming Q-matrix** (`qm1792247725102000`) confirmed with those three items on Names the part. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Presentation **Name the plant part** (`pm1792248740926001`) confirmed and locked at task-model version 1. An earlier presentation without a version (`pm1792248528536000`) was archived. Composite library `cl1792248740990004` points at the versioned presentation with no warning. Work product **Selected plant-part name** (`wp1792248528479000`), task-model variable **Plant diagram** (`tmv1792248528494000`), and rubric **Plant part name** (`rub1792248528513000`, confirmed) are in the libraries. Template **Name the plant part** (`tpl1792240000812000`) is confirmed with the student model, evidence model, task model, and presentation. Evidence model **Part naming evidence** is operational. Three instantiated tasks (`t1792248547771`, `t1792248547789`, `t1792248547806`) and session `s1792248680597` (ready, fixed policy `p1792248680584`) are stored. Task model activation was refused: the locked confirmed model has no accessibility assumption and no equivalence group. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Cloned **Name the plant part** to version 2 (`tm1792249385692001`). The draft received access assumptions and equivalence group `plant-part-naming-v2`, then was confirmed. Three items were confirmed against it (`it_mvcj0cp0_005`, `it_mvcj0crl_006`, `it_mvcj0cuj_007`). Presentation `pm1792249386051002` is confirmed at version 2. Activation stored the task model as operational. Composite library `cl1792249386101008` has 3 items and no warnings. Version 1 stays confirmed. The Task Model list shows v1 Confirmed and v2 Operational. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Assembly model **Plant part naming assembly** (`am1792249848051000`) is confirmed and locked. It targets Names the part at classification accuracy 0.8, stops after 1–3 items or when that target is met, and uses fixed policy `p1792248680584`. The Assembly Model list shows it as Confirmed on Plant part naming. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Ten class 6A students (`stu1792250393153` through `stu1792250393361`) and `walk-student-1` each completed the three plant-part tasks. Eleven sessions are Submitted, including `s1792250393382` and `s1792248680597`. Each stopped on assembly maxItems 3. Learner feedback, teacher report, class report for 6A, and district report for `diet-chennai` all return. Responses are stored, and each one warns that the work product did not match the item's `equalsCorrect` pattern, so Activated is null. The Analytics dashboard still shows 0 sessions. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Dichotomous `equalsCorrect` rules now resolve against the item key, and 33 stored responses were rescored. The analytics dashboard reads the delivery store and shows 11 sessions, 10 students, and 70% mastery. Item analysis `aa1792253585477`, test information `aa1792253585495`, and DIF `aa1792253585512` are ingested. Attribute profiles stay empty because that job needs a DINA or G-DINA model and Part naming evidence is Rasch. W29 stays open. D151 not started. |
| 2026-10-17 | off-calendar | — | Dichotomous `equalsCorrect` rules now resolve against the item's keyed option, and stored null activations can be rescored. 33 responses on the plant-part sessions were rescored. The analytics dashboard reads the same store as delivery and shows 11 sessions, 10 students, and 70% mastery. Item analysis `aa1792253585477`, test information `aa1792253585495`, and DIF `aa1792253585512` are ingested. Attribute profiles stay empty: that job requires a DINA or G-DINA model, and Part naming evidence is Rasch. W29 stays open. D151 not started. |
| 2026-10-17 | D150 | 3, alone | Adversarial review of W27–W30. No P0. The trait/DINA advisory holds and confirm is not blocked. P1: deleting a pattern drops the seed back-link. Suite close re-run **2277 passed / 9 skipped**. W30 closed on the restated gate. W29 stays open. No D151. |
| 2026-10-22 | off-calendar | — | Design Pattern three-tab shell: Dashboard, Design Pattern Structure, Manage Design Pattern. Not a schema change. Suite **2283 passed / 9 skipped**. **Not D146.** Handoff: `claude/day145e-offcal-design-pattern-tabs.md`. |
| 2026-10-22 | off-calendar | — | Domain Analysis three-tab shell: Dashboard, Domain Analysis Structure, Manage Domain Analysis. Not a schema change. Suite **2290 passed / 9 skipped**. **Not D146.** Handoff: `claude/day145f-offcal-domain-analysis-tabs.md`. |
| 2026-10-22 | off-calendar | — | Manage Design Pattern and Manage Domain Analysis use the same list console as Manage Task Model: New, search, filters, expandable cards, Edit, Duplicate, and Delete. Not a schema change. Suite **2296 passed / 9 skipped**. **Not D146.** Handoff: `claude/day145g-offcal-manage-tab-parity.md`. |
| 2026-10-22 | off-calendar | — | Templates three-tab shell and Manage list console, matching Task Model: Dashboard, Template Structure, Manage Templates. Not a schema change. Suite **2305 passed / 9 skipped**. **Not D146.** Handoff: `claude/day145h-offcal-templates-parity.md`. |
| 2026-10-22 | off-calendar | — | Assembly Model three-tab shell and Manage list console, matching Task Model: Dashboard, Assembly Structure, Manage Assembly Models. Not a schema change. Suite **2315 passed / 9 skipped**. **Not D146.** Handoff: `claude/day145i-offcal-assembly-parity.md`. |
| 2026-10-22 | off-calendar | — | Diagnostic Design three-tab shell and Manage list console, matching Task Model: Dashboard, Diagnostic Design Structure, Manage Diagnostic Designs. The artifact stays a Q-matrix. Not a schema change. Suite **2328 passed / 9 skipped**. **Not D146.** Handoff: `claude/day145j-offcal-diagnostic-design-parity.md`. |
| 2026-10-22 | off-calendar | — | Presentation, Templates zip, Work Products, TMVs, and Rubrics received the same three-tab shell, plus one-zip Settings import and rubric add-level. Not a schema change. Latest off-cal suite **2417 passed / 9 skipped**. **Not D151.** Handoffs: `claude/day145k-offcal-presentation-model-parity.md` through `claude/day145q-offcal-rubric-levels.md`. |
| 2026-10-26 | calibrate | — | D151 premise checked at `f7ec896`. `taskSpecs` is still absent. Items are still authored by hand. Templates already project family size from Task Model settings. D48 forbids a schema-only collection. Work order: D151 alone. No D152. D155 stays never-compress. Suite not re-run; the product tree is the day145q off-cal run. |



## Compression debt



| Unit | What was compressed | Why | Discharge by | Status |

|---|---|---|---|---|

| D133 | Per-attribute PADI guidance, and the `:6060` walk | Narrative fields persist in tests. The exit check's guidance clause was not written. | W27 close (D135) | **closed** — guidance `249963a`; walk 2026-10-14 on `:6060` (`claude/day133-design-pattern-walk.md`). |

| D135 | Live Settings bulk-upload of a pattern file | W27 gate was the wizard confirm; bulk is a 207 test | W28 close (D140) | **closed** — 2026-10-14 Settings → Data upload of `d140-bulk-check.json` created 1 draft on `:6060` (`claude/day140-pattern-neighbourhood.md`). |

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

| D68 | Live mid-flight ingest + second submit on `:6060` | HTTP switchover tests; player regression only | D71 | **open — standing risk** escalated at W26 close 2026-10-13 (carried past two block closes). Still no unstopped two-item live walk. |
| D146 | Perspective readout not opened on `:6060` | Exit check was the inheritance test | Next live Evidence Model walk | **closed** — 2026-10-17 `:6060`. Design Pattern does not store a perspective. Confirmed Student Model **Plant part naming** shows `Perspective: Trait Inherited from Fractions.` Evidence identity, the statistical-model choice, and template **Name the plant part** each show `Perspective: Trait. Declared on Fractions.` Task was not opened |
| D147 | New advisory wording not opened on `:6060` | Exit check was the panel test and the audit test | Next live Evidence Model walk | **closed** — 2026-10-17 `:6060`. Draft **Part naming evidence**, type DINA, configuration panel: “Declared on Fractions. A trait perspective describes competence as a continuous latent trait, which a diagnostic model does not estimate. This is advisory, not blocking.” The same model was later confirmed as Rasch 1PL (`em1792239691400`), because a DINA confirm still needs a confirmed Q-matrix |
| D148 | New decision-point lines not opened on `:6060` | Exit check was the selector test, the template test, and the Storybook component | Next live Evidence Model walk | **closed** — 2026-10-17 `:6060`. The statistical-model selector and the template Student Model select both show `Perspective: Trait. Declared on Fractions.` |
| D149 | Relationship control and overlap note not opened on `:6060` | Exit check was the schema test and the builder test. The nginx image is behind `bcfc71a` | W30 close (D150) | **closed** — 2026-10-17 `:6060`. Matching label warned and did not block the draft. Confirm stayed disabled until `required_but_not_measured`. Pattern `Explain a diagram` confirmed |

| D69 | Live difR planted-item flags not executed in the authoring environment (no Docker/R here) | CI `lsat7-pipeline` now also runs `difPipeline.test.js` | this PR's CI | **closed** — live job green (`difR 6.1.0`, unique ETS C on Item.5; first two live runs failed the unique-item rule, recorded in the handoff) |

| D70 | Live known-equating not executed against Hub `rvkmar/r-backend:latest` | Local `:4000` has equate 2.0.9 / plink 1.5.1; CI still pulls Hub | Docker Hub push of the rebuilt image | **closed D88** — Hub `latest` reports plink 1.5.1; CI package gate fails loudly if missing |

| CM archive live walk | Archive UI/API in source; not demonstrated on `:6060` | Image not rebuilt this session | next live admin walk | **open — standing risk** escalated at W26 close 2026-10-13. Still not walked on `:6060`. |

| D115 | Live `:6060` two-PM / one-item browser walk | Tests proved chrome flip; seeded dual-PM session not walked end-to-end | next live student/admin walk | **closed** — 2026-09-21 live walk on `s1789988990327` / `tm-d56` / `itemA`; student tenancy bugs fixed (presentation attach + task GET); chrome flipped `large_text` → `high_contrast` without item edits |

| Admin CAF IA | Live tabs do not match TR9 CAF/delivery | Walk 2026-09-15; wiring is D73b | D73b | **closed** — Admin nested Models / Implementation / Delivery on `:6060`; District/Teacher/Student chrome aligned same session |



Debt against the never-compress list is not permitted. **D60** (this file's real unit) is closed.



## Units revised on contact



| Unit | Plan assumed | Code actually was | Became |

|---|---|---|---|

| D58 | Write `sessionOrchestrator.js`; stop on accuracy, length, or coverage | Stop already in `activitySelection.js`; no coverage field | Persist `{ stopped }` on the session; player shows the reason; do not add a second orchestrator |
| 2026-10-16 screens | The second walk's fixes would close the W29 chain | The breaks were missing foreign keys. The approved five sessions were forms, examples, and menus | Ship the five screens. Leave the chain unlinked. Do not call it D146 |
| D146 | Declare the perspective once on the Domain Analysis and copy it onto Design Patterns, Student, Evidence, and Task Models, with no two fields able to disagree | The Domain Analysis already has the field (D141). The Student Model has its own field. A new model copies the analysis when its stored value is empty; a stored value is kept until rebuild, and validation allows the two to differ. Evidence Models, Task Models, and Design Patterns have no perspective field | Finish that contract. Downstream layers read the analysis. A stored Student Model value is an override, visible as one, until rebuild. Do not add a second silent field. Not closed by `9e369f5` |
| D147 | Upgrade a UI-only advisory into a new modelled rule, and encode sociocultural and process-trace mismatches in the same pass | `DINAConfigPanel` already shows the trait + DINA/G-DINA note and says it is not blocking. It reads the Student Model field directly. `readEvidencePerspective` already resolves the Domain Analysis, with a stored Student Model value as an override. `auditLog` exists and this warning does not write to it. The other two mismatches are not implemented | Keep this one case. The shared check uses the effective perspective and names its source. Confirm still succeeds. Saving through the conflict appends an audit row. Leave sociocultural and process-trace for a later pass |
| D148 | Add the perspective at every decision point, and show an override only if D146 allowed one | D146 already shows the readout on the Student Model, the Evidence claim step, the Task evidence step, and the Design Pattern identity step. D147 made the DINA panel use the reader, and only as a conflict note. Step 6's model selector and `TemplateBuilder` still show no perspective. The Item wizard does not either. One Storybook story shows a stored trait warning, not an inherited-versus-override pair | Show the effective perspective where the measurement model is chosen and where a template binds a Student Model. A Storybook story shows the inherited state and the override. Do not add a second readout on the four D146 screens. The Item wizard is not this unit |
| D149 | Replace Task Model Step 7 risk cards with Additional KSA records, and warn when one is another competency's Focal KSA | Additional KSAs are already `{ label }` rows on the Design Pattern, the same shape as Focal KSAs. Competencies have no Focal KSA field. `seedFromDesignPattern` does not copy the list. Step 7 is the Evidence Model's fairness notes | Keep the list on the Design Pattern. Each entry gains `relationship`: `required_but_not_measured` or `potentially_confounding`. Confirm requires it. The advisory matches the label to a Focal KSA label on a different pattern and does not block. Do not copy the list onto the Task Model |
| D150 | A separate agent refutes a finished W27–W30: advisories that always or never fire, pattern inheritance disagreeing with perspective inheritance, a seeded back-link lost when the parent is edited or archived, D143 losing curricular-policy rows, and D144 leaving Q-matrix orphans. The handoff closes the upstream block | W27 and W28 gates are already held. W29 is open: a Domain Analysis does not produce a Competency Model. The action-plan W30 gate is the trait/diagnostic advisory; D147 raises it for DINA/G-DINA and does not block. Sociocultural and process-trace were left out. Design patterns cite `domainAnalysisId` and store no perspective. Kind-of links do not copy menus. `seededFrom.designPatternId` is the back-link. D143 dry-run found 0 policies (migration `006`). D144 stayed on the DINA store (migration `007`, no write). This conversation wrote D146–D149 | Still one session, still never-compress, still a separate refuting agent. Probe the trait advisory for a false positive and a false negative. Probe the seed back-link after a pattern edit and an archive. Confirm the D143 and D144 logs rather than hunting rows that were never migrated. Do not close W29. Do not treat “visible at every layer” as the W30 gate. Rank findings. Fix every P0 the same day with a regression test. The handoff says whether the W30 gate holds |
| D151 | A `taskSpecs` collection; the Item already plays this role with no derivation step; decide regenerate / mark stale / freeze when the template changes | `taskSpecs` is absent from schema, routes, roles, and queries. Items are still authored (`POST /api/items`) with `taskModelId` and no `templateId`. Templates exist (D126) with four bindings and `draft` \| `confirmed`. Family size is already `projectTaskSpecFamilySize` / `projectTaskSpecFamily` from Task Model settings, shown on the template builder (D127), capped at 500 in the projector. AIG `templateId` is a different unmounted registry. D48 fails a schema key with no mount and no role entry. `compositeLibrary` is the compiled-artefact precedent. D126 left templates without operational until generation | Seven-artefact for `taskSpecs`, including the D48 surface. Authored `POST /api/taskSpecs` is refused. A spec without `templateId` and `tmvAssignment` fails validation. Record the template-change policy as stale (ADR 0003: structural change invalidates; do not auto-regenerate a spec that may already have been delivered). A PUT of the source template sets that marker. Do not generate the family. Do not replace Item POST. Do not mount AIG. Do not start D152 |

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

| D95 | Evaluate SAML/OIDC against actual district IdP | No district IdP metadata in repo; local JWT only | Local accounts remain correct; OIDC preferred if/when IdP named; interim single-host compose; residency working assumption; three open questions with owners (ADR 0005) |

| Off-cal TN | Seed roster + keep local login; SSO-ready | createUserRecord was dead-export baseline; unused helpers exported | Seed via createUserRecord (resurrected); unexport identity/password helpers at close gate |



| D97 | Enforce in/above `dbAdapter` only | Most tenant reads use `loadDB`; save without merge would wipe tenants | Shared ALS filter on loadDB + dbAdapter; mergeScopedDbSave; path-param guard |

| D106 | `dbAdapter` alone has JSON + Mongo; decide one production story | Two stores: ECD via `loadDB`/`ECD_DB_FILE`; users/questions via `dbAdapter`. Compose already `DB_MODE=mongo` + ECD file | ADR 0007: Mongo is production of record (ECD target included); JSON harness only; ECD file interim until cutover; boot refuse + compose pin |

| D111 | Props-only fold of TaskWizard onto CM/EM shared shell | TM is context-driven: gated rail, amber readiness dots, step container doubles as router | Shared shell grew **convention B**; TM adapters map `useTaskModelWizard()`; CM/EM stay convention A |

| D112 | Fold ItemWizard like Task (reuse B) or props-only A | Item has real completion ticks, named Next-blocker banner, Step-8 confirm, extra lifecycle toolbar; Step 7 pilot surface is measurement-critical | Shared shell grew **convention C**; Item adapters; A/B unchanged |

| D113 | day81 inventory once labeled W23 = Presentation authoring alone starting at D111 | Calendar put shell folds on D111–D112; authoring on D113 | D111/D112 = shell chrome; D113 = real G8 authoring + ADR 0008 pointer-bake deferred; SessionPlayer obedience later |

| D114 | Calendar: build Presentation authoring wizard on shared shell + Storybook + a11y | Wizard + a11y already shipped D113; no pointer; no Storybook | Delivery `presentationModelId` pointer + live resolve on `/next-task` + Storybook residual; no new shell; D115 still owns player obedience |

| D115 live | Live dual-PM walk “just exercise existing overlay” | Student tenancy hid tasks without districtId → no presentation + task 404 | `readRawDB` attach + rostered task GET + student chrome; debt closed |

| D115b | (outline) Possible full CAF lifecycle on Instantiated tasks | Tasks are runtime instances, not CAF models; schema commented; UI cannot bind itemId | Schema + instantiable-TM + itemId authoring + tenancy stamp; **no** draft→operational machine. Closed D115b. |

| D117 | Calendar: routes, lifecycle, query hooks (seven-artefact remainder after D116 schema) | D116 already shipped routes/hooks/readiness/permissions; **no** CAF lifecycle on TMVs by design; zero UI | Authoring UI (library + wizard Variables + settings bind) — calendar D118 create/list early. D118 residual: consumer graph + Storybook themes. |

| D121 | Collapse WP into interaction; identifyEvidence anticipates separation | Collapse true; no workProducts collection; identifyEvidence `workProduct` is raw response blob; EM already has free-string workProductType/Id | Elevate to first-class collection + lifecycle; exit check unchanged (one WP × two interactions × same EM). Tier 2 alone. |

| D122 | No rubric objects; criteria invented at EM time; revive RubricManager.backup | Inline EM rubric artifacts executable (EM-R1); no first-class collection/exemplars; .backup dead (0 importers) | Promote reusable rubrics+exemplars; do not claim zero rubric structure; revive or delete .backup. Tier 2 alone (never with D121). |

| D123 | Add evaluationProcedures[] with phases; Identification pauses for human | evaluationProcedures[] already exist (key/rubric/auto/process_log); no phases; Identification still sync one-pass | Add phases + human pause onto existing procedures. **Never-compress** (fixed §3). Alone. |

| D124 | Build rater queue + adjudication from scratch | D123 shipped human-rating API + adjudication; zero UI; **blinding broken** (`provisionalActivated` on pendingHumanRatings); no audit on rating write; tenancy unconfirmed for cross-district | Blinded rater UI + strip automated/identity from rater projection; audit ratings; tenancy. Consume D123 — do not rebuild phase runner. Tier 2 alone. |

| D125 | Invent support for four performance WP types after 3.4/3.5 | Types already in ecdVocabulary with empty interaction maps (deliberate); two-phase already D123; D124 still open for W25 gate | Disposition decisions only after D124; resolve §6 deferred list; W25 handoff. Tier 2 alone. Never with D126. |

| D126 | Greenfield templates + invent per-template TMV settings | No `templates` in schema (true); D120 settings already on Task Models; PM↔TM coherence on compositeLibrary; D48 = `collectionSurfaceGuard` | Seven-artefact `templates`; consume TM settings; reuse PM/TM rule; routes same session. Tier 2 alone. |

| D127 | Configure TMV settings stored on the template | Settings live on Task Model (D126); `projectTaskSpecFamilySize` already exists | Builder binds four models; live family size from TM settings (write-through if unlocked); server errors via apiErrorMessage. Tier 1 alone. |

| D128 | No joint language anywhere | Per-SMV marginal priors only; DINA attribute-profile joint already exists | Continuous/covariance joint prior schema only; do not confuse with DINA. Alone after D126. |

| D129 | Joint update is a new estimator with no existing continuous path | 1D EAP still the continuous path; `jointPrior` unread; Day 39 still refuses two Evidence Models on one SMV; DINA joint is separate | Consume D128 `jointPrior` for one correlated partner. Zero off-diagonal stays on the 1D EAP. Do not pool the Day 39 collision. **Never-compress.** Alone. |

| D131 | Schema-only PADI attributes; routes and lifecycle on D132; D48 green from schema alone | Adding `schema.designPatterns` with no mounted route fails `collectionSurfaceGuard`. `operational` would mean student delivery. Templates (D126) are the reduced `draft|confirmed` precedent | One session: ADR 0009, then schema + meanings + `/api/designPatterns` + rolePermissions + query hooks + readiness mirror. Empty rationale refused on confirm/strict. No wizard. |

| D132 | Routes, auth, and a reduced lifecycle for design patterns | Those artefacts shipped inside D131 because the collection guard will not pass schema-only | Do not re-implement routes. Closed as a routes unit on 2026-10-14. Wizard narrative is D133; real menu references are D134. |

| D133 | Narrative wizard over a pattern that does not exist yet, with Additional KSAs copied from Task Model fairness notes | `designPatterns` exists (D131). `fairnessRisks` stay on the Task Model. No pattern screen | Admin library: title, summary, rationale, focal KSAs, additional KSAs. Draft may omit rationale; confirm cannot. Tier 1, alone. |

| D133 remainder | Rebuild the wizard so each attribute explains itself | The form already saves those five fields. What was missing was the PADI role of each one | Add that guidance on the existing screen. Do not rebuild the form. Do not open the D134 menus. The `:6060` walk waits until nginx is serving this screen. |

| D134 | Every menu is a real object collection | WP/rubric/TMV libraries exist. Potential Observations and Characteristic Features have no collection. Confirm already allowed empty `{label}` menus | Library menus cite ids (`workProductId`, not a type string). Observations and characteristic features stay labelled possibilities. Copy: possibilities, not commitments. No new collections. No W28. |

| D135 | Invent a second pattern importer; remap menu ids by name; bulk WP/rubrics/TMVs first | Unified bulk already exists; pattern refs are by id; those libraries have POST `/` not `/bulk` | Add `/api/designPatterns/bulk` + Settings cards. Missing ids fail the row. Force draft. W27 gate = live author+confirm. |

| D136 | W28 opens by writing `seedFromDesignPattern.js` | No `designPatternId` / `templateIds` anywhere. `templates` (D126) confirm on CM/EM/TM/PM bindings with no pattern. Calendar D136 is the link; the seeder is D137 | Add an optional link, navigable both ways. A pattern offers templates; it does not block confirm. Unpatterned templates stay valid. No seeding, no graph, no inheritance. |

| D137 | Copy menus into new models; characteristic features fill `blueprintConstraints`; rubrics become evaluation procedures; a new confirm gate blocks seeded models | Observations are labels (optional foreign observable id). Characteristic features have no Task Model field; `blueprintConstraints` is difficulty, Bloom, domain, exposure. A rubric id is not an evaluation procedure. EM draft already requires `competencyId`. EM confirm already requires claim, warrants, typed observables, and evidence rules. TM confirm already requires a confirmed Evidence Model and expected observations. A draft Task Model may not cite a draft Evidence Model unless `allowDraftParents` | Seed **drafts** from **one confirmed** pattern. Designer picks menu rows; declined rows stay on the back-link. Chosen observation labels become draft observable statements, not copied ids. Chosen variable features may cite `taskModelVariableIds`. Do not write characteristic-feature labels into `blueprintConstraints`. Do not invent evaluation procedures from rubric ids. The designer supplies `competencyId`. Existing confirm rules are the substance gate. Use `allowDraftParents` only so the new Task Model may cite the new draft Evidence Model. No inheritance. No back-fill. No second confirm blocker. |

| D138 | Compare a seeded Evidence Model's observables to the pattern's Focal KSAs, and build the first graph edge for W33 | Focal KSAs are labels. D137 stores the accepted and declined menu snapshot on `seededFrom`, including `seededObservableId`. The pattern's current menus can change later. Characteristic features, rubrics, and work products were not copied into model fields. React Flow already draws competency graphs | List Evidence and Task Models whose `seededFrom.designPatternId` matches. Compare each model to that snapshot, not to Focal KSAs and not to the pattern's current menus. An accepted observation diverges when its `seededObservableId` is missing or its statement no longer equals the accepted label. Designer-added observables are not divergence. Declined rows that were never copied are not missing. An accepted variable-feature id missing from `taskModelVariableIds` is named. Advisory only; confirm is unchanged. No graph. No inheritance. |

| D139 | A child pattern inherits its parent's Potential Observations, and editing the parent changes the child; that choice must precede D137 | D137 already seeds from the pattern's own menus. `designPatterns` has no relation fields. Competency `relationships` already store `{ type, targetCompetencyId }` and refuse a part-of cycle. Rubric exemplars and `curricularPolicies` are other collections | Add `relationships: [{ type: "kind-of" \| "part-of", targetPatternId }]`. A child references its parent. It does not copy menus, and a parent edit does not change the child or any model D137 already seeded. Refuse a cycle, including a self-link, at write time. Optional `references: [{ label, url }]` are labels, not curricular policies and not rubric exemplars. Seeding still reads only the pattern's own menus. No graph. |

| D140 | The first graph-shaped surface in the app, showing every pattern | React Flow already draws competency relationships (`RelationshipGraphEditor`, `CompetencyGraphVisualizer`). Design patterns have no graph. `GET /:id/descendants` already lists seeded models and names snapshot drift. `relationships` are kind-of or part-of citations and do not copy menus. This mongo has two patterns, no competency, and no seeded models | Anchor on one pattern. Show its relations and its seeded models to a bounded depth, reading the existing descendants query. A diverged descendant is identifiable without colour. Do not draw every pattern. The Settings → Data design-pattern card already exists; walk that click-through at this close. |

| D141 | Schema only, with the HTTP surface waiting for D142; the seven Layer-1 entities are still undesigned; psychological perspective is added here and inherited in W30 | `domainAnalyses` is absent from `schema.js`, routes, and roles. `collectionSurfaceGuard` fails a schema key that has no mounted route and no role entry (D131 put those in the schema unit). `capitalize()` strips a trailing `s`, so the collection `domainAnalyses` becomes the model `DomainAnalyse`. `psychologicalPerspective` is already required on competency models (`PSYCHOLOGICAL_PERSPECTIVES`). `curricularPolicies` are a live collection cited from Competency Wizard Step 3. `QMatrixGrid` is its own component; `QMatrixEditor` is bound to competency models and `/api/qMatrixModels`. Design-pattern menus are Layer 2, not these seven entities | One collection, seven entities as fields on that record. ADR first. Include validation, a lifecycle that does not mean student delivery, the readiness mirror, and the minimum gated route so the D48 guard passes. Store the perspective enum on the Domain Analysis only as a declared value; do not copy it onto competency models and do not inherit it (D146). Leave `curricularPolicies` and Q-matrices where they are. Bulk upload and the correction form stay D142. |

| D142 | Routes, reduced lifecycle, and the upload, as if none of that surface existed | D141 already mounted `/api/domainAnalyses`, stored `draft` \| `confirmed`, and refused `operational`. `curricularPolicies` already upload through the staged bulk uploader. Unified `detectKind` would classify a Layer-1 file as a competency model because both carry `psychologicalPerspective` | Keep the D141 route. Add `POST /bulk` that always stores draft, the Settings and download cards, Layer-1 detection before the competency check, and one correction form (not a wizard). A foreign curricular-policy or Q-matrix id fails the row. Do not absorb policies (D143) or re-home the Q-matrix (D144). |

| D143 | Fold `curricularPolicies` into the Domain Analysis `valuedKnowledge` labels, then delete the Settings tab | A policy is `curricularGoals` → competencies → learning outcomes (`schema.js`). Step 3 stores `constructFramework.policyId` plus a snapshot (`policyName`, `curricularGoalCodes`, `curricularGoals`). `valuedKnowledge` is `{ label }` and a `curricularPolicyId` on that row is refused (ADR 0010). `CurricularPolicyManager` is Settings → Policies, and the bulk card also posts `/api/curricularPolicies/bulk`. The dry-run runner is `server/migrations/runner.js`. This calibration did not count live policy rows | Keep the policy shape as content standards on a Domain Analysis. Do not flatten it into labels. Dry-run and record the version before any write. Step 3 still resolves `policyId`; a confirmed model's snapshot still renders. Retire the Settings surface only when nothing reads `/api/curricularPolicies`. Leave Q-matrices and perspective inheritance alone. |

| D144 | Add `domainAnalysisId` and re-parent the route; the grid was built to make this small | `QMatrixGrid` is presentational. The editor is Admin → Diagnostic design (`QMatrixModelBuilder`), bound to `competencyModelId` and `/api/qMatrixModels`. DINA resolves `structureConfig.qMatrixId` on that collection. `knowledgeTaskRelationships` are `{ label }` and refuse `qMatrixId`. Competency models have no `domainAnalysisId`. At 2026-10-15 14:28Z the live JSON file is a 382-byte default: 0 Q-matrices, 0 domain analyses, no backups, no migration log | Ran 2026-10-15 as the calibration revision (`2a2a5c7`). Collection and DINA ids stayed. Migration `007` is a recorded no-write (`2026-10-15T15:18:16Z`). Optional `domainAnalysisId` fails when the analysis is missing. Diagnostic design stayed; a saved analysis deep-links to it. The empty live file was not treated as proof draft `da1792032778751000` never existed, and it was not restored. |

| D145 | Walk Domain Analysis → Design Pattern → Competency Model → Evidence → Task → Items → delivery, because that chain now exists end to end | `domainAnalyses` has the seven statement lists, `contentStandards`, and `psychologicalPerspective`. It has no design-pattern id and no competency-model id. `designPatterns` cite other patterns and seed from their own menus. `seedFromDesignPattern` requires an existing `competencyId` and writes a draft Evidence Model and a draft Task Model. It does not create a Competency Model. The only Domain Analysis deep link is Diagnostic design (`?domainAnalysisId=`). `designPatternId` is optional on templates. Live `:6060` at the D144 close had an empty default store | Walk what an author can actually open, in order, on `:6060`. Where a step does not produce the next step's input, write that as a finding. Do not add the missing foreign keys in this unit. Confirm an author can still start at a Competency Model with no Domain Analysis and no pattern. The W29 gate (start at a Domain Analysis and reach a Competency Model) stays open after this walk; saying so is the record, not a quiet edit of the gate. |



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

- ~~Session ownership-scoping (a student may only read their own session)~~ closed D72 on session + session-report routes; ~~`GET /api/students` roster dump~~ closed D97 at storage boundary; ~~row-level HTTP matrix~~ closed D98 (`d98TenancyRowNegatives.test.js` + sixth mirror)

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

- ~~Work Products / Rubrics as first-class objects + multi-phase eval + human rating UI (W25 / G11–G12)~~ closed D125 (`claude/day125-w25-block-close.md`)

- ~~Presentation Model authoring (W23) — stub only (`PresentationModelStub.jsx`)~~ closed D113. ~~Library-pointer bake~~ closed D114. ~~SessionPlayer obedience / W23 gate~~ closed D115 (`claude/day115-sessionplayer-presentation-w23.md`). ~~Live `:6060` dual-PM browser walk~~ closed 2026-09-21 (compression debt D115).

- ~~D47 F6 / TasksManager item bind (`schema.tasks` commented; POST `{ taskModelId }` only)~~ closed D115b (`claude/day115b-instantiated-tasks.md`)

- D115b live Implementation → Instantiated tasks click-through on `:6060` — **open** (schema/API/UI tests this close)

- ~~W26 templates + joint SMV update (G14)~~ closed D130 (`claude/day130-adversarial-joint-w26.md`, `claude/day130-w26-session-close.md`)

- ~~Design Patterns (W27 / G9)~~ closed D135 (`claude/day135-pattern-import-w27.md`). ~~D136 pattern ↔ template link~~ closed (`claude/day136-pattern-template-link.md`). ~~D137 seed drafts from a confirmed pattern~~ closed (`claude/day137-seed-from-design-pattern.md`). ~~D138 seed-snapshot divergence~~ closed (`claude/day138-seed-snapshot-divergence.md`). ~~D139 pattern relations~~ closed (`claude/day139-pattern-relations.md`). ~~W28 neighbourhood graph (D140)~~ closed (`claude/day140-pattern-neighbourhood.md`). ~~D141 domainAnalyses schema~~ closed (`claude/day141-domain-analysis-schema.md`). ~~D142 upload and correction form~~ closed (`claude/day142-domain-analysis-upload.md`). ~~D143 content standards~~ closed (`claude/day143-content-standards.md`). ~~D144 Q-matrix re-home~~ closed as a stay-on-the-DINA-store decision (`claude/day144-qmatrix-stays-dina-store.md`). ~~D145 chain walk~~ closed as a walk (`claude/day145-chain-walk.md`); the W29 gate stays open. ~~D146 perspective read-through~~ closed (`claude/day146-perspective-inheritance.md`). ~~D147 coherence advisory~~ closed (`claude/day147-coherence-advisory.md`). ~~D148 perspective at the decision~~ closed (`claude/day148-perspective-at-decision.md`). ~~D149 additional KSA relationship~~ closed (`claude/day149-additional-ksa-relationship.md`). ~~D150 adversarial review~~ closed (`claude/day150-adversarial-w30.md`, `claude/day150-w30-session-close.md`). ~~W30 trait/diagnostic advisory~~ closed on the restated gate. W29 stays open. P1: deleting a Design Pattern drops `seededFrom.designPatternId`. Off-calendar authoring screens closed 2026-10-16 (`claude/day145b-offcal-authoring-fixes.md`) and are not on `:6060` until the frontend image is rebuilt. The live `/data/db.json` read at calibration on 2026-10-15 14:28Z is an empty default; draft `da1792032778751000` is not in that file.

- ~~W17 psychometric dashboard shell + mandatory provenance stamp~~ closed D81 (`claude/day81-psychometric-dashboard-shell.md`)

- ~~W17 item-analysis dashboard~~ closed D82 (`claude/day82-item-analysis-dashboard.md`)

- ~~W17 test-information + requiredSEM overlay~~ closed D83 (`claude/day83-test-information-dashboard.md`)

- ~~W17 attribute-profile + DIF dashboards~~ closed D84 (`claude/day84-attribute-profile-dif-dashboards.md`)

- ~~W17 PDF/CSV export + provenance-in-export~~ closed D85 (`claude/day85-export-w17-handoff.md`); W17 closed (`claude/day85-w17-close.md`)

- ~~W18 job timeout + R process kill on breach~~ closed D86 (`claude/day86-job-timeouts-process-kill.md`)

- ~~W18 concurrency bound + queue-depth alarm~~ closed D87 (`claude/day87-concurrency-backpressure-queue-alarm.md`)

