# Session close — D140 pattern neighbourhood

**Closed 2026-10-14.** One pattern shows its immediate citations and the models seeded from it. The graph does not draw the library.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D140 | A seeded model traces back to its pattern in the graph and in the existing descendants query; the neighbourhood stays bounded; divergence is not colour alone | **DONE** |

The component test opened **Child pattern** with a `kind-of` parent, an unrelated pattern, and a descendants report whose model **Child evidence** had one snapshot divergence. The accessible list read `Child pattern (this pattern)`, `Problem solving (kind-of)`, and `Child evidence (seeded, diverged)`. **Unrelated family** was absent from that list. Opening the parent dropped **Child evidence**, because the report’s `designPatternId` did not match. A chain of 24 patterns, anchored on `dp12`, kept four nodes: `dp11`, `dp12`, `dp13`, and `evidenceModel:em1`. The same descendants payload is the trace; there is no second walk.

Live Admin (`admin1`) on `:6060` after `docker compose up -d --build nginx node`. Editing **Explain a labelled diagram** showed that pattern and **D139 parent (kind-of)**. Opening **D139 parent** reversed the citation. **Seeded models** still read “No seeded models yet,” so the seeded and diverged sentence is the component test. This mongo still has no competency, so **Seed draft models** stays disabled.

Settings → Data → Upload accepted `d140-bulk-check.json` (name **D140 bulk check**). The Design Patterns card ended “1 created.” That draft is in live mongo. This discharges the D135 click-through.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2143 passed | 9 skipped (2152)
  Test Files 212 passed
  78.87s, exit 0
  (the product run earlier the same evening was the same count)

npm run build
  green (29.52s). Largest JS chunk recharts 488.42 kB.
  index-C8pCN5RI.js; DesignPatternBuilder-BSveCwc7.js 29.04 kB.
```

Product commit `5462c98`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar called this the first graph and asked to draw specialisations of every pattern. React Flow already draws competency relationships. Design patterns had none. `GET /api/designPatterns/:id/descendants` was already the one-query trace. The neighbourhood is depth 1: the anchor, outgoing and incoming `kind-of` or `part-of` citations, and models from that descendants payload. Unrelated patterns stay in the library list and off the graph. A diverged model uses the word “diverged” and a dashed border. Every node uses the same fill. Relation type is the edge label.

## Half-applied work

None. Node and nginx were rebuilt together. The live graph is the existing kind-of citation. The new draft is the Settings upload. No seeded models were written.

## Compression debt

| Unit | What was compressed | Why | Discharge by |
|---|---|---|---|
| D135 live bulk upload | Settings Data click-through of the design-pattern card | W27 closed on the wizard confirm | **closed** 2026-10-14 — `d140-bulk-check.json` created 1 draft on `:6060` |

Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through

## Calendar

D140 marked ✅. The 2027-03-10 date was not moved.

## Next

D141, alone. `domainAnalyses` is a schema unit and does not exist yet. Do not start it in the same session as another schema change. Never-compress after that: D143, D144, D145.
