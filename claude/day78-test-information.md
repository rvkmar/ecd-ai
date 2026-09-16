# D78 — test-information → analysisArtefacts (W16)

**Status: DONE** for the calendar exit check: analytic Fisher I(θ) on a
known 2PL parameter set matches hand-verified values at θ∈{−1,0,1};
KR-20 on the same dichotomous matrix matches the classical CTT formula
(`.kr20` / JS twin). Artefacts inform only — never `activeParameterSetId`.

## Authority decision (must not drift)

1. **Operational IRT readiness** = job kind `irt-parameters` →
   `parameterSets`. Only this path may set `activeParameterSetId`.
2. **Test information** = job kind `test-information` →
   `analysisArtefacts` (D76). Informs only; never gates lifecycle.
3. **Reliability**: `fitStatistics.kr20` is classical KR-20 on the
   response matrix (same `.kr20` as `ctt-statistics` / `item-analysis`).
   I(θ) and `marginalReliability` are IRT quantities. Both are stated in
   `diagnostics.reliabilityNote` — do not conflate them.
4. **Formula**: analytic Fisher matching `src/.../irtEngine.js`
   `itemInformation` / `testInformation` (when c=0: Σ a²P(1−P)).
   **Not** `mirt::testinfo`. Known-parameter path uses
   `model.parameters` / `options.sourceParameters` with no mirt fit.
   LSAT7 structural path fits mirt 2PL then applies the same formula to
   fitted coefs — do **not** pin LSAT7 I(θ) numerically.

## Hand-verified I(θ) (known 2PL fixture)

Items (c=0): A a=1 b=0; B a=1.5 b=−0.5; C a=0.8 b=0.5.

| θ | I(θ) |
|---|---|
| −1 | 0.800728111220 |
| 0 | 0.894030613239 |
| 1 | 0.544459185512 |

Hand KR-20 on the committed 10×3 matrix: **0.35**.

## Exit checks

| Claim | Executed? |
|---|---|
| R family `test-information` + `calibrate_test_information` | **Yes** |
| Primary `POST /calibrate/test-information` + alias `/analyse/test-information` | **Yes** (live known-2pl HTTP 200) |
| Node `KIND_TO_R_PATH` + fixtures `known-2pl-testinfo` + `lsat7-test-information` + console | **Yes** |
| Contract-path enqueue → process → ingest → `analysisArtefacts`; nested EM empty | **Yes** (always-run vitest) |
| Live known-2pl: checkpoints −1/0/1 within 1e-6 of hand; KR-20 = 0.35 | **Yes** (`R_BACKEND_URL` + `:6060`) |
| Live LSAT7 structural: info>0 at checkpoints; KR-20 ≈ JS twin (0.4542) | **Yes** (vitest live) |
| CI `lsat7-pipeline` step for `testInformationPipeline.test.js` | **Yes** (wired) |

## What shipped

| Area | Change |
|---|---|
| `server/r/fixtures/known-2pl-testinfo.json` (+ R twin) | Known 2PL params, hand I(θ), hand KR-20, tiny matrix |
| `server/r/known2plTestinfoFixture.js` | Named fixture loader |
| `r-backend/.../calibrate.R` | Dispatch + `calibrate_test_information` |
| `r-backend/.../api.R` | Both paths; serializer `digits=16` (precision for 1e-6 exit) |
| `contract.R` / `calibrationContract.js` | Family + `KIND_TO_R_PATH` |
| `ecdVocabulary.js` | Bind `["irt","rasch"]` |
| Console + samples | `known-2pl-testinfo`, `lsat7-test-information` |
| Tests + CI | `testInformationPipeline.test.js`; `lsat7-pipeline` step |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  108 passed (108)
  Tests  1468 passed | 9 skipped (1477)
  Duration  ~43.6s

R_BACKEND_URL=http://127.0.0.1:4000 npx vitest run server/r/__tests__/testInformationPipeline.test.js
  Tests  11 passed (11)  — live analytic Fisher + LSAT7 mirt structural

docker compose restart r-backend; docker compose up -d --build node
Live R POST /calibrate/test-information (known-2pl):
  I(-1)=0.8007281112195191 I(0)=0.8940306132386603 I(1)=0.5444591855118271 kr20=0.35
Live :6060 (admin1 / WalkPass!2026, role=admin):
  EM em1789318941967 / SM sm-irt-2pl
  Enqueue known-2pl-testinfo → job1789547325752000 (worker auto-processed)
  Ingest → aa1789547326353; parameterSet null
  GET /api/analysisArtefacts?kind=test-information → checkpoints match hand
```

## Honest gaps (not D78 blockers)

- No dashboard curve chart UI yet (W17).
- Hub image still needs republish for `digits=16` if operators hit a
  non-bind-mount R; local compose bind-mounts `./r-backend/app`.

## Next

**D79** — remaining W16 analytics / classification reporting (per calendar).
