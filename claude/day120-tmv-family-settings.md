# D120 — Per-template TMV settings + W24 handoff

**Status: DONE.** Calendar unit **D120**, alone (Tier 2). Started from
`7e59eb9` (post-D118). Product tip **`f5b3d5c`**. Did **not** start D119
(never-compress) or W25/W26.

## Exit check

> A TMV is defined once and consumed by more than one Task Model; a written
> worked example shows the settings that would generate W31's target family.

| Claim | Executed? |
|---|---|
| One TMV, ≥2 Task Models | **Yes** — already D116 (`taskModelVariables.test.js`); unchanged |
| Settings express fixed vs varying | **Yes** — `variation: "fixed" \| "varying"` + `fixedValue` / `allowedValues` |
| Family size = cross-product of varying axes | **Yes** — `projectTaskSpecFamilySize` / `projectTaskSpecFamily` |
| Written ten-spec worked example | **Yes** — `claude/day120-w24-tmv-family-worked-example.md` (5×2×1=10) |
| Example asserted in tests | **Yes** — `taskModelVariableFamily.test.js` |
| Wizard surfaces variation + projected size | **Yes** — `StepVariables` Fixed/Varying + `tmv-family-size` |
| No D119 enum re-point | **Yes** |

Live `:6060` (`admin1` / WalkPass): Models → Task Model Variables library
loads (D117/D118 smoke). D120 variation UI needs the new frontend bundle on
that host; gate here is schema + worked example + unit tests.

## Premise on contact

Held: settings had `required` / `allowedValues` / numeric min-max only — no
fixed/vary axis, no family projection, no paper example for W31.

## Design

| Piece | Where |
|---|---|
| Schema | `variation`, `fixedValue` validation on `taskModelVariableSettings` |
| Family helpers | `src/utils/taskModelVariableFamily.js` |
| Wizard | `StepVariables` radios + family-size readout |
| Worked example | `claude/day120-w24-tmv-family-worked-example.md` |
| Tests | `taskModelVariableFamily.test.js` + StepVariables updates |

Absent `variation` still means varying (D117 compat). Numeric min/max alone
is not a discrete generation axis.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1993 passed | 9 skipped (2002) — 179 files (~156s)

npm run build
  green (2m 12s)
```

D118 close: **1987 passed / 9 skipped**. Delta: **+6 tests** / +1 file
(`taskModelVariableFamily.test.js`).

## W24 block

Gate “defined once, consumed twice” met since D116. D120 adds the settings
shape + worked example W26/W31 need. **D119** (enum re-point) remains open,
never-compress, alone — not required to call W24’s calendar gate met for G13
consumption, but still on the backlog before Stage 3.2 is fully clean.

## Next

**D119** alone (never-compress) when budget allows — or re-calibrate. Do not
start W25/W26 from this unit without calibration.
