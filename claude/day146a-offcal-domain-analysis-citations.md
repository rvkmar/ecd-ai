# Off-calendar: domain analysis statements are cited by id

**Not D146.** Not a calendar unit. Valued knowledge and task features now have stable ids, and design patterns and task model variables can cite those statements. The W29 gate stays open.

## Premise

Confirmed before the change. A Domain Analysis feeds `psychologicalPerspective` inheritance, `contentStandards`, and `domainAnalysisId` pointers on competency models, Q-matrices, and design patterns. `valuedKnowledge` and `taskFeatures` were `{ label }` only. Nothing downstream stored an id for those rows. Design pattern KSAs could cite a competency and a student model variable (G17). Characteristic features were labels (G21). Task model variables did not cite a domain analysis statement.

## What was delivered

`valuedKnowledge` and `taskFeatures` rows gain a stable id when they do not have one. A label-only row still validates. Save assigns an id, and a later save that sends the same label without an id keeps the old id. Editing the wording in the Domain Analysis form keeps the id on that line. Migration `009-domain-analysis-entry-ids` backfills stored rows and does not rewrite labels. A dry run writes nothing. The other five Layer-1 sections stay labels.

A focal KSA and an additional KSA may cite `valuedKnowledgeId`. A characteristic feature and a variable feature may cite `taskFeatureId`. A task model variable may cite `taskFeatureId`, and may name `domainAnalysisId` so the list is that analysis. Blank citations are omitted, so a label-only row still saves as a label-only row.

When the record has `domainAnalysisId`, the cited entry must be on that analysis. When it does not, the id must exist on exactly one Domain Analysis. A missing id, a string that is not an id, and an id that appears on more than one analysis are readable save errors.

Deleting a Domain Analysis that still has a cited statement returns 409. Saving an analysis that drops a cited id returns 409. The message names a design pattern, a task model variable, a task model, or an evidence model, matching the G17 and G18 refusal. An uncited analysis still deletes.

Seeding copies a valued-knowledge id onto `seededFrom.valuedKnowledge` on the draft evidence model and the draft task model. An accepted characteristic feature copies `taskFeatureId` onto `blueprintConstraints.characteristicFeatures` when the row has one. Variable-feature rows are already copied onto the seed snapshot, so a `taskFeatureId` on that row comes with them. The shared task model variable is not rewritten.

Zip import gives statement rows ids and rewrites `valuedKnowledgeId` and `taskFeatureId` on design patterns, task model variables, blueprint characteristic features, and the seed snapshot. `samples/ecd-sample-complete.zip` now cites plant and diagram statements. It stays flat JSON at the zip root and imports with 0 failures.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Ids | Valued knowledge and task features receive a stable id. A label-only save keeps it. Other sections stay labels | **DONE** |
| Citations | KSAs may cite valued knowledge. Features and task model variables may cite a task feature. A label-only row still saves | **DONE** |
| Scope | A record with `domainAnalysisId` may cite only that analysis. A missing or ambiguous id fails with a readable error | **DONE** |
| Delete | Removing a cited statement, or deleting the analysis, returns 409 | **DONE** |
| Seed | The blueprint and the seed snapshot carry the ids the target can store | **DONE** |
| Zip | Statement ids remap. The sample zip imports with 0 failures | **DONE** |
| UI | Pickers sit next to the current fields. Unset means not linked | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2584 passed | 10 skipped (303 files, 64.64s)
  Node on this VM is v22. package.json engines asks for Node >= 24.

npm run build
  green (vite, 1.25s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 374.17 kB (gzip 82.95 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

No new skips. The baseline before this change was 2561 passed and 10 skipped.

## Browser

Local Vite `http://127.0.0.1:5173`, API on `:3000`, `DB_MODE=json`, signed in as `admin1`. The sample zip was imported with original ids kept: 45 created, 0 failed.

Manage Design Pattern, Edit "Name a plant part", Focal KSAs. The label is "Plant-part vocabulary". Valued knowledge is "Leaf, root, stem, and flower, and the job each one does". Competency is "Names the part". Student model variable is "Plant part naming: Names the part".

Characteristic and variable features. The characteristic label is "One part is called out on a flowering-plant diagram". Its task feature is "A labelled diagram of a flowering plant, with one part called out". The variable feature "Plant diagram" stays "Not linked", which is the label-only path.

Manage Task Model Variables, Edit "Plant diagram". Domain Analysis is "Plant structure". Task feature is the same flowering-plant statement.

Manage Domain Analysis, Edit "Plant structure", Valued knowledge. The line is the plant-parts statement, and the note says editing the line keeps the statement id.

A direct save that renamed that statement and kept `vk-plant-parts` returned 200. A following save that sent the label only kept `vk-plant-parts`. Clearing task features returned 409: "Cannot remove a task feature referenced by a design pattern or a task model variable." The original label was restored.

## Left for later

- G-DINA information gain is still not computed (D60 P1-5). BayesianNetwork selection still delivers pool order for that family.
- The evidence step still edits one procedure per observation. Extra procedures on that observation are kept and listed, and they are not separate form rows.
- Deleting a Design Pattern can still drop a seed back-link (D150).

## Compression debt

None new.

## Calendar

D146 was not marked. This change has no calendar event.

## Next

Do not treat this as D146. W29 stays open. Calendar next stays D151 alone. The textbook ECD gaps G15 to G22 are all closed.
