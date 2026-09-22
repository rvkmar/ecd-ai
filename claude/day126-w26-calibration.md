# W26 calibration — work order (2026-09-22)

**Calibration only. No product code.** Tip `ae2b653` ≡ `main/master`.
Suite last verified at D125 session close: **2047 passed / 9 skipped**; build green.

## Repo state

| | |
|---|---|
| HEAD | `ae2b653` — D125 completed pin |
| Tree | clean |
| Last block | **W25 closed** (D121–D125) |
| Next | **D126** (W26 templates) |

## Done vs ledger

Ledger matches repo: W25 gate met; next queued D126. No half-applied work.

## Premises revised on contact

| Unit | Plan assumed | Code actually is | Became |
|---|---|---|---|
| D126 | Greenfield templates + “per-template TMV settings from D120” | No `templates` in schema; D120 settings live on **Task Models** (`taskModelVariableSettings` + `taskModelVariableFamily.js`); PM↔TM coherence already on compositeLibrary; D48 = `collectionSurfaceGuard.test.js` | New seven-artefact `templates` collection; **consume** TM settings from bound Task Model; reuse PM/TM mismatch rule; ship routes/roles/queries same session or guard fails |
| D128 | No joint distribution | Per-SMV marginal priors only; DINA already has attribute-profile joint (different) | Schema/joint prior only; do not confuse with DINA joint; alone after D126 |
| D129 | Highest-risk accumulation | Still independent continuous SMV updates | **Unchanged — never-compress.** Alone after D128 |

D127 premise held (UI after schema exists). D130 remains adversarial Tier 3 after D129.

## This session — work order

1. **D126 alone** — Tier **2** (schema entity + its HTTP surface). Model: Opus / high.
   - **Exit check:** Template validates four bindings (competency / evidence / task / presentation); refuses PM bound to a different Task Model; `collectionSurfaceGuard` green.
   - Deliver: `templates` schema + lifecycle + routes + `rolePermissions` + queries + readiness mirror + tests. No generation. No builder UI (that is D127).
2. **Stop.** Do not start D127 / D128 / D129.

## Will not fit

- D127 Template builder UI (Tier 1 — next session after D126)
- D128 Joint SMV prior schema (Tier 2 — second schema; never with D126)
- **D129** correlated accumulation (**never-compress** — flag; not on a thin budget)
- D130 adversarial / W26 gate
- W27 Design Patterns

## Debt due at W26 close (D130)

No open compression-debt row due this block. Carried-forward gaps (not W26 discharge):

- Live admin Human-rating tab click-through (D124 API walked; shell blank noted)
- D115b live Instantiated-tasks click-through
- Artifact file-upload ItemPresenter chrome
- D68 live mid-flight ingest; CM archive live walk; Newtonian live promote

## Never-compress coming up

**D129** (correlated SMV accumulation) — fixed §3 list. **D130** (adversarial). Do not start D129 unless the full exit check (hand fixture + zero-corr identity + reproducibility) fits the session.
