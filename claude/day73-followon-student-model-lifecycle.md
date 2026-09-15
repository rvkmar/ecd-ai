# Session 2026-09-15 — Student Model lifecycle + archive

**Not D74.** Calendar D74 remains the bundle-split unit. This session answered whether Competency Models need Operational/Suspended, then added Archive.

**Status: DONE** for the decision and the archive path in source and tests. **PARTIAL** for live behaviour: Archive was not walked on `:6060` (that image was not rebuilt this session). Do not treat a passing suite as a live Operate-tab walk.

## Exit check (what was actually executed)

| Claim | Form stated | Executed? |
|---|---|---|
| Assembly / Q-matrix activate against confirmed+locked CM | Unit tests in `newEntityLifecycle.test.js` | **Yes** |
| No Competency Wizard Activate/Suspend | Source: confirm + archive only | **Yes** (no those buttons added) |
| Confirmed CM can be archived; badge becomes Archived | Route test + `CompetencyModelList.archive.test.jsx` | **Yes in tests** |
| Same Archive click on Operate against live `:6060` | Browser on rebuilt stack | **No** |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  95 passed (95)
  Tests  1392 passed | 6 skipped (1398)
  Duration  82.06s

npm run build
  dist/assets/index-Bv9sTRq0.js  2,277.50 kB
  built in 18.32s
  chunk >500 kB warning still present (D74)
```

Product commit: `55d4514`. Close commit is this handoff. `AGENTS.md` leftover formatting: `25ee166`.

## What was delivered

PADI TR9 (Mislevy & Riconscente 2005): Competency Model = CAF Student Model. Delivery writes into SMVs; the Student Model is not a composite-library object. Operational/Suspended are **not** required on CMs.

- Assembly / Q-matrix activation use `isLinkableCompetencyModel` + version match, not `cm.status === "operational"`.
- Decision recorded in `claude/student-model-lifecycle.md` and Drive (not in `AGENTS.md`).
- `POST /api/competencies/models/:id/archive` for locked confirmed / operational / suspended. Badge follows real `status`. Clone refused once archived. List/table/dashboard no longer treat every locked model as Confirmed.

## What remains

- Live Archive walk after nginx/node rebuild on `:6060`. Do not archive the D56 Diagnostic Walk CM if sessions still need it as a parent.
- D74 bundle split (chunk still 2,277.50 kB).
- D75 W15 close, never-compress.
- D68 mid-flight ingest on `:6060`.
- Hub image for live equating.
- D54 wizard-readiness agreement test.

## Next

Calendar **D74** — Performance pass (route-level split; measure dashboard and composite-library build). Do not start D75 thin.
