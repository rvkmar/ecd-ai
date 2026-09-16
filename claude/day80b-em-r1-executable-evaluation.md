# Session 2026-09-16 — EM-R1: executable non-key evaluation

**Not D81.** Calendar D81 remains W17 psychometric dashboards. This session
was off-calendar residual **EM-R1** from the Newtonian / TR9 EM gap-fix
work order.

**Status: DONE** for the exit check: constructed WP + rubric dimensions →
expected OV activation/strength; process_log events → declared observable;
empty map + key still green; Identification suite green. Activation-map
precedence unchanged.

## Premise on contact

Hand-off claimed Identification only executed `key` `correctPatterns` when
the activation map was empty. Code confirmed: rubric / auto / process_log
artifacts were baked and authored but never applied. EM-R1 stands alone
(Tier 3 / quiet wrong OVs).

## Exit checks

| Claim | Form stated | Executed? |
|---|---|---|
| Rubric dimensions → OV activation/strength | Fixture + Identification | **Yes** |
| process_log events → declared observable | Fixture + `process_log_v1` | **Yes** |
| Empty map + key still green | Regression in EM-R1 + existing tests | **Yes** |
| Non-empty map never reinterpreted as artifact | Fixture | **Yes** |
| Full suite + build | Vitest + vite build | Recorded below |

## The rule that defines this unit

**Activation map wins.** Artifact fallback runs only when
`evidenceActivationMap` is empty. A non-empty map that fails to match stays
a "no pattern" warning — never silently rescored by a rubric or process log.

Artifact contracts (no invention from `observableId`):

| kind / method | Work product | Activation |
|---|---|---|
| `key` | response fields | `correctPatterns` overlap (unchanged) |
| `rubric` | `dimensions` / `rubricLevels` / `rubricLevel` | each dim ≥ `activatesAt` (default: lowest positive level) |
| `auto` / `process_log` + `process_log_v1` | `events[]` and/or `firstMove` | `activateOnFirstMove` or `activatingPatterns` |
| other `auto` | raw WP | `config.activatingPatterns` / `correctPatterns` |

Unknown scorers without patterns → warning (`activated: null`), not a quiet false.

## What was delivered

- `server/delivery/evaluationArtifacts.js` — matchers for key / rubric / auto /
  `process_log_v1`
- `server/delivery/evidenceIdentification.js` — empty-map fallback calls
  `applyEvaluationArtifact` for all bakeable kinds
- `server/delivery/__tests__/evaluationArtifacts.test.js` — EM-R1 exit fixtures
- Newtonian process_log sample configs gain `activateOnFirstMove` +
  `classByEvent` (diagram / equation / narrative) so authored artifacts are
  executable when maps are empty
- Schema comment documents WP contracts

## Where the plan was right

Composite already baked `evaluationProcedure.artifact`. Scope stayed inside
Identification + fixtures; no schema redesign, no Design Patterns, no EM-R3.

## What remains

| ID | Item |
|---|---|
| EM-R2 | Live console calibration for Newtonian (replace pilot seeds) |
| EM-R4 | `prerequisiteGating` in activitySelection |
| EM-R5 | Assembly sufficiency hard gate at confirm |
| EM-R3 | Force attribute-split SMVs + multi-column Q |
| Ops | Live `:6060` Newtonian promote walk |
| Calendar | D81 — W17 psychometric dashboards |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  118 passed (118)
  Tests  1523 passed | 9 skipped (1532)
  Duration  77.18s

npm run build
  largest JS chunk recharts 446.89 kB; entry index-lQ2QSsua.js 31.31 kB
  built in 18.47s
```

Product commit recorded at close (hash filled after push).

## Next

**EM-R2** (Tier 2) or calendar **D81**. Do not stack EM-R1 follow-ons with
schema EM-R3 in one session.

## Calendar

Off-calendar — **do not** mark D81 ✅.
