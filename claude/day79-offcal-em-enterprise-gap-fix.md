# Session 2026-09-16 — Newtonian enterprise EMs + TR9 gap-fix closeout

**Not D79.** Calendar D79 remains attribute-profile cohort summaries (W16). This session was off-calendar TR9 Evidence Model enterprise content and delivery wiring after the W16 D76–D78 close.

**Status: DONE** for the shipped product commits and close-gate fixes below. **PARTIAL** for (1) live `:6060` upload → confirm → attach-seed → operational walk of the Newtonian pack, and (2) non-key evaluation execution (rubric / process_log / auto) — authored and baked, Identification still only *runs* `key` artifacts when the activation map is empty. Residual work order produced as **EM-R1…EM-R5** (next session); Design Patterns / Presentation Model not started.

## Exit checks (what was actually executed)

| Claim | Form stated | Executed? |
|---|---|---|
| Enterprise EM fields + Newtonian sample pack (S1–S10 authoring) | Schema, Step7, bulk, samples, tests | **Yes** — `e3d6595` |
| G1 bake `evaluationProcedure` into composite; Identification consumes | Builder + Identification tests | **Yes** — `28fd9f0`; key fallback when map empty |
| G3 scoring artifacts from reviewed onward | Schema + Step7 + samples | **Yes** |
| G5/G6 pipeline + `workProductId` | Strict validate + Step7 panel | **Yes** |
| G2 multi-OV / shared WP | Schema relax + Force sample wp ids | **Yes** |
| G4 pilot seeds + attach route + Accumulation smoke | Samples + `attach-seed-parameter-sets` + smoke test | **Yes** (synthetic pilot, not live R) |
| G8 Assembly sufficiency | Step7 warnings | **Yes** (warn-only, not hard confirm gate) |
| G7 Design Patterns | Deferred | **Not started** (intentional) |
| Full suite + build on close | Vitest + vite build | **Yes** this close (after gate fixes) |
| Live Newtonian promote on `:6060` | Operator walk | **No** |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  First close run: FAILED (3 from gap-fix + 2 QMatrix label drift)
    - resolveEvaluationProcedure exported with no production caller → unexported
    - compileSeeded warning when EM has no evaluationProcedures[] → warn only if array non-empty
    - d49c exact equality missing evaluationMethod/Id → expect nulls
    - QMatrixReadOnly looked for /new q-matrix/i; UI is "+ New Diagnostic design" → test regex
  After fixes:
  Test Files  115 passed (115)
  Tests  1498 passed | 9 skipped (1507)

npm run build
  largest JS chunk recharts 446.89 kB; entry index-C_2xPdVp.js 31.31 kB
  built in 55.48s
```

Product commits this session (before close):

- `e3d6595` — enterprise Evidence Model fields, bulk remaps, Newtonian sample pack
- `28fd9f0` — wire TR9 evaluation procedures into delivery; gap-fix G1–G6/G8

## What was delivered

### Enterprise pack (`e3d6595`)
- EM schema: `evaluationProcedures`, `fairnessNotes`, `difReviewChecklist`, `calibrationPlan`
- Step 7 editors + gates; Q-matrix / Assembly bulk; name remaps (EM / TM / Items)
- Newtonian samples (EMs, TMs, Items, Q-matrix, policy, Assembly) + README upload order
- EM Settings card: Student Model id scope for `competencyName` (manual Upload only)

### Gap-fix (`28fd9f0`)
- Composite bake of `evaluationProcedure` (+ artifact); staleness on procedure content change
- Identification returns `evaluationMethod` / `evaluationProcedureId`; key artifact fallback if activation map empty
- Reviewed+ artifact requirement; Step 7 seed key/rubric + pipeline health + Assembly warnings
- `workProductId`; multi-OV allowed; confirm pipeline → active SM `observableIds`
- `calibrationPlan.seedParameterSets` + `POST /api/evidenceModels/:id/attach-seed-parameter-sets`
- Confirm-ready sample JSON; Accumulation smoke on Theta pilot seeds

### Where the plan was wrong
- “G3 closed” did **not** mean all evaluation methods execute at delivery — only **key** patterns run today (EM-R1).
- Draft bulk upload correctly forbids live `parameterSets`; confirm still needs attach-seed or real calibration (documented, not auto).

## What remains

| ID | Item | Notes |
|---|---|---|
| EM-R1 | Executable rubric / process_log / auto in Identification | Tier 3 alone (quiet wrong OVs) |
| EM-R2 | Live console calibration for Newtonian (replace pilot seeds) | Tier 2 |
| EM-R4 | `prerequisiteGating` in activitySelection | Not wired; Tier 2 |
| EM-R5 | Assembly sufficiency hard gate at confirm | Warn-only today; Tier 1 |
| EM-R3 | Force attribute-split SMVs + multi-column Q | Tier 2 alone from other schema |
| G7 / W23 | Design Patterns; Presentation Model | Deferred |
| Ops | Live `:6060` Newtonian promote walk | Not done this close |
| Calendar | D79 | Next queued; **not** this session |

Work order: chat 2026-09-16 “EM residual gaps (off-calendar)”.

## Next

1. Prefer **EM-R1** in a dedicated session (never-compress adjacent), **or** calendar **D79** if W16 priority wins.
2. Do not stack EM-R1 with schema EM-R3 or Design Patterns.
3. Record live Newtonian promote when walked.

## Calendar

No `ECD D<n>` event completed this session (off-calendar). **Do not** mark D79 ✅. Search for ECD D79 / Evidence events returned empty from the Calendar MCP this close — ledger is the authority for next queue.
