# Textbook ECD gaps T1–T28 and fix plan (audit of main 2d5ada6, 2026-10-29)

**Not D146.** Off-calendar record. No product code was changed by this audit.
Audited read-only at `origin/main` `2d5ada6` ("Record Wave 4: …"). The references are Mislevy, Steinberg & Almond (2003); Mislevy & Riconscente (2006); Almond, Steinberg & Mislevy (2002, four-process architecture); and Almond et al. (2015, *Bayesian Networks in Educational Assessment*).
Page: https://cursor.com/canvas/store-b0394a21-356e-487f-9e3f-c7ff1961557c/604d4f5c-cff8-4858-8d6d-7bb96cb98d5c

## Path check when this handoff was filed

Re-checked `origin/main` `2d5ada6` before this copy. That is the commit named above. Wave 4 (`claude/day146ae-offcal-wave4-limits.md`) changed docs only, so the product tree matches this audit. No `T1` to `T28` or `TU1` to `TU27` gap id exists in `claude/` or `docs/`. `day146af` was free (`day146ae` is Wave 4). The gap text below is unchanged. This note records where a cited line, or a fact beside it, differs.

- T1. Session IRT cuts sit at `server/routes/reportsRoutes.js` L181-187, inside the cited ~L181-197. Learner-feedback IRT cuts sit at L326-333. The BN 0.7 / 0.4 cuts in that same handler sit at L354-355, four lines past the cited ~L326-351. Teacher IRT level sits at L489-495, inside ~L489-516. Class BN level is L696, as cited. `claimStatement` is still absent from this file. Accumulation `sem` is still written at `server/delivery/evidenceAccumulation.js` L1273, L1282, L1318, L1451, and L1629. Reports still leave that field unread.
- T1, beside the four-place list. The teacher report stores `stderr` as `1/sqrt(n)` at L490-494. That value is the response count, separate from the accumulation SEM. District recommendations also use mean < 0 / mean > 1 at L912-914 and BN 0.4 / 0.7 at L931-934.
- T2. `DEFAULT_MASTERY_THRESHOLD = 0.5` is `server/delivery/attributeClassification.js` L78. `decisionRule` is still read on `server/routes/evidenceModels.js` for the calibration gate and the decision-rule write. Scoring still uses the constant. The ledger bullet "Mastery cut fixed at 0.5" is already struck (Wave 4, ADR 0004, `claude/day146ae-offcal-wave4-limits.md`). This record leaves that strike in place.
- T3. `converged !== true` is still at `server/routes/evidenceModels.js` L823 (recalibrate, which then activates) and L955 (activate). Both sites also require `packageVersion` and a positive `sampleSize`. Recalibrate also requires `calibrationMethod`. `fitStatistics` may be stored (L843) and does not block activation. `r-backend/app/modules/calibrate.R` `.itemfit_from_mirt` starts at L227 and `mirt::M2` is at L405, inside the cited ~L227-410.
- T6. `students` in `src/utils/schema.js` (L691-696) is `id`, `name`, `createdAt`, and `updatedAt`. The audit text says `{id, name}`.
- T8. `server/r/calibrationContract.js` families are still irt, dina, gdina, ctt, dif, equating, item-analysis, test-information, and attribute-profile. `src/components/evidences/calibration/engines/calibrationFile.js` still names `bayesian-cpt`.
- T9. `LIVE_KINDS` in `server/r/liveResponseMatrix.js` L72-77 is still irt-parameters, dina-parameters, ctt-statistics, and item-analysis.
- T11. `taskCompositionType` and `subTaskIds` do not appear under `server/delivery`.
- T14. The delivery-model PUT is `server/routes/deliveryModelsRoutes.js` L128-151, as cited.
- T15. `.cutscore_summary` is `r-backend/app/modules/cttAnalysis.R` L375.
- T18. The response row sets `timestamp: scoredAt` at `server/routes/sessionRoutes.js` L809, as cited.

These cited paths are present and were not re-lined: `WarrantBuilder.jsx`, `Step7InferentialAudit.jsx`, `Step8StructuralAudit.jsx`, `src/components/qMatrix/QMatrixValidity.js`, `presentationChrome.js`, `presentationPlayer.js` (`responseFeedbackLines` at L119), `ItemResponseFeedback.jsx`, `server/delivery/deliveryAdministration.js` (`extraTimeMinutes`), `server/utils/lifecycleValidation.js`, `server/routes/taskModelsRoutes.js`, `server/import/ecdZipImport.js`, `server/delivery/raterQueue.js`, `domainAnalysesRoutes.js`, `designPatternsRoutes.js`, `templatesRoutes.js`.

## Id scheme (read first)

- **Gaps are `T1`–`T28`** ("T" for textbook). The audit Page first used G1–G28, but the ledger already uses `G1, G3, G6, G8, G9, G11–G22` (for example G19 = a cited delivery model binds its `assemblyModelId`), so G ids would collide. No `T<n>` id exists anywhere in `claude/` or `docs/` on 2d5ada6.
- **Fix units are `TU1`–`TU27`.** No `TU<n>` id exists in the repo. Calendar unit **D155** keeps its own id and is not renumbered.
- In the text below, "ledger G19", "R5" and similar refer to existing ledger ids, not to new ones.

## Instructions for the agent adding this to `claude/progress-ledger.md`

1. Add one row to the **Current position** table, under the "Textbook ECD re-audit" row:
   `| Textbook ECD gap audit 2 (2026-10-29) | 28 gaps T1–T28 on main 2d5ada6 (3 High, 14 Med, 11 Low; 18 new, 9 tracked, 1 partly tracked). Fix plan TU1–TU27. Source: claude/day146af-offcal-ecd-textbook-gaps-t.md. **Not D146.** |`
   (Use the next free handoff suffix if `day146af` is taken.)
2. Copy this file to `claude/day146af-offcal-ecd-textbook-gaps-t.md` as the handoff.
3. Under **Carried-forward gaps**, add a sub-list "Textbook gaps T1–T28 (2026-10-29)", one line per **new** gap (id, title, severity, planned unit).
   - For the 9 fully tracked gaps (T13, T16, T17, T23–T28), add only a cross-reference to the existing entry (for example "T16 = R5 remainder"). Do not duplicate them, and do not un-strike any existing line.
   - For T2, add the line and cross-reference the existing "Mastery cut fixed at 0.5" entry.
4. Change no product code. Commit only the ledger plus the handoff, and only on the user's OK.

## Rules for every fix PR

- **Not D146.** Each PR writes its own handoff in `claude/` marked **Not D146**. Merging needs the user's explicit OK.
- **Small and self-hosted, no paid APIs.**
  - R work uses CRAN packages inside the existing `r-backend` container (mirt, GDINA, TAM, difR, plink are already there; new ones are limited to free CRAN packages such as PerFit or eRm).
  - Read-aloud uses the browser's built-in `speechSynthesis`, not a cloud TTS.
- **Back-compatible by default.** New fields are optional, and when a field is absent today's behaviour holds (for example the 0.5 mastery cut). A unit needs a migration only where the plan says so.
- **Shared files: merge serially and rebase.** Many units touch `src/utils/schema.js`, `server/routes/reportsRoutes.js`, `server/delivery/evidenceAccumulation.js` or `r-backend/app/modules/calibrate.R`.

## Summary

| Severity | Count | New | Tracked |
|---|---|---|---|
| High | 3 | 2 | 1 partly (T2) |
| Medium | 14 | 11 | 3 (T13, T16, T17) |
| Low | 11 | 5 | 6 (T23–T28) |
| **Total** | **28** | **18** | **10 (9 fully, 1 partly)** |

## Gaps

Severity scale: High means the gap undermines the inference or its use. Medium means a textbook capability is missing. Low means the gap is narrower, or is an already-recorded limit.

### T1 - Score reports not tied to claims (High, new)
- **ECD element:** delivery and reporting (summary scoring and reporting).
- **Textbook:** reports state the claim, the evidence, the uncertainty, and what to do next.
- **Today:** `server/routes/reportsRoutes.js` uses hardcoded cuts in four places: session (~L181–197), learner-feedback (~L326–351), teacher-report (~L489–516) and class (~L696). Those cuts are theta > 1 "Advanced", > 0 "Proficient", and Bayesian network (BN) 0.7 / 0.4, with generic advice. Reports never read `evidenceModels.claimStatement`. SEM is computed in `server/delivery/evidenceAccumulation.js` (~L1273–1629) but not reported.
- **Fix:** build report text from the Evidence Model `claimStatement`, show the standard error or posterior spread, and take levels from authored rules (T2, T15).
- **Ledger:** new.

### T2 - Authored decision rules never applied (High, partly tracked)
- **ECD element:** Evidence and Assembly Model decision rules.
- **Textbook:** decision rules turn a posterior into the reported classification.
- **Today:** `evidenceModels.decisionRule` is validated and used in the calibration gate (`server/routes/evidenceModels.js`) and shown in UI panels only. Scoring and reporting never apply it. Mastery uses `DEFAULT_MASTERY_THRESHOLD = 0.5` (`attributeClassification.js`).
- **Fix:** apply `decisionRule`, plus an optional cut per Assembly Model or SMV, in classification and reports. The default stays 0.5.
- **Ledger:** the mastery cut is tracked (Wave 4, ADR 0004, "Mastery cut fixed at 0.5"). The unused `decisionRule` is new.

### T3 - No model criticism before activation (High, new)
- **ECD element:** measurement model calibration and fit.
- **Textbook:** item, person, global and Q-matrix fit are checked before operational use (Almond et al. 2015, model criticism).
- **Today:**
  - Activation gates check only `converged: true` (`server/routes/evidenceModels.js` ~L823 and ~L955).
  - IRT gets mirt `itemfit` and M2 (`r-backend/app/modules/calibrate.R` ~L227–410). Cognitive diagnosis models (CDM) get AIC/BIC only.
  - No GDINA `modelfit`, no empirical Q-matrix validation (`Qval`), no person fit, and no dimensionality or local-dependence check anywhere.
- **Fix:** add CDM absolute fit, `Qval` and person fit in R, and gate activation on fit thresholds with a recorded override.
- **Ledger:** new.

### T4 - Alternative explanations not first-class in the argument (Medium, new)
- **ECD element:** domain modelling (the Toulmin assessment argument).
- **Textbook:** the argument has claim, data, warrant, backing, alternative explanations, and rebuttal data that rules them out.
- **Today:**
  - `src/components/evidences/EvidenceWizard/components/WarrantBuilder.jsx` captures backing and a rebuttal (`limitationClause`) as free text.
  - The schema's `evidenceModels.warrants` has no backing field, and the server never validates or reads backing or `limitationClause`.
  - Construct-irrelevant KSAs exist only as `designPatterns.additionalKsas`.
- **Fix:** add `alternativeExplanations[]` on Evidence Models, each linked to an additionalKsa and to the observable or TMV that addresses it. Persist and validate backing.
- **Ledger:** new.

### T5 - No empirical validity evidence (Medium, new)
- **ECD element:** validity argument.
- **Textbook:** the argument is backed by evidence on response processes, internal structure, relations to other variables, and consequences.
- **Today:** only design-time audits exist (`Step7InferentialAudit.jsx`, Competency Wizard `Step8StructuralAudit.jsx`, `src/components/qMatrix/QMatrixValidity.js`). There is no store for evidence from cognitive labs, criterion studies or consequences.
- **Fix:** add a `validityEvidence` collection keyed to the Evidence Model and its warrants, with a panel on the Evidence Model.
- **Ledger:** new.

### T6 - No per-examinee accommodations (Medium, new)
- **ECD element:** presentation and delivery models.
- **Textbook:** presentation adapts to an examinee's needs without changing the construct.
- **Today:**
  - `students` is `{id, name}` (`src/utils/schema.js`).
  - Accessibility (profile, fontScale, high_contrast, timeMultiplier) sits on the Presentation Model and applies to everyone (`src/components/sessions/presentationChrome.js`).
  - `server/delivery/deliveryAdministration.js` reads `extraTimeMinutes` (default 0), but nothing sets it per student.
  - There is no read-aloud.
- **Fix:** add a student accommodation profile and merge it into presentation chrome and the deadline.
- **Ledger:** new.

### T7 - Task-level feedback is not authored (Medium, new)
- **ECD element:** four processes (response processing feedback).
- **Textbook:** response processing can return authored task-level feedback, separate from summary scoring.
- **Today:**
  - `src/components/sessions/presentationPlayer.js` `responseFeedbackLines` shows one of: `feedback.message` (the server never writes it), correct or incorrect, the scoring rationale, or "counted toward the score".
  - Items have no learner-facing feedback field.
  - `ItemResponseFeedback.jsx` renders scorer text.
- **Fix:** add authored feedback per option or per score to items, and return it from response processing within the existing feedback timing.
- **Ledger:** new.

### T8 - BN probability tables are not learned from data (Medium, new)
- **ECD element:** measurement model (Bayesian network).
- **Textbook:** conditional probability tables are estimated from data and then criticised (Almond et al. 2015).
- **Today:** `server/r/calibrationContract.js` has the families irt, dina, gdina, ctt, dif, equating, item-analysis, test-information and attribute-profile, with no BN family. CPTs arrive only by file import (`src/components/evidences/calibration/engines/calibrationFile.js`, "bayesian-cpt").
- **Fix:** add a `bn` calibration family (EM over the latent tree) with a live-session source.
- **Ledger:** new.

### T9 - DIF and equating don't run on live data (Medium, new)
- **ECD element:** fairness.
- **Textbook:** DIF and linking run on operational data for defined groups.
- **Today:** `server/r/liveResponseMatrix.js` `LIVE_KINDS` are irt-parameters, dina-parameters, ctt-statistics and item-analysis. DIF and equating run on fixtures only, and students have no group variable.
- **Fix:** add optional, admin-defined group fields on students, and enable dif and equating as live kinds.
- **Ledger:** new.

### T10 - Observables within one task treated as independent (Medium, new)
- **ECD element:** evidence model (conditional independence).
- **Textbook:** observables from one task or shared stimulus are modelled jointly, through bundles or context/testlet variables.
- **Today:** multiple observables per work product and `stimulus.layout` `passage_based` exist, but `evidenceAccumulation.js` multiplies their likelihoods as independent. There is no bundle or testlet model and no local-dependence check.
- **Fix:** add a Q3 / local-dependence check in calibration, plus opt-in bundle scoring (one polytomous score per work product).
- **Ledger:** new.

### T11 - Composite tasks are never delivered (Medium, new)
- **ECD element:** task model (composite tasks).
- **Textbook:** a task model can be made of sub-tasks.
- **Today:** `taskModels.taskCompositionType` and `subTaskIds` are authored and validated (`server/utils/lifecycleValidation.js`, `server/routes/taskModelsRoutes.js`, `server/import/ecdZipImport.js`). Nothing under `server/delivery` reads them.
- **Fix:** expand a composite Task Model into ordered sub-task presentation in the delivery loop.
- **Ledger:** new.

### T12 - No family-level psychometrics for generated tasks (Medium, new)
- **ECD element:** task families and task model variables.
- **Textbook:** TMVs predict task properties, so family members carry expected parameters (LLTM, isomorph or variant modelling).
- **Today:** `taskSpecs` hold `{templateId, tmvAssignment, stale, generatedAt, …}`. TMVs have no difficulty model, and generated members have no parameters until calibrated.
- **Fix:** add a TMV-to-difficulty model (LLTM in R) and seed spec parameters from it, flagged "predicted".
- **Ledger:** new. Related to D155.

### T13 - Generated spec not yet delivered and scored (Medium, tracked)
- **ECD element:** task families end to end.
- **Today:** D151–D153 generate a family. Delivering one spec as a scoring item is D155 (W31 gate), queued and not started. The AIG `ITEM_MODEL_REGISTRY` is shelved.
- **Fix:** run D155.
- **Ledger:** tracked as calendar D155.

### T14 - Design-layer and delivery records are not versioned (Medium, new)
- **ECD element:** implementation (reuse and traceability).
- **Textbook:** reusable design objects are versioned, so any administration traces to the exact specs used.
- **Today:**
  - Domain Analyses, Design Patterns, Templates and Delivery Models have no `versionNumber` or lock.
  - Confirming only switches on strict validation, and PUT edits a confirmed record in place (`server/routes/deliveryModelsRoutes.js` L128–151; the same pattern applies in `domainAnalysesRoutes.js`, `designPatternsRoutes.js` and `templatesRoutes.js`).
  - Delivery Models cite component ids without pinning versions.
- **Fix:** lock on confirm and version these four collections the way Task and Presentation Models already are.
- **Ledger:** new.

### T15 - No standard setting or performance-level descriptors (Medium, new)
- **ECD element:** reporting (levels).
- **Textbook:** reported levels come from a standard-setting procedure, with descriptors tied to claims.
- **Today:** there are no PLD fields and no standard-setting workflow. The only cut score is a CTT pass-rate summary (`r-backend/app/modules/cttAnalysis.R` `.cutscore_summary`). Report levels are code constants (T1).
- **Fix:** add per-competency level descriptors and cuts, authored on the Student Model, with a simple Angoff/bookmark worksheet.
- **Ledger:** new.

### T16 - PCM and GPCM calibrated but not scored (Medium, tracked)
- **Today:** `calibrationContract.js` calibrates 2PL, 3PL, Rasch, GRM, GPCM and PCM. Delivery scores 3PL and GRM only.
- **Fix:** add PCM/GPCM likelihoods to `evidenceAccumulation.js`.
- **Ledger:** tracked as the R5 remainder.

### T17 - Multivariate student model capped (Medium, tracked)
- **Today:** each Evidence Model binds one `competencyId`. `JOINT_PRIOR_MAX_CORRELATED_PARTNERS = 1`, EAP is bivariate only, and the Competency Wizard has no `jointPrior` editor.
- **Fix:** multivariate EAP and a `jointPrior` editor.
- **Ledger:** tracked as R10 / Wave 4 (D129 stays closed).

### T18 - No response timing or process data (Low, new)
- **Today:** responses carry only a scoring timestamp (`server/routes/sessionRoutes.js` ~L809). There is no presented-at time or time-on-item.
- **Fix:** record `presentedAt` and time-on-item per response, and flag rapid guesses.
- **Ledger:** new.

### T19 - Task-level time and attempt limits not enforced (Low, new)
- **Today:** `taskModels.taskStructure.timingConstraint` and `resourceConstraints.maxAttempts` are authored, but nothing in `server/delivery` reads them. Only session-level Delivery Model limits are enforced.
- **Fix:** enforce per-task time and attempt limits.
- **Ledger:** new.

### T20 - No rater-agreement statistics (Low, new)
- **Today:** `server/delivery/raterQueue.js` does blinded rating and `require_agreement` adjudication. There are no kappa or agreement statistics and no rater-effect model.
- **Fix:** report exact and adjacent agreement and Cohen's kappa per rubric.
- **Ledger:** new.

### T21 - No standard interchange format (Low, new)
- **Today:** import and export use the app's own ECD zip JSON (`server/import/ecdZipImport.js`). There is no QTI.
- **Fix:** QTI 3 item export first, import later.
- **Ledger:** new.

### T22 - Design patterns have no exemplar tasks (Low, new)
- **Today:** `designPatterns` has the PADI attributes, relationships and references, but no exemplar-task field.
- **Fix:** add `exemplarTaskIds`.
- **Ledger:** new.

### T23 - No probabilistic exposure control (Low, tracked)
- **Today:** top-N randomesque selection by `usageCount`, with no Sympson–Hetter P(A) table.
- **Fix:** Sympson–Hetter.
- **Ledger:** tracked as the R13 remainder.

### T24 - Session not bound to one Assembly Model (Low, tracked)
- **Today:** a session is bound through its Delivery Model (ledger G19). Otherwise the model is inferred, and two governing models give `AMBIGUOUS` and none is applied.
- **Fix:** a first-class `session.assemblyModelId`.
- **Ledger:** tracked as a Wave 4 limit.

### T25 - DINA calibration keyed by item (Low, tracked)
- **Today:** slip and guess are keyed by item id at calibration. Scoring looks up the observable first.
- **Fix:** key DINA calibration by observable.
- **Ledger:** tracked as the R9 remainder (Wave 4).

### T26 - Legacy selection path uses nearest difficulty (Low, tracked)
- **Today:** the legacy question path picks the nearest difficulty to `irtTheta`.
- **Fix:** route it through `activitySelection`.
- **Ledger:** tracked as an R12 limit.

### T27 - Sociocultural and process-trace perspectives missing (Low, tracked)
- **Today:** perspective advisories cover trait and DINA/G-DINA only.
- **Fix:** add the remaining advisories.
- **Ledger:** tracked as a Wave 4 limit (D147).

### T28 - Carry-forward off by default (Low, tracked)
- **Today:** `studentModelRecords` exist, but carry-forward is off unless `administration.carryForward` or a session option turns it on.
- **Fix:** choose the default per Delivery Model.
- **Ledger:** tracked as an R11 limit.

## Phased fix plan (TU1–TU27)

**Sizes:** S ≈ up to 1 day, M ≈ 1–3 days, L ≈ more than 3 days.

**Migrations:** "none" means the field is optional and today's behaviour holds when it's absent. Units that touch the R backend need a `docker compose build r-backend` and a fixture run.

### Phase 1 - Decisions and claim-tied reports (highest value)

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU1 | T2 | Apply `evidenceModels.decisionRule` in `attributeClassification` and report levels. Add an optional `masteryThreshold` per Assembly Model or SMV; the default stays 0.5. Amend ADR 0004. | none | - | M |
| TU2 | T15 | Optional `performanceLevels[{label, descriptor, cut}]` per competency, with a Competency Wizard step and a simple Angoff/bookmark worksheet. | none | - | M |
| TU3 | T1 | Rewrite the session, learner-feedback, teacher, class and district reports to quote `claimStatement`, show the standard error or posterior SD, and take levels from TU1/TU2. Remove the hardcoded 1/0 and 0.7/0.4 cuts, falling back to labelled defaults. | none | TU1, TU2 | M |

### Phase 2 - Fit checks gate activation

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU4 | T3 (analysis) | In `calibrate.R`: GDINA `modelfit` (M2/SRMSR), `Qval` suggestions, person fit (mirt `personfit` / PerFit) and mirt Q3. All written into `parameterSets.fitStatistics`. | none | - | M |
| TU5 | T3 (gate) | Activation in `evidenceModels.js` checks fit thresholds from `calibrationPlan`, with an override that records a reason. Existing active sets are grandfathered. | none | TU4 | S |
| TU6 | T10 | Surface Q3 local dependence. Add opt-in bundle scoring: one polytomous (GRM) score per work product or passage. | none | TU4 | L |

### Phase 3 - Examinee and learner experience

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU7 | T6 | Optional `students.accommodations {extraTimeMinutes, timeMultiplier, fontScale, highContrast, readAloud}`, merged in `deliveryAdministration` and `presentationChrome`. Read-aloud through browser `speechSynthesis`. Access is tenancy-scoped. | none | - | M |
| TU8 | T7 | Authored `items.feedback {byOption, byScore, general}`. Response processing writes `response.feedback`, honouring feedback timing. | none | - | M |
| TU9 | T18 | Record `presentedAt` and `timeOnItemMs` per response, with a rapid-guess flag in the teacher report. | none | - | S |
| TU10 | T19 | Enforce Task Model `timingConstraint` and `maxAttempts` per task. | none | TU9 | S |

### Phase 4 - Calibration breadth and fairness

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU11 | T9 | Optional admin-defined `students.groups`. Add `dif` and `equating` to `LIVE_KINDS`, with a minimum group size before DIF runs. | none | - | M |
| TU12 | T8 | A `bn` calibration family in R (EM over the latent tree; base R or free CRAN), with a live source, fit output and the TU5 gate. | none | TU5 | L |
| TU13 | T16 | PCM/GPCM likelihoods in `evidenceAccumulation.js` and activity selection. | none | - | S–M |
| TU14 | T17 | Multivariate EAP (quadrature over 2 or more dimensions, with a cap) and a `jointPrior` editor in the Competency Wizard. | none | - | L |
| TU15 | T25 | Key DINA/G-DINA calibration by observable id. New parameter sets only; old ones still resolve through the item fallback. | none | - | S |

### Phase 5 - Assessment argument and validity

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU16 | T4 | Add `alternativeExplanations[{text, additionalKsaRef, addressedBy}]` and `warrants.backing` to the Evidence Model schema, validated from `reviewed` onward. Persist `backingEvidence` from WarrantBuilder. | none | - | M |
| TU17 | T5 | New `validityEvidence` collection (type: response-process, internal-structure, relations, consequences) linked to the Evidence Model and its warrants. TU4 fit results are linked in automatically as internal-structure evidence. | new collection plus index | TU16 (TU4 optional) | M |

### Phase 6 - Task structure and families

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU18 | T11 | Expand composite Task Models (`subTaskIds`) into ordered sub-task presentation and scoring in the delivery loop. | none | TU6 helps if sub-tasks share stimulus | L |
| D155 | T13 | Existing calendar unit (never-compress, W31 gate): generate the ten-spec family and deliver one spec as a scoring item. | per D155 | - | L |
| TU19 | T12 | LLTM / item-covariate model (mirt or eRm) from TMV assignments. Seed `taskSpecs` with predicted parameters, flagged and never auto-activated. | none | D155, TU5 | L |

### Phase 7 - Governance and versioning

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU20 | T14 | `versionNumber`, `locked` and `parentId` on Domain Analyses, Design Patterns, Templates and Delivery Models. Confirm locks the record, and edits create a new version. Sessions stamp `deliveryModelVersion`. | **yes:** backfill `versionNumber: 1`, and lock confirmed rows (idempotent script, dry run first) | - | M |
| TU21 | T24 | Optional first-class `session.assemblyModelId`, which beats inference. | none | - | S |

### Phase 8 - Low items (pick up as capacity allows)

| Unit | Closes | Scope | Migration | Depends on | Size |
|---|---|---|---|---|---|
| TU22 | T20 | Agreement and Cohen's kappa per rubric from `raterQueue`, shown in the rater console. | none | - | S |
| TU23 | T22 | `designPatterns.exemplarTaskIds`, with a picker. | none | - | S |
| TU24 | T23 | Sympson–Hetter P(A) table, iterated by simulation in R, used in selection. | none | - | M |
| TU25 | T26, T28 | Route the legacy question path through `activitySelection`, and set a carry-forward default per Delivery Model. | none | - | S |
| TU26 | T27 | Sociocultural and process-trace perspective advisories. Process-trace uses TU9 timing. | none | TU9 | S |
| TU27 | T21 | QTI 3 item export (choice, text entry, extended text), import later. | none | - | L |

### Parallel lanes

Units in different lanes can run in parallel. Merges stay serial because of the shared files.

- **Lane A (reports):** TU1 and TU2 in parallel, then TU3.
- **Lane B (R and model criticism):** TU4 → TU5 → TU12 / TU19. TU6 after TU4. TU15 at any time.
- **Lane C (delivery and learner):** TU7, TU8 and TU9 in parallel. TU10 after TU9.
- **Lane D (argument):** TU16 → TU17.
- **Independent, at any time:** TU11, TU13, TU14, TU20, TU21, TU22, TU23, TU24, TU25, TU27. TU26 after TU9.
- **D155** follows its own calendar calibration and is not started by this plan.

**Suggested order by value:** TU1, TU2 → TU3 → TU4 → TU5 → TU7 / TU8 / TU9 → TU16 → TU11 → TU20 → TU13 → TU6 → TU12 → TU17 → TU10 → TU18 → D155 → TU19 → TU14 → the Low items.
