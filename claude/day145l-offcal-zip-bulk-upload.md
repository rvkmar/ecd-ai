# Off-calendar — One zip for every ECD entity

**Not D146.** Not a calendar unit. Settings → Data can take one zip for the whole chain. The staged uploader and the single-entity cards stay.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| One archive | Admin uploads one zip. One JSON file per entity, bare array or one-key wrapper. Unknown files are skipped | **DONE** |
| Order and links | Server walks dependency order and rewrites old id → new id through the existing create builders. Templates, presentation models, and task-model variables are included | **DONE** |
| Preview then commit | Dry run reports per-entity created/failed and per-row errors. A bad row does not cancel the rest. Commit writes only the rows that passed | **DONE** |
| Ids | Default is a new id and draft. Optional toggle keeps an original id and status only when that id is free. A repeated id is not merged | **DONE** |
| Export | Download → Export all as zip writes the same layout | **DONE** |
| Limits | Admin only. Size, entry count, JSON only, no path traversal, no zip bomb. Node `zlib`. No new dependency | **DONE** |
| Untouched | Staged upload and the per-entity cards still post to their own routes | **DONE** |

## What was delivered

`POST /api/data/zip?dryRun=1&keepOriginalIds=0` accepts `application/zip`. `GET /api/data/zip` returns `ecd-entities.zip`. Both are admin-only.

Import order: curricular policies, selection policies, domain analyses, task-model variables, Student Models, competencies, design patterns, evidence models, task models, items, Q-matrix models, assembly models, presentation models, templates. Design patterns run before evidence so `seededFrom.designPatternId` can be rewritten. Evidence runs before task models. Items run before Q-matrices.

Each row is created by the same helper the single POST and `POST /bulk` routes already use (`allowDraftParents` where those routes already allow it). `_origin` and `_sources` are not stored. `_sources` is read only while choosing which imported copy a reference points at.

Settings → Data → Upload shows the zip panel above the staged uploader. Import stays disabled until Preview has run for the current file and the current keep-ids checkbox. Download shows Export all as zip above the per-entity cards.

The zip reader is Node `zlib` (`server/utils/safeZip.js`). Limits: 8 MB compressed, 100 entries, 32 MB uncompressed in total, 8 MB per file, compression ratio capped once a file is over 64 KiB. Methods 0 and 8 only. CRC checked. Encrypted, ZIP64, absolute paths, `..`, and multi-disk archives are rejected.

## Ids, collisions, and duplicate fixture rows

Default (toggle off): every row gets a new id and the builder's usual draft status. Links are still rewritten. Nothing already in the database is overwritten.

Toggle on: an original id is kept only when that id is absent from the database and has not already been taken by an earlier row in this import. Status, lock, and version are applied only when the id was kept. If that lifecycle fails the existing validator, the same id is retried as a draft and the row records a warning.

A repeated id inside the zip is not merged. Fixture packs reuse ids such as `tm-plant` and `da-plant` with different bodies. With the toggle on, the first free copy keeps the id. Each later copy gets a new id, draft status, and an id-collision warning. With the toggle off, every copy gets a new id.

A reference binds to the imported row that shares a `_sources` path (the part before `#`). If exactly one imported row has that id, that row is used. If several imported rows share the id and none shares a source with the reference, that referencing row fails as ambiguous. A reference does not point at a pre-existing database row when this import also created a row for that source id. Failed rows are dropped from the catalog so later rows do not link to them.

Rows with no id always receive a new id. Student-model variable ids and attribute ids are not collection ids and are left as stored.

## Sample zip (`by-entity-final.zip`)

Empty database, both modes. File-level errors: 0. Skipped: `by-entity-final/README-by-entity.txt` (not a JSON entity file). Q-matrix name rebind after the walk: 0, because no evidence model was created.

| Entity | Created | Failed |
|---|---:|---:|
| Curricular policies | 3 | 0 |
| Selection policies | 6 | 0 |
| Domain analyses | 7 | 0 |
| Task model variables | 2 | 0 |
| Student Models | 5 | 6 |
| Competencies | 0 | 2 |
| Design patterns | 7 | 3 |
| Evidence models | 0 | 9 |
| Task models | 3 | 10 |
| Items | 0 | 5 |
| Q-matrix models | 0 | 9 |
| Assembly models | 1 | 5 |
| Presentation models | 6 | 2 |
| Templates | 3 | 5 |
| **Total** | **43** | **56** |

The 56 failures are the existing validators, not the zip reader. Fixture Student Models lack `measurementIntent`. Fixture competencies lack `variableType`, so evidence rows that cite `c-plant` / `c-frac` have no competency. Sample evidence `competencyName` values are Student Model variable labels, and the evidence builder only matches competency records. Placeholders (`<EVIDENCE_MODEL_ID>`, `<REPLACE_WITH_REAL_...>`, `da-missing`, `pm-missing`, `dp-other`) do not resolve. Design-pattern work-product, rubric, and observable refs that are not in the database fail that row. Q-matrix rows need a Student Model id, or items that themselves failed. Three task models with no evidence id did import (Name the plant part, Plant part naming, Fractions). Plant part template and Fraction template imported because their presentation-model sources resolved. Newtonian assembly imported by Student Model name and policy name.

With the toggle on, created/failed stay 43/56. Ids actually kept: curricular policies 1, selection policies 2 (including `p-fixed`), domain analyses 5, task-model variables 2, design patterns 7, task models 3, presentation models 6, templates 3. `da-plant` occurs twice; the second copy (Plant parts, status confirmed) received a new id and stayed draft. One domain analysis has no id, so it always receives a new one. Explain a diagram (`dp-plant`) and Plant part presentation (`pm-plant`) kept their ids and fell back to draft because the original status failed validation. Statuses that did stick: domain analysis Fractions confirmed; design pattern Explain a diagram confirmed (the other copy); task models draft, operational, and confirmed; presentation models draft, reviewed, confirmed, and operational.

Two side effects of the existing builders are not in the per-file created count. Creating a curricular policy upserts content-standard domain analyses, so the database holds 10 domain analyses after 7 file rows succeed. Student Model import writes nested competencies, so the database holds 10 competencies even though `competencies.json` created 0. Export writes what is stored (domain analyses 10, competencies 10).

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2363 passed | 9 skipped (2372)
  Test Files 264 passed
  69.82s, exit 0

npm run build
  green (1.55s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.88 kB (gzip 82.85 kB).
  SettingsPage 78.43 kB (gzip 18.66 kB).
```

Previous close on this tree was Presentation Model parity, **2340 passed / 9 skipped**. Delta: **+23 tests / +3 files** (`safeZip.test.js`, `dataZipRoutes.test.js`, `zipBundlePanel.test.jsx`). `apiClient.test.js` gained the raw-body and blob cases. Skips unchanged.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed. `npm audit` still reports the pre-existing moderate finding. No dependency was added, and the high-severity audit gate was not loosened.

## Browser

Local Vite `http://localhost:5173` and the API on `:3000`, `DB_MODE=json`, `ECD_DB_FILE` a throwaway file. Signed in as `admin1`.

Settings → Data → Upload showed "All entities in one zip", the keep-ids checkbox unchecked, Preview, and Import, with "Or upload one entity type at a time" and the Users and Policies cards still underneath. Preview of `by-entity-final.zip` said "Preview: 43 created, 56 failed.", "Nothing has been written yet.", and skipped `README-by-entity.txt`. Import said "Imported: 43 created, 56 failed." and toasted "Imported 43 record(s)." The database stayed empty of those entities until Import. Download showed Export all as zip; the click toasted "Exported all entities as a zip." and the browser saved `ecd-entities.zip` (12.4 KB). A fresh `GET /api/data/zip` after that import was 200 and 12672 bytes, with the stored counts above.

Task Model (`?tab=taskmodels`) then showed Total 3: Name the plant part, Plant part naming, and Fractions, all draft, which is the default (new ids, draft) import. Light theme. No error toast.

## Half-applied work

None on this path. The staged uploader still expects the operator to copy new ids between stages. The zip path does that rewrite itself.

## Compression debt

None new. The archive reader does not pull in a zip package.

## Calendar

D146 was not marked. This upload has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this zip as that unit. W29 stays open.
