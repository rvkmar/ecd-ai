# Off-calendar: slim evidence model parameter sets

**Not D146.** Student ids and HTML reports were being copied onto authored Evidence Models.

Handoff id: day146am. day146aj, day146ak, and day146al are taken.

**Status: DONE.**

## What changed

Promoting a calibration onto an Evidence Model stored the full R `reportHtml` (about 35 to 43 KB) and `fitStatistics.personScores` (personIds, theta, and se for hundreds of students) on `statisticalModels[].parameterSets[]`. Three evidence models were about 316 KB.

`src/utils/slimParameterSet.js` is the one helper every writer uses. It removes:

- `reportHtml`
- `fitStatistics.personScores` and any other person-level fit or score rows
- sidecar payloads: `scores`, `scoresCsv`, TIF/IIF csv and grids, `responseMatrix`, `optionMatrix`, and `diagnostics.plots`

It keeps item parameters, standard errors, and scalar fit indices (global fit, item fit, KR-20, and the rest). When the caller knows a `calibrationJobId` or `analysisArtefactId`, and the set does not already cite it, the helper adds that reference.

Writers:

- `server/r/calibrationIngest.js` slims the parameter set before it is pushed. The calibration job response still holds the report and the person scores.
- `server/routes/evidenceModels.js` slims on recalibrate and on attach-seed. Create and update slim statistical models too, so a later save cannot put the blobs back.

Parameter Sets inspect no longer reads a report off the model. With `calibrationJobId` or `analysisArtefactId` it fetches the HTML report and the person scores from that job or artefact. With neither reference it shows `report not stored on this model` and does not render an inline copy.

Migration `015-slim-evidence-model-parameter-sets`:

- `--dry-run` reports evidenceModels byte savings and writes nothing.
- A real run copies `backups/db.json.pre-evidence-slim` and a `db.json.<timestamp>` crash copy.
- Before the file is rewritten, each stripped payload is stored on `analysisArtefacts` (kind `parameter-set-sidecar`), or an existing artefact is linked when its payload already matches.
- The store is checked, then a temp rewrite is checked. Only then does the temp file replace `db.json`.
- A second run with nothing left to strip writes no further artefact.

`analysisArtefactId` is an optional string on the parameter set, next to `calibrationJobId`.

## Deploy

1. Copy the live `db.json` aside.
2. `mongodump` the database, including `analysisArtefacts` and `calibrationJobs`.
3. Deploy this build.
4. Dry-run 015 and read the byte savings:

```
node server/migrations/run.js 015-slim-evidence-model-parameter-sets --dry-run
```

5. Run 015:

```
node server/migrations/run.js 015-slim-evidence-model-parameter-sets
```

6. Verify. `evidenceModels` is smaller. A parameter set still has item parameters, standard errors, and scalar fit, and it has no `reportHtml` and no `fitStatistics.personScores`. The cited analysis artefact still has the report and the person scores. `backups/db.json.pre-evidence-slim` is the pre-migration file.

## Rollback

Stop node. Copy `backups/db.json.pre-evidence-slim` over the ECD db file. The preserved analysis artefacts are additive. Leave them, or restore the `analysisArtefacts` collection from the mongodump taken before deploy. Start the previous build.

## What was not done

A live browser walk. This environment has no seeded database and no login. The Parameter Sets inspect fallback and the fetch-by-reference path were rendered in jsdom.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3013 passed | 13 skipped (3026). 353 files. 78.55s.
```

There is no lint script and no ESLint config.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

Not D146. Do not merge without an explicit OK.
