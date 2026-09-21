# D116 — Task Model Variables (W24 G13)

**Status: DONE.** Calendar unit **D116**, alone. Started from `main` tip
`68ed3ec` (post-D115b). Did not start D117–D120, D119 enum re-point, W25,
Presentation Model, or SessionPlayer work.

## Exit check

> A Task Model Variable is defined once and consumed by more than one Task
> Model. `validateEntity` accepts a well-formed record. Vocabulary stays a
> single source. No CAF status machine on the variable, and D115b
> instantiated-task binding is unchanged.

| Claim | Executed? |
|---|---|
| `validateEntity("taskModelVariables")` accepts a well-formed record | **Yes** — `taskModelVariables.test.js` |
| One variable id is referenced by ≥2 Task Models | **Yes** — schema gate and `POST` two Task Models in `d116TaskModelVariables.test.js` |
| Bloom / reasoning / design-feature levels are not copied into the record | **Yes** — `valueSet` names the `ecdVocabulary.js` array; mirror-drift asserts reference equality |
| Author tenancy stamped on create; not rewritten on update | **Yes** — district JWT → `districtId` / `schoolId` / `createdBy` |
| No CAF `draft→operational` machine | **Yes** — `schema.taskModelVariables.status` is undefined; POST strips `status` |
| D115b `schema.tasks` / item bind | **Yes** — untouched; `schema.tasks.status` still undefined; TasksManager chunk unchanged (5.27 kB) |

## Premise on contact

HEAD `68ed3ec`. Hypothesis held:

- No `taskModelVariables` collection, route, or query hook.
- Student Model Variables stay embedded on `competencyModels.smVariables`. They are latent-student variables, not task design features, so they were not reused as the TMV store.
- `presentationMode`, `responseFormat`, and `stimulusPolicy` were hardcoded twice: inline arrays in `schema.js` and `PRESENTATION_MODES` / `RESPONSE_FORMATS` / `STIMULUS_POLICIES` in `taskModelConstants.js`.
- Templates are not a collection (W26). The Task Model record is the binding surface that already exists.

## Design

Library records, not CAF models. Seven-artefact contract with lifecycle omitted on purpose (same posture as instantiated `tasks`, different reason: a variable is a shared definition).

| Artefact | Where |
|---|---|
| Schema | `schema.taskModelVariables` + `validateEntity` (strict completeness, lenient draft) |
| Vocabulary | `ecdVocabulary.js` §11. Design-feature lists moved here (Day-22 style). `valueSet` points at Bloom, reasoning, or those lists |
| Lifecycle | None. Not added to `lifecycleMatrix.js` |
| HTTP + RBAC | `taskModelVariablesRoutes.js`. Admin and district author; admin deletes; teacher may view. `authenticateToken` + `authorizeRole` |
| Query hooks | `src/api/queries/taskModelVariables.js` |
| Readiness mirror | `taskModelVariableReadiness.js` agrees with `validateEntity`. Type and value-set **keys** are an independent copy; levels are not |
| Tests | Schema gate, readiness agreement, HTTP tenancy + two consumers, mirror-drift, collection surface, route auth, role permissions |

**Shape.** `name`, `type` (`categorical` \| `ordinal` \| `numeric` \| `boolean`), author `possibleValues` **or** `valueSet`, numeric `range`. Tenancy fields are provenance. The collection is not in `TENANT_SCOPED_COLLECTIONS`: Task Models are shared, and hiding a variable inside one district would break “defined once”.

**Consumption.** `taskModels.taskModelVariableIds` lists shared ids. `taskModelVariableSettings` is the per-model constraint (allowed levels, numeric window, `required`). Changing either on a locked or operational Task Model is structural. Delete of a variable that any Task Model still lists is 409. An edit that would make a consumer’s allowed level illegal is 400.

**What this is not.** Task Models still store `taskStructure.presentationMode` (and response format, stimulus policy) as strings. Those strings now come from `ecdVocabulary.js` instead of a second copy. Re-pointing the fields at variable ids is D119, later, alone. No Task Model wizard step in this unit.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1980 passed | 9 skipped (1989) — 176 files (~30s)

npm run build
  green (7.18s); TasksManager chunk 5.27 kB (unchanged)
```

D115b close was **1936 passed / 9 skipped** (173 files). Delta: **+44 tests / +3 files** (`taskModelVariables.test.js`, `taskModelVariableReadiness.test.js`, `d116TaskModelVariables.test.js`) plus extensions of mirror-drift, role permissions, collection surface, and route auth. Skips unchanged.

No new screen, so there was no browser walk. The gate is the schema test and the HTTP test that posts one variable and two Task Models.

Session-close re-run 2026-09-21 on clean `main` at product tip `5d0717c`: same counts, **1980 passed / 9 skipped** (1989) across 176 files in 30.69s; `npm run build` green in 7.01s (product session recorded 7.18s); TasksManager chunk still 5.27 kB. Still no browser walk.

## Next

Calendar **D117** — remainder of W24 (Task Model Variable settings on the authoring surface). Do not start D119 (enum re-point; never-compress, alone), W25, or SessionPlayer work from this unit.
