# D76 — analysisArtefacts collection (W16)

**Status: DONE** for the calendar exit check: artefact round-trips with
provenance; D48 collection guard passes; mutate refused; DIF/equating
ingest writes the top-level collection (not nested on the Evidence Model).

## Premise on contact (rewritten)

The 2026-09-03 calendar assumed a greenfield collection. By D69/D70 the
code already appended nested `evidenceModels[].analysisArtefacts[]` on
DIF/equating ingest, with no schema field, routes, or immutability.
D76 **promoted** that write to a first-class collection and stopped the
nested path — not a second write home.

## Exit checks

| Claim | Executed? |
|---|---|
| Artefact round-trips with full provenance | **Yes** — ingest → `GET /api/analysisArtefacts` (tests + live empty list) |
| D48 collection guard passes | **Yes** — schema + mount + `rolePermissions` + route gate |
| Mutate refused | **Yes** — PUT/PATCH/DELETE/POST → 405; schema immutability; live PUT → 405 |
| DIF/equating ingest targets the collection | **Yes** — contract-path pipelines assert `db.analysisArtefacts` and empty nested array |

## What shipped

| Area | Change |
|---|---|
| `src/utils/schema.js` | `analysisArtefacts` block + validateEntity (kind, jobId, scope, provenance, payload, immutability) |
| `src/utils/ecdVocabulary.js` | `ANALYSIS_ARTEFACT_KIND_VALUES`; comment corrected (no longer “ingest into nothing”) |
| `src/utils/analysisArtefactReadiness.js` | Artefact-6 readiness mirror |
| `server/r/calibrationIngest.js` | Analysis kinds write `db.analysisArtefacts[]`; response keeps aliases (`analysisArtefactId`, `parameters`, …) |
| `server/routes/analysisArtefactsRoutes.js` | GET list/id; POST/PUT/PATCH/DELETE → 405 |
| `server/index.js` | Mount `/api/analysisArtefacts` |
| `src/config/rolePermissions.js` | Admin + district `canView` |
| `src/api/queries/analysisArtefacts.js` | Read-only React Query hooks |
| `src/utils/db-server.js` | Default `analysisArtefacts: []` |
| Tests | `analysisArtefactsRoutes.test.js`; DIF/equating pipelines; collectionSurfaceGuard |

Shape stored:

```
{ id, kind, jobId, scope{evidenceModelId, taskModelId, cohort},
  packageVersion, sampleSize, computedAt, payload, createdAt }
```

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  106 passed (106)
  Tests  1447 passed | 6 skipped (1453)
  Duration  ~34.2s

Live :6060 after docker compose up -d --build node:
  admin GET /api/analysisArtefacts → 200 []
  admin PUT /api/analysisArtefacts/x → 405 immutable
  stud1 GET /api/analysisArtefacts → 403
```

## Honest gaps (not D76 blockers)

- No UI list for artefacts yet (W17 dashboards).
- `item-analysis` / `test-information` still enqueueable with no R path (D77/D78).
- Nested `em.analysisArtefacts` from any pre-D76 ingest (none in this deployment) are orphaned — not migrated automatically.

## Next

**D77** — Item analysis endpoint (`/analyse/item`) via mirt/TAM; authority vs CTT parameter sets stated explicitly.
