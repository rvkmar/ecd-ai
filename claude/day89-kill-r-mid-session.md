# D89 — Failure isolation: kill R mid live session (W18 gate)

**Status: DONE.** Never-compress destructive proof on `:6060` + compose
`r-backend`. Delivery, scoring, and accumulation continued while R was
dead; calibration failed with a recorded reason; after restart the queue
drained and a new LSAT7 job succeeded.

## Premise on contact

Calendar: start a live session walk and kill the R container mid-session.

Code already had ADR 0001 boundary guards (`rBoundaryGuard.test.js`) and
D86 `killRBackend` for **job timeouts**. Neither is this unit. D89 is the
live isolation proof: break the container during examinee work and watch
what survives.

No product code change required.

## Exit check

| Claim | Executed? |
|---|---|
| Kill R mid live session | **Yes** — `docker kill r-backend` after response 1 on `s1789650266626` |
| Delivery / scoring / accumulation unaffected | **Yes** — response 2 (`t-d56-3` / `itemA2`) HTTP 200 while R down; attrA posterior updated (0.82 → 0.95 across the walk); `next-task` still ranked |
| Calibration / analytics degrade only | **Yes** — `job1789650388836001` process while R down → `failed` with `{ message: "fetch failed", rClass: "TypeError" }` (HTTP 409) |
| Recovery: jobs fail with reason; queue drains | **Yes** — failed job kept its reason; after `docker start r-backend`, `job1789650399935002` auto-ran to `succeeded` / `converged: true` / `mirt 1.47`; queue-metrics `queued:0 running:0` |
| Post-recovery delivery still works | **Yes** — response 3 on `t-d56-2` after R returned |

## Live protocol (2026-09-17)

Stack: nginx `:6060`, node `ecd-node`, mongo, `r-backend` (compose name).

1. Created BN adaptive session `s1789650266626` for `stud1` (tasks
   `t-d56-1`…`t-d56-4`, policy `p-bn`). Staff Play → `in_progress`.
2. Student submit #1 (`t-d56-1` / `itemA` / `opt_a`) with R healthy →
   posterior `attrA` ≈ 0.82.
3. `docker kill r-backend` → `/health` unreachable.
4. Student submit #2 (`t-d56-3` / `itemA2`) → 200; session still
   `in_progress`; `next-task` returned `t-d56-2`.
5. Enqueued LSAT7 on `em1789318941967` / `sm-irt-2pl`, then processed with
   R dead → job **failed** with fetch/TypeError reason.
6. `docker start r-backend` → healthy (plink 1.5.1) within a few tries.
7. New LSAT7 job succeeded (`mirt 1.47`); queue empty.
8. Student submit #3 still worked (3 responses, no stop yet).

## What this does **not** claim

- UI click-through (API walk is the behavioural gate; same session APIs
  the player uses).
- That every in-flight calibration is auto-retried (failed job stays
  failed with reason — correct; operator re-enqueues).
- D90 adversarial review of the R track.

## Verification (suite)

```
npx vitest run server/r/__tests__/rBoundaryGuard.test.js
  2 passed

npx vitest run
  1605 passed | 9 skipped

npm run build
  green; recharts 451.37 kB
```

Live kill evidence above is the gate; the suite only re-confirms the ADR 0001 import boundary.

## Next

**D90** — never-compress adversarial R track + W18 handoff (separate Agent).

## Calendar

Mark **D89** ✅ with real date **2026-09-17**. W18 gate closed.
