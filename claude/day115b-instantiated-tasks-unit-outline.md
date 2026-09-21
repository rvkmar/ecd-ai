# D115b — Instantiated tasks schema & item bind (unit outline)

**Status: OUTLINED (not started).** Calendar insert between W23 close and W24
TMVs. Implementation debt from D47 F6 / TasksManager — **not** Presentation
Model work, and **not** a copy of the CAF model lifecycle machine.

## Placement

| | |
|---|---|
| Calendar title | `ECD D115b · Instantiated tasks schema & item bind` |
| Why here | Session delivery still needs `tasks` rows; UI cannot bind `itemId`; schema block still commented out; parent/tenancy gates incomplete. W24 (D116+) is TMVs — orthogonal. |
| Tier | **2–3** (schema + API gates + authoring UI; no cut-over of scoring) |
| Model hint | Opus/high for schema boundaries; Sonnet/medium for TasksManager |

## Premise (verify on start)

- `schema.tasks` is commented out; `validateEntity("tasks")` is a no-op.
- POST/PUT enforce `itemId` XOR `questionId` binding in the route (D47) but
  do **not** require `isInstantiableTaskModel`.
- `TasksManager` POSTs `{ taskModelId }` only — no item picker (D47 deliberate
  scope; still open).
- No `useTasks` query module.
- Tasks often omit `districtId` (student tenancy hide — mitigated for GET by
  D115 debt fix; create path should still stamp tenancy).
- Full `draft→…→operational` lifecycle is **out of scope** for instances.

## Exit check

> An author can create an instantiated task that binds an instantiable Task
> Model to a coherent Item Bank `itemId` through the Implementation UI; the
> record validates via `schema.tasks`; a student session that schedules that
> task can load the item. No CAF status machine on `tasks`.

## In scope

1. **Schema** — uncomment/design `schema.tasks` (`id`, `taskModelId`,
   `itemId` XOR `questionId`, observation arrays, timestamps, optional
   `districtId`/`schoolId`). Wire `validateEntity` on POST/PUT.
2. **API gates** — refuse create unless TM is instantiable; keep D47 binding
   checks; stamp author tenancy on insert; review DELETE→sessions cascade.
3. **Authoring** — TasksManager (or thin wizard): pick instantiable TM +
   eligible item; stop pretending question-only mappings are the path.
4. **Queries** — `src/api/queries/tasks.js` hooks (list/create/update/remove).
5. **Tests** — schema + lifecycle-of-binding (not status machine) + UI smoke;
   student GET still works with/without districtId when rostered.

## Out of scope

- Presentation Model / SessionPlayer chrome (done D113–D115).
- Full CAF lifecycle / lock / confirm on `tasks`.
- Killing legacy `questionId` delivery path (may remain for old sessions).
- Composite-library rewrite; Assembly Model changes.
- W24 TMVs / `ecdVocabulary` changes.

## Anti-goals

- Do not invent a “Delivery Model.”
- Do not treat Activities as Presentation (TR9 IA).
- Do not reintroduce `validateEntity("tasks")` that always fails.

## Suggested verification commands

```
npx vitest run server/routes/__tests__/d115TaskDeliveryTenancy.test.js
npx vitest run -t "tasks"
npm run build
# live: Admin Implementation → Instantiated tasks → create with itemId →
# student session play loads item
```

## Depends on / discharges

- Discharges open D47 authoring-UI debt and the recorded “tasks schema block”
  gap.
- Complements D115 tenancy delivery fixes (does not replace them).
