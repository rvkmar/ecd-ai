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

## Compression debt

D146–D149 were not opened on `:6060`. The nginx image is behind `bcfc71a`, so those walks cannot be discharged here. Re-dated to the next live admin walk after the frontend image is rebuilt. Standing risks stay open: D68 mid-flight ingest, the competency-model archive walk, the D115b instantiated-tasks click-through, and the W29 gate.

## Next

The P1 delete is the open provenance hole. D151 was not started. W29 stays open. The W30 advisory gate holds; the block is not closed, because W29 is a separate gate and the live walks are unpaid.
