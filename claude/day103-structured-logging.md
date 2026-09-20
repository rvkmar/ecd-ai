# D103 — Structured logging + request-id propagation

**Status: DONE.** Calendar unit **D103** complete 2026-09-20.

## Premise on contact

Calendar: structured JSON server logs with a request id at the edge,
propagated through scoring/persistence and into the R client so a
calibration job can be traced to the enqueue request. Explicitly log
auth failures, lifecycle transitions, force-deactivate, bulk-upload
failures. Hard rule: no student response content and no personal data —
ids only.

**Code at calibration:** D101 already emits `X-Request-Id` and stores
request id / actor in ALS (`auditContext`). No structured logger; R
client did not forward the request id; session submit had no trace
events.

**Became:** `server/utils/logger.js` (JSON lines + hard redaction);
session submit start/scored/persisted; auth/lifecycle/force-deactivate/
bulk.failure; R client `X-Request-Id` + `r.request` log; calibration
jobs persist `requestId` and the worker re-enters ALS via `runWithAudit`.

## Exit check

| Claim | Executed? |
|---|---|
| One request id traces a session submit from the edge through scoring to persistence | **Yes** — `d103StructuredLogging.test.js` asserts the same `requestId` on start → scored → persisted |
| A test asserts no log call receives a response body or a student name | **Yes** — redaction test; R client header + `r.request` share the same id |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1750 passed | 9 skipped (1759) — 151 files (~184s)

npm run build
  green (recharts 451.37 kB) — 8.64s
```

## Delivered

| Area | Change |
|---|---|
| `server/utils/logger.js` | JSON log + redaction; `__testing__.setLogSink` for capture |
| `sessionRoutes.js` | `session.submit.start` / `.scored` / `.persisted` |
| `usersRoutes.js` | `auth.failure` |
| `auditLog.js` | `lifecycle.transition` on save audits |
| `taskModelsRoutes.js` | `taskModel.force_deactivate` + bulk.failure |
| CM/EM/items bulk routes | `bulk.failure` |
| `rClient.js` | `X-Request-Id` header + `r.request` log |
| `calibrationJobsRoutes.js` + worker | persist/propagate `job.requestId` via `runWithAudit` |
| `auditContext.js` | re-export `runWithAudit` for worker/tests |
| `schema.js` | document optional `calibrationJobs.requestId` |
| Tests | `d103StructuredLogging.test.js` |

Redacted field names include (case-insensitive): password variants,
`response`/`responses`/`rawAnswer`/`answer`/`scoredValue`/
`selectedOptionId`/`workProduct`, and PII keys `name`/`displayName`/
`studentName`/`fullName`/`email`/`emisId`/`apaarId`/`udise`.

## Next

Calendar **D104** — health, readiness, metrics + client error tracking.
W21 gate still at **D105** (one-query promotion provenance).
