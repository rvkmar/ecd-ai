# Off-calendar: professional ECD session, cumulative, and percentile reports

**Not D146.** **Not D156.** Not a calendar unit. Continues the psychometric/reporting track after the Iteman/Xcalibre live walk (`claude/day146ah-offcal-iteman-xcalibre-live-walk.md`). Does not start D156 (AIG). Does not remount `/score`. ADR 0001 held. D59/D72/D99 held.

Handoff id: day146ai.

**Status: DONE.** Product is in git through `0494d90`. Live `:6060` walks executed for the session ECD document, the three cumulative documents, and percentiles.

## Exit checks (as executed)

| Slice | Claim | Executed? | Status |
|---|---|---|---|
| Iteman/Xcalibre HTML restyle | Reviewer-ready printed technical document (layout, type, compact tables) | **Yes.** CSS in `r-backend/app/reports/_layout.css`. r-backend restarted so plumber re-sourced. New jobs show the restyle. | **DONE** |
| CTT/IRT chart axes | Boxed panel, ticks, numeric labels, axis titles, interior grid | **Yes.** Shared `.chart_axes` in `reportHtml.R`; ggplot `theme_bw` + `panel.border`. Local SVG preview, then r-backend restart. | **DONE** |
| Per-student ECD session report | Item → Task Model → Evidence → Competency tables, charts, bands, interpretations; no keys on student payload | **Yes on `:6060`.** Admin Delivery → Sessions → Report on `s1793177117741` (sim-e2e student 001). Student GET teacher-report still 403. | **DONE** |
| Cumulative ECD reports | Cross-session student / teacher / district documents on the same paper world | **Yes on `:6060`.** Student Delivery → Reports; teacher Delivery → Classroom; admin Results → Curriculum (600 students / 600 sessions / 6900 scored). | **DONE** |
| Percentiles | Midrank PR + P10–P90 of per-student means; n < 5 suppress; students never see named peers | **Yes on `:6060`.** stud1 PR 99.2 among 600; teacher P10–P90 20.0 · 30.0 · 50.0 · 69.2 · 84.6; named roster PR; district no names. | **DONE** |

A green suite is not the live exit check. The live walks above are.

## Premise (held)

R stays a queued calibration bureau. Scoring and CAT stay in JS. Session and cumulative ECD reports are Node aggregations of stored scores (ADR 0001). Envelope 1.0 stays additive. ECD task `templates` stay task templates (D126). Students must not fetch teacher-report (D59). A student must not read another examinee's session (D72). District cells below `MIN_CELL_SIZE` = 5 are suppressed (D99).

## What the plan got wrong

- **Google Fonts.** SessionReport CSS `@import` is blocked by nginx `font-src 'self'`. Self-host `@fontsource/source-sans-3` and `@fontsource/source-serif-4`.
- **Narrow session modal.** Viewport media queries did not shrink the competency table inside the modal. `container-type: inline-size` on `.ecd-paper` plus `@container` hides `.extra` columns.
- **Teacher/district cumulative empty on `:6060`.** Production `loadDB()` is tenancy-filtered. Cumulative routes load unscoped (`runWithTenancy(UNSCOPED_DB, loadDB)`) then `scopedStudentsFor`. The live sim roster of 600 is unstamped (`districtId` / `schoolId` null); unstamped rows are in-scope for teacher/district, stamped foreign-district rows are not.
- **Student GroupTable.** Empty Emerging/Developing/Secure count columns on the student document. `groupCounts={kind !== "student"}`.
- **Student PR needs peers.** `buildStudentCumulativeReport` only had that student's sessions. The route passes `comparisonStudentsFor` (class if `classId`, else district/unstamped). stud1 has no `classId`, so the live comparison is the 600 unstamped peers, labelled "group".
- **R chart frames.** Outer beige card is not a plot panel. Shared SVG axes; ggplot `theme_minimal` swapped for `theme_bw` + `panel.border`. Wright item labels moved off the x-tick numbers.
- **Layout CSS `:root`.** Pasting shared layout after skin tokens overwrote palettes. Paste layout then skin so skins win.
- **Existing ingested HTML is frozen.** Restyle and chart-axis CSS apply to new jobs after r-backend restart. Old artefacts keep the HTML they ingested.

Did not remount `/score`. Did not mount `aigRoutes.js`. Did not `docker compose build r-backend`. Compose still bind-mounts `./r-backend/app`. Docker `node` does not bind-mount `server`; live API/UI on `:6060` required `docker compose up -d --build node nginx`.

## What was delivered

Product commits after the Iteman/Xcalibre live walk (`f73d74d`):

| Commit | What |
|---|---|
| `7ca4935` | Iteman/Xcalibre HTML restyle (`_layout.css`, compact tables, credits footer). |
| `d0e91ce` | Impeccable to v4.8.0. |
| `485c829` | Per-student ECD session report (`ecdReport` on session / learner-feedback / teacher-report). |
| `9325f1f` | CTT/IRT SVG axes (boxed panel, ticks, labels, grid). |
| `cfe5df6` | Cumulative ECD reports: student strengths, classroom focus, curriculum plan. |
| `0494d90` | Percentile rank (midrank) and P10–P90 of per-student means. |

Navigation (unchanged paths, new documents on them):

- Session: Delivery → Sessions → Report (staff) or Delivery → Reports (student).
- Cumulative student: Delivery → Reports, above the session list.
- Classroom: teacher Delivery → Classroom.
- Curriculum: admin Results → Curriculum; district Delivery → Curriculum.
- CTT/IRT HTML: Results → Psychometrics / Delivery → Parameter estimation. Re-enqueue to see restyled charts.

Live numbers on `:6060` (JSON store, unstamped sim roster): 600 students, 600 closed sessions, 6900 scored; cumulative mean 49.4%. Competencies: Fraction equivalence 47.7%, Names the function 48.3%, Plant-part naming 52.3%. stud1 session history: Secure 100% on Plant-part naming, PR 99.2 (top quartile) among 600.

## Half-applied work

None in the scoring path. No migration. Cumulative builders are complete. Percentile helpers are not exported (repoGuards: tests do not count as callers).

## Compression debt

Several reporting slices shipped in one continued session after the templates close. None of them is a never-compress calendar unit. Recorded so the next calibration does not treat this as one D-unit.

Existing ingested CTT/IRT HTML remains frozen until those jobs are re-enqueued. That is the artefact contract, not unfinished code.

## What was not done

D156. Mounting `aigRoutes.js` (D157). Publishing a new `rvkmar/r-backend` image. CAT in R. Word output. T1–T28 / TU1–TU27. Reopening D129. Re-enqueuing old CTT/IRT jobs so ingested HTML picks up chart axes. Rebuild of Hub `r-backend` (compose bind-mount is enough locally after `docker compose restart r-backend`).

## Rollback

Revert `7ca4935`…`0494d90` for the product (keep `f73d74d` if the live-walk R fixes should stay). Revert this close commit for the recording. No live store schema mutation.

## Verification

On the product tree `0494d90` (clean, ≡ `main/master` before this close):

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  342 passed (342)
  Tests  2924 passed | 6 skipped (2930)
  Duration  242.43s

npm run build
  green (27.09s). Largest JS chunk
  EvidenceModelBuilder-DTmNPqUQ.js 371.78 kB (gzip 82.67 kB).
  CumulativeEcdReport-CyqOUCjG.js 20.04 kB (gzip 4.76 kB).
  StudentEcdReport-CSr8WCwE.js 10.40 kB (gzip 2.98 kB).
  PsychometricsDashboard-BShTqDX4.js 56.14 kB (gzip 14.16 kB).
```

+22 tests vs the Iteman/Xcalibre recording close (2902 passed / 4 skipped). Skip count 6 is as-run.

Live `:6060` was rebuilt (`node` + `nginx`) for the session, cumulative, and percentile walks.

## Calendar

Not a calendar unit. Last completed calendar unit stays **D155**. Next remains **D156** (AIG generator bound to templates), unmarked. Calendar search was skipped at close; dates were not moved. W31 stays closed. W32 not started.

## Next

Re-calibrate before D156. Do not start D156 from this close. Do not mount `aigRoutes.js` until D157.

T1–T28 remainder stays recorded, not started. Re-enqueue CTT/IRT jobs only if a reviewer needs the restyled axes on already-ingested HTML.
