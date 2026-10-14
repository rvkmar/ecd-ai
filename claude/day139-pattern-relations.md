# Session close — D139 pattern relations

**Closed 2026-10-14.** A child pattern cites its parent. It does not copy menus. The graph is still D140.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D139 | A child can record a kind-of or part-of link and a labelled reference; seeding still uses only its own menus; a parent edit does not change the child or a seeded model; a cycle, including a self-link, is refused | **DONE** |

The route test created a confirmed parent with observation `Parent observation` and a confirmed child with `Child observation`. The child stored `{ type: "kind-of", targetPatternId }` and `{ label: "PADI figures 9-11", url: "https://example.test/padi" }`. Its menus stayed its own. After the parent observation was rewritten, the child observation was unchanged. Seeding the child copied `Child observation` only. A later parent rewrite left that seeded statement as `Child observation`. A self-link returned 400 (`itself` or `cycle`). After the child pointed at the parent, a part-of link back returned 400 (`cycle`).

Live Admin (`admin1`) on `:6060` after `docker compose up -d --build nginx node`. A draft **D139 parent** was created. **Explain a labelled diagram** saved a `kind-of` link to that draft and the reference “PADI figures 9-11”. Cancel and Edit reloaded both from the server. The template **D136 link check** is still linked. **Confirm** stays enabled. **Seed draft models** stays disabled: this mongo has no competency. **Seeded models** still reads “No seeded models yet,” so the parent-edit sentence was the route test, not that screen.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2141 passed | 9 skipped (2150)
  88.64s, exit 0
  (the product run earlier the same evening was the same count)

npm run build
  green (27.68s). Largest JS chunk recharts 488.42 kB.
  index-Dx_Jc3BG.js; DesignPatternBuilder-CmGCP8uR.js 25.13 kB.
```

Product commit `9c7c520`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar asked whether a child inherits its parent's Potential Observations, and said that choice had to precede D137. D137 already seeds from the pattern's own menus. Inheritance would have rewritten those drafts. The child stores `relationships: [{ type: "kind-of" | "part-of", targetPatternId }]`. Editing the parent does not change the child or a model already seeded. `references` are labels, not `curricularPolicies` and not rubric exemplars. Cycle detection follows the competency part-of walk. There is no graph.

## Half-applied work

None. Node and nginx were rebuilt together. The live link is a citation on an existing confirmed pattern, plus one new draft. No seeded models were written.

## Compression debt

| Unit | What was compressed | Why | Discharge by |
|---|---|---|---|
| D135 live bulk upload | Settings Data click-through of the design-pattern card | This session walked the relation form, not Settings | W28 close (D140) |

Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`

## Calendar

D139 marked ✅. The 2027-03-09 date was not moved.

## Next

D140, alone. Anchor on one pattern and show a bounded neighbourhood. Mark diverged descendants without relying on colour alone. Discharge the D135 Settings bulk click-through at that close.
