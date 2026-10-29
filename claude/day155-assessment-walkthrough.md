# Assessment walkthrough — Domain Analysis to a scored session

This is a start-to-end walk of one assessment on the live host
**http://localhost:6060**. The worked example is **naming a plant part**.
A family of **ten task specs** (Bloom × register, stimulus held static)
was generated from a confirmed template; **one spec was cited on an
item**, that item was **delivered in a session**, and the keyed response
**activated the Evidence Model observable**.

Login (every staff screen below uses Admin unless a step says otherwise):

| Role | Username | Password | Role on the Sign-in form |
|---|---|---|---|
| Admin | `admin1` | `WalkPass!2026` | Admin |
| Student | `stud1` | `WalkPass!2026` | Student |

Open http://localhost:6060/login. Choose the role that matches the
account. Admin lands on **Admin Control Center**. The layer tabs across
the top are **Home → Models → Libraries → Implementation → Delivery →
Results**. Models are authored left to right.

What this product does **not** do: generating a spec family does **not**
write items. Confirming a template does **not** generate specs. There is
no Automatic Item Generation service mounted. An item still needs an
authored stimulus, options, and scoring map. The spec is a citation of
the Task Model Variable assignment the item was written for.

---

## 1. Domain Analysis

**Models → Domain Analysis.**

A Domain Analysis is the Layer-1 statement of what is being assessed.
The live plant-part analysis is **Plant structure** (`damvrvcqgf06bd6d`,
confirmed). Open it and read the seven sections. Confirming a Domain
Analysis does not create a Student Model; it is the source a Design
Pattern and Task Model Variables can cite.

For a new assessment: New analysis → name it → fill the sections →
**Review** → **Confirm**. Status machine is the shared CAF one:
`draft → reviewed → confirmed`. Confirmed records lock.

---

## 2. Libraries the pattern and Task Model will cite

**Libraries** (between Models and Implementation):

1. **Work Products** — what the student produces (selected option, written
   response, …). The plant-part items use a selected-response work
   product.
2. **Rubrics** — only needed when scoring is human-rated. Selected-response
   plant-part items do not need a rubric.
3. **Task Model Variables** — reusable design features. The live library
   already has **Plant diagram** (leaf / root / flower) and **Bloom
   demand** (remember / understand / apply). The ten-spec family below
   also uses:
   - **D155 Cognitive demand** — Bloom six-level vocabulary, of which
     the Task Model takes five (`remember` … `evaluate`)
   - **D155 Scenario register** — `formal` / `informal`
   - **D155 Stimulus policy** — `static` held fixed

Create a variable here **before** binding it on a Task Model. A
categorical variable needs at least two possible values (or a `valueSet`
such as `bloomLevel`).

---

## 3. Design Pattern

**Models → Design Patterns.**

The live pattern is **Name a plant part** (`dpmvrvcqgp3d0fdc`,
confirmed). A pattern is the PADI argument: focal KSAs, observations,
work products, characteristic features. Confirming it does not create
models and does not generate items. It can **seed** a Student / Evidence
/ Task Model later, and a Template may cite it.

---

## 4. Student Model (competency model)

**Models → Student Model.**

The live model is **Plant part naming** (`cmmvrvcqgjf78094`, confirmed).
It holds the construct: a continuous **Plant-part naming proficiency**
and binary attributes **Names the part** / **Names the function**.

Authoring order inside the wizard: identity → variables → construct
framework (optional curricular policy) → review → confirm. Items never
store the construct themselves; they inherit it through Task Model →
Evidence Model.

---

## 5. Evidence Model

**Models → Evidence Model.**

The live model is **Part naming evidence** (`emmvrvcqgr9d3318`,
confirmed). It declares:

- Observable **obs-plant-name** — “The learner selects the name of the
  called-out plant part.”
- An evidence rule (direction, strength, activation condition).
- A statistical model (here IRT, with a pilot parameter set).

The observable id is what a Task Model lists under expected
observations, and what an item’s scoring map activates. Scoring a
session does **not** write a numeric `scoredValue` onto the response;
it records whether the observable **activated**.

Confirm the Evidence Model before the Task Model can bind it. Promoting
the Evidence Model to **operational** is a later delivery/calibration
step; a **confirmed** Evidence Model is enough to score a confirmed
item in a session.

---

## 6. Task Model

**Models → Task Model.**

The original blueprint is **Name the plant part**
(`tmmvrvcqgs4e8826`, confirmed, locked, v1). It binds the Evidence
Model above, declares expected observation `obs-plant-name`, and
restricts items to MCQ / dichotomous scoring.

### If you only need new items against the existing blueprint

Skip to §9. Confirmed and operational Task Models both accept new items.

### If you need a different spec family (ten specs, not three)

A confirmed Task Model **cannot be edited**. The original family is
Plant diagram (3) × Bloom fixed at remember = **3 specs**. The ten-spec
family is Bloom (5) × register (2) × stimulus fixed = **10**.

1. On the Task Model list, **Clone to new version**. That produces a
   **draft** v2 (live clone: `tm1793288978071000`, named
   **Name the plant part (D155 family)**).
2. Open the clone. On the blueprint / Task Model Variable step, bind:
   - D155 Cognitive demand — **varying**, allowed values
     `remember, understand, apply, analyze, evaluate`
   - D155 Scenario register — **varying**, `formal, informal`
   - D155 Stimulus policy — **fixed** `static`
3. Leave `taskStructure.stimulusPolicy` as **parameterized** if the
   bound Evidence Model is IRT. Binding a variable whose `valueSet` is
   `stimulusPolicy` will shrink the legal structure values to that
   variable’s levels, and IRT confirmation then refuses a fully static
   structure. Use a library categorical variable for the family axis,
   not the `stimulusPolicy` valueSet, when the Evidence Model is IRT.
4. **Reviewed** then **Confirmed**. The clone locks. Items will
   instantiate **this** version, not v1.

---

## 7. Presentation Model

**Models → Presentation Model.**

A Presentation Model is the session overlay for one Task Model: order,
navigation, feedback timing, accessibility. The original
**Plant part presentation** is bound to v1. A clone Task Model needs
its own overlay.

Live D155 overlay: **D155 plant-part family presentation**
(`pm1793289069185000`), bound to the clone, confirmed. Typical values:
item order authored, grouping single item, navigation linear, feedback
immediate, large-text profile.

Draft → reviewed → confirmed. Confirm requires a name, a Task Model,
`layout.itemOrder`, `layout.navigation`,
`conditionalDisplay.showFeedback`, and `accessibility.profile`.

---

## 8. Template, then generate the spec family

**Models → Templates → Manage Templates.**

A template binds four models into a family-generating blueprint:

| Binding | Live D155 value |
|---|---|
| Student Model | Plant part naming |
| Evidence Model | Part naming evidence |
| Task Model | Name the plant part (D155 family) |
| Presentation Model | D155 plant-part family presentation |

Optional: cite Design Pattern **Name a plant part**.

**Confirm** records those four bindings. It does **not** generate specs
and does **not** create items. Family size is read from the Task Model’s
variable settings.

On the confirmed template (live:
**D155 plant-part ten-spec family**, `tpl1793289069252000`):

1. Open it. The preview table shows the Cartesian product. The list
   row reads **Family size 10**.
2. Click **Generate family**. That inserts ten `taskSpecs` rows. Specs
   have no CAF status; they are `{ templateId, tmvAssignment, stale }`.
3. **Replace family** regenerates. **Retire** deletes the specs.
   There is no authored **Create spec** form — `POST /api/taskSpecs`
   returns 405.

The ten assignments are every pair of
`{remember,understand,apply,analyze,evaluate} × {formal,informal}`
with stimulus held at `static`. One generated spec (live
`tspec1793289069305000`, assignment `remember,formal,static`) is the
one cited on the item below.

The older **Plant part template** is unchanged and still has family
size 3.

---

## 9. Author an item that cites one spec

**Implementation → Item Bank → Authoring → New item.**

Step 1 — Instantiation:

1. Task Model: **Name the plant part (D155 family)** (or v1 if you are
   not using the ten-spec family).
2. Observation: **The learner selects the name of the called-out plant
   part** (`obs-plant-name`). The derived Evidence Model fills in
   read-only.
3. **Generated task spec (optional)** — pick the assignment, e.g.
   `remember · formal · static`. This stores `taskSpecId`. It does
   **not** fill the stimulus or the key. Generate the family on the
   template first or the list is empty. Specs from another Task Model
   do not appear.

Then write the item as usual:

- **Stimulus** — the prompt the student sees.
- **Interaction** — MCQ, four options, one keyed (`opt_a` = Leaf in
  the walk).
- **Scoring** — method **dichotomous**. The activating rule for the
  keyed option must **activate the observable and award a score
  greater than 0**. A rule that activates with score 0 is rejected at
  **reviewed**.
- **Metadata** — subject (Science), grade, tags.
- **Psychometrics** — statistical model type IRT, calibration
  `pilot` is enough for a walk.

Save. **Reviewed**, then **Confirmed**. Confirmed items lock. Clone to
make a new version.

Live citing item: `it_mvtq0dnj_000`, name
**D155 cited: remember formal static**, confirmed, bound to
`obs-plant-name` / `emmvrvcqgr9d3318`, `taskSpecId` =
`tspec1793289069305000`.

You can also author items **without** a spec (the default). The
citation is optional.

---

## 10. Instantiated task

**Implementation → Instantiated tasks.**

A session delivers **tasks**, not items directly. Create a task that
points at the Task Model and the item:

- Task Model: Name the plant part (D155 family)
- Item: the confirmed citing item

Live task: `t1793289069498`.

---

## 11. Build a session

**Delivery → Sessions.**

1. New session.
2. Assign a student (`stud1` on this host).
3. Add the instantiated task from §10.
4. Selection policy: **Fixed Form - Grade 6 Numeracy Benchmark**
   (`pmvrvcqgea71400`, type `fixed`). A session without a policy of
   the chosen strategy is refused. Adaptive IRT / Bayesian policies
   need an Assembly Model and operational packages; the plant-part
   walk uses fixed order.
5. Save. Status is **ready**.

Live session: `s1793289069569`, assigned to `stud1`, one task.

Admin can submit a response on that session. The student path is
§12.

---

## 12. Sit the assessment (student)

Sign out. Sign in as **stud1** / `WalkPass!2026` / Student.

**Delivery → My Sessions.** The ready session is listed. **Start**
opens `/student/sessions/s1793289069569/player`.

The player shows the authored stimulus and the four options. Choose
**Leaf** (the keyed option) and submit.

What is stored is not a points total. The Evidence Model identifies
the response against `obs-plant-name`:

| Field | Live result |
|---|---|
| `itemId` | `it_mvtq0dnj_000` |
| `evidenceModelId` | `emmvrvcqgr9d3318` |
| `observationId` | `obs-plant-name` |
| `activated` | `true` for Leaf; `false` for Root / Stem / Flower |

A wrong option still scores through the same observable; it records
`activated: false` (the other category). After the last task, the
session completes. **Reports** on the student dashboard shows the
sitting. Admin **Results → Student model** / **Evidence Accumulation
(inspect)** is the staff view of the same chain.

---

## 13. Order of operations (checklist)

Do these in this order. Skipping a lock/confirm step is the usual
failure.

1. Domain Analysis — confirm
2. Work Products / Rubrics / Task Model Variables — create library rows
3. Design Pattern — confirm (optional but used here)
4. Student Model — confirm
5. Evidence Model — confirm (observables + statistical model)
6. Task Model — confirm. If you need new variable settings on a
   locked Task Model, **clone first**
7. Presentation Model bound to **that** Task Model — confirm
8. Template with all four bindings — confirm
9. **Generate family** on the template (≥10 specs if the settings
   project that)
10. Item — bind Task Model + observation + optional spec → author
    stimulus/scoring → reviewed → confirmed
11. Instantiated task — Task Model + item
12. Session — student + task + selection policy
13. Student (or admin) submits; Evidence Model activation is the score

---

## 14. Things that look like they should be automatic, and are not

These are the steps this walk had to do by hand. They are product
behaviour, not a missed click.

| Expectation | What actually happens |
|---|---|
| Confirming a template generates items | Confirm only records the four bindings. Specs are a separate **Generate family** action. |
| Generate family writes items | It writes `taskSpecs` only. Stimulus and key stay authored. |
| A spec can be typed in by hand | `POST /api/taskSpecs` is 405. Specs exist only via generate / replace. |
| Changing TMV settings on a live Task Model | Confirmed Task Models are locked. Clone to v2, edit the clone, confirm the clone. |
| Binding `valueSet: stimulusPolicy` as a fixed-static family axis | That valueSet also constrains `taskStructure.stimulusPolicy`. IRT Evidence Models refuse a fully static structure at Task Model confirm. Use a categorical library variable for the family axis instead. |
| The existing plant-part template is already ten specs | It is three (diagram × Bloom fixed remember). Ten specs need the 5 × 2 settings on a clone. |
| Item wizard Step 1 fills the prompt from the spec | The spec picker only cites `taskSpecId`. Write the prompt and key yourself. |
| Reviewing an item with an activating rule of score 0 | Rejected: “An activating rule must award a score greater than 0.” |
| A session with tasks but no policy | Refused. Pick a selection policy (Fixed Form for this walk). |
| Automatic Item Generation | Unmounted. Do not expect a spec-to-item engine. |

---

## 15. Live walk that was executed (2026-10-29)

Host: **http://localhost:6060** (compose `node` + `nginx` rebuilt with
this code; frontend asset `index-CYgp0svI.js`). Account: `admin1`.

| Step | Id |
|---|---|
| Clone Task Model v2 | `tm1793288978071000` |
| Presentation Model | `pm1793289069185000` |
| Template | `tpl1793289069252000` |
| Generated specs | **10** |
| Cited spec | `tspec1793289069305000` (`remember,formal,static`) |
| Item | `it_mvtq0dnj_000` |
| Task | `t1793289069498` |
| Session | `s1793289069569` (student `stud1`) |
| Submit `opt_a` | `activated: true` through `emmvrvcqgr9d3318` / `obs-plant-name` |

You can repeat the student half: log in as `stud1`, open **My
Sessions**, and sit any remaining ready session, or clone the item /
create a new session from the same task.
