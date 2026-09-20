# D88 — Full benchmark suite in CI (drift / perturbation)

**Status: DONE.** Premise rewritten on contact: the five benchmarks
already ran on `lsat7-pipeline`. What was missing was the calendar's
second half — each predicate must **fail when perturbed** — and Hub
`plink` honesty.

## Premise on contact

Calendar: "All five benchmarks running in CI as one suite."

Code already had LSAT7 / sim10GDINA / CTT / DIF / equating (plus later
item-analysis / test-info) on `lsat7-pipeline`. Always-run contract stubs
existed. Live paths asserted today's estimates but nothing proved those
assertions were load-bearing under deliberate wrong values.

Hub `rvkmar/r-backend:latest` **already includes plink 1.5.1** (verified
`docker run … Rscript -e packageVersion("plink")`). D70's open Hub debt
closes as of this probe + CI package gate.

## Exit checks

| Claim | Executed? |
|---|---|
| All five pass in CI | **Yes** — already on `lsat7-pipeline`; live local `:4000` 42/42 across the five pipeline files |
| Each fails when expected values are perturbed | **Yes** — `benchmarkPerturbation.test.js` (20 always-run); shared `benchmarkAcceptance.js` predicates also used by live paths |
| Hub equating / plink honesty | **Yes** — Hub image has plink 1.5.1; CI step `Require Hub packages for live benchmarks` fails loudly if `packages.plink` (or mirt/GDINA/TAM/difR) is missing |

No invented LSAT7 a/b or KR-20 coefficient pins (D64/D67 restatements stand).

## What shipped

| Area | Change |
|---|---|
| `server/r/__tests__/benchmarkAcceptance.js` | Stated predicates + Hub package gate (test helper; not a production export) |
| `server/r/__tests__/benchmarkPerturbation.test.js` | Perturbation-fail for five + Hub gate |
| Five `*Pipeline.test.js` live paths | Call the shared predicates |
| `.github/workflows/ci.yml` | Hub package gate + always-run perturbation step before live pipelines |

## Verification

```
npx vitest run server/r/__tests__/benchmarkPerturbation.test.js
  20 passed

R_BACKEND_URL=http://127.0.0.1:4000 npx vitest run \
  lsat7|sim10gdina|ctt|dif|equating Pipeline
  42 passed

npx vitest run (full suite)
  1604 passed | 9 skipped (1×5s flake: evidenceAccumulation Day 32;
  isolation re-run green → product count **1605** / 9 skipped)

npm run build
  green; recharts 451.37 kB

Hub image: plink=1.5.1 (and mirt/GDINA/TAM/difR present)
Local :4000 /health package gate: ok
src/test/repoGuards.test.js: green (acceptance helpers live under __tests__)
```

## Honest gaps

- Coefficient-table pins still not sourced (correct — do not invent).
- Nightly schedule for the suite (calendar optional) not added; per-push
  `lsat7-pipeline` remains the standing guarantee.

## Next

**D89** — never-compress: kill R mid live session (W18 gate).
Live stack `:6060` + `admin1` ready.

## Calendar

Mark **D88** ✅ with real date **2026-09-17**.
