# Session close — D144 Q-matrices stay the DINA store

**Closed 2026-10-15.** A Q-matrix keeps its id, its competency-model binding, and `/api/qMatrixModels`. An optional `domainAnalysisId` is set only when that analysis already exists.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D144 | A recorded dry-run precedes any write. Every existing Q-matrix keeps its id, competency-model binding, and DINA resolution. Knowledge–task labels stay statements. The Admin screen may move. The API still resolves | **DONE** |

Live `/data/db.json` in the node container, after `docker compose up -d --build node nginx`. The dry-run of `007-qmatrix-domain-analysis-link` ran first and printed: “No Q-matrices in this store. Nothing to re-home.” The apply that followed wrote only the migration log, at `2026-10-15T15:18:16.917Z`. No id, `competencyModelId`, or entry was rewritten. No Domain Analysis was created.

The link itself is the route and schema tests, because the live store had nothing to re-home. A matrix `qm1` bound to `cm1` stays that way through a dry-run and an apply. `structureConfig.qMatrixId` still names `qm1`. A knowledge–task row stays `{ label }`. `POST /api/qMatrixModels` accepts `domainAnalysisId` `da1` when that analysis exists and refuses `da-nope`. `GET /api/qMatrixModels/qm1` returns 200.

Admin → Diagnostic design stayed. The tab is still named Diagnostic design. A saved Domain Analysis offers “Author a Q-matrix for this analysis”, which opens that tab with `?domainAnalysisId=`. On `:6060` the live store is empty, so Diagnostic design shows “No Q-matrices yet” and the new Domain Analysis form has no saved analysis to link.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2177 passed | 9 skipped (2186)
  Test Files 222 passed
  179.91s, exit 0
  (the product run earlier the same day was the same count)

npm run build
  green (1m 2s). Largest JS chunk recharts 488.42 kB (gzip 139.42 kB).
  index-Bytq9zZo.js 33.18 kB; schema-bTCViPUX.js 49.72 kB.
```

Product commit `2a2a5c7`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar asked to re-parent the Q-matrix under Domain Analysis, mint a default analysis per competency model, and redirect the old route. DINA resolves `structureConfig.qMatrixId` on `/api/qMatrixModels`, so a redirect that drops the id breaks scoring. `knowledgeTaskRelationships` are `{ label }` and refuse `qMatrixId`. Competency models have no `domainAnalysisId`. ADR 0012 keeps the collection. Migration `007` is a recorded no-write: it compares the store before and after and throws if anything changed. The optional `domainAnalysisId` fails validation when the analysis is missing. The editor still requires `competencyModelId`.

## Half-applied work

None. The live set was empty, so the apply did not rewrite some matrices and leave others. No analysis was invented to hold them. Diagnostic design is still the authoring screen, which is the condition for leaving the route where DINA reads it.

## Compression debt

None new. Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through

The empty live file at calibration (14:28Z) replaced an earlier draft Domain Analysis. That is a store fact, not compression debt. This close did not restore it.

## Calendar

D144 marked ✅. The 2027-03-16 date was not moved.

## Next

D145, alone. Never-compress walk. W29 is not closed: an author still cannot start at a Domain Analysis and reach a Competency Model. D146 and D150 stay never-compress. Do not start D145 here.
