# Off-calendar: Iteman/Xcalibre live walk (day146ah leftovers)

**Not D156.** Discharges the live R HTML and `:6060` walk left open on `claude/day146ah-offcal-iteman-xcalibre-templates.md`. Product on `de19dd0` plus the three R fixes below.

**Status: DONE.**

## Exit checks (executed)

| Check | Result |
|---|---|
| Live CTT job with operational Iteman template produces HTML | **Yes** — `job1793294039843006` (`lsat7-ctt`, template `prt1793293656800000`). CSEM, KR-20, credits, stamp `template Walk Iteman CTT`. |
| Live IRT job with operational Xcalibre template produces HTML | **Yes** — `job1793293875202004`. T-Rpbis, empirical IRF, credits, `Walk Xcalibre IRT`. Ingested `ps1793293895203`. |
| Live MCQ item-analysis HTML | **Yes** — `job1793293874775002` / `aa1793293895398`. Option Mean/SD, omit and notAdministered rows, domain rpb, CSEM, credits. |
| Live TIF HTML + CSV | **Yes** — `job1793294040102007` / `aa1793294058816`. Credits, template in stamp, TIF CSV sidecar. |
| Person scores + district aggregate | **Yes** — scores rows with `domain.algebra` / `domain.geometry`. Aggregate HTML title Walk Iteman CTT, `n gated at 5`, meanRaw 2.05, n=20 not suppressed. |
| Student audience | **Yes** — `stud1` GET artefact scores **403**, GET psychometricReportTemplates **403**. Student stays on SessionReport. |
| `:6060` Psychometrics | **Yes** — Report templates tab lists both operational rows. Calibration Adopt shows Walk Xcalibre IRT on LSAT7 and Walk Iteman CTT on LSAT7 CTT. Open HTML opened the TIF blob with Software and packages. |

Ids: `claude/day146ah-walk-result.json`. Login `admin1` / `WalkPass!2026`. Frontend `index-CKvQEtqs.js`. R was restarted so bind-mounted G–J modules loaded (container had been sourced before that commit).

## What the leftover found

- **`calibrate_ctt` had no `reportHtml`.** Item-analysis did. LSAT7 CTT returned `No HTML report on this job.` Added the Iteman builder, scores, credits, and frozen template on the CTT path. Ingest parameters stay `difficulty` / `discrimination`.
- **Unused flags fired on omit / not-administered** even at n=0. Skip those roles in `.item_flags`.
- **TIF stamp omitted the template name.** Added. Heading stays “Test information technical report” (the Xcalibre skin title is “IRT calibration”).
- First MCQ job before the R restart was the pre-G-J HTML. After restart the statistic classes and credits are present.

Did not remount `/score`. Did not start D156. Did not `docker compose build r-backend`.

## Next

D156 still needs its own calibration. Hub `rvkmar/r-backend:latest` still needs a restart (or a later image) to pick up bind-mounted modules; compose already mounts `./r-backend/app`.
