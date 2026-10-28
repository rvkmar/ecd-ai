# Off-calendar: plant sample can confirm with 2PL

**Not D146.** Not a calendar unit. Does not start D154. Does not loosen the rule that a binary competency allows only 1PL (Rasch) IRT.

## Modelling choice

`c-plant` stays binary. The plant Q-matrix (`qm-plant`) and `sm-plant-dina` on `em-function` use it, with `c-function`, as diagnostic attributes. A binary attribute is a mastery class. 2PL estimates discrimination and difficulty on a continuous latent trait, so confirmation correctly refuses 2PL on `c-plant`.

The 2PL evidence model now targets a third student-model variable, Plant-part naming proficiency (`c-plant-proficiency`), continuous on a scale from -3 to 3. In the CAF a student model can hold both grains. The continuous variable is the theta the naming items update. The binary attributes are the Q-matrix. They are not the same variable, and the proficiency is not a sum of the two attributes.

The three variables use `correlates-with`, stored in both directions. That is the relationship that says the claims move together without making one a part or a prerequisite of another. A `part-of` link onto the same target would be a second relationship type, which confirmation rejects. `correlates-with` must be symmetric, so each pair is written on both competencies. With three competencies the audit floor is `min(3, n*(n-1))`, which is 3. The sample declares 6.

The fraction model stays unidimensional and binary. Its active model is 1PL. That is the IRT form a binary competency allows, and the Q-matrix attribute is that same variable. The inactive Bayesian network still updates it.

The student-model perspective stays information processing, because the diagnostic attributes are still in the model. The mixed-type advisory (continuous plus binary, separate evidence models) is expected and does not block confirmation.

## Sample changes

`samples/ecd-sample-complete/` and the flat zip at `samples/ecd-sample-complete.zip`.

- Competency `c-plant-proficiency` added. `em-plant` and `sm-plant-irt` (2PL) target it. Decision rule is a posterior threshold at 0, with the calibration basis named.
- `c-plant` and `c-function` stay binary. Q-matrix attributes and assembly targets use those competency ids, which are the student-model variable ids after review sync.
- Both student models cite their curricular policy and goal (`cp-plants` / CG-S1, `cp-math` / CG-1). State values are `value`, which is what sync copies onto the variable scale. Fraction states are `not_mastered` and `mastered` so the Bayesian table still matches.
- Evidence models carry fairness notes, a DIF checklist, a pilot sample size, and warrants with a cognitive attribute. The naming procedure has a key artifact (`equalsCorrect`), because the correct option id differs by item.
- Keyed MCQs score the key at 1 and each distractor at 0, with no strength on the 0. Three naming items (leaf, root, stem) so a 2PL family has a third item. Function evidence has a second observable (function, not location). Fraction evidence has a lowest-terms observable. Task structure declares presentation mode, response format, and a parameterized stimulus. Observable weights on a task sum to 1.
- Plant items carry an intended difficulty inside the task range, plus pilot 2PL `a` and `b`. Function items carry pilot DINA slip and guess. Fraction items carry 1PL pilot parameters with discrimination 1.

## Import

`createCompetencyRecord` drops relationships so a row can be inserted before its sibling exists. Symmetric `correlates-with` is applied after every competency in the file has an id, and the target ids are remapped.

Review then rewrites student-model variable ids to competency ids. The sample authors those ids up front so draft validation can see them. When import assigns new competency ids, a later pass renames the variable and every citation that used that same id: Q-matrix attributes, assembly targets, design-pattern `smvId`, and the Bayesian latent node. A bare id that is not a competency id, such as `smv-names-part`, is not rewritten. `smvId` stays off the foreign-key path list. Zip entries stay flat JSON at the zip root.

Item create now keeps a DINA pilot `dinaParams` pair the same way it already kept IRT pilot parameters. Without that, a confirmed DINA item in this sample would lose slip and guess on import.

The unidimensional evidence lock now looks only at competencies in the same student model. It was treating a confirmed plant evidence model as a second competency of the fraction model. A unidimensional model still cannot confirm evidence for two of its own competencies.

## Migration

None. The 2PL refusal runs only when the evidence model is confirmed. The shipped rows are drafts, and a draft save does not run that rule. An install that already confirmed the old 2PL-on-binary model is locked. Changing its competency and its statistical target is a new measurement claim, which confirmation does not allow on a locked model. The author clones, or imports this sample. A migration keyed on `c-plant` would also miss installs that imported with new ids, and a migration keyed on names could rewrite a model the school had edited.

## Verification

`server/routes/__tests__/ecdSampleCompleteLifecycle.test.js` imports the zip with original ids and with new ids, then walks every authored model to confirmed. Domain analyses, design patterns, rubrics, templates, and the delivery model confirm from draft, because those collections have no reviewed status. The others go draft, reviewed, confirmed. Content-standard shells created from the curricular policies are not sample models and stay draft.

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2672 passed | 10 skipped (2682)
```

The 10 skipped tests are the existing live-R cases. No new skips.
