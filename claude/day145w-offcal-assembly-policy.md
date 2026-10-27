# Off-calendar: Assembly model policy and content constraints

**Not D146.** Not a calendar unit. When a session cites a delivery model, the assembly model that delivery model names is the selection policy and the content constraints. A session with no delivery model keeps its own strategy. An assembly model with no constraints selects and stops as before. The W29 gate stays open.

## Premise

Confirmed before the change. `targetsBySMV` and `stoppingRules` already stop a session (`evaluateStoppingRules`, `assemblyProgress.js`). `selectionAlgorithm.policyId` only added a warning when it disagreed with the session strategy (`not applied retroactively`). G15 made `deliveryModel.policyId` the stored strategy when a session cited a delivery model, and ignored the body. There was no content or blueprint constraint field. Assembly progress was computed on submit and returned as an SMV-row array. It was not stored on the session.

## Design

### Policy

When the session cites `deliveryModelId` and the cited assembly model's `selectionAlgorithm.policyId` names a policy that exists and has a type, that policy drives selection.

Session create rejects an explicit `selectionStrategy` or `nextTaskPolicy.policyId` that disagrees, with 400. Omitting them stores the assembly model policy. The stored strategy is then the same policy selection will use.

The delivery model's own `policyId` is used only when the assembly model does not declare a usable policy (missing assembly model policy, or a policy id that does not resolve). That is the G15 fallback: the body is ignored and the delivery model policy is stored.

At selection time the assembly model policy still wins if a stored strategy disagrees. The warning says that policy drives the session and the stored strategy is not used. That covers a session created before this change. Prerequisite gating uses the same resolution.

A session with no `deliveryModelId` is unchanged. Its own strategy is used, and a disagreeing assembly model pointer stays a warning.

Confirm of a delivery model was not changed. The two policy ids do not have to match.

### Constraints

Optional `assemblyModels.constraints`. Absent, null, or an empty object means no constraints.

| Field | Row |
|---|---|
| `taskModelCounts` | `{ taskModelId, min?, max? }` |
| `contentStandardCounts` | `{ code, min?, max? }` |
| `taskModelVariableCounts` | `{ taskModelVariableId, value, min?, max? }` |
| `exposure` | `{ maxPerItem }` |
| `enemies` | `{ itemIds }` of at least two distinct ids |

`min` and `max` are integers of at least 1. At least one of them is required on a count row. `min` cannot exceed `max`. Unknown keys and duplicate rows are rejected. A task model id, task model variable id, or item id is checked only when that collection is an array on the db. A content-standard code is checked against curricular goal and competency codes on curricular policies and domain analyses, and only when at least one such code exists.

A task's content codes are the union of `item.metadata.contentStandardCodes`, `task.contentStandardCodes`, and `constructFramework.curricularGoalCodes` on the competency model reached through the task model's evidence models. A task model variable value starts from a task model setting whose variation is `fixed`, then `item.tmvAssignment`, then `task.tmvAssignment`. Exposure counts that item id in this session's responses. It does not read `item.exposureControl.usageCount`. An enemy group allows at most one distinct item id. Repeating the same item is an exposure concern.

### How selection and stopping enforce it

Maximums, exposure, and enemies exclude a task. If any minimum is still open and a remaining legal task can fill it, only those fillers are eligible. If nothing remaining can fill it, the legal set stays and a warning is recorded.

Fixed order walks forward from `currentTaskIndex`, skips answered and ineligible tasks, and does not go backward. Other strategies receive the eligible ids and start at index 0. If candidates remain and none are eligible, selection stops with rule `constraints`.

`targetsMet` does not stop while an unmet minimum still has a remaining filler. The warning says the session continues. If `targetsMet` is met, minimums are unmet, and nothing remaining can fill them, the session stops on `targetsMet` and the warning says so. `maxItems` still stops, and warns when a minimum is unmet.

An assembly model with no active constraints leaves the fixed path byte-identical to the pre-D56 branch.

### Progress

Submit on the item path, the legacy path, and human rating stores `session.assemblyProgress` when an assembly model resolves:

`{ assemblyModelId, updatedAt, delivered, targets: { declared, scored, met }, constraints? }`

The item-submit HTTP body still returns the SMV-row array under `assemblyProgress`. The spread of the session is overwritten on purpose so existing callers keep that array. GET session and the session report, learner feedback, and teacher report include the snapshot when it is present. The player and the teacher report show one line. Next-task does not write the snapshot.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Policy | A cited assembly model policy drives selection. Create rejects an explicit conflict. No delivery model keeps today's strategy | **DONE** |
| Constraints | Optional schema. Readable errors. Empty means unchanged delivery | **DONE** |
| Selection and stopping | Maximums, exposure, and enemies exclude. Open minimums prefer a filler and can hold `targetsMet`. A blocked roster stops with `constraints` | **DONE** |
| Progress | Snapshot stored on submit. Response array unchanged. Reports and the player show it | **DONE** |
| Editor | Content constraints step. Ingredients View lists the rows | **DONE** |
| Zip | Task model, task model variable, and enemy item ids remap. Plant sample has counts and an exposure cap. Complete zip imports with 0 failures | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2511 passed | 9 skipped (291 files, 55.01s)
  Node 24.22.1

npm run build
  green (vite, 1.42s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.86 kB).
  AssemblyModelBuilder 41.14 kB (gzip 11.19 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

This docs commit did not re-run the suite. The product commits are `967cc25` and `d611394`.

`samples/ecd-sample-complete.zip` with keep-original-ids: 45 created, 0 failed, 0 file errors. Assembly models: 2 created, 0 failed. The same totals came back from `POST /api/data/zip?keepOriginalIds=1` against the local API.

## Browser

Local Vite `http://127.0.0.1:5173`, API on `:3000`, `DB_MODE=json`, signed in as `admin1` / `WalkPass!2026`.

Assembly Structure, Ingredients View, Plant part naming assembly, Content constraints. The rows are "Name the plant part" with min 1, max 8; "Name the plant function" with min 1, max 4; and Exposure, at most 1 delivery of each item in the session.

Manage, Edit on that assembly, step Content constraints. The same two task model rows are filled in, and Maximum uses of each item is 1. Nothing was saved.

## Remote

Draft pull request #107 against `main`: https://github.com/rvkmar/ecd-ai/pull/107. Branch `cursor/assembly-model-constraints-e867`.

## Half-applied work

A session created before this change can still store a strategy that disagrees with the assembly model. Selection follows the assembly model and says so. New creates cannot store that disagreement.

When the assembly model has no usable policy, the delivery model policy is what gets stored. Confirm does not require the two ids to agree.

## Left for later

G20 is the next textbook gap, and it is coupled to this one:

- Candidates still come only from `session.taskIds`. If the roster has no remaining task that can fill a minimum or satisfy a maximum, an enemy group, or the exposure cap, selection stops with rule `constraints` even when another package holds a legal item.
- The legacy questions path is unchanged.
- Exposure here is the count of that item id in this session. It does not read or write `item.exposureControl.usageCount`. Global retirement stays on the item path.
- IRT still ranks only a task whose item sits in an active composite library package. An eligible set that cannot be ranked returns no task. The minimum-preference test gives the second task model its own package for that reason. Drawing candidates from packages beyond the roster is G20.

## Compression debt

None new.

## Calendar

D146 was not marked. This change has no calendar event.

## Next

Do not treat this as D146. W29 stays open. Calendar next stays D151 alone. The next textbook gap is G20.
