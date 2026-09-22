# D119 — Point Task Model design-feature enums at the TMV registry

**Status: DONE.** Calendar unit **D119**, alone (Tier 3 / never-compress).
Started from `76a1f0d` (post-D120). Did not start W25/W26 or touch item
metadata enums.

## Exit check

> Task Model blueprint constraints read from the registry; all six
> mirror-drift tests green; no value that could be recorded before can no
> longer be recorded (the D22 failure mode, checked explicitly).

| Claim | Executed? |
|---|---|
| Structure / blueprint selects resolve via TMV valueSet registry path | **Yes** — `designFeatureOptions` in Step4 + Step5 |
| Schema validates those fields through the same path | **Yes** — `isDesignFeatureValueAllowed` |
| ecdVocabulary remains the definition beneath valueSet | **Yes** — `TMV_VALUE_SET_SOURCES` reference equality (mirrorDrift) |
| Every pre-D119 vocabulary value still validates unbound | **Yes** — `d119DesignFeatureRegistry.test.js` D22 floor |
| Bound TMV settings can narrow options for that TM only | **Yes** — subset test |
| Item `cognitiveDemand` untouched | **Yes** — still `BLOOM_LEVEL_VALUES` in schema |
| Mirror-drift suite green | **Yes** — full suite includes `mirrorDrift.test.js` |

## Premise on contact

Wizard imported `BLOOM_LEVELS` / `PRESENTATION_MODES` etc. from
`taskModelConstants` (re-exports of ecdVocabulary). Schema validated
against the same VALUES arrays. TMV registry already named those lists via
`valueSet`, but Task Model structure/blueprint authoring did not go through
that path. Re-point = authoring + TM validation use
`taskModelDesignFeatureRegistry.js`; stored values stay vocabulary strings.

## Design

| Piece | Where |
|---|---|
| Registry path | `src/utils/taskModelDesignFeatureRegistry.js` |
| Schema | taskStructure + blueprintConstraints cognitiveDemand |
| Wizard | Step4TaskStructure, Step5Blueprint |
| Tests | `d119DesignFeatureRegistry.test.js` |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1996 passed | 9 skipped (2005) — 180 files (~113s at close re-verify)

npm run build
  green (~19s at close re-verify)
```

Product: **`99c4d85`**. Close tip: **`38df7f2`** ≡ `main/master`.
D120 close: **1993 passed / 9 skipped**. Delta: **+3 tests** / +1 file.

## Next

W24 calendar units D116–D120 are complete (D119 was the remaining
never-compress slot). Re-calibrate before W25. Do not start templates (W26)
from this unit without calibration.
