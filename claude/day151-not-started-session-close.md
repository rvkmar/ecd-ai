# Session close — D151 not started

**Closed 2026-10-28.** Calibration on 2026-10-26 produced a work order. The unit was not run. Last completed calendar unit stays **D150**.

## Exit check (not executed)

| Unit | Exit check | Executed? |
|---|---|---|
| D151 | A task spec cannot be created except by generation; the template-change policy is recorded and enforced. | **No.** `taskSpecs` is still absent from schema, routes, roles, and queries. Items are still authored by hand. |

Do not mark the D151 calendar event. Do not treat the textbook-audit **G15** (Delivery Model, PR #103) as the conformance-schedule G15 that D151 closes. Those are different lists.

## Verification

On `77fafb9`, matching `main/master` before this close commit:

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  first pass: 2 failed | 2582 passed | 10 skipped (2594) — 303 files (391.75s)
  failures: d133DesignPatternBuilder and d134DesignPatternMenus confirm tests,
  each Test timed out in 15000ms under the full-suite load.

npx vitest run src/components/designPatterns/__tests__/d133DesignPatternBuilder.test.jsx
               src/components/designPatterns/__tests__/d134DesignPatternMenus.test.jsx
  8 passed (2 files, 19.07s)

npm run build
  green (1m 2s). Largest JS chunk EvidenceModelBuilder-b7I4Hk6-.js
  371.68 kB (gzip 87.58 kB).
```

The two timeouts are load on this machine, not a D151 product defect. Isolated they pass. They are not this unit.

## What this session did

Calibrated D151 at `f7ec896` (`ff2a541`). Rewrote the unit: seven-artefact collection plus the D48 surface; authored POST refused; stale on template change; family generation is D152.

After that calibration, other sessions shipped off-calendar textbook-audit gaps G15–G22 and F24 through `77fafb9`. Those have their own handoffs. None of them is `taskSpecs`.

## Half-applied work

None for D151. The collection was not started.

## What remains

- **D151**, still next, still alone, still Tier 2. Same rewritten exit check.
- **W29.** A Domain Analysis still does not produce a Competency Model.
- Standing: D68 mid-flight ingest, competency-model archive walk, D115b instantiated-tasks click-through, P1 pattern delete dropping `seededFrom.designPatternId`.
- **D155** never-compress. Do not start it from this close.

## Calendar

D151 and W31 were not marked. Dates were not moved.

## Next

Re-calibrate before **D151** if the tree has moved again. Otherwise run D151 alone as rewritten. Do not pair D152.
