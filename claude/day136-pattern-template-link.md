# Session close — D136 pattern → template link

**Closed 2026-10-14.** W28 is open. The seeder is still D137.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D136 | A pattern links to one or more templates; the link is navigable both ways; an unpatterned template is still valid and still confirmable | **DONE** |

Live Admin (`admin1`) on `:6060` after `docker compose up -d --build nginx node`. Index `index-CFjxGwt5.js`. Draft template **D136 link check** (`tpl1791977316679000`) cites **Explain a labelled diagram** (`dp1791974767770000`). The pattern screen lists that template. Opening the template from `?tab=templates&focus=` shows the pattern selected and the link back. This mongo has no Student Model, so a four-binding confirm was not clicked live. The route test confirmed an unpatterned template that already had its four bindings.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2131 passed | 9 skipped (2140)
  close re-run 105.35s, exit 0

npm run build
  green (21.00s). Largest JS chunk recharts 488.42 kB.
  DesignPatternBuilder-xJbR00jE.js 18.10 kB; TemplateBuilder-CpSeM8us.js 14.49 kB.
```

Product commit `4af23fb`. Close commit follows. Tip matches `main/master` after the close push.

## What was delivered

The plan said W28 opens by writing `seedFromDesignPattern.js`. The calendar unit is the link, and the seeder is D137. The link is optional `template.designPatternId`. A pattern lists the templates that cite it. Confirm does not require a pattern. A missing pattern id is refused. Deleting a pattern that templates still cite returns 409.

No seeding. No pattern inheritance. No graph. Existing models stay unpatterned.

## Half-applied work

None. Node and nginx were rebuilt together. The live draft **D136 link check** remains on this mongo.

## Compression debt

| Unit | What was compressed | Why | Discharge by |
|---|---|---|---|
| D135 live bulk upload | Settings Data click-through of the design-pattern card | This session walked the template link, not Settings | W28 close (D140) — missed the W28-start date |

Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`

## Calendar

D136 marked ✅. The 2027-03-04 date was not moved.

## Next

D137, alone. Seed draft Evidence and Task Models from one confirmed pattern's own menus. Record offers that were declined. Do not inherit from a parent pattern. Do not treat `confirmed` as delivery.
