# D64 — LSAT7 through the full calibration pipeline in CI

**Status: DONE.** The published LSAT7 matrix is a committed fixture. `npm test` always
runs enqueue → process → ingest on it (contract-path stub for the R body). CI job
`lsat7-pipeline` starts the same published R image compose uses and asserts a live
mirt run reaches `succeeded` + `converged: true` and writes a parameter set with
`calibrationJobId`.

D65 (calibration console UI) was not started.

## What LSAT7 actually is

`mirt::LSAT7` is Law School Admission Test **section 7**: **1000 examinees × 5
dichotomous items** (Bock & Lieberman 1970). The 7 is the section number, not the
item count. A 1000×7 matrix would not be this dataset; this unit uses the published
5-item matrix.

Source of truth: `r-backend/app/tests/fixtures/lsat7-frequency-table.json` — 32
response patterns + frequencies (`psych::bock.table` column `Ob7`, the same table
`expand.table(mirt::LSAT7)` expands). Published correct-counts that the fixture
test pins:

| Item.1 | Item.2 | Item.3 | Item.4 | Item.5 |
|---|---|---|---|---|
| 828 | 658 | 772 | 606 | 843 |

## What shipped

- `server/r/lsat7Fixture.js` expands the table into an ADR 0002 IRT-2PL request
  (`seed` 20261120). `POST /api/calibrationJobs` accepts `{ fixture: "lsat7" }`
  and fills `request.model` / `responseMatrix` / `options.seed`. That is the
  production caller (the dead-export guard does not count tests).
- `samples/sample-calibration-job-irt-lsat7.json` — curl-ready POST body (fill
  `evidenceModelId` / `statisticalModelId`). A drift test keeps it equal to the
  fixture expansion.
- `server/r/__tests__/lsat7Pipeline.test.js`
  - **Always-run:** fixture authenticity + contract-valid request + HTTP enqueue
    + worker + ingest. The R body is `lsat7ContractStubResponse()` with
    `packageVersion: "contract-stub (not mirt)"` so it cannot be mistaken for
    a psychometric result.
  - **Live (`R_BACKEND_URL` set):** `GET /health` must report `mirt`, then the
    worker calls real `postCalibration` → `/calibrate/irt`. Asserts
    `status: succeeded`, `converged: true`, `sampleSize: 1000`,
    `packageVersion` matches `/^mirt /`, each item has `a > 0`, and Item.5
    (easiest) has a lower `b` than Item.4 (hardest). Ingest writes
    `parameterSets[]` with `calibrationJobId`.
- `.github/workflows/ci.yml` job `lsat7-pipeline` — investigated first: the
  existing `build-and-test` job only runs `npm test` and never starts
  `r-backend`. The new job pulls `rvkmar/r-backend:latest`, bind-mounts
  `./r-backend/app` (same as compose; does not `docker compose build`), waits
  on `/health`, then `R_BACKEND_URL=http://127.0.0.1:4000 npx vitest run
  server/r/__tests__/lsat7Pipeline.test.js`.

R is still not on any session path (ADR 0001). No D65 UI.

## Live CI findings

1. `GET /health` returned `status: ["healthy"]` — plumber/jsonlite boxed a
   length-1 character vector. Fix: `serializer_unboxed_json()`,
   `jsonlite::unbox` on health, `unboxPlumberScalars()` on the Node client.
2. Next run got past health with a real **1000×5** matrix, then
   `succeeded` + `converged: false` because mirt 1.47 rejected
   `technical = list(TOL=...)`. `TOL` is a top-level `mirt()` argument;
   `NCYCLES` stays in `technical`. Not a psychometric stub.

## How to re-run

```bash
# Always-run half (no R)
npx vitest run server/r/__tests__/lsat7Pipeline.test.js

# Live half — compose default image + app mount, or the CI docker run
# docker compose up -d r-backend   # plus a local override that publishes 4000
R_BACKEND_URL=http://127.0.0.1:4000 npm run test:lsat7
```

Enqueue by hand (admin token):

```bash
# POST /api/calibrationJobs  body: samples/sample-calibration-job-irt-lsat7.json
# POST /api/calibrationJobs/:id/process
# POST /api/calibrationJobs/:id/ingest
```

## Honest remaining gap

This environment has no Docker and no R, so the **live** mirt run was not
executed here. The contract-path tests were (`npx vitest run` — **1293
passed / 1 skipped** / 81 files; the skip is the live describe). CI is
the place the live acceptance is supposed to run. If
`docker pull rvkmar/r-backend:latest` fails on GitHub (private image or
Hub rate limit), `lsat7-pipeline` fails honestly — it does not skip or
invent estimates.

Live D62 restart recovery and the D65 console are still open.

## Next

Calendar **D65** — `/admin/calibration` console (hooks exist, no screen).
