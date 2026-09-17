# D85 — PDF/CSV export + W17 handoff

**Status: DONE** for the calendar exit check: no figure renders on screen
or in an export without stating where it came from, asserted across every
W17 dashboard view. **W17 deliverables due — closed.**

## Premise on contact

D81–D84 shipped stamped on-screen figures. Calendar required the *same*
provenance block on CSV/PDF exports. No jspdf/pdfkit in the repo — D85
adds a minimal text PDF builder and CSV builder that **refuse** incomplete
provenance (same `assertPsychometricProvenance` contract).

## Exit checks

| Claim | Executed? |
|---|---|
| CSV + PDF for every dashboard view | **Yes** — item-analysis, test-information, attribute-profile, dif |
| Export carries same provenance (job, package, sample, computed-at, source) | **Yes** — `assertExportCarriesProvenance` per view |
| On-screen figures still require stamp | **Yes** — PsychometricFigure compose guard + per-view stamp render |
| Cross-view suite assertion | **Yes** — `exportProvenance.test.jsx` iterates `PSYCHOMETRIC_EXPORT_VIEWS` |

## What shipped

| Area | Change |
|---|---|
| `exportProvenance.js` | CSV/PDF builders; `buildExportsForView`; download helper |
| `PsychometricExportToolbar.jsx` | Shared Export CSV + PDF control |
| Four dashboards | Toolbar wired when an artefact + provenance are selected |
| Tests | Refuse missing provenance; every view CSV/PDF stamped |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  131 passed (131)
  Tests  1570 passed | 9 skipped (1579)

npm run build
  largest JS chunk recharts 451.37 kB; built ~18.1s
```

## W17 gate

Admin Psychometrics shell consumes R/Node analysis artefacts; every
on-screen figure and every CSV/PDF export states job / package / sample /
computed-at / source. Block closed at D85.

## Honest gaps

- Equating has no dedicated dashboard pane (not on calendar D84/D85).
- Live browser download click not walked; builders + toolbar tests cover the contract.
- Minimal PDF is text-only (no chart raster) — provenance and table lines are the defendable payload.

## Debt at block close

- **D54** readiness-mirror agreement test remains **standing risk** (past multiple closes) — re-date to W18 close or discharge deliberately.
- Other open ops debt (D68 mid-flight, D70 Hub image, live walks) unchanged.

## Next

**W18** — R track hardening (D86+). First unit per calendar.

## Calendar

Marked **D85** ✅ with real date **2026-09-17**. W17 closed.
