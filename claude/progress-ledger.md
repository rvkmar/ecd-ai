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
| Last completed unit | **D59** — role-split reports / attribute profile / examinee leak. D50 leftover staff Play routing closed in #12/#13 (`day60-…`). This branch closes the remaining staff Play/Pause/Operate + assignment + /mine leftover (`claude/day61-staff-session-operate-and-assignment.md`); that file is not the never-compress D60. |
| Next queued | **D60** — never-compress adversarial review of selection/stopping (own session) |
| Block | W12 — Activity Selection, stopping, reporting |
| Block gate | Sessions end on an accuracy target, not only on length; attribute-profile report renders |
| Gate status | Stopping evaluates, persists, and shows in the student player (D58). Attribute-profile **report** renders, role-split; examinee cannot GET teacher-report (D59). |
| HEAD at D58 code | `ede5f33` |
| HEAD at D59 | `c3b2ef7` |
| HEAD this close | `f518bc9` (PR #14 merge + extra gitignore of UI-walk scripts) |

## Session log

| Date (IST) | Units | Tier mix | Notes |
|---|---|---|---|
| 2026-09-13 | D58 | 2, alone | Premise rewritten: no new orchestrator. Persist `session.stopped`; player reads `data.stopped`. Live player walk later the same day: `s1789288381307` showed "Measurement target met" / attrA master 0.95. Walk Playwright/seed scripts gitignored (`0efe535`), not committed. |
| 2026-09-13 | D59 | 2, alone | Closed examinee leak on `teacher-report`. Role-split `SessionReport` / `reportsRoutes`. Classification + stop on report header, learner/teacher tabs, session list badge, session-player header. D60 not started. |
| 2026-09-13 | docs | — | Restored missing D51–D57 handoffs under `claude/` (see file list in that PR). No product code. D55 remains the skipped WCAG audit. |
| 2026-09-13 | D50 leftover | 2 | Staff Play no longer bounces to `/login`; Pause on the player; student My Sessions lists attendable sessions (`GET /api/sessions/mine`). Handoff: `day60-staff-play-and-student-discovery.md` (not the never-compress D60). |
| 2026-09-13 | D50 leftover | 2 | Staff list Play/Pause persist (exclusive) + Operate/Back; student/cohort assignment; /mine never 404s as "Session not found". Handoff: `day61-staff-session-operate-and-assignment.md`. |
| 2026-09-13 | close | — | Working tree clean at `f518bc9`. Additional walk scripts gitignored (`scripts-login-dump.cjs`, `scripts-new-session-walk.cjs`, `scripts-ui-walk.cjs`). Plan **D60** (adversarial review) not started, calendar unmarked. |

## Compression debt

| Unit | What was compressed | Why | Discharge by | Status |
|---|---|---|---|---|
| D50 | District/teacher browser pass skipped | Human logins | D71 | open |
| D55 | Entire W11 accessibility audit skipped | Never scheduled after Q-matrix/Assembly shipped | Re-date at W12 close or before D73 | **open, past one block close → standing risk** |
| D56 | Adaptive selection not live-browser | Tests only | D71 | open |
| D58 | Live diagnostic-session ending screen not walked at first close | Walked later 2026-09-13 on `s1789288381307` | D58 | **closed** |
| D57 | Author UI said accuracy was unevaluated | Folded into D58 | D58 | **closed** |
| D59 | Live report-surface browser walk skipped | Component + route tests; no running TLS stack this session | D71 | open |
| D46 | Phase-2 `apiFetch` | — | — | **closed** (`e533a77` / PRs #5–#6) |
| D54 | Wizard readiness mirror has no agreement test | Token | W12 close | open |

Debt against the never-compress list is not permitted. **D60** is next on that list — do not start it in the same session as D59.

## Units revised on contact

| Unit | Plan assumed | Code actually was | Became |
|---|---|---|---|
| D58 | Write `sessionOrchestrator.js`; stop on accuracy, length, or coverage | Stop already in `activitySelection.js`; no coverage field | Persist `{ stopped }` on the session; player shows the reason; do not add a second orchestrator |
| D59 | Split reports by role; attribute-profile UI; close teacher-report leak | One stack (`reportsRoutes` + `SessionReport`); teacher-report was authenticate-only; classification already computed, not shown on reports | Gate teacher routes with `authorizeRole`; stop the client fetching them as a student; attach `stopped` + `attributeProfile` to existing payloads/surfaces |

## Carried-forward gaps

- ~~F4 — `buildCompositeLibrary()` has no caller~~ closed D49a + D49c
- ~~F3 — client computes the score~~ closed D47
- ~~Classification accuracy visible but unevaluated~~ closed D57; persist/show closed D58
- ~~Classification on reports~~ closed D59
- ~~Examinee can GET teacher-report~~ closed D59
- Mastery cut fixed at 0.5 — still true
- `gdina` has no pilot path
- Session not bound to a specific Assembly Model (ambiguous match → none applied)
- Adaptive selection: nearest difficulty, not max information (held for benchmark work)
- Chunk >500 kB — D74
- ~~Student My Sessions placeholder~~ closed D60
- Dead-export guard can miss unused exports that share a name
- Session ownership-scoping (a student may only read their own session) — still open; D59 closed the role leak only
