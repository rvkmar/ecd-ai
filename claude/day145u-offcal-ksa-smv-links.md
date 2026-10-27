# Off-calendar: design pattern KSAs cite the student model

**Not D146.** Not a calendar unit. Focal KSAs now name what the student model measures. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Premise

Confirmed before the change. `DESIGN_PATTERN_LABEL_ONLY_MENUS` included `focalKsas`. Additional KSAs were checked for a relationship and then returned, so they were label-only too. `formFromRow` and the focal list saved `{ label }` only. `seedFromDesignPattern` required `body.competencyId` or answered `400` with "competencyId is required." The seed form started empty and stayed disabled until a competency was chosen by hand. Competency and competency-model delete refused only a locked evidence-model citation. Zip remap did not know a KSA reference.

## What was delivered

Each focal KSA and each additional KSA may cite `competencyId`, and may cite `competencyModelId` together with `smvId`. The label stays. Blank link fields are omitted on save, so a label-only pattern loads and saves unchanged.

Cited ids must exist. A half pair is an error. When both a competency and a model are set, the competency must belong to that model. Client readiness does not check existence when the library snapshot is absent, matching the other menus.

Confirm warns when a labelled focal KSA is unlinked. It does not block. Existing confirm rules require the label, the summary, the rationale, and an additional-KSA relationship. They do not require a student-model id. A pattern can be confirmed before that model exists. Blocking would reject every existing confirmed label-only pattern, including the sample patterns that stay unlinked. The additional-KSA relationship still blocks confirm.

Readiness keeps `ready` for warnings. The structure table appends "Focal KSA linked" or "Focal KSA not linked". Ingredients View shows the competency name and `model name: variable label`, or "Not linked".

The editor shows a competency select and a student model variable select on each KSA, with "Not linked" when unset. The label input stays.

Seeding uses the request competency when it is non-empty. If the request omits it and exactly one focal competency is cited, that id is used. Several focal competencies without a choice return 400: "Focal KSAs cite more than one competency. Choose which competency to seed." None returns the same "competencyId is required." If the request includes `smvId` or `competencyModelId`, including an empty string, that choice is kept and a blank pair does not reapply the focal variable. If both keys are omitted, the single matching focal variable is attached. The evidence model and the copied task store `seededFrom.studentModel`. No statistical model is invented.

Delete of a competency that any design pattern KSA cites returns 409 "Cannot delete competency referenced by a design pattern." Delete of an unlocked competency model returns 409 "Cannot delete Competency Model referenced by a design pattern." when one of its competencies is cited or one of its student model variables is cited by `competencyModelId` and `smvId` together. Draft and confirmed patterns both count.

Zip import remaps `competencyId` and `competencyModelId` on focal and additional KSAs. `smvId` is not a collection id. Bare student model variables keep their authored ids, including `smv-names-part` in the sample. The sample pattern "Name a plant part" links "Plant-part vocabulary" to competency `c-plant`, model `cm-plant`, and `smv-names-part`. The sample zip is flat JSON at the zip root and imports with 0 failures.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Schema | Optional competency and student model variable on focal and additional KSAs. Label-only rows still valid | **DONE** |
| Editor | Picker per KSA. Missing ids fail validation. Unlinked focal KSA warns on confirm and does not block | **DONE** |
| Readiness | Structure readiness and Ingredients View show the link | **DONE** |
| Seed | Focal link pre-fills competency and student model variable. The request can override | **DONE** |
| Delete | A cited competency or student model variable blocks delete where those guards already live | **DONE** |
| Zip | Collection ids remap. Sample focal KSA is linked. Zip imports with 0 failures | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2480 passed | 9 skipped (287 files)

npm run build
  green

npm audit --audit-level=high
  found 0 vulnerabilities
```

This docs commit did not re-run the suite. The product commit is `37ee9cc`.

## Browser

Local Vite `http://127.0.0.1:5173`, API on `:3000`, `DB_MODE=json`, signed in as `admin1` / `WalkPass!2026`. Settings, Data, Upload. "Keep original ids and statuses" was on. The file was `samples/ecd-sample-complete.zip`. Import finished: 45 created, 0 failed.

Manage Design Pattern, Edit "Name a plant part", Focal KSAs. The label is "Plant-part vocabulary". Competency is "Names the part". Student model variable is "Plant part naming: Names the part".

Design Pattern Structure, Ingredients View, Focal KSAs on that card. The row is "Plant-part vocabulary" with "Names the part; Plant part naming: Names the part". Table readiness reads "Ready Focal KSA linked".

Confirm succeeded. Review & confirm, Seed draft models, shows the same competency and student model variable already selected. The seed button was not clicked.

## Remote

`git push` of `cursor/ksa-smv-links-f932` was refused: GitHub returned 403, "Permission to rvkmar/ecd-ai.git denied to cursor[bot]". The installation token reports `push: false`. The draft pull request against `main` was not opened. The commits are local on that branch.

## Half-applied work

None in the product. The branch is not on the remote.

## Compression debt

None new.

## Calendar

D146 was not marked. This link has no calendar event.

## Next

Do not treat this link as D146. W29 stays open. Calendar next stays D151 alone. The next textbook gap is G18.
