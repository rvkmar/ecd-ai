# Off-calendar: Delivery Model

**Not D146.** Not a calendar unit. A session can now cite a delivery model. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Premise

Confirmed in the code before the change. There was no `deliveryModels` collection. A session stored `taskIds` and `selectionStrategy`. `resolveAssemblyModelForSession` inferred the governing assembly model from the competency model. The assembly model's `selectionAlgorithm.policyId` only added a warning (`not applied retroactively`) and did not change the session strategy.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Collection | `deliveryModels`: unique name, description, status `draft` or `confirmed`, `competencyModelId`, `assemblyModelId`, `policyId`, optional `presentationModelId`, administration (`timeLimitMinutes`, `attempts`, `allowedReview`, `feedbackMode`). `POST /api/deliveryModels/:id/confirm` | **DONE** |
| Confirm | Cited student model, assembly model, and presentation model must exist and be confirmed or operational. The assembly model must belong to that student model. A policy has no status, so it only has to exist. Administration must be present and valid | **DONE** |
| Readiness | `deliveryModelReadiness` runs the same binding check as confirm. The agreement test compares the two | **DONE** |
| Sessions | Optional `deliveryModelId`. When set, session create and activity selection use that assembly model and that policy. No inference, and no advisory-only warning. When absent, the old path is unchanged | **DONE** |
| UI | Admin, Models, Delivery Model, after Assembly Model. Dashboard, Delivery Structure (table and Ingredients View), Manage (New, search, status, readiness, Edit, Duplicate, Delete). Delete stays disabled while a session cites the id. The session builder can pick a delivery model | **DONE** |
| Zip | `deliveryModels` imports after presentation models and before templates, with id remaps. `samples/ecd-sample-complete/` includes `dm-plant`. The zip is rebuilt. Keep-original-ids import: 45 created, 0 failed | **DONE** |

## What was delivered

A delivery model is the CAF binding of one student model, one assembly model, one selection policy, an optional presentation override, and the administration rules. Status is `draft` or `confirmed`, the same machine as templates and rubrics. There is no operational state on this record. The cited models carry that, where they have a status.

Confirm and readiness share `deliveryModelBindingErrors`. A draft may cite draft parents, which is what lets the sample import. Confirm refuses a draft parent, an assembly model on a different student model, a missing policy, a bad feedback mode, attempts below 1, or a non-boolean review flag. `timeLimitMinutes` is a positive number or null. Feedback mode reuses `none`, `immediate`, and `delayed_end`.

Session create, when `deliveryModelId` is set, ignores the body's `selectionStrategy` and `nextTaskPolicy` and stores the policy's `type` and `{ policyId }`. An unknown id or a missing policy is 400. Activity selection resolves that assembly model even when it is still a draft, and it does not fall through to inference. A missing delivery model warns with `DELIVERY_MODEL_MISSING` and does not infer. A missing assembly model warns with `ASSEMBLY_UNBOUND`. The presentation overlay prefers `presentationModelId` on the delivery model, then the live pick, then the package pointer. The override still has to be linkable (locked, and confirmed, operational, or suspended, on the same task model version). The sample presentation model is a draft, so it is stored and not yet applied at delivery.

Delete returns 409 with the citing session ids. The Manage button is disabled with title "Remove citations before deleting". Duplicate has no clone route. The copy name is `<name> (copy)`, then `<name> (copy N)`, compared case-insensitively.

Admin can view, edit, and delete. District can view. Teacher and student cannot view. Writes are admin only.

## Sample

`dm-plant`, "Plant part naming delivery", status draft. It cites `cm-plant`, `am-plant`, `p-fixed`, and `pm-plant`. Administration is 20 minutes, 1 attempt, review allowed, feedback immediate. It stays a draft so both keep-id modes import with 0 failures and 0 warnings. Confirm of that row would fail until the student model, assembly model, and presentation model are confirmed or operational.

The sample zip has no `tasks` collection. Task models in the sample are draft and unlocked, so Instantiated tasks cannot create one. Browser session setup added one runtime task (`task-plant-leaf`, item `it-leaf`) to the JSON store after the import. The session itself was created in the session builder.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2449 passed | 9 skipped (2458)
  Test Files 280 passed
  59.35s, exit 0

npm run build
  green (1.30s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  DeliveryModelBuilder 24.41 kB (gzip 6.65 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

New tests cover schema and the readiness/confirm agreement, route confirm and delete rules, authoritative selection, the legacy fallback, presentation override, zip remap with and without original ids, the three-tab shell, admin tab order, role permissions, and the collection surface guard.

This VM ran the suite on Node 22. The package asks for Node >= 24. `npm ci` printed an engine warning and still installed. CI installs Node 24.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` pointing at a JSON file, signed in as `admin1`. Settings, Data, Upload. "Keep original ids and statuses" was on. The file was `samples/ecd-sample-complete.zip`.

Import finished: 45 created, 0 failed, including Delivery models 1 created, 0 failed. The store kept `dm-plant`.

Dashboard, captured before any session cited it: Total 1, Draft 1, Confirmed 0, Ready 0, Not ready 1, In use 0, Unused 1. Not ready is correct: the cited models are still drafts.

Structure listed `dm-plant`, Plant part naming delivery, draft, Not ready, student model Plant part naming, assembly model Plant part naming assembly, policy Fixed Form - Grade 6 Numeracy Benchmark, presentation Plant part presentation. Ingredients Administration showed Time limit: 20 minutes, Attempts: 1, Review: allowed, Feedback: Immediate.

Manage, before the session, showed New Delivery Model, search, lifecycle status, and readiness, with Edit, Duplicate, and Delete. After the session, the card read "1 session(s)" and Delete was disabled, title "Remove citations before deleting".

Session builder: student `stud1`, task `task-plant-leaf`, delivery model Plant part naming delivery (draft). Choosing it disabled the strategy and policy selects and set them to fixed and Fixed Form - Grade 6 Numeracy Benchmark. Save showed "Session created." The card read Delivery model: dm-plant, Strategy: fixed (Policy: p-fixed), Tasks: 1, status Ready. The list prints the policy id because `SessionList` is not given the policies array. The stored policy is `p-fixed`, which is the delivery model's policy.

## Half-applied work

The sample presentation model is stored on `dm-plant` and is not linkable yet, so next-task will not render that overlay until the presentation model is locked and confirmed, operational, or suspended. Session create does not require the delivery model itself to be confirmed, so a draft can be cited. That matches templates: confirm is the readiness gate, not a gate on every citation.

## Compression debt

None new.

## Calendar

D146 was not marked. This collection has no calendar event.

## Next

Do not treat this collection as D146. W29 stays open.
