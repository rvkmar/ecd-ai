# Off-calendar: Q-matrix cells can cite an observable

**Not D146.** Not a calendar unit. A Q-matrix cell may cite an observable, with the item optional. Item-only matrices still load, validate, score, and select as they did. The W29 gate stays open.

## Premise

Confirmed before the change. `qMatrixModels.entries` required both `itemId` and `attributeId`. Observable ids live on `evidenceModels.observables` and are unique inside one evidence model, not across models. They are not collection ids. DINA and G-DINA slip and guess are keyed by item. The sim10GDINA and LSAT7 jobs build their dense matrices from published fixtures. They never read `qMatrixModels.entries`. The R contract asks for `qMatrix.itemIds`.

## Design

A cell cites an item, an observable, or both. At least one of `itemId` and `observableId` is required, plus `attributeId`.

`observableId` is checked against a real observable. `evidenceModelId` is required only when that observable id exists on more than one evidence model. When it is omitted and the id is unique, the cell key uses that model's id, so a bare citation and an explicit one are the same cell. `evidenceModelId` without `observableId` is an error. When the owning evidence model's competency belongs to a different competency model than the Q-matrix, validation fails.

Duplicate cells are rejected. An item-only duplicate keeps the message "duplicates the (itemId, attributeId) pair". An observable-only duplicate says "duplicates the (observableId, attributeId) cell". A cell that names both says so.

When a response matches any observable-keyed row, those rows are the whole Q-vector. They are not unioned with the item-only rows. A match needs the same `observableId`, the same evidence model when both sides name one, and the same item when the entry names one. If nothing matches, the item-only rows for that `itemId` are used, including when the response carries an unrelated `observableId`. Slip and guess stay on the item. Attribute indices are sorted and a repeated index is kept once. An unknown attribute on a matched required cell excludes the response.

Activity selection uses the same resolver before a response exists, with `item.observationId` and the evidence model id. It still counts a `required: false` cell, which is what the old item lookup did.

Confirmation still places an item when any entry cites its `itemId`. An observable row also places an item whose `observationId` matches.

The editor keeps "+ Add item…". It adds "+ Add observable…", grouped by evidence model. An observable row can stay "Any item" or name an item that produces that observation. Ingredients View has an Observables group. A cell that names both is listed there, not again under Items.

Delete of an item a Q-matrix cites returns 409 "Cannot delete item referenced by a Q-matrix." Delete of an evidence model a Q-matrix cites returns 409 "Cannot delete evidence model referenced by a Q-matrix." A PUT that drops a cited observable id returns 409 "Cannot remove an observable referenced by a Q-matrix." Removing a binary student model variable from a competency model is not guarded on that write. The next Q-matrix validation catches a dangling attribute.

Zip import remaps `entries[].itemId` and `entries[].evidenceModelId`. `observableId` is left as authored. The plant sample Q-matrix keeps its item rows and adds one observable row: `obs-plant-function` on `em-function` for `smv-names-function`. The sample zip stays flat JSON at the zip root.

## What consumers do

| Consumer | Observable-keyed rows |
|---|---|
| Schema and bulk create | Accepted. Item-only rows unchanged. |
| DINA / G-DINA scoring | Observable rows win for a matching response. Otherwise the item rows. Parameters stay on the item. |
| Bayesian network selection | Same resolver, from the item's observation, before a response. |
| Confirmation placement | Item id still places the item. A matching observation does too. |
| Editor and Ingredients View | Observable picker, grouped by evidence model. Ingredients lists the link. |
| Zip import | Remaps the evidence model and the item. Leaves the observable id. |
| sim10GDINA and LSAT7 | Not used. Those jobs do not read authored entries. No compiler was added. |

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Schema | Observable id optional item. Shared ids need an evidence model. Duplicates rejected. Item-only rows still valid | **DONE** |
| Scoring and selection | Observable rows resolve. Item-only matrices unchanged | **DONE** |
| Editor | Observable picker grouped by evidence model. Item still selectable | **DONE** |
| Ingredients | The observable link is shown | **DONE** |
| Delete | Cited item, evidence model, or removed observable returns 409 | **DONE** |
| Zip | Ids remap. Sample row present. Complete zip imports with 0 failures | **DONE** |
| Calibration fixtures | Left alone. Documented here | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2500 passed | 9 skipped (291 files, 59.96s)
  Node 24.22.1

npm run build
  green (vite, 1.51s)

npm audit --audit-level=high
  found 0 vulnerabilities
```

This docs commit did not re-run the suite. The product commit is `edf5b3d`.

## Browser

Local Vite `http://localhost:5173`, API on `:3000`, `DB_MODE=json`, signed in as `admin1` / `WalkPass!2026`. Settings, Data, Upload. "Keep original ids and statuses" was on. The file was `samples/ecd-sample-complete.zip`. Import finished: 45 created, 0 failed.

Diagnostic design, focus `qm-plant`. The grid has the item row `it-function` and an observable row "The learner selects the function of the named plant part." The caption is "Part function evidence". The item select is "Any item", and "Job of the leaf" is the other choice. "+ Add observable…" opens grouped under "Part naming evidence" (the function observable is already a row, so it is not in that list).

Diagnostic Design Structure, Ingredients View, Plant part Q-matrix, Observables. The row is that same statement, with "Part function evidence; Any item; Names the function".

## Remote

Draft pull request #106 against `main`: https://github.com/rvkmar/ecd-ai/pull/106. Branch `cursor/qmatrix-observable-keys-d637`.

## Half-applied work

None.

## Left for later

- Calibration jobs still do not read authored Q-matrix entries. There is no per-observable calibration row. Two observables from one item share that item's slip and guess.
- Dropping a binary student model variable from a competency model is not a 409. The Q-matrix fails validation on the next save.
- Confirmation asks whether the item is placed, not whether every observable of a multi-observable item is mapped.
- Selection still needs item-level DINA parameters. An observable-only matrix with no parameters for the item cannot rank it.
- Reports and student model records were not changed.

## Compression debt

None new.

## Calendar

D146 was not marked. This link has no calendar event.

## Next

Do not treat this as D146. W29 stays open. Calendar next stays D151 alone. The next textbook gap is G19.
