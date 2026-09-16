# Session 2026-09-17 — EM remaining-gap inventory (post EM-R1…R5)

**Not D81.** Calendar D81 remains W17 psychometric dashboards (shell + provenance stamp). This session was off-calendar analysis only: re-check Evidence Model gaps after the residual stack closed, and list **files that still need creating**.

**Status: DONE** for the inventory. **No product code** this session. No calendar unit completed.

## Exit check

| Claim | Form stated | Executed? |
|---|---|---|
| Confirm EM G1–G6/G8 + EM-R1…R5 still closed in ledger/code | Read handoffs + ledger + canvas | **Yes** |
| List remaining EM / EM-adjacent gaps | Grounded in TR9 canvas, `padi-tr9-admin-ia.md`, calendar W23/W25/W27 | **Yes** |
| List files to create (not edit) | Seven-artefact peers of assembly/qMatrix/analysisArtefacts | **Yes** (chat + this handoff) |
| Suite + build at close | Vitest + vite build | **Yes** this close |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  122 passed (122)
  Tests  1536 passed | 9 skipped (1545)
  Duration  57.31s

npm run build
  largest JS chunk recharts 446.89 kB; entry index-AzxEEuBR.js 31.31 kB
  built in 56.38s

git status
  clean; HEAD 7330a41 ≡ main/master
```

## What was delivered

### Verdict
EM entity TR9 gap-fix work is **closed** for authoring + delivery wiring (G1–G6/G8, EM-R1…EM-R5). There is **no further EM-core file creation** required for that stack.

What remains is **new collections** (and Delivery Presentation), not more patches inside `evidenceModels`.

### Remaining gaps (ordered for EM quality)

| Gap | Calendar | Nature |
|---|---|---|
| Ops | — | Live `:6060` Newtonian promote + console walk beyond suite ingest — **no new files** |
| **W25** G11/G12 | D121–D125 | Work Products + Rubrics as objects; multi-phase eval; human-rating queue — **closest remaining EM substance** |
| **W23** G8 | D111–D115 | `presentationModels` (stub only today) |
| **W27** G7/G9 | D131–D135 | `designPatterns` upstream of EM |
| Later | W26 / W29 | `templates`, `domainAnalyses` |

### Files that need to be created

#### W25 — Work products / rubrics / phases / rating
- `server/routes/workProductsRoutes.js`
- `server/routes/__tests__/workProductsLifecycle.test.js`
- `src/api/queries/workProducts.js`
- `src/utils/__tests__/workProducts.test.js`
- `src/components/workProducts/` (builder or wizard)
- `samples/sample-work-products.json` (optional)
- `server/routes/rubricsRoutes.js`
- `server/routes/__tests__/rubricsLifecycle.test.js`
- `src/api/queries/rubrics.js`
- `src/utils/__tests__/rubrics.test.js`
- `src/components/rubrics/` (wizard; or revive `RubricManager.jsx.backup` deliberately)
- `samples/sample-rubrics.json`
- `server/delivery/evaluationPhases.js`
- `server/delivery/__tests__/evaluationPhases.test.js`
- `src/components/rating/HumanRatingQueue.jsx`
- `src/components/rating/AdjudicationPanel.jsx`
- `server/routes/ratingQueueRoutes.js` (or sessions-owned equivalent)
- Plus schema/lifecycle/`rolePermissions`/`server/index.js` edits (not new files)

#### W23 — Presentation Model
- `server/routes/presentationModelsRoutes.js`
- `server/routes/__tests__/presentationModelsLifecycle.test.js`
- `src/api/queries/presentationModels.js`
- `src/utils/__tests__/presentationModels.test.js`
- `src/components/presentationModels/PresentationModelWizard/` (+ list)
- `samples/sample-presentation-models.json`
- `claude/adr/00xx-presentation-library-bake.md`
- Replace `PresentationModelStub.jsx` usage; SessionPlayer obeys model (D115)

#### W27 — Design Patterns
- `server/routes/designPatternsRoutes.js`
- `server/routes/__tests__/designPatternsLifecycle.test.js`
- `src/api/queries/designPatterns.js`
- `src/utils/__tests__/designPatterns.test.js`
- `src/components/designPatterns/DesignPatternWizard/` (+ list)
- `samples/sample-design-patterns.json`
- Later W28: `server/services/seedFromDesignPattern.js` (+ tests)

## Where the plan was wrong / refined

Earlier residual work order treated “other EM gaps” as EM-R1…R5 (scoring, calibration, Force Q, prereq, Assembly gate). Those are **done**. Asking again after close correctly surfaces that the **next** EM substance is W25 objects, not another EM-R* unit.

## What remains

| Item | Notes |
|---|---|
| Calendar | **D81** — W17 dashboard shell + provenance stamp |
| Ops | Newtonian live promote / console walk |
| EM substance | Prefer **W25** when calendar allows; do not invent off-cal W25 without re-prioritizing D81 |
| Upstream | W23 Presentation; W27 Design Patterns |

## Next

Calendar **D81** (W17). Do not start W25/W23/W27 in the same session as D81.

## Calendar

Off-calendar analysis — **do not** mark D81 ✅. Append note only.
