# Off-calendar: Activity selection reads the assembly packages

**Not D146.** Not a calendar unit. When a session cites a delivery model, IRT and BayesianNetwork draw candidates from the active composite library packages for that assembly model's competency model. A session with no delivery model keeps the roster. The W29 gate stays open.

## Premise

Confirmed before the change. `selectIrt` and `selectBayesianNetwork` ranked only unanswered ids in `session.taskIds`. G19 constraints used that same roster. A roster with no remaining legal task stopped on `constraints` even when another active package held a legal task. BayesianNetwork, when nothing could be ranked, delivered the first unanswered task and called that `first-unanswered`. The legacy `db.questions` reader was still the IRT path for a task with `questionId` and no `itemId`.

## Design

### Pool rule

A session that cites `deliveryModelId`, and whose resolved strategy is IRT or BayesianNetwork, uses the package pool. The resolved strategy is the assembly model policy when that policy exists, otherwise the delivery model policy. Fixed order does not use the pool. A session with no delivery model does not use the pool.

An active composite library package belongs to the assembly model when its task model has an evidence model whose competency `modelId` equals `assemblyModel.competencyModelId`. If that competency has no `modelId`, `evidenceModel.competencyModelId` is used. A package for a different competency model is not a candidate.

A candidate is an unanswered task that instantiates an item in such a package (`task.itemId` is in the package, and `task.taskModelId` is the package's task model). A suspended or archived item is left out. An item with no task record is not a candidate. Delivery still presents a task, and this unit does not create one.

Pool order is the session seed first, in seed order, then every other pool task id in `localeCompare` order. A tie keeps the earlier task.

If the assembly model has no `competencyModelId`, or no active package belongs to it, adaptive selection stays on the seed and a warning says so.

G19 constraints, exposure, and enemies filter this same list. An open minimum can be filled by a package task that was not in the seed. If every remaining pool task is illegal, the session still stops on `constraints`.

### What `session.taskIds` is

It is the seed. It is not an allow-list, and it is not ignored.

Create still requires a non-empty seed. Fixed order walks that seed and does not pull a task from outside it, even when the session cites a delivery model. IRT and BayesianNetwork on a delivery-model session do not filter the pool down to the seed. Seed order is only the tie-break and the start of pool order.

Submit appends a delivered task id that was not already in the seed. The original ids stay at the front. Reports also union response task ids, so a stored response whose task was never appended is still listed. Resume only flips status. The next selection reads the pool again.

### BayesianNetwork fallback

When no candidate has evaluable diagnostic information, selection delivers the first remaining candidate in pool order. `debug.fallback` is `pool-order`. A warning says this is not an information-gain ranking, and it lists why each candidate could not be ranked.

On a roster session, pool order is the seed, so the task is the one the old first-unanswered rule returned. The name and the warning are the change. G-DINA is still unrankable (D60 P1-5) and uses this fallback. IRT is still nearest difficulty, not maximum information.

### Legacy questions

`selectLegacyQuestionCandidate` stays. The package pool never calls it, because a package entry is an item. A delivery-model session with a question-only seed task and an item in a belonging package ranks the item.

The reader stays for a session with no delivery model, and for the roster fallback when no package belongs. The player still fetches `/api/questions` for a `questionId` task. `/submit` still has the question branch. The task schema still allows `questionId` XOR `itemId`. Removing the reader would leave a stored question-only session with no IRT choice. That removal needs those tasks migrated onto items, and the player and the submit branch retargeted. This unit does not do that, and it does not rewrite stored sessions.

### Exposure

Per-session exposure is unchanged from G19: the count of that item id in this session's responses. Selection does not read or write `item.exposureControl.usageCount`. A high global count does not remove an item from the pool. Submit still calls `recordItemUsage`, so an operational item, including one that was not in the seed, still increments `usageCount` when it is delivered. Global retirement stays on that submit path.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Pool | Delivery-model IRT and BayesianNetwork rank active packages for the assembly model's competency model. No delivery model stays on the roster. Fixed stays on the seed | **DONE** |
| Seed | `session.taskIds` orders ties and is not an allow-list. Submit appends a delivered off-seed id | **DONE** |
| Fallback | Unrankable BayesianNetwork delivers pool order and warns. G-DINA stays unrankable | **DONE** |
| Legacy | Roster question sessions still select. The package pool does not rank `db.questions` | **DONE** |
| Exposure | Session exposure is the response count. Selection does not touch `usageCount` | **DONE** |
| Reports and resume | Captured tasks include a response whose task was not in the seed. Pause, resume, and the next task still run | **DONE** |
| Zip | Sample zip imports with 0 failures. Sessions are not in the zip | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2527 passed | 9 skipped (291 files, 60.65s)
  Node 22.23.4 (this VM). package.json engines asks for Node >= 24.

npm run build
  green (vite, 1.30s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.86 kB).
  AssemblyModelBuilder 41.14 kB (gzip 11.19 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

`samples/ecd-sample-complete.zip`: 45 created, 0 failed, 0 file errors, for both new ids and keep-original-ids. Assembly models: 2 created, 0 failed. Sessions are runtime data and are not in the zip. No zip code changed.

## Remote

Draft pull request #108 against `main`: https://github.com/rvkmar/ecd-ai/pull/108. Branch `cursor/activity-selection-pool-5f19`. Product `cfbacc1`.

## Browser

No screen changed. SessionPlayer was not edited. It already loads whatever task id `/next-task` returns. After submit, the appended id is on `session.taskIds`, which the existing wizard already lists. The route test covers next-task, submit of an off-seed task, pause, resume, and the following next-task.

## Half-applied work

A delivery-model session whose assembly model has no active package stays on the seed and warns. Once any belonging package is active, the seed is no longer the candidate list.

A package item with no task record is not delivered. Creating that task is not part of selection.

## Left for later

- F24 / D129. `bnPosteriors` is still never written in production (F24). Continuous `jointPrior` is unchanged (D129). Do not re-open D129 as unused at scoring.
- G21. Characteristic features and rubric ids still do not flow into the seeded task model.
- G22. `valuedKnowledge` and `taskFeatures` are still not cited by id downstream.
- D60 P1-5. G-DINA information gain is still not computed. The fallback is now pool order, and the item is still not ranked.
- IRT is still nearest difficulty, not maximum information.
- Fixed forms do not pull a legal task from another package.
- Global `usageCount` is still not a selection input. Session exposure does not write it.

## Compression debt

None new.

## Calendar

D146 was not marked. This change has no calendar event.

## Next

Do not treat this as D146. W29 stays open. Calendar next stays D151 alone. The next textbook gap is G21.
