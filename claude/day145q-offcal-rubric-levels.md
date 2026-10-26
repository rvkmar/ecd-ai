# Off-calendar: rubric grids can add performance levels

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Root cause

A new rubric grid shows two columns because `blankDimension` in `RubricBuilder.jsx` seeds each criterion from `LOW_HIGH`: Low at score 0 and High at score 1. The table renders one column per level already on the criterion, and the only add button was Add criterion. There was no control that appended a performance level.

`rubricStarter.js` already defines four levels (Beginning, Developing, Accomplished, Exemplary). Those columns appear only after Write a first draft. They are not the blank-form default.

Nothing else caps the grid at two:

- `schema.js` requires at least one level per dimension. It does not set a maximum.
- `rubricReadiness.js` uses the same minimum. A confirmed rubric still needs at least one exemplar.
- `rubricsRoutes.js` stores the `dimensions` array it is given. `POST /:id/confirm` does not count columns.
- Zip import calls `createRubricRecord`, which keeps that array. Export writes the stored rows.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Cause | Blank grid is the two-level Low/High seed, plus no add-column control. Starter, schema, readiness, route, and zip are not a two-column cap | **DONE** |
| Add level | Appends one column on every criterion: editable label, score one above the current maximum, empty descriptor | **DONE** |
| Remove level | Drops that column. The form keeps at least two. A confirm appears when a descriptor or exemplar would be lost | **DONE** |
| Scores | Columns stay in author order. A blank or duplicate score is restored on blur. `activatesAt` follows the column whose score changes, and moves to the highest remaining score if that column is removed | **DONE** |
| Save and confirm | Create, edit, and save keep every level. `POST /:id/confirm` still requires one exemplar and accepts four or more levels | **DONE** |
| Starter and readiness | Write a first draft still fills four levels. Readiness accepts a longer list | **DONE** |
| Zip | Import and export keep four levels. A confirmed rubric stays confirmed when the original id is kept | **DONE** |
| Upper bound | The Add level button stops at 10. A rubric that already has more than 10 is shown and saved whole. The server has no level-count cap | **DONE** |
| Shell from #100 | Dashboard, Rubric Structure, and Manage Rubrics stay. Add level and Remove sit on the Manage form | **DONE** |
| Duplicate | Manage Duplicate copies every level into a new draft. It does not keep only the first two | **DONE** |
| Structure | The levels column is the widest criterion. Ingredients View lists every level label on the criterion | **DONE** |

## What was delivered

The criteria table headers are editable. Each column has a label, a score, and Remove. Add level sits next to Add criterion on the Manage form (New, Edit, and Duplicate).

Add criterion copies the current columns, including ones just added, and leaves the new cells empty. The cell editor still writes the same sentence into `descriptor` and `exemplar`.

The form maximum is 10 new columns from the button. It is not a validator change. `validateEntity` still accepts a longer list, which is how an imported rubric with 11 levels round-trips through Edit and Save.

This branch started before PR #100. That shell is on main as `6c467f2`. The merge keeps Dashboard, Rubric Structure, and Manage Rubrics, and puts the level controls on `RubricLibraryView`. Duplicate calls `formFromRow`, so the copy includes every level, then saves as a new draft. Structure counts levels with `levelCount` (the widest dimension). Ingredients View joins every level label on the criterion. A four-level rubric shows 4 in the table and all four names under Criteria. Zip import and export still store `dimensions` unchanged.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2417 passed | 9 skipped (2426)
  Test Files 277 passed
  exit 0

npm run build
  green (1.24s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  RubricBuilder 37.30 kB (gzip 10.74 kB).

npm audit --audit-level=high
  clean. npm audit reported 0 vulnerabilities. No dependency was added.
```

The suite is main after PR #100, plus the level-column tests. Two tests were added on the merge: Duplicate keeps four levels (`rubricTabs.test.jsx`), and Structure / Ingredients lists four level names (`rubricStructure.test.jsx`). Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://localhost:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` a throwaway file. Signed in as `admin1`.

Settings, Data, Upload. Keep original ids checked. The file was `samples/ecd-sample-complete.zip`.

Preview: 44 created, 0 failed, and "Nothing has been written yet." Rubrics: 2 created, 0 failed. Import finished with the same totals.

Libraries, Rubrics opens on Dashboard. Manage Rubrics, then Edit on Plant function judgement (`rub-function`, confirmed). The grid started at Wrong job (score 0) and Right job (score 1).

Add level twice. The grid then had Wrong job 0, Right job 1, Level 3 at score 2, and Level 4 at score 3. The Level 3 cell was filled with "The student names a related job but not the main one." Save showed the toast "Rubric updated".

Rubric Structure, Ingredients View. Plant function judgement read "Confirmed • Ready • 1 criterion • 4 levels". Criteria listed Function match with Wrong job, Right job, Level 3, and Level 4. Table View showed 4 in the Levels column.

## Half-applied work

None. The three-tab shell from PR #100 is intact. Duplicate copies every level. Structure and Ingredients View show every level, not only the first two.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

Do not treat this grid change as D146.
