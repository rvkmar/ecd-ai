# Off-calendar: work products and rubrics in the ECD zip

**Not D146.** Not a calendar unit. The one-zip import and export from PR #85 now includes Work Products and Rubrics. Validators are unchanged.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Builders | `createWorkProductRecord` and `createRubricRecord` are what POST writes. The zip walk calls them | **DONE** |
| Collections | `workProducts` and `rubrics` sit after `taskModelVariables` and before `designPatterns` on import and export | **DONE** |
| Ids | An original id is kept only when unused. Otherwise a new id. Work products have no status. A rubric stays confirmed only when the id is kept and the existing validator accepts it | **DONE** |
| Links | Items `interaction.workProductId`, evidence `evaluationProcedures[].workProductId`, `evaluationProcedures[].rubricId`, and `evaluationProcedures[].phases[].rubricId` are rewritten. Design-pattern menus already were | **DONE** |
| Sample | `samples/ecd-sample-complete/` has 3 work products and 2 rubrics, wired into the plant-part and fraction stories. Zip rebuilt with `build-zip.mjs` | **DONE** |
| Untouched | Name uniqueness, type lock, rubric confirm rules, and the other validators are the same code | **DONE** |

## What was delivered

`GET /api/data/zip` and `POST /api/data/zip` now read and write `workProducts.json` and `rubrics.json`. Unknown files are still skipped. A file named `workProducts.json` or `rubrics.json` is no longer "Unrecognised entity file".

Import order: curricular policies, selection policies, domain analyses, task-model variables, work products, rubrics, Student Models, competencies, design patterns, evidence models, task models, items, Q-matrix models, assembly models, presentation models, templates.

Work products have no status field. The collision warning for that collection does not claim a draft status. Rubrics use the same draft fallback as the other governed rows: confirmed is applied only when `keepOriginalIds` kept the id and `validateEntity` accepts it. A confirmed rubric with no exemplar is retried as draft and records the existing warning.

Settings, Data, Upload lists `workProducts.json` and `rubrics.json` in the zip panel.

## Complete sample

Empty database, both modes. File-level errors: 0. Skipped: none. Warnings: none. With the toggle on, every source id is kept. With it off, every id is new.

| Entity | Created | Failed |
|---|---:|---:|
| Curricular policies | 2 | 0 |
| Selection policies | 3 | 0 |
| Domain analyses | 3 | 0 |
| Task model variables | 3 | 0 |
| Work products | 3 | 0 |
| Rubrics | 2 | 0 |
| Student Models | 2 | 0 |
| Competencies | 3 | 0 |
| Design patterns | 3 | 0 |
| Evidence models | 3 | 0 |
| Task models | 3 | 0 |
| Items | 4 | 0 |
| Q-matrix models | 2 | 0 |
| Assembly models | 2 | 0 |
| Presentation models | 3 | 0 |
| Templates | 3 | 0 |
| **Total** | **44** | **0** |

Work products (no status): Selected plant-part name, Selected plant-part function, Selected equivalent fraction. All `selected_response`, which is what the existing multiple-choice items can bind.

Rubrics: Plant function judgement is confirmed in the file and has a level exemplar (a leaf makes food; a leaf takes up water). Fraction equivalence judgement is draft and also has exemplars. With the toggle off, Plant function judgement is stored as draft. With the toggle on, it stays confirmed.

Links, after either import, point at the rows this import created:

- Leaf on the diagram and Root on the diagram bind Selected plant-part name. Job of the leaf binds Selected plant-part function. Equivalent to 2/4 binds Selected equivalent fraction.
- Part naming evidence scores that name with method `key`.
- Part function evidence uses method `rubric`, the function work product, Plant function judgement, and a human phase that cites the same rubric.
- Fraction evidence uses method `rubric`, the fraction work product, Fraction equivalence judgement, and a human phase that cites that rubric.
- Explain a labelled diagram lists the function work product and Plant function judgement. Name a plant part lists the name work product. Explain a fraction lists the fraction work product and Fraction equivalence judgement.

Creating a curricular policy still upserts a content-standard shell, so Domain Analysis holds 5 records after 3 file rows. That is the existing builder.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2367 passed | 9 skipped (2376)
  Test Files 265 passed
  59.26s, exit 0

npm run build
  green (1.35s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.88 kB (gzip 82.85 kB).
  SettingsPage 78.47 kB (gzip 18.67 kB).
```

Previous close on this tree was the one-zip upload, **2366 passed / 9 skipped**. This pass adds **+1 test** in `ecdSampleCompleteZip.test.js` (export includes the two collections). The same file now asserts the new counts, both modes, and the remaps above. `dataZipRoutes.test.js` expects `workProducts.json` and `rubrics.json` in the export. Route tests `d121WorkProducts` and `d122Rubrics` still pass. Skips unchanged. Suite is now **2367 passed / 9 skipped**.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed. `npm audit --audit-level=high` is clean. One pre-existing moderate advisory remains. No dependency was added.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` a throwaway file. Signed in as `admin1`.

Settings, Data, Upload. Keep original ids checked (empty store). Preview of `samples/ecd-sample-complete.zip` said "Preview: 44 created, 0 failed, keeping free original ids." and "Nothing has been written yet." Import said "Import finished." and "Imported: 44 created, 0 failed, keeping free original ids."

Libraries, Work Products listed the three selected-response rows. Used by: name 2 items, function 1 item, equivalent fraction 1 item.

Libraries, Rubrics listed Plant function judgement as confirmed (1 EM) and Fraction equivalence judgement as draft (1 EM).

Design Patterns, Design Pattern Structure, Ingredients View. Explain a labelled diagram (`dp-diagram`) shows Potential work products "Selected plant-part function" and Potential rubrics "Plant function judgement".

## Half-applied work

None on this path. The staged uploader is unchanged. AIG routes stay unmounted.

## Compression debt

None new. The archive reader is still Node `zlib`.

## Calendar

D146 was not marked. This upload has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this zip change as that unit.
