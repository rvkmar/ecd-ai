# Bulk Upload Sample Files

One JSON file per Settings > Bulk Upload card. Each file is a JSON array of
full entity objects, validated and created row-by-row with the exact same
rules as creating that entity one at a time through its normal form/wizard —
there's no cross-file smart ordering, so a row that references something
that doesn't exist yet just fails that row.

| File | Upload target | Works as-is? |
|---|---|---|
| `sample-users.json` | Settings > Users | Yes |
| `sample-policies.json` | Settings > Policies > Selection Policies | Yes |
| `sample-curricular-policies.json` | Settings > Policies > Curricular Policies | Yes |
| `sample-competency-models.json` | Settings > Bulk Upload > Competency Models | Yes |
| `sample-evidence-models.json` | Settings > Bulk Upload > Evidence Models | No — needs a real `competencyId` |
| `sample-task-models.json` | Settings > Bulk Upload > Task Models | No — needs a real, confirmed `evidenceModelId` (and a two-pass upload for the composite row) |
| `sample-items.json` | Settings > Bulk Upload > Items | No — needs a real, confirmed `taskModelId` |

## Users, Policies, Curricular Policies, Competency Models

These have no dependencies on anything else in the system, so you can
upload them immediately, unmodified, to see the feature work end to end.

Note that `sample-competency-models.json` only creates the draft model
shells (2 rows: "Grade 6 Numeracy - Fractions" and "Grade 6 Literacy -
Reading Comprehension"). Competencies themselves aren't one of the six bulk
types — after uploading, open each model in the Competency Model Builder to
add its individual competencies, then Confirm to lock the model.

## Curricular Policies vs Policies

Two different things share the word "policy" here.

`sample-policies.json` holds **selection policies** — how a session picks the
next item (`fixed` | `IRT` | `BayesianNetwork` | `MarkovChain`).

`sample-curricular-policies.json` holds **curricular policies** — published
curriculum documents shaped as Curricular Goals → Competencies → Learning
Outcomes. Uploading one makes it appear in the **Policy Name** dropdown in
Competency Wizard **Step 3 — Construct Framework**, where the author then
selects the curricular goal(s) the model is grounded in. The selected goals
are snapshotted into the model's `constructFramework`, so a confirmed model
still reads correctly if the policy is later edited.

Only `name` and a non-empty `curricularGoals` array are required; each goal
needs a `code` and a `statement`, and goal codes must be unique within a
policy (Step 3's multi-select keys on them). `competencies` and their
`learningOutcomes` are optional but are carried through with the selection.

## Evidence Models, Task Models, Items — these need real IDs first

These three sample files tell one coherent worked example ("Grade 6
Fractions — Equivalent Fractions" and "Fraction Comparison"), but every
field that references a parent entity is a placeholder like
`<REPLACE_WITH_REAL_COMPETENCY_ID>` — the app has no way to know those IDs in
advance since they're generated when you create the parent record. Uploading
these files unmodified will show every row as failed in the results table,
with the exact validation error (e.g. "Referenced competency does not
exist"), which is the expected, correct behavior — the same thing would
happen if you tried to create one of these by hand through its wizard before
its parent existed.

To actually walk the full chain end to end:

1. Upload `sample-competency-models.json`. Open "Grade 6 Numeracy -
   Fractions" in the Competency Model Builder, add at least one competency
   (e.g. "Fraction Equivalence"), and Confirm the model. Copy that
   competency's id.
2. In `sample-evidence-models.json`, replace both
   `<REPLACE_WITH_REAL_COMPETENCY_ID>` placeholders with that id, then
   upload. Both rows land as drafts.
3. Open each evidence model in its wizard and Confirm it (evidence models
   must be confirmed + locked before any task model can reference them).
   Copy each evidence model's id.
4. In `sample-task-models.json`, replace the placeholders (see
   **The Task Models sample** below — there are four, and the composite row
   needs a two-pass upload), then upload.
5. Confirm + lock each task model via its builder. Copy each task model's
   id.
6. In `sample-items.json`, replace
   `<REPLACE_WITH_REAL_CONFIRMED_TASK_MODEL_ID>` (row 1) and
   `<REPLACE_WITH_REAL_CONFIRMED_TASK_MODEL_ID_2>` (row 2) with the matching
   task model ids, then upload.

## The Task Models sample

`sample-task-models.json` is four rows chosen to exercise the parts of the
Task Model layer that are easy to get wrong. Every row imports as a **draft**
(the bulk endpoint forces `status: "draft"` and validates permissively, the
same as the wizard's autosave), then promotes cleanly to `reviewed` and
`confirmed`; row 1 also has everything needed to reach `operational`.

**Activation needs the whole chain live.** A Task Model cannot be promoted to
`operational` until two further things are true:

1. **Every bound Evidence Model is itself `operational`.** A merely
   `confirmed` model is structurally frozen but not activated, and a
   `suspended` one has been deliberately pulled — delivering against either
   means collecting responses nothing can score.
2. **At least one `confirmed` Item instantiates that exact version** of the
   Task Model. A blueprint nothing can deliver has no business being live,
   and version-matching matters: a cloned v2 starts with none of v1's items.

So the chain activates bottom-up:

```
Evidence Model   confirmed → operational
Task Model       confirmed
Item(s)          authored against it → confirmed
Task Model       → operational
```

Neither gate applies to *confirming* a Task Model — confirming against merely
confirmed evidence, with no items yet, is the normal authoring order. And
neither applies to `suspended` or `archived`: those are the safety valves, and
blocking them would trap a broken Task Model in service.

### Placeholders to replace

| Placeholder | Replace with |
|---|---|
| `<EVIDENCE_MODEL_ID>` | the id of a **confirmed** (or operational/suspended) Evidence Model — must be **operational** before the Task Model can be activated |
| `<OBSERVABLE_ID_1..3>` | ids from that model's `observables[]`, in any order |
| `<SUB_TASK_MODEL_ID>` | the id of another Task Model — row 1's id, after it imports |

The evidence model needs at least **three** observables for all four rows to
import as written. With fewer, either point several `observationId`s at the
same observable or drop the extra entries — but if you drop entries, adjust
the remaining `weight` values so they still total exactly 1.

### The composite row needs two passes

Row 4 is `taskCompositionType: "composite"`, and a composite task must name
at least one **existing** sub-task. Upload the first three rows, copy the id
of row 1 from the results table into `<SUB_TASK_MODEL_ID>`, then upload row 4
on its own. There is no cross-file ordering — a row referencing something
that does not exist yet simply fails that row.

(Leaving `subTaskIds` empty is instructive in its own right: the row still
*imports*, because drafts are permissive, but confirmation is refused with
"Composite tasks must declare at least one sub-task.")

### What each row is for

1. **Equivalent Fractions — Bar Model Selection.** The minimal confirmable
   task: one observable at full weight, selected response. Carries a full
   `accessibilityAssumptions` block and an `equivalenceGroupId` — two of the
   four things activation requires. The others are a live Evidence Model and
   a confirmed Item; see the note above.
2. **Fraction Comparison — Justified Choice.** Three observables at
   0.5 / 0.3 / 0.2 — an uneven allocation that still totals 1. Also satisfies
   the CTT and Bayesian-network coherence rules, which both require two or
   more observables. Carries two structured fairness risks, one high-severity
   with a mitigation.
3. **Mixed Number Conversion — Three-Part.** Weights of
   0.3333 / 0.3333 / 0.3334, which is what an even split of three has to look
   like to total exactly 1 at 4dp. Use this row to confirm the review summary
   and the list card render the residual at full precision rather than
   showing `0.333` three times under a heading claiming `1`.
4. **Fractions Progress Check — Composite.** Composite structure plus a
   deliberately **legacy plain-string** fairness risk, so you can see
   `normalizeFairnessRisks()` upgrade a pre-structured record on read.

### Two things to know about the values

**Difficulty is in logits (roughly -3 to 3), not 0–1.** These rows assume the
bound evidence model runs IRT. Difficulty is expressed on whatever scale the
primary evidence model's active statistical model uses, and the scales are
not interchangeable — if yours runs CTT, change `difficultyRange` to a
proportion-correct range inside 0–1. Step 5 of the wizard states the right
scale for the bound model and offers a one-click default.

**`allowedInteractionTypes` and `allowedScoringMethods` are enforced.** They
are matched against `item.interaction.type` and `item.scoring.method` when an
Item is saved, so the values have to be the ones the Item Wizard actually
produces: `mcq`, `multiselect`, `numeric`, `constructed`, `likert` and
`dichotomous`, `polytomous`, `category_map`, `weighted_sum`,
`categorical_activation`. An empty list means unconstrained. (The previous
version of this sample used `"MCQ"` and `"binary"`, neither of which exists —
which would have silently blocked every item written against those blueprints.)

### Also worth knowing

`observationId` values must be ids from the bound evidence model's
`observables[]`; the server rejects a row whose observation does not belong to
the evidence model it names. Weights must total exactly 1 **and** none may be
zero at confirmation — a targeted observable contributing nothing to the
inference is a contradiction, and three observables at 1 / 0 / 0 total 1.0
while two of them carry no evidence.

## A note on the Items sample

Uploading items also surfaced (and this build now fixes) a pre-existing bug:
the item-creation endpoint never set `evidenceModelVersion` on a new item,
which the schema requires — so item creation was failing validation
regardless of what was submitted, for both the single-item wizard and bulk
upload. That's fixed in `server/routes/itemsRoutes.js`; a backend restart is
needed for it to take effect.

---

# Calibration Files

Three more samples drive the **Calibration & Operationalization** workspace
(Evidence Models list → **Calibrate**). Unlike the bulk-upload samples above,
these are not uploaded through Settings — they are imported from the
**Calibration** tab of a *confirmed* evidence model.

| File | Import route | Works as-is? |
|---|---|---|
| `sample-calibration-irt-2pl.json` | Calibration tab → **Calibration file** | Yes, against an `irt` model whose observables are `o1`/`o2`/`o3` |
| `sample-calibration-bayesian-cpt.json` | Calibration tab → **Calibration file** | Yes, against a `bayesian_network` model whose competency states are `L1`/`L2`/`L3` |
| `sample-calibration-responses.csv` | Calibration tab → **Response matrix** | Yes, against any `irt`/`rasch` model with observables `o1`/`o2`/`o3` |

All three are written against the observables in `sample-evidence-model.json`
(`o1`, `o2`, `o3`), so the fastest way to see the feature work end to end is:

1. Create the competency model and competency, confirm both.
2. Upload / build the Numerical Reasoning evidence model, add an `irt`
   statistical model mapping `o1`, `o2`, `o3`, and **Confirm** it.
   (A draft model cannot hold parameters — `schema.js` blocks it outright.)
3. Evidence Models list → **Calibrate** → **Calibration** tab → drop in
   `sample-calibration-irt-2pl.json` → **Commit parameter set**.
4. **Parameter Sets** tab shows the set, active. **Inference** tab now
   estimates θ from real a/b values instead of the a = 1, b = 0 defaults.
5. Import `sample-calibration-responses.csv` as a second calibration and use
   the **Compare active against…** selector to see parameter drift between
   the two.

## The JSON calibration package

```
calibrationFileVersion   "1.0" — major version must match the build
kind                     "irt-parameters" | "bayesian-cpt"
target                   advisory only: names the model the file was cut for
provenance               REQUIRED: calibratedBy, calibrationMethod, sampleSize
                         (+ optional calibrationDate, population, software, notes)
scale                    IRT: metric / mean / sd / linking — the reporting scale
parameters               IRT: { <observableId>: { a, b, c, se_a, se_b,
                                                  infit, outfit, pValue,
                                                  pointBiserial, n } }
prior                    Bayesian: { <stateValue>: probability } — must sum to 1
cpt                      Bayesian: { <observableId>: { levels: { <stateValue>: p } } }
fit                      free-form model fit block, displayed verbatim
decisionRule             optional { type, threshold, direction, justification }
```

Import is refused (not merely warned about) when: the file's `kind` does not
match the selected statistical model's type; it carries parameters for
observables the evidence model does not define; a mapped observable has no
parameters; a Bayesian prior does not sum to 1; or CPT states do not match the
competency's declared states. Softer problems — a small sample, a low
discrimination, a non-monotonic CPT, an `a` value that a Rasch model will
ignore — are shown as advisories and do not block.

Stored parameter sets keep observable parameters flat (keyed by observable id,
because `IRTInferencePanel` reads `parameters[obsId]`) and put package
metadata under reserved `_`-prefixed keys: `_kind`, `_scale`, `_prior`,
`_fit`, `_source`.

## The CSV response matrix

```
studentId,o1,o2,o3
S001,1,1,1
S002,0,0,1
...
```

First column is an examinee id when its header looks like one
(`studentId`, `personId`, `id`, …); otherwise every column is treated as an
observable. Cells are `1`, `0`, or blank/`NA` for omitted. The app computes
proportion correct, corrected point-biserial, KR-20, and a **provisional**
logistic parameterisation (`b` = mean-centred logit difficulty, `a` derived
from the point-biserial). This is the classical approximation, not marginal
maximum likelihood: every parameter set it produces is stamped
`calibrationMethod: "classical-approximation (…)"` so it can never be mistaken
for a defensible operational calibration.

`sample-calibration-responses.csv` is 120 simulated examinees drawn from the
2PL parameters in `sample-calibration-irt-2pl.json` (with two deliberately
omitted responses, to exercise the missing-data path). Importing it recovers
the difficulty ordering — o1 hardest, o3 easiest — but on a three-item test
the corrected item-total correlations are heavily attenuated, so the
discriminations come out low and KR-20 lands around 0.42. The resulting
advisories ("point-biserial below 0.20", "KR-20 below 0.60") are correct and
are exactly what you should see: three dichotomous observables are not enough
to calibrate anything for real.

## Unified staged upload (Settings > Data > Upload)

The panel at the top of the Upload tab takes several of these files at once and walks them in
dependency order:

    competency models -> evidence models -> task models -> items

Any subset works; a file whose type isn't recognised is left on `— skip —` and can be assigned
by hand.

**Everything imports as a draft, and a draft may reference a draft.** The bulk endpoints pass
`allowDraftParents` (see `src/utils/schema.js`), so an imported task model may cite a still-draft
evidence model and an imported item a still-draft task model. Nothing is confirmed or locked
during an import; the confirmed+locked chain is enforced later, when you confirm each record in
its builder. The single-create routes the wizards use are unchanged and still refuse a draft
parent.

What referential integrity still enforces, in bulk as everywhere else: the parent must exist, an
item's `observationId` must be declared in its task model's `expectedObservations`, and a task
model's `primaryEvidenceModelId` must be among its `evidenceModelIds`.

The stages exist only because cross-file references are real, system-generated ids — never
resolved by name. So the loop is:

1. Upload the stage.
2. Copy the ids out of the results table (`Copy all` gives a `[{name, id}]` block).
3. Paste them into the next file, use **Replace file** to re-pick it, then **Continue**.

Confirm and lock the whole chain afterwards, in the order the lifecycle requires.

The per-entity cards below the panel are unchanged and still upload a single file on their own.

## Newtonian enterprise pack (TR9 Evidence Model full stack)

Files (name-remappable where noted):

| File | Upload target | Remapping |
|---|---|---|
| `newtonian_mechanics_competency_model.json` | Student Models (or specification export) | Force split into 3 binary attributes (EM-R3) |
| `newtonian_mechanics_policy.json` | Selection Policies | none |
| `newtonian_mechanics_evidence_models.json` | Evidence Models | **Student Model id required** in the Settings card; scopes `competencyName`. Choose the file, then click Upload. Also accepts `{ competencyModelId, evidenceModels }`. |
| `newtonian_mechanics_task_models.json` | Task Models | `evidenceModelName` / `primaryEvidenceModelName` |
| `newtonian_force_items.json` | Items | `taskModelName` + item `name` |
| `newtonian_force_qmatrix.json` | Q-matrix Models | Multi-column Force attributes; `competencyModelName`, `attributeNames`, `itemName` |
| `newtonian_mechanics_assembly.json` | Assembly Models | `competencyModelName`, `smvName`, `policyName` |

**Evidence Models (Settings card):** select or paste the Student Model (`competencyModelId`), choose `newtonian_mechanics_evidence_models.json`, then click Upload.

**Recommended order**

1. Student Model (specification export)
2. Selection policy
3. Evidence Models (Force DINA may land without `qMatrixId` yet — draft-legal)
4. Task Models
5. Force Items
6. Force Q-matrix
7. **Re-upload Evidence Models** so Force `qMatrixName` resolves to `qMatrixId`
8. Assembly Model

**Promote gate for Force→DINA:** confirm and lock the Q-matrix before confirming the Force Evidence Model. Confirm-time schema requires a linkable (`confirmed` / `operational` / `suspended`) Q-matrix for active `dina`/`gdina`.

**Calibration path (EM-R2):** `attach-seed-parameter-sets` is a **draft bridge only** (synthetic `ecd-pilot-1.0.0`). For Accumulation-ready parameters, run the Calibration console (enqueue → process → **ingest**) so `activeParameterSetId` points at a converged `r-job` set. Force DINA: confirm the Q-matrix before EM confirm, then calibrate/ingest (do not treat pilot seeds as operational measurement).

**Gap-fix closeout (evaluation → identification → accumulation)**

1. Upload pack in the order above (drafts). Evaluation procedures now include inline `artifact` payloads and `workProductId`; `calibrationPlan.seedParameterSets` holds pilot params (drafts still forbid live `parameterSets`).
2. Confirm Q-matrix → Review → Confirm each Evidence Model (strict: artifacts, pipeline, DIF).
3. Optional bridge: `POST /api/evidenceModels/:id/attach-seed-parameter-sets` (empty body uses `calibrationPlan.seedParameterSets`) — **not** a substitute for console ingest.
4. Prefer Calibration console ingest for a converged packageVersion other than `ecd-pilot-1.0.0`.
5. Confirm Task Models / Items; activate Task Model (rebuilds composite library — bakes `evaluationProcedure`).
6. Operational Evidence Model only after readiness (`parameterSets` + confirmed Task Model binding).

Regenerate authoring drafts from `samples/_build_newtonian_enterprise_pack.py`, then re-run `samples/_upgrade_em_gap_fix.py` for artifacts/seeds.

**What this pack implements (enterprise solutions S1–S10):** evaluationProcedures, calibrationPlan, Force DINA + inactive 1PL, Kinematics PCM + inactive threshold, specialized rebuttals, fairnessNotes + difReviewChecklist, Task Models with process capture for representation mode, Assembly targets + prerequisite-gated policy.
