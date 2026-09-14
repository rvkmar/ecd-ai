# D68 — calibrated supersedes pilot (never-compress)

**Status: DONE.** Product is the D68 commit on this close. Calibrated
parameters already won for *new* delivery (D38). What was missing — and
what this unit actually closed — is **switchover**: an in-flight session
must not be retagged when an active parameter set appears or moves.

R is still not on any session path (ADR 0001). CTT `operational` lifecycle
walk was **not** this unit (D71). DIF / equating remain 501 (D69 / D70).

## Exit check

| Plan exit check | What was actually executed |
|---|---|
| A posterior recomputed from `session.responses` alone still reproduces exactly, across a parameter-set switchover; a session scored on pilot and one scored on calibrated neither silently rescores the other | **Met in tests.** HTTP switchover in `d68CalibratedSupersedesPilot.test.js`: (1) pilot-opened session stays `parameterSource: "pilot"` after ingest; posterior remains supported and does not equal the posterior you would get by retagging the same responses as the new calibrated set. (2) calibrated-opened session keeps the **opening** `parameterSetId` after `activeParameterSetId` flips; mixed-set retag is what accumulation already refuses. (3) a **new** session after ingest scores calibrated, not leftover Step 7 pilots. Accumulation already pinned calibrated history vs a later active set (D39). Schema no longer requires a stored `parameterSetId` to equal the *current* active set — only that the cited set still exists on the Evidence Model. |

Browser: `stud1` / `WalkPass!2026` at `/student` listed `s1789288355960` and
`s1789288381307`; player for the first still opens (already stopped:
"Measurement target met"). Mid-flight ingest was **not** walked live on
`:6060` (needs a two-item pilot session plus ingest in that deployment).
The switchover itself is the HTTP tests.

## What the plan assumed, and what the code was

Calibration (2026-09-14) rewrote this unit before it ran. The 2026-09-03
tasks said "wire calibrated values through Step 7." Submit and selection
already preferred `activeParameterSetId` over Step 7 / `dinaParams`. The
quiet hole was the *next* submit on an in-flight session: it followed the
live preference, mixed `pilot`+`calibrated` (or `ps1`+`ps2`), and
`accumulateEvidence` refused the whole posterior.

D49c had a test that *required* that mix: "flipping `activeParameterSetId`
takes effect on the next score" in the **same** session. Restated: the
flip takes effect on a **new** session; the in-flight session stays on
the opening set; the composite library is still untouched (ADR 0003).

## D50 keying decision

Calibrated IRT parameters are keyed by **`observableId`**. Distinct item
difficulties require distinct observables. Three items sharing one
observation correctly share one `(a, b)` — that D50 walk was a fixture
with one observable, not a reason to key IRT by item. DINA stays keyed
by **item id**. If an R job keyed columns by `model.itemIds` and there is
no observable key, lookup falls back to `itemId` so ingest is not
silently unused. When both keys exist, observable wins
(`calibratedIrtParams`).

## What shipped

- `server/delivery/parameterSourceResolution.js` — freeze per Evidence
  Model from `session.responses`; `chooseSubmitParameterBinding` used by
  submit.
- Submit + IRT/DINA selection honour freeze (pilot stays pilot after
  ingest; calibrated stays on the opening `parameterSetId`).
- `schema.js` session provenance: a calibrated pointer must resolve to a
  set that still exists, not necessarily the currently active one.
- D49c parameter-flip test restated (new session vs mid-flight).

## Session-close verification (2026-09-14 IST)

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1350 passed / 4 skipped** (87 files). Skips: live LSAT7, two live sim10GDINA describes, live CTT when `R_BACKEND_URL` is unset.
- `npm run build` — Vite 7.3.6, **27.43s**. Chunk warning remains (`index-4BMHM0La.js` 2,272.82 kB / gzip 633.36 kB) — D74.
- Live R not involved. Player regression on `:6060` as above.

## Honest remaining gaps

- Mid-flight ingest not demonstrated in the live `:6060` deployment.
- `classicalCalibration.js` still emits provisional IRT. File-import CTT
  and a CTT Evidence Model reaching `operational` stay D71 / D77.
- Parameter-set diff UI still not started (D65 leftover).
- DIF and equating job kinds remain declared and unimplemented (D69, D70).
- Dual-attribute *selection* hole from D60 is unchanged.

## Next

Calendar **D69** — DIF (`difR`) as a job kind. Never-compress. Then D70
equating / W14 close. Do not start D69 on a thin budget.
