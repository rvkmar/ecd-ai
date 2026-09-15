# PADI TR9 vs live Admin — information architecture

**Status: WIRED 2026-09-15 (D73b).** Admin nested Models / Implementation / Delivery. Collection names unchanged.

**Source:** Mislevy, R. J., & Riconscente, M. M. (2005). *Evidence-centered assessment design: Layers, structures, and terminology* (PADI Technical Report 9). SRI International. File: `Evidence-Centered_Assessment_Design_Layers_Structu.pdf` (46 pp.).

**Live walk:** `http://localhost:6060` as `admin1`, `dist1`, `teach1`, `stud1` (temporary password on the seed accounts). D73b close. Archive on Competency Operate still not a dedicated walk.

**Drive:** [ECD — Admin information architecture (PADI TR9)](https://docs.google.com/document/d/1JlzwBNNfZWRA_fmb--n9GsvWY29v2bYwCuXYv-TnZKk/edit)

## What TR9 actually names

Five **layers** (Table 1 / Fig. 3), not five Admin tabs:

| Layer | Role | Key entities |
|---|---|---|
| Domain Analysis | Gather domain substance | concepts, standards, representational forms |
| Domain Modeling | Narrative assessment argument | KSAs, design patterns, Toulmin claim–data–warrant |
| Conceptual Assessment Framework | Blueprints | Student, Evidence, Task, **Assembly** models; SMVs, observables, TMVs, measurement models, templates |
| Assessment Implementation | Build the pieces | task materials, fitted parameters, rubrics, task specs |
| Assessment Delivery | Operate the loop | four processes + task/evidence composite library + reports |

CAF questions (TR9 §2.3):

1. **Student Model** — what are we measuring? (SMVs + a distribution over claims)
2. **Evidence Model** — how do we measure it? (evaluation + measurement model)
3. **Task Model** — where do we measure it? (situation, work products, TMVs)
4. **Assembly Model** — how much do we need? (mix, accuracy targets, adaptive algorithm)

Delivery is **not** a fifth CAF model. It is the four-process architecture (Fig. 12): Activity Selection → Presentation → Evidence Identification → Evidence Accumulation, around the composite library. “Materials & Presentation” in the PADI template (Fig. 7) is the CAF object that later becomes a Presentation Model (plan G8 / W23).

## Live Admin Control Center (walked 2026-09-15, then rewired)

**Before D73b:** peer tabs Competency Model · Evidence Model · Task Model · Q-Matrix · Calibration · Item Bank · Analytics.

**After D73b:** Models / Implementation / Delivery as in the decision table below. District and Teacher match Implementation + Delivery (no Models, no Q-Matrix, no Calibration). Student is Delivery only (My Sessions, Reports).

Pre-D73b snapshot (what the walk found before wiring):

| Surface | Live | TR9 home |
|---|---|---|
| Competency Model | Tab. Dashboard / Structure / Operate. Label is not “Student Model”. | CAF Student Model |
| Evidence Model | Tab | CAF Evidence Model |
| Task Model | Tab | CAF Task Model |
| Assembly Model | **No tab.** Wizard exists at `/admin/assembly-models` (D56 diagnostic AM listed, Confirmed). | CAF Assembly Model |
| Q-Matrix | Top-level tab | Diagnostic **measurement design** (Evidence Model / attributes), not a CAF sibling |
| Calibration | Top-level tab. Enqueue LSAT7 / sim10GDINA / CTT / DIF / equating. | Implementation: “fitting measurement models” (TR9 §2.4) |
| Item Bank | Default tab | Implementation (task specs / items) |
| Analytics | Tab. Filters + “Analytics & Reports Dashboard”; `/api/reports/dashboard` with mock fallback | Delivery reporting (summary feedback). Psychometric artefacts are W16–W17 |
| Student Model (as name) | **Not visible** | CAF §2.3.1 |
| Evidence Accumulation | **No Admin surface.** Engine in `server/delivery/evidenceAccumulation.js`; player/reports show some stop/profile | Delivery process, not an authoring object |
| Evidence Identification | Engine only | Delivery process |
| Activity Selection | Engine + Assembly binding | Delivery process |
| Presentation / Delivery Model | **Absent** | Delivery Presentation process; CAF Materials & Presentation → W23 |
| Domain Analysis / Design Patterns / Templates | Absent | Layers 1–2 and CAF templates (W27–W31, W29) |

District, teacher, and student use the same `RoleWorkbench` layers as Admin. Q-matrix and calibration consoles are **Admin Models** only (bookmark routes `/district/q-matrices` and `/district/calibration` remain). Analytics is **Reports** under Delivery.

**Activities is not the Presentation Model.** `TasksManager` instantiates Task Models into the `tasks` collection (TR9 §2.4 task specs / library entries). Presentation is SessionPlayer (TR9 §2.5 Presentation process; CAF Materials & Presentation is W23). Assembly and evidence accumulation attach at session select/submit, not on the Activities tab.

## Decision — Admin top-level (do not invent a CAF “Delivery Model”)

Three top-level groups. Nested tabs, not seven peers.

### 1. Models (CAF + the measurement tools that belong with it)

- **Student Model** (rename Competency Model in the chrome; collection may stay `competencyModels`)
- **Evidence Model**
- **Task Model**
- **Assembly Model** (wire the existing builder as a nested tab; stop URL-only)
- **Q-Matrix** (nested here: design-time diagnostic structure)
- **Calibration** (nested here: fitting the Evidence Model’s measurement model). Not a peer of Item Bank.

### 2. Implementation

- **Item Bank** (items)
- **Activities** (`tasks` collection — instantiated Task Models / task specs). Not Presentation.

### 3. Delivery (plan the workspace; do not fake a wizard)

- **Sessions** (activity selection + presentation as operated today — district/teacher already have this; Admin currently does not)
- **Evidence Accumulation** inspector (read-only examinee record / SMV posteriors / classification). Not an authoring entity.
- **Presentation Model** (W23) — the real CAF object for “how it looks.” Label it Presentation, not “Delivery Model.”
- **Reports** — move today’s Analytics tab here. W16–W17 replace mock charts with provenance-bearing artefacts.

Settings stays at `/admin/settings`.

## What D73b will change (and what it will not)

**Will:** Admin (and only Admin unless a follow-on names District) nested tabs as above; label Competency → Student Model in that chrome; mount Assembly on the Models group; move Q-Matrix and Calibration under Models; move Analytics under Delivery/Reports.

**Will not:** Domain Analysis, Design Patterns, Templates, Presentation Model authoring, a new Evidence Accumulation engine, psychometric dashboard rewrite (W16–W17), D74 bundle split.

## Gaps that stay on the existing plan (not this IA)

- Domain Analysis (W29 / G10)
- Design Patterns (W27–W28 / G9)
- Templates (W26 / G14)
- Presentation Model (W23 / G8)
- Work products / rubrics as objects (W25)
- Q-matrix re-home under Domain Analysis Step 7 (W29 / D144, never-compress)
- Analytics artefacts with package provenance (W16–W17)
- D74 chunk >500 kB
- D68 mid-flight ingest live walk
- CM Archive live walk on rebuilt `:6060`
