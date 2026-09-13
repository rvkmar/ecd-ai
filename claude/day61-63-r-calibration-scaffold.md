# D61–D63 — R calibration scaffold, job queue, ADR 0002 contract

**Status: DONE in tests and compose wiring.** Live `/health` was executed 2026-09-13 on the user's stack (`GET :4000/health` 200; versions in `claude/day61-63-live-r-health.md`). Live enqueue → process → ingest was still not walked.

Do not confuse with `claude/day61-staff-session-operate-and-assignment.md` (a D50 leftover).

## Exit checks

| Day | Exit check | How it was met |
|---|---|---|
| D61 | Container answers `/health` with exact package versions | `GET /health` is attached on the programmatic router; payload reads `packageVersion()` for `mirt`, `GDINA`, `TAM`, `difR`, `plumber`, `jsonlite`. Compose re-enables `r-backend` with `expose: "4000"`, `R_BACKEND_URL=http://r-backend:4000`, `depends_on`. |
| D62 | Job survives restart; failed job inspectable; no session path touches R | `recoverRunningJobs()` marks `running` → `failed` with `rClass: RestartRecovery` and stderr. Failed R calls store `{message, rClass, stderr}`. Guard test: no `server/delivery/**` import and no `/api/sessions` file reaches the R client. The live `/submit` call to `/irt/estimate` was removed. |
| D63 | Contract test both sides; non-converged fixture refused | Node and R read `r-backend/app/tests/fixtures/*.json`. `POST /api/calibrationJobs/:id/ingest` returns 409 when `converged: false` and writes no `parameterSets[]` entry. |

## What shipped

### D61 — R service scaffold

- `r-backend/Dockerfile` — originally `rocker/r-ver:4.4.2` + dated Posit snapshot `2025-01-15`. **Compose default is now `image: rvkmar/r-backend:latest`** (packages already installed); the Dockerfile is a thin `FROM rvkmar/r-backend:latest` overlay only. `install-packages.R` is optional/orphan.
- `start.R` sources `api.R` then `api$run(...)`. `api.R` does **not** call `$run()` and does **not** set CORS. ASCII comments only (no BOM, no fancy dashes).
- `/health` reports running package versions. `/irt/parallel-status` no longer calls `futures(drop=FALSE)` (that was the 500).
- `scoring.R` is neutralized and not sourced. `/score` and `/irt/estimate` are not mounted.
- Main compose uses `expose`, not host `ports`. A local override may still publish `4000:4000`.

`renv.lock` was **not** committed. Package versions come from the published image (`/health`); do not treat a local Posit rebuild as the pin.

### D62 — `calibrationJobs` seven-artefact contract

1. Schema block — `src/utils/schema.js` `calibrationJobs`
2. Validation — `validateEntity("calibrationJobs", ...)`
3. Lifecycle — `CALIBRATION_JOB_STATUS` / `canTransitionCalibrationJob` / `validateCalibrationJobLifecycle`
4. Routes + role gate — `server/routes/calibrationJobsRoutes.js`, admin write, district view
5. Vocabulary — `CALIBRATION_JOB_KINDS` in `ecdVocabulary.js`
6. Readiness mirror — `src/utils/calibrationJobReadiness.js` (independent of the server functions; agreement test)
7. Tests — schema, routes, worker, boundary guard, collection surface

States: `queued → running → succeeded|failed`; `queued → cancelled`; `failed → queued` on retry (increments `attempts`, refuses at `maxAttempts`).

Node R client: `server/r/rClient.js`. Worker: `server/r/calibrationWorker.js`. On node boot, running jobs are recovered; compose sets `CALIBRATION_QUEUE_AUTORUN=1`.

`POST /api/calibrate/:evidenceModelId` is **410**. It no longer calls `r-backend:8000` or writes `questions[].metadata`.

### D63 — ADR 0002 contract

Request/response version `1.0` on both sides (`server/r/calibrationContract.js`, `r-backend/app/modules/contract.R`). Ingest maps `{parameters, standardErrors, fitStatistics, converged, packageVersion, sampleSize, calibratedAt}` onto `parameterSets[]` with `calibrationJobId`. No reshaping.

A non-converged run is stored on the job (`status: succeeded`, `converged: false`) and **refused** at ingest.

## Live bugs closed

1. CORS preroute `function()` without `req,res` — gone (no CORS hook).
2. `plumber::plumb('api.R')` while `api.R` built a programmatic router and called `$run()` — replaced with source-then-run.
3. `/irt/calibrate` and `/irt/parallel-status` 500 — parallel-status no longer calls `futures()`; `/irt/calibrate` is an alias of the contract `POST /calibrate/irt`.
4. `calibrationRoutes.js` defaulted to port 8000 and wrote legacy metadata — retired.
5. UTF-8 BOM / fancy dashes — new `.R` files are ASCII.

## Remaining gaps (out of scope)

- ~~**D64** — LSAT7 through the full pipeline in CI.~~ see `claude/day64-lsat7-pipeline.md`
- ~~**D65** — calibration console UI (hooks shipped; no screen).~~ see `claude/day65-calibration-console.md`
- **D66 / D67** — DINA and CTT endpoints return contract-shaped 501.
- `renv.lock` is still absent; `/health` on `rvkmar/r-backend:latest` is the version record.
- Response-matrix size limit / sparse encoding / multi-tenancy (architecture doc §12) — not decided.

## Verify on Docker

Pull the published psychometric image (packages already installed) and start the stack. Compose bind-mounts `./r-backend/app` over `/home/app` so D61+ plumber routes win over whatever is baked in the image. Do **not** run `docker compose build r-backend` as the default path.

```bash
docker compose pull r-backend
docker compose up -d
```

A local `docker-compose.override.yml` may publish `4000:4000` and set `container_name: r-backend`. Main compose omits `container_name` so that override wins. Node still reaches the service as `http://r-backend:4000` (compose service name).

Optional overlay only: uncomment `build:` in `docker-compose.yml`, then `docker compose build r-backend`, to bake current `app/` onto `FROM rvkmar/r-backend:latest`. Not required for `compose up`.

Health (from the node container, or from the host if the override publishes 4000):

```bash
docker compose exec node wget -qO- http://r-backend:4000/health
# expect 200 + packages.mirt / packages.plumber / ...
```

Enqueue a tiny IRT job (admin token), then process and inspect:

```bash
# POST /api/calibrationJobs  body: samples/sample-calibration-job-irt-tiny.json
#   (fill evidenceModelId / statisticalModelId)
# POST /api/calibrationJobs/:id/process
# GET  /api/calibrationJobs/:id   -- succeeded or failed, error.stderr if failed
# POST /api/calibrationJobs/:id/ingest
# A fixture with converged: false must 409 and leave parameterSets[] unchanged.
```

Tests: `npx vitest run` — 1287 passed at this close, including the new contract, worker, ingest, and boundary files.
