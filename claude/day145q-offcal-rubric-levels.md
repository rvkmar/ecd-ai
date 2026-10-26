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

## What was delivered

The criteria table headers are editable. Each column has a label, a score, and Remove. Add level sits next to Add criterion.

Add criterion copies the current columns, including ones just added, and leaves the new cells empty. The cell editor still writes the same sentence into `descriptor` and `exemplar`.

The form maximum is 10 new columns from the button. It is not a validator change. `validateEntity` still accepts a longer list, which is how an imported rubric with 11 levels round-trips through Edit and Save.

Rubrics have no Duplicate action and no Structure tab. Work Products and Task Model Variables gained those shells in earlier off-calendar passes. This pass did not add them. The criteria-by-levels shape is the edit grid. Zip import and export store `dimensions` unchanged, so any level count in `rubrics.json` is kept.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2403 passed | 9 skipped (2412)
  Test Files 274 passed
  exit 0

npm run build
  green (1.26s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.92 kB (gzip 82.87 kB).
  RubricBuilder 18.76 kB (gzip 5.65 kB).

npm audit --audit-level=high
  clean. npm audit reported 0 vulnerabilities. No dependency was added.
```

Previous close on this tree was Task Model Variables parity, **2389 passed / 9 skipped**. Delta: **+14 tests / +3 files** (`rubricLevels.test.js`, `rubricGrid.test.jsx`, `rubricLevelZip.test.js`). `rubrics.test.js` and `d122Rubrics.test.js` were extended in place. Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://localhost:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` a throwaway file. Signed in as `admin1`.

Settings, Data, Upload. Keep original ids checked. The file was `samples/ecd-sample-complete.zip`.

Preview: 44 created, 0 failed, and "Nothing has been written yet." Rubrics: 2 created, 0 failed. Import finished with the same totals.

Libraries, Rubrics. Edit on Plant function judgement (`rub-function`, confirmed). Before Add level the grid had two columns: Wrong job at score 0, and Right job at score 1. Function match showed the sample sentences (a leaf takes up water; a leaf makes food).

Add level twice. The grid then had Wrong job 0, Right job 1, Level 3 at score 2, and Level 4 at score 3. The Level 3 cell was filled with "The student names a related job but not the main one." Save showed the toast "Rubric updated".

Reload, then Edit again. The same four columns and that sentence were still there. The stored row stayed `rub-function`, status confirmed, `activatesAt` 1. Level 4 was saved empty. The original two exemplars were still on Wrong job and Right job.

## Half-applied work

None on this grid. There is still no rubric Duplicate action and no Rubric Structure / Ingredients view. A duplicate of a criterion, via Add criterion, copies every current level rather than only the first two.

## Compression debt

None new.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

Do not treat this grid change as D146.
