# D65 — Calibration console UI (W13 block gate)

**Status: DONE in UI + component/route tests.** An administrator can start,
watch, inspect, and ingest a calibration job from `/admin/calibration`
without a shell. Live browser walk on the operator's localhost is deferred
to the coordinator (password `WalkPass!2026` after merge). R is still not
on any session path (ADR 0001).

## Exit check

| Check | How it was met |
|---|---|
| Administrator can start a job | Enqueue form posts `{ fixture: "lsat7", kind: "irt-parameters", evidenceModelId, statisticalModelId }`. The server expands the published LSAT7 matrix. The form does not invent item parameters. |
| Watch | `useCalibrationJobs` / `useCalibrationJob` poll every 2s while any job is `queued` or `running`. The list shows status transitions; a live region announces watching. |
| Inspect | Detail shows request summary (family/subtype, item×person counts, seed, item ids), response (parameters / SEs / fit / packageVersion / sampleSize / converged), and `error.stderr` when failed. |
| Ingest | Ingest is offered on `succeeded` jobs that are not yet ingested. A `converged: false` run is still clickable; the 409 is shown in an alert and the UI does not claim a parameter set was written. |
| Discoverable | Admin Control Center has a **Calibration** tab (Q-Matrix pattern) in addition to `/admin/calibration`. |
| District | Read-only tab + `/district/calibration`. No enqueue / cancel / retry / process / ingest. |
| Students / teachers | No route, no tab, no `calibrationJobs` view permission. |

## What shipped

- `src/components/calibration/*` — list, enqueue form, detail, status badge, poll helpers.
- `src/pages/CalibrationConsolePage.jsx` — addressable page with a back link.
- Admin tab on `AdminPage`; district tab on `DistrictDashboard`.
- `useProcessCalibrationJob` next to the D62 hooks. Compose sets
  `CALIBRATION_QUEUE_AUTORUN=1`, so enqueue already kicks the worker there.
  Local `npm run dev` and the test suite leave autorun off; Process is the
  operator action those environments need. A Process click on a job the
  autorunner already picked up surfaces the existing 409 (`Job is 'running'`
  / `'succeeded'`).
- `useIngestCalibrationJob` now also invalidates `evidenceModels` so an
  open Evidence Model workspace sees the new parameter set.
- Tests: `CalibrationConsole.test.jsx` (happy path + non-converged 409 +
  failed stderr + district read-only) and `calibrationConsoleRoutes.test.jsx`
  (wiring + ProtectedRoute isolation). RBAC cases added to
  `rolePermissions.test.js`.

No change to the live LSAT7 CI job.

## Autorun vs Process

Investigated `kickQueue()` in `server/r/calibrationWorker.js`:

- `CALIBRATION_QUEUE_AUTORUN=1` (compose) → `setImmediate(processQueuedJobs)`.
- Otherwise enqueue only writes `queued`. Tests and a bare Node process stay
  in that mode on purpose so a missing R service cannot race assertions.

The console therefore always offers Process on a queued job. It is not a
second calibrator; it is `POST /api/calibrationJobs/:id/process`.

## Honest remaining gaps

- Live operator walk (start → watch against running R → ingest) is not
  executed in this environment. Coordinator walk after merge.
- Live D62 restart recovery is still unwalked.
- D66 / D67 DINA and CTT endpoints remain 501.
- `renv.lock` is still absent; `/health` on `rvkmar/r-backend:latest` is
  the version record.
- Assembly Models is still a dedicated admin route without an Admin tab
  (pre-existing; this unit did not change it).

## How to verify

```bash
npx vitest run src/components/calibration/__tests__/CalibrationConsole.test.jsx \
  src/pages/__tests__/calibrationConsoleRoutes.test.jsx \
  src/config/__tests__/rolePermissions.test.js

# Full suite at this close: 1311 passed / 1 skipped (live LSAT7 describe).
# `npm run build` green (chunk warning still D74).
```

On a stack with compose autorun + an admin token: open `/admin` → Calibration
(or `/admin/calibration`), bind an IRT evidence model, Enqueue LSAT7, wait or
Process, Inspect, Ingest. A non-converged job must 409.

## Next

Calendar D66 / D67 (DINA / CTT endpoints) are out of scope. W13 gate is this
console.
