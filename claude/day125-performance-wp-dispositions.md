# D125 — Performance work-product dispositions + W25 handoff

**Status: DONE.** Calendar unit **D125**, alone (Tier 2). Started from
`cc65e97` (post-D124). Did not start W26 / D126.

## Exit check — W25 deliverables

> A two-phase evaluation runs automated then human with adjudication
> applied; each of the four performance work-product types has an
> explicit, recorded disposition.

| Claim | Executed? |
|---|---|
| `performance` / `artifact` / `behavior` / `process_trace` dispositions in `ecdVocabulary` | **Yes** — all `supported` at D125 |
| Empty interaction maps remain intentional (not mapped to `constructed`) | **Yes** |
| Two-phase + `human_wins` adjudication still completes | **Yes** — `d125PerformanceWorkProductDispositions.test.js` |
| Wizard/schema messages drop stale “yet / no rater workflow” | **Yes** — shared `interactionCompatibilityMessage` |
| W25 block handoff | **Yes** — `claude/day125-w25-block-close.md` |

## Dispositions (summary)

| Type | Status | Capture | Evaluation |
|---|---|---|---|
| performance | supported | external_observation | human / hybrid |
| artifact | supported | external_artifact | human / hybrid |
| behavior | supported | external_observation | human / hybrid |
| process_trace | supported | process_log | automated / human / hybrid |

File-upload ItemPresenter chrome for artifacts remains a later enhancement;
the type is authorable and rater-evaluable now.

## Premise on contact

Types already existed with empty compatibility maps. Unit recorded
dispositions after D121–D124 — did not invent a second vocabulary.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2047 passed | 9 skipped (2056) — 191 files

npm run build
  green (~20s)
```

D124 close: **2043 passed / 9 skipped**. Delta: **+4 tests**.

Session close re-verify (2026-09-22): same suite count; build green (~19s).
See `claude/day125-w25-session-close.md`.

## Next

**W26 / D126** — templates schema (four CAF bindings). Do not start casually;
re-calibrate first. Tier 2 schema alone.
