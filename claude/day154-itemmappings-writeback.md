# D154 — itemMappings write-back

**Closed 2026-10-29.** Calendar unit **D154**, alone (Tier 2). W31. Calibrated from `99320b2`. Product `9b944ee`. Did not start D155.

**Status: DONE.**

## Exit check (executed)

| Claim | Executed? |
|---|---|
| Confirming an item updates its Task Model's coverage map without the author touching Step 6 | **Yes** — `PATCH /api/items/:id/lifecycle` to `confirmed` writes `{ itemId, observationId, evidenceModelId }` on the parent, including when that Task Model is locked. `itemLifecycle.test.js` |
| The map and the composite library agree | **Yes** — same `{ itemId, observationId }` set as `buildCompositeLibrary`. Instantiable statuses and version match. Drafts omitted. Archive empties the row. |
| The “best-effort” label is gone | **Yes** — Step 6 is a readout; no mapping checkboxes. Schema and lifecycle comments say derived. SessionPlayer still delivers from `task.itemId`, not the map |

Live `:6060` is the previous image. Step 6 was not walked there. The exit check was executed in tests.

## Verification

Product `9b944ee` ≡ `main/master` before this close.

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2862 passed | 3 skipped (2865) — 329 files (196.82s)

npm run build
  green (24.30s). Largest JS chunk
  EvidenceModelBuilder-BYfsU0O1.js 372.26 kB (gzip 87.77 kB).
  TaskModelBuilder-BBCgbCwe.js 108.61 kB (gzip 27.97 kB).
```

PsychometricFigure uncaught errors still print from tests that expect a throw; they are not failures. Skip count vs the product-tree run (8 skipped) is live-R auto-detect: plumber was healthy on this close.

Tree clean at `9b944ee` ≡ `main/master`. Remote is named `main`, tracking `master`.

## What the plan got wrong

Calendar said make Step 6 authoritative by writing back from the Item Wizard. Items already stored `taskModelId` and `observationId`. The composite library already walked those items and ignored `itemMappings`. Step 6 was a second, authored list that could not agree with the library.

A confirmed Task Model is locked; locked PUT is status-only. Write-back therefore cannot go through the Task Model authoring route.

**Became:** derive `itemMappings` (and `selectedItemIds`) server-side from instantiable items on that Task Model version. Recompute on item confirm, archive, delete, and Task Model write. Discard client `itemMappings`. Step 6 is a readout. TM confirm still does not require coverage — items are authored after the Task Model. Delivery stays on `task.itemId`.

Creation of a draft does not appear on the map. Calendar said create/confirm/retire; the library agreement forces confirm as the gate, archive as retirement (confirmed items cannot be deleted).

## What was delivered

| Piece | Where |
|---|---|
| Projector | `server/services/syncTaskModelItemMappings.js` |
| Item writes | confirm / archive / delete / PUT / clone call `syncTaskModelItemMappings` |
| Task Model writes | create / PUT / clone call `applyDerivedItemMappings`; client payload discarded |
| Step 6 | readout table, no ticks (`Step6ItemMapping.jsx`) |
| Tests | `syncTaskModelItemMappings.test.js`, item lifecycle confirm/archive/library agreement, TM PUT discard, Step 6 no checkboxes |

Item POST is still the authored-item path. AIG still unmounted.

## Half-applied work

None. D155 was not started.

## Compression debt

None new. Standing, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through

P1 pattern-delete was closed off-calendar by R14.

## Calendar

D154 marked ✅. Date was not moved. W31 was not marked. W29 stays open.

## Next

**D155** (never-compress): generate the D120 ten-spec family for real, from Domain Analysis through a scored session. Re-calibrate first. Do not start it from this close. W31 gate is that walk. W29 stays open.
