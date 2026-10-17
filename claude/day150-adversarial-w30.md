# D150 — Adversarial review of W27–W30

**Status: DONE as a review.** Tier 3, alone, never-compress. Started from `3a23330`. This review did not write D146–D149. A separate refuting pass read the code and ran three small probes. No files were changed by that pass.

## Exit check

> Ranked findings. Every P0 fixed the same day with a regression test. The handoff says whether the trait/diagnostic advisory holds.

| Claim | Executed? |
|---|---|
| Ranked findings | **Yes** — below |
| Each P0 fixed the same day with a regression test | **No P0.** Nothing to fix |
| W30 gate: a trait Student Model scored with DINA or G-DINA raises an advisory, and confirm is not blocked | **Holds** |
| W29 | **Stays open.** A Domain Analysis does not produce a Competency Model |

## What the review tried to break

A coherent design that still warns, a trait design scored diagnostically that warns nothing, a seed back-link lost when the parent pattern is edited or archived, curricular-policy rows lost by migration 006, and Q-matrix orphans left by migration 007. The Additional KSA overlap was checked for a match that fires on every label or on none.

## Findings (ranked)

**P1 — deleting a Design Pattern drops the seed back-link**

`DELETE /api/designPatterns/:id` refuses the delete only when a template cites the pattern (`designPatternsRoutes.js` 223–233). It does not look at `seededFrom.designPatternId` on Evidence Models or Task Models. A confirmed pattern can be seeded and then deleted. `GET /:id/descendants` then 404s because it looks up the pattern first. The seeded models keep their snapshot. Scoring is unchanged, which is why this is not a P0. Not fixed in this review.

**P2 — the same delete breaks a later save of a related pattern**

A pattern whose `relationships[].targetPatternId` points at the deleted pattern fails its next save, because `designPatternRelationErrors` requires the target to exist. Workaround: remove the relation first.

**P2 — the audit and the panel disagree about an inactive diagnostic model**

`traitDiagnosticDeparture` treats `active !== false` as active (`perspectiveInheritance.js` 65). Scoring treats a model as active only when `active` is truthy. A trait Evidence Model with an active IRT model and a DINA model that has no `active` field can write `coherence.proceed` for a model that will not score. `DINAConfigPanel` shows the advisory for any DINA or G-DINA candidate and does not read `active` (lines 107–110). The audit stays silent when `active` is `false`.

**P2 — renaming a Domain Analysis writes a proceed row**

`pushTraitDiagnosticProceed` fingerprints the whole departure, including `sourceName` (`auditLog.js` 70–73). Renaming the analysis changes that fingerprint and appends `coherence.proceed` on an evidence model nobody edited.

## Claims that held

- The advisory fires for `dina` and `gdina` when the effective perspective is `trait`. Information processing or sociocultural with DINA, and trait with IRT, stay silent. A stored non-trait value overrides a trait analysis until rebuild, which is the D146 rule.
- Confirm is not blocked. Evidence-model validation has no perspective rule.
- Editing a pattern keeps its id and does not rewrite seeded models. Design-pattern status is only `draft` or `confirmed`, so there is no archive transition to survive. Demoting to draft leaves descendants findable.
- Migration `007` does not write. Migration `006` copies a policy only when no Domain Analysis already holds it. The working tree has no `migrations.log.json` (it is written beside the database and is gitignored). A dry run against the local empty store changes nothing. That matches the D143 and D144 closes. It does not replay a live log that is not in the repo. The empty store is not lost data.
- The Additional KSA overlap trims and lowercases, skips the same pattern, and matches another pattern's Focal KSA. A missing relationship fails confirm and is allowed on a draft.

## Live walk (2026-10-17, `:6060`)

Signed in as `admin1`. The nginx image includes the perspective reader and the Additional KSA relationship. The store had no patterns, analyses, student models, or evidence models.

- Design Pattern identity says the perspective is read from the Domain Analysis and is not stored on the pattern.
- Created and confirmed **Name the part** with Focal KSA `Diagram conventions`.
- On **Explain a diagram**, an Additional KSA with that label showed: “Diagram conventions” is a Focal KSA of Name the part. This is advisory, not blocking. Confirm stayed disabled until the relationship was `required_but_not_measured`. Create draft stayed enabled. Confirm then stored the pattern as confirmed.
- Saved Domain Analysis **Fractions** as a draft with perspective Trait. Student Model **Plant part naming** was confirmed (same-author acknowledgment) and shows `Perspective: Trait Inherited from Fractions.`
- Evidence Model **Part naming evidence** is a draft bound to Names the part. On the statistical-model choice the line is `Perspective: Trait. Declared on Fractions.` Choosing DINA and opening Configuration shows: “Declared on Fractions. A trait perspective describes competence as a continuous latent trait, which a diagnostic model does not estimate. This is advisory, not blocking.”
- Warrants used to throw minified React error #185 on mount. The wizard now keeps the previous validity array when the reported flag is unchanged. After that fix the draft gained a warrant, an observable, an evidence rule, a seeded key, fairness notes, and DIF rows set to `na`. DINA still required a confirmed Q-matrix, which needs an item, which needs a Task Model, which needs this Evidence Model confirmed. The active statistical model was changed to Rasch 1PL and mapped to observable `o1792241707663`. Save for Review, then Lock & Confirm, stored **Part naming evidence** (`em1792239691400`) as confirmed and locked. Calibration is Not Calibrated.
- Template **Name the plant part** is a draft. Under the Student Model select the line is `Perspective: Trait. Declared on Fractions.` It cites the design pattern and the evidence draft. Task Model and Presentation Model have nothing to bind: a Task Model requires a confirmed Evidence Model, and a Presentation Model requires a Task Model.
- Assembly Model **Plant part naming assembly** was filled through identity and an SMV target, then cancelled. The store has no selection policy, and the wizard does not save until one is chosen.
- Presentation **Name the plant part** (`pm1792248740926001`) is confirmed at task-model version 1. Composite library `cl1792248740990004` carries that presentation. The first presentation, saved without a version, is archived.
- Libraries: work product **Selected plant-part name**, task-model variable **Plant diagram**, rubric **Plant part name** (confirmed). Template **Name the plant part** is confirmed on the student model, the evidence model, the task model, and the presentation.
- **Part naming evidence** is operational. Instantiated tasks `t1792248547771`, `t1792248547789`, and `t1792248547806` feed session `s1792248680597` (ready, student `walk-student-1`, fixed policy `p1792248680584`). The Sessions list shows that session with three tasks.
- Task model **Name the plant part** stayed confirmed. Activation returned: operational tasks must define accessibility assumptions, and must define an equivalence group. The confirmed record is locked, so those fields cannot be added on the transition.
- Clone `tm1792249385692001` is version 2. Access assumptions and equivalence group `plant-part-naming-v2` were saved before confirm. Items `it_mvcj0cp0_005`, `it_mvcj0crl_006`, and `it_mvcj0cuj_007` are confirmed on it. Presentation `pm1792249386051002` is confirmed at version 2. The clone is operational. Composite library `cl1792249386101008` has 3 items and no warnings. The Task Model list shows v1 Confirmed and v2 Operational.
- Assembly model **Plant part naming assembly** (`am1792249848051000`) is confirmed. Target: Names the part at classification accuracy 0.8. Stopping rules: 1 to 3 items, or when the target is met. Selection policy: `p1792248680584`. The Assembly Model list shows it Confirmed.
- Ten students in class 6A, plus `walk-student-1`, completed the three plant-part tasks. Eleven sessions are Submitted. The list shows Item limit reached and 3 responses. Learner feedback and the teacher report open for Class 6A student 1. Class report `6A` and district report `diet-chennai` return. Every response warns that the selected option did not match the item's `equalsCorrect` pattern, so Activated is null. The Analytics dashboard shows 0 sessions.
- Psychometrics tabs switch. Item analysis, test information, attribute profiles, DIF, and the catalogue are empty because `/api/analysisArtefacts` returns none. Session item analysis for Part naming evidence returns `UNSCORED`: 11 students, every `activated` null. Reference chrome is the only tab that does not depend on an artefact.

## Compression debt

D146, D147, D148, and D149 were opened on `:6060`. The trait/DINA advisory is on the configuration panel and does not claim to block. **Part naming evidence** was later confirmed as Rasch 1PL, because a DINA confirm still needs a Q-matrix. Standing risks stay open: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through, and the W29 gate.

## Next

The P1 delete is the open provenance hole. D151 was not started. W29 stays open. The W30 advisory was read on the DINA panel. **Part naming evidence** is operational as Rasch 1PL. Task model version 2 (`tm1792249385692001`) is operational. Assembly model **Plant part naming assembly** (`am1792249848051000`) is confirmed. Version 1 of the task model stays confirmed. The block is not closed, because W29 is a separate gate.
