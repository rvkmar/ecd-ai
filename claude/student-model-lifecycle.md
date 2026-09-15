# Student Model lifecycle (PADI TR9)

**Drive:** [ECD — Student Model lifecycle (PADI TR9)](https://docs.google.com/document/d/179u95_xUDj26MpFuADrU2sNBlrnmHB6VfT66hOlQ9qU/edit)

**Status: DECIDED 2026-09-15.** Not a calendar work unit. Next queued product unit remains D74.

**Source:** Mislevy, R. J., & Riconscente, M. M. (2005). *Evidence-centered assessment design: Layers, structures, and terminology* (PADI Technical Report 9). SRI International.

## Exit check

Assembly Model and Q-matrix activation succeed against a **confirmed + locked** Competency Model at the matching version. They still refuse draft / reviewed / unlocked / archived parents. Competency Wizard does **not** gain Activate or Suspend. New Evidence Model continues to use `isLinkableCompetencyModel`.

## Decision

The Competency Model is the CAF **Student Model** (TR9 §2.3.1): “what are we measuring?” — SMVs and a distribution over claims. Delivery (TR9 §2.5) is the four-process loop over the **task/evidence composite library**. Evidence accumulation writes into Student Model Variables. The Student Model is not selected, presented, or scored.

Therefore:

| Object | Authoring freeze | Operational / suspended |
|---|---|---|
| Competency Model | `draft` ↔ `reviewed` → `confirmed` (locked). Clone to change structure. | **Not required.** Do not add those buttons. Schema may still *accept* the strings so seed rows and filters do not strand parents. |
| Evidence / Task / Item / Assembly / Q-matrix | Confirmed = structure frozen | May mean “in (or out of) the composite library / live scoring” |

`lifecycleMatrix.js` is shared **vocabulary**, not a requirement that every collection visit every state.

D71’s “New Evidence Model disabled because the CM was operational” was a **filter** that treated `confirmed` as the only frozen parent. Linkability is locked + non-archived (`confirmed` / `operational` / `suspended`). That does not mean authors must activate Competency Models.

## What the code changed (this session)

- `validateAssemblyModelLifecycle` / `validateQMatrixModelLifecycle` no longer require `cm.status === "operational"`. They use `isLinkableCompetencyModel` plus version match.
- Competency Wizard Step 9 copy no longer says confirmation “transitions to operational.”
- Clone accepts any locked, non-archived Competency Model.
- `POST /api/competencies/models/:id/archive` withdraws a locked confirmed (also operational/suspended) model. Badges use real `status`.

## What remains

- Live Archive walk on a rebuilt `:6060` (not this session). Do not archive the D56 walk CM while sessions still bind it.
- Assembly / Q-matrix wizard readiness panels do not mention the frozen-parent rule (activation is a later status than those panels cover).
- Calendar **D74** (bundle split) was not started.
