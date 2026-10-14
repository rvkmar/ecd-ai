# Session close — D137 seed draft models from a design pattern

**Closed 2026-10-14.** W28 seeding has started. Inheritance is still D139.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D137 | A pattern seeds a draft Evidence Model and a draft Task Model; both carry back-links; neither can be confirmed without a designer supplying substance the pattern did not | **DONE** |

The behaviour is the route test, against a fixture competency. One confirmed pattern with five menus seeded both drafts. The chosen observation became a new statement (`Names the claim`), not the foreign id `foreign-obs`. The declined observation, work product, rubric, and characteristic feature stayed on `seededFrom` on both records. `evaluationProcedures` stayed empty. `blueprintConstraints` did not contain the characteristic-feature label. The Task Model cited the new draft Evidence Model. After the Evidence Model moved to reviewed, confirm returned 400 for the missing claim and observable substance. Moving the Task Model to reviewed returned 400 because that Evidence Model is still a draft. A draft pattern created nothing.

Live Admin (`admin1`) on `:6060` after `docker compose up -d --build nginx node`. **Explain a labelled diagram** shows **Seed draft models**. The competency list is empty, so the button stays disabled. A live seed was not saved.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  first run: 1 failed (unused export of partitionMenus / SEED_MENU_KEYS) | 2134 passed | 9 skipped
  after the export was removed: 2135 passed | 9 skipped (2144)
  88.46s, exit 0

npm run build
  green (20.99s). Largest JS chunk recharts 488.42 kB.
  index-rMKxsjyf.js; DesignPatternBuilder-QVxcma23.js 20.83 kB.
```

Product commit `1a23d02`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The queued plan said copy menus into new models, put characteristic features in `blueprintConstraints`, turn rubrics into evaluation procedures, and add a second confirm gate. That premise was already rewritten before this session (`bd24589`). Characteristic features have no Task Model field. A rubric id is not an evaluation procedure. Evidence Model confirm already requires the claim, warrants, typed observables, and evidence rules.

`POST /api/designPatterns/:id/seed` writes one draft Evidence Model and one draft Task Model from one confirmed pattern. The designer picks menu rows. Declined rows stay on the shared `seededFrom` record. Chosen observation labels become new draft statements. Chosen variable features may cite `taskModelVariableIds`. `allowDraftParents` is used only so the new Task Model may cite the new draft Evidence Model. A draft pattern is refused. Existing models are not rewritten. There is no inheritance and no second confirm blocker.

## Half-applied work

None. Node and nginx were rebuilt together. No seeded models were written to this mongo, because it has no competency.

## Compression debt

| Unit | What was compressed | Why | Discharge by |
|---|---|---|---|
| D135 live bulk upload | Settings Data click-through of the design-pattern card | This session walked the seed control, not Settings | W28 close (D140) |

Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`

## Calendar

D137 marked ✅. The 2027-03-05 date was not moved.

## Next

D138, alone. Compare the stored accepted and declined rows to the current model. Advisory. A Focal KSA label is not an observable id.
