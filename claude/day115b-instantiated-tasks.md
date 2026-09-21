# D115b — Instantiated tasks schema & item bind

**Status: DONE.** Calendar insert between W23 close and W24 TMVs.
Implementation debt from D47 F6 / TasksManager — **not** Presentation Model
work, and **not** a copy of the CAF model lifecycle machine.

## Exit check

> An author can create an instantiated task that binds an instantiable Task
> Model to a coherent Item Bank `itemId` through the Implementation UI; the
> record validates via `schema.tasks`; a student session that schedules that
> task can load the item. No CAF status machine on `tasks`.

| Claim | Executed? |
|---|---|
| `schema.tasks` is a real collection; `validateEntity("tasks")` can pass | **Yes** — `tasksSchema.test.js` |
| POST/PUT refuse a non-instantiable Task Model | **Yes** — `d115bInstantiatedTasks.test.js` |
| D47 `itemId` XOR `questionId` still holds | **Yes** — existing `d47ItemDelivery.test.js` + schema XOR |
| TasksManager posts `{ taskModelId, itemId }`, not task-model-only | **Yes** — `TasksManager.test.jsx` |
| Author tenancy stamped on insert | **Yes** — district JWT → `districtId` / `schoolId` / `createdBy` |
| Student GET still works with/without `districtId` when rostered | **Yes** — `d115TaskDeliveryTenancy.test.js` |
| No CAF `draft→operational` machine on `tasks` | **Yes** — `schema.tasks.status` is undefined |

## Premise on contact

HEAD `1268158` (D115 debt closed + this unit outlined). Hypothesis held:

- `schema.tasks` was commented out; `validateEntity("tasks")` was
  `"Unknown collection"`.
- POST/PUT enforced D47 XOR in the route, not instantiable TM, and did not
  call `validateEntity`.
- `TasksManager` POSTed `{ taskModelId }` only; no item picker; no `useTasks`.
- Tasks often omitted `districtId` (student tenancy hide — D115 GET fallback
  remains; create now stamps author claims).

Naming in this repo is ECD: Task Model, Item Bank `itemId`, `schema.tasks`,
`TasksManager`, `isInstantiableTaskModel`.

## Design

Tasks are **runtime instances**, not CAF models. Shape is `id`, `taskModelId`,
`itemId` XOR `questionId`, observation arrays, timestamps, optional
`districtId` / `schoolId` / `createdBy`. No `status` / `locked` / version
chain.

Deep `validateEntity("tasks")` owns:

1. `taskModelId` required and must exist.
2. `isInstantiableTaskModel` (confirmed/operational/suspended **and** locked),
   unless `allowDraftParents`.
3. Exactly one of `itemId` / `questionId`.
4. If `itemId`: item exists, `item.taskModelId` matches, `isDeliverableItem`
   (not suspended/archived). Draft items remain bindable (D29).

POST stamps tenancy from the JWT (`req.user.districtId` / `schoolId` /
`username`). PUT preserves those fields (no tenant hopping). DELETE still
cascades sessions whose `taskIds` include the row — leaving a dangling
taskId 404s the player (reviewed, kept).

Authoring: Implementation → Instantiated tasks. Picker lists instantiable
Task Models and deliverable items for the selected TM; create is disabled
until both are chosen.

## Verification

Filled after the suite run on this branch.

```
npx vitest run server/routes/__tests__/d115TaskDeliveryTenancy.test.js
npx vitest run -t "tasks"
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
npm run build
```

## Next

Calendar **D116** — W24 TMVs. Do not start from this unit. Re-calibrate
before touching `ecdVocabulary.js`.
