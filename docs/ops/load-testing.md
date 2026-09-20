# Load testing record (D110)

Five scenarios measured because they are what break **this** application.
Full machine-readable record: `docs/ops/load-test-record.json`.
Re-run: `npm run load:rehearsal`.

## Configuration (shared)

| | |
|---|---|
| Production-shaped seed | `20260920` (D109 generator) |
| Bank | 1000 items, 480 sessions, 320 students, 8 districts |
| Samples per timing | 7 (2 warmup) unless noted |

## Recorded numbers

| # | Scenario | Metric | Value | Configuration highlights |
|---|---|---|---|---|
| 1 | Wizard autosave under latency | Perceived autosave median | **312.2 ms** | Draft PUT-sized body; **RTT 300 ms** simulated school network (half up / half down) + server write |
| 2 | Dashboard vs D109 bank | Dashboard-shaped scan median | **0.174 ms** | In-process reduce over 480 sessions / 320 students (same shape as `GET /api/reports/dashboard`) |
| 3 | Concurrent adaptive selection | Cohort wall-clock median | **0.047 ms** | **Cohort 30**; 50 IRT candidates; `Promise.all` over `selectNextActivity` |
| 4 | Composite library at activation | `buildCompositeLibrary` median | **0.226 ms** | TM `tm-prod-1`; **200** compiled items from D109 bank |
| 5 | Calibration queue pressure | Queue metrics median | **5 µs** | 24 queued + 1 running; `maxConcurrent=1`; **depthAlarm=true** (threshold 20) |

Server-only autosave write (no network) is also in the JSON record under
scenario 1 (`serverWrite.medianMs`) — the **recorded** number for exit
check is the perceived figure with RTT, because authors feel the RTT.

## Honesty notes

- Scenarios 2–4 are CPU/memory bound in-process; live HTTP adds storage
  round-trips (D74 live dashboard median was 15 ms on a 4-item bank).
- Scenario 5 records backpressure **decision** cost and that the depth
  alarm fires under stated queue depth — not end-to-end R job runtime.
