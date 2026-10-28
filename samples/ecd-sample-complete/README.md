# Complete ECD sample zip

One zip the Settings zip uploader accepts with no failed rows. It is two short chains, plants and fractions, linked the way the screens expect.

`samples/ecd-sample-complete.zip` is the archive. The JSON files in this folder are the same bytes, one file per entity, so a change is reviewable without unzipping.

## What is in it

| File | Rows | Story |
|---|---:|---|
| curricularPolicies.json | 2 | NCF-SE mathematics (CG-1) and science (CG-S1) |
| policies.json | 3 | Fixed form, IRT adaptive, Bayesian fractions diagnostic |
| domainAnalyses.json | 3 | Labelled diagram, plant structure, fractions |
| taskModelVariables.json | 3 | Plant diagram, Bloom demand, fraction denominator |
| workProducts.json | 3 | Selected plant-part name, selected plant-part function, selected equivalent fraction |
| rubrics.json | 2 | Plant function judgement (confirmed, with an exemplar), Fraction equivalence judgement (draft) |
| competencyModels.json | 2 | Plant part naming (two binary attributes), Grade 6 fractions (one) |
| competencies.json | 3 | Names the part, Names the function, Fraction equivalence |
| designPatterns.json | 3 | Explain a labelled diagram, Name a plant part (kind-of that pattern), Explain a fraction |
| evidenceModels.json | 3 | Part naming (IRT), Part function (DINA, bound to the plant Q-matrix by name), Fraction evidence. Fraction evidence also carries an inactive Bayesian network (sm-frac-bn) over smv-equiv, with a conditional probability for obs-equiv. The active model stays IRT. |
| taskModels.json | 3 | Name the plant part, Name the plant function, Name the fraction |
| items.json | 4 | Leaf, root, job of the leaf, equivalent to 2/4 |
| qMatrixModels.json | 2 | Plant part Q-matrix, Fraction equivalence Q-matrix |
| assemblyModels.json | 2 | Plant assembly on the fixed form, with task-model counts and a per-item cap. Fraction assembly on the Bayesian policy |
| presentationModels.json | 3 | One linear overlay per task model |
| deliveryModels.json | 1 | Plant part naming delivery: student model, assembly model, fixed policy, plant presentation, 20 minute administration |
| templates.json | 3 | One family binding per task |

Ids in the files are stable (`cm-plant`, `em-plant`, `tm-plant`, `wp-part-name`, `rub-function`, `dm-plant`, and so on). Cross-references use those ids. Work products have no status. Plant function judgement is confirmed in the file and stays confirmed only when "Keep original ids and statuses" is on and the row is valid. With the toggle off it is stored as a draft. Fraction equivalence judgement is a draft. Every other governed row is a draft.

Name a plant part cites valued knowledge `vk-plant-parts` and task feature `tf-plant-diagram` on the plant analysis. Explain a labelled diagram cites `vk-diagram-fit` and `tf-diagram-labelled`. The Plant diagram task model variable cites `tf-plant-diagram`. Design patterns list these work products and rubrics. Part naming evidence scores the selected plant-part name with a key. Part function evidence and Fraction evidence score with the matching rubric (method rubric), and each procedure's human phase cites that same rubric. The four items bind the work product that matches their stem, on interaction.workProductId.

Creating a curricular policy also writes a content-standard shell onto Domain Analysis. After import the Domain Analysis list shows the three analyses above plus one shell per curricular policy. That is the existing curricular-policy builder, not a second copy of `domainAnalyses.json`.

## How to load it

1. Sign in as an admin.
2. Open Settings, then Data, then Upload.
3. Choose `ecd-sample-complete.zip`.
4. Preview, then Import.
5. Leave "Keep original ids and statuses" off for new ids and draft status. Turn it on only on an empty store (or any store that does not already use these ids) when the screens should keep `cm-plant`, `tm-plant`, `wp-part-name`, `rub-function`, and the other ids in this folder. That is also when Plant function judgement stays confirmed.

A bad row in some other zip does not cancel the rest. This zip is written so Preview reports 0 failed.

## Regenerating the zip

After editing a JSON file in this folder, rebuild the archive from the repository root:

```bash
node samples/ecd-sample-complete/build-zip.mjs
```

The test `server/routes/__tests__/ecdSampleCompleteZip.test.js` imports the committed zip into an empty store with the toggle off and on, and it checks that the zip entries match these JSON files.
