# W17 close — Psychometric dashboards (D81–D85)

**Status: DONE.** Gate held: no figure renders on screen or in an export
without stating where it came from. Closed **2026-09-17** (real date; calendar
slots remain Dec backlog).

## Exit checks (executed this close)

| Unit | Exit check | Executed? |
|---|---|---|
| D81 | Shell renders; figure cannot compose without stamp (test); Storybook stamp + reference chart | **Yes** — `PsychometricFigure` throws without provenance; stories present |
| D82 | Renders from a real artefact; every figure stamped; flags name threshold + next action | **Yes** — ItemAnalysisDashboard + actionable flag copy |
| D83 | requiredSEM on the curve; bank that never meets it is visible without arithmetic | **Yes** — overlay + never-meets banner |
| D84 | Both aggregate estimands labelled; DIF flag meaning on screen | **Yes** — dual labels + investigation framing |
| D85 / W17 gate | No figure on screen or in CSV/PDF without provenance, across every view | **Yes** — `exportProvenance.test.jsx` iterates all four views |

## Verification (session close re-run)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  131 passed (131)
  Tests  1570 passed | 9 skipped (1579)
  Duration  80.81s

npm run build
  built in 13.02s; largest JS chunk recharts 451.37 kB (gzip 131.64 kB)
```

- `git status` — clean before close docs; product HEAD **`2a7c2f0`**.
- Branch tracks `main/master`; product D81–D85 already on the branch
  (`34405b8` … `2a7c2f0`).
- No half-applied work. No new compression debt this session.

## What was delivered (and where the plan was wrong)

| Unit | Plan assumed | Became |
|---|---|---|
| D81 | Greenfield `/admin/psychometrics` + new chart library + invent provenance fields | Nested Admin Delivery tab; **recharts** already chosen; stamp from existing artefact fields; `PsychometricFigure` refuse incomplete stamp |
| D82 | Greenfield item-analysis UI | Consume D77 payload on the D81 shell; actionable flags |
| D83 | Invent SEM math | Use D78 `conditionalSEM` + Assembly `requiredSEM` overlay |
| D84 | Attribute-profile + DIF panes | Dual estimands labelled; DIF investigation framing **on screen** |
| D85 | Chart-raster PDF | No jspdf in tree → **text PDF + CSV** that refuse missing provenance |

Product commits: `34405b8` (D81), `75a7de9` (D82), `49fb14c` (D83),
`a198469` (D84), `2a7c2f0` (D85).

## What remains

- Equating has no dedicated dashboard pane (not on D84/D85 calendar).
- Live browser download click not walked; builders + toolbar tests cover the contract.
- **D54** readiness-mirror agreement test — standing risk; **re-dated to W18 close**.
- Open ops debt unchanged: D68 mid-flight ingest, D70 Hub equating image, live walks.

## Next

**W18 / D86** — Job timeouts and process kill (R track hardening). Calendar
block `ECD W18 (D86–90)` unmarked until that week’s units close.

## Calendar

D81–D85 already ✅ with real date **2026-09-17**. W17 block event marked ✅
at this session close (dates not moved).
