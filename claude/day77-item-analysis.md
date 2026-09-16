# D77 — item-analysis → analysisArtefacts (W16)

**Status: DONE** for the calendar exit check: TAM item analysis on the
published LSAT7 matrix writes an `analysisArtefacts` row; authority vs
CTT parameter sets is stated in R diagnostics; distractors are explicit
null on dichotomous data.

## Authority decision (must not drift)

1. **Operational CTT readiness** = job kind `ctt-statistics` →
   `parameterSets` (D67 TAM). Only this path may set
   `activeParameterSetId`.
2. **Dashboard item analysis** = job kind `item-analysis` →
   `analysisArtefacts` (D76). Informs only; never gates lifecycle.
3. **`classicalCalibration.js`** = provisional authoring approximation
   only; not authoritative once R artefacts / parameter sets exist.
4. Where quantities overlap on dichotomous data: artefact `pValue` ===
   CTT `difficulty` (published item mean); artefact `pointBiserial` ===
   CTT `discrimination` (TAM item-total rpb). Same `TAM::tam.ctt2`
   engine. Stated in `diagnostics.overlapWithCtt`.
5. Distractors: dichotomous 0/1 LSAT7 has no option-level distractors —
   each item sets `distractors: null` and `diagnostics.distractorsNote`
   explains (not silent).

## Exit checks

| Claim | Executed? |
|---|---|
| R family `item-analysis` + `calibrate_item_analysis` via TAM CTT helpers | **Yes** |
| Primary `POST /calibrate/item-analysis` + alias `POST /analyse/item` | **Yes** (live both HTTP 200) |
| Node `KIND_TO_R_PATH` + fixture `lsat7-item-analysis` + console bind | **Yes** |
| Contract-path enqueue → process → ingest → `analysisArtefacts` | **Yes** (always-run vitest) |
| Live TAM: pValue ≈ published means; Item.5 > Item.4; rpb in (0,1); `^TAM ` | **Yes** (`R_BACKEND_URL`) |
| CI `lsat7-pipeline` step for `itemAnalysisPipeline.test.js` | **Yes** (wired) |
| Nested EM `analysisArtefacts` stays empty; no parameter set written | **Yes** |

## What shipped

| Area | Change |
|---|---|
| `r-backend/app/modules/contract.R` | Family `item-analysis` |
| `r-backend/app/modules/calibrate.R` | Dispatch + `calibrate_item_analysis` (reuse `.run_tam_ctt` / `.ctt_parameters_from_tam` / `.kr20`; remap to `{ pValue, pointBiserial, n, distractors: NULL }`; diagnostics: method, overlapWithCtt, authority, distractorsNote, scoreForDiscrimination) |
| `r-backend/app/api.R` | Mount both paths; plumber serializer `null = "null"` so R NULL is JSON null (jsonlite default was `{}`) |
| `r-backend/app/modules/analytics.R` | Comment: item-analysis lives on calibrate path; this file stays unmounted stub |
| `server/r/calibrationContract.js` | Family + `KIND_TO_R_PATH["item-analysis"]` |
| `server/r/calibrationFixtures.js` / `lsat7Fixture.js` | Fixture `lsat7-item-analysis` |
| `src/utils/ecdVocabulary.js` | package `TAM`; bind `["ctt","irt","rasch"]` |
| `src/components/calibration/calibrationConsoleUtils.js` | Named fixture + console test |
| `samples/sample-calibration-job-item-analysis-lsat7.json` | Sample enqueue body |
| Tests + CI | `itemAnalysisPipeline.test.js`; `lsat7-pipeline` step |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  107 passed (107)
  Tests  1456 passed | 7 skipped (1463)
  Duration  ~37.4s

R_BACKEND_URL=http://127.0.0.1:4000 npx vitest run server/r/__tests__/itemAnalysisPipeline.test.js
  Tests  8 passed (8)  — live TAM 4.3.25; Item.4 pValue 0.606; Item.5 0.843; distractors null

docker compose up -d --build node; docker compose restart r-backend
Live R:
  POST /calibrate/item-analysis → 200 converged, distractors null, overlap/authority present
  POST /analyse/item            → 200 same handler
Live :6060:
  GET /api/analysisArtefacts unauthenticated → 401 (gate present)
  Admin enqueue walk blocked by seed-password gap (same as D61/D65)
```

## Honest gaps (not D77 blockers)

- No dashboard UI list for item-analysis artefacts yet (W17).
- `test-information` still enqueueable with no R path (D78).
- Calendar event `ka8j70orrva6umu249oacan7ns` not found via Google Calendar tool (optional mark skipped).

## Next

**D78** — Test information endpoint / remaining W16 analytics surface.
