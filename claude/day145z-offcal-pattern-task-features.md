# Off-calendar: design pattern features and rubrics seed into the drafts

**Not D146.** Not a calendar unit. A confirmed design pattern now carries the characteristic features the designer accepts onto the seeded task model, and turns accepted rubric ids that still exist into evaluation procedures on the seeded evidence model. The W29 gate stays open.

## Premise

Confirmed before the change. `seedFromDesignPattern` wrote a draft evidence model and a draft task model. Accepted variable features were copied onto `taskModelVariableIds`. A chosen variable feature with no `taskModelVariableId` still refused the whole seed. Accepted characteristic features stayed on `seededFrom` only. `blueprintConstraints` was `{}`. `evaluationProcedures` was `[]`. D137 had left those two copies out on purpose: characteristic features were labels, and a rubric id was not yet an evaluation procedure.

The schema still has no separate characteristic-feature collection. The label is the feature. `blueprintConstraints` is where a task model records constraints that stay fixed, so that is the field the labels now use. Evaluation procedures already cite `rubricId`.

## What was delivered

Accepted characteristic features with a label are stored as `{ label }` on `taskModel.blueprintConstraints.characteristicFeatures`. Declined features stay on the seed snapshot and are not copied. Variable features are unchanged: a chosen id is appended to `taskModelVariableIds`, and a chosen row with no id still returns 400 and writes nothing.

An accepted potential rubric becomes one evaluation procedure per accepted observation. The procedure uses the existing shape: `id`, `observableId`, `method: "rubric"`, `rubricId`, and a description taken from the menu label. The pattern does not say which observation a rubric scores, so each resolved rubric is attached to every selected observation. Both records stay drafts. Confirm still requires the claim, warrants, evidence rules, and the rest of the existing substance gate.

Rows that cannot be copied are skipped. The seed response includes `warnings`, and the seed panel lists them:

- A characteristic feature with no label.
- A potential rubric with a label and no rubric id.
- A rubric id that is not in `rubrics`.
- A rubric that still exists when no observation was selected. A procedure must cite an observable.

The evidence editor used to collapse every observation down to one procedure when Step 7 opened. It now keeps a second rubric on the same observation, and the row shows each `rubricId`. Editing the visible procedure updates the first one only. The task blueprint step lists characteristic features when they are present.

Zip import already rewrote `evaluationProcedures[].rubricId`. It now also rewrites `seededFrom.accepted.potentialRubrics[].rubricId` and the declined copy, on both the evidence model and the task model, so the snapshot stays on the same rubric as the procedure. Characteristic-feature labels are not collection ids and are not rewritten. `samples/ecd-sample-complete.zip` was not changed. It is still flat JSON at the zip root.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Features | Accepted characteristic-feature labels land on `blueprintConstraints.characteristicFeatures` | **DONE** |
| Variables | Chosen variable features still cite `taskModelVariableIds`. A missing id still refuses the seed | **DONE** |
| Rubrics | A rubric id that still exists becomes an evaluation procedure with `rubricId` | **DONE** |
| Unmapped rows | A blank feature, a label with no rubric id, a missing rubric, or a rubric with no observation is skipped and named | **DONE** |
| Drafts | Seeded records stay drafts. Confirm still refuses a model that lacks the claim | **DONE** |
| Existing data | An empty blueprint stays valid. Unselected menus are not copied | **DONE** |
| Zip | Snapshot rubric ids remap. The sample zip imports with 0 failures | **DONE** |
| UI | The seed panel shows the warning. The blueprint lists the labels | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2561 passed | 10 skipped (296 files, 67.53s)
  Node on this VM is v22. package.json engines asks for Node >= 24.

npm run build
  green (vite, 1.47s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 374.17 kB (gzip 82.94 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

No new skips. The sample zip test is `server/routes/__tests__/ecdSampleCompleteZip.test.js`. It passed inside that suite. The archive was not rebuilt.

## Browser

Local Vite `http://127.0.0.1:5173`, API on `:3000`, `DB_MODE=json`, signed in as `admin1`.

Seed draft models on "Explain a labelled diagram". Checked the observation, the live rubric, "Label only", "Retired rubric", the labelled-diagram feature, and the diagram-complexity variable. The blank feature stayed unchecked. The seed panel showed:

- Potential rubric "Label only" has a label but no rubric id, so it was not turned into an evaluation procedure.
- Potential rubric "Retired rubric" cites rubric "rb-missing", which no longer exists, so it was not turned into an evaluation procedure.

The new evidence model, Inferential Audit, shows method rubric and "Rubric rb-walk".

The editable task wizard will not open Blueprint Constraints while that evidence model is still a draft. That gate was already there. The seeded task was opened read-only so the stored label could be read. Blueprint Constraints lists Characteristic features: Uses a labelled diagram.

## Left for later

- G22. `valuedKnowledge` and `taskFeatures` are still not cited by id downstream.
- G-DINA information gain is still not computed (D60 P1-5). BayesianNetwork selection still delivers pool order for that family.
- The evidence step still edits one procedure per observation. Extra procedures on that observation are kept and listed, and they are not separate form rows.

## Compression debt

None new.

## Calendar

D146 was not marked. This change has no calendar event.

## Next

Do not treat this as D146. W29 stays open. Calendar next stays D151 alone. The next textbook gap is G22.
