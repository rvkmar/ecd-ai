# Off-calendar: Waves 0–4 leftover pass

**Not D146.** Not a calendar unit. Checks Waves 0, 1, 2, 2A, 2B, 3, and 4 for leftover product. Does not start D155. Does not start T1–T28. D129 was not reopened.

Handoff id: day146ag.

**Status: DONE.** Exit check: every leftover named by those waves is either already in git, already deleted from the live store, or already recorded as a design limit / written-off walk. No new application files.

## Premise (held)

Checked on HEAD `73c5ac2` (Wave 4 product tree is `2d5ada6`; T1–T28 is docs on top). Each wave’s own leftovers were the next wave’s work, then Wave 4 recorded the rest.

| Wave | Named leftover | Where it went |
|---|---|---|
| 0 | Live image behind git; DA only offered Author a Q-matrix | Wave 0 rebuilt. Wave 3 added the Student Model / Design Pattern buttons. Live `:6060` index is still Wave 3 `/assets/index-CcflFHJL.js`. Wave 4 and T1–T28 changed docs only, so that match is correct. |
| 1 | Step 9 `CheckCircle2`; announcement tenancy | Wave 2 product `758c3e1`. `VersionHistoryViewer` imports `CheckCircle2` and `Eye`. Create stamps `districtId`; admin unscoped posts are platform-wide. |
| 1 | Draft clone; teachers-only announcement | Wave 2B DELETE. Live store: announcements `[]`. Competency models are the two confirmed parents plus **W29 Fractions Student Model**. |
| 1 / 2 | D68, Continue, Newtonian, archive of live confirmed parents | Wave 4 wrote them off. This pass does not invent a session or a Newtonian pack. |
| 2A | Inspect with no active set; walk debris; stale CHANGELOG | Wave 2B. Missing-active copy is `parameter-set-diff-missing-active`. Debris deleted. |
| 2A / 2B | `sm-plant-irt` `activeParameterSetId = ps1793177976685` | Still set. That is the ingested candidate Wave 2A activated so inspect could render, not graffiti. Left in place. |
| 3 | Wave 4 limits; PCM / Sympson–Hetter / joint EAP / default carry-forward | Wave 4 recorded. Not product. |
| 4 | Ledger HEAD still said uncommitted at `7fb4bef` | This pass. Commit was `2d5ada6`. |

T1–T28 (`claude/day146af-offcal-ecd-textbook-gaps-t.md`) is a new textbook audit on `2d5ada6`, not a leftover of these waves. It was not started.

## What was not done

D155. T1–T28 / TU1–TU27. Reopening D129. Clearing the Part naming IRT active pointer. Archiving confirmed Student Models. `docker compose build r-backend`. Suite / build (no application files). Commit (not asked).

## Rollback

Revert this handoff and the ledger HEAD correction. No application files to revert.

## Verification

Live `:6060` health ok; hybrid `ecd-json` + mongo backends; R reachable. Index `/assets/index-CcflFHJL.js` (Wave 3).

Live `/data/db.json`: three confirmed Student Models (Plant part naming, Grade 6 Numeracy - Fractions, W29 Fractions Student Model). Zero announcements. Part naming IRT still points at `ps1793177976685`.

Product files named by Waves 2, 2A, 2B, and 3 are present (`VersionHistoryViewer.jsx`, `tenancyScope.js` / `announcements.js`, `parameterSetDiff.js`, `CalibrationJobDetail.jsx`, `activitySelection.js` `diagnosticBeliefForAttribute`, `DomainAnalysisEditor.jsx` `openFromDomainAnalysis`).

## Calendar

Not a calendar unit. Last completed calendar unit stays D154. Next remains D155, never-compress, not started. W29 stays closed. T1–T28 stays recorded, not started.

## Next

T1–T28 if still wanted, as their own units, not as wave leftovers. Do not start D155 from this close.
