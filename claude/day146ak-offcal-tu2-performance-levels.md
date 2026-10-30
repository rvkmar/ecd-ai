# Off-calendar: TU2 performance levels

**Not D146.** Closes textbook gap T15. Does not start TU3. Reports are unchanged.

Handoff id: day146ak. TU1 already took `day146aj`. `day146ah` and `day146ai` were already used.

**Status: DONE.**

## What changed

Optional performance levels on a competency, authored in the Student Model wizard.

- `performanceLevels`: `[{ label, descriptor, cut }]`. Each cut is the lowest score that reaches that level. Labels are non-empty and unique. Cuts are finite and strictly ascending.
- `performanceLevelScale`: `theta` or `probability`. Required when any level is present. A probability cut must sit between 0 and 1.
- Absent, null, or `[]` means no standard is set. `levelForScore` returns null. No migration.
- A score below every cut returns null. A score equal to a cut has reached that level. The highest matching cut wins.
- If the score's scale does not match `performanceLevelScale`, `levelForScore` returns null. TU3 should pass the scale of the number it has (theta or a probability) and fall back when the result is null.
- Wizard step 9 is optional. Confirmation moved to step 10. The structural audit stays step 8.
- Angoff: panelist probabilities per item. The cut is the mean of the per-item means, on the probability scale.
- Bookmark: difficulties in strictly increasing order. The cut is the difficulty at the chosen 0-based position (the first item a borderline examinee is not expected to answer correctly), on the theta scale.
- The worksheet is not stored. Apply writes the cut into `performanceLevels`.
- Validation lives in `src/utils/performanceLevels.js` and is called from `src/utils/schema.js`, so the schema edit stays a field pair plus one call. A parallel TU1 edit can land beside it.

## What was not done

Report wording. The hardcoded Advanced / Proficient / Needs Support cuts in `server/routes/reportsRoutes.js`. TU1 `decisionRule` / `masteryThreshold`. Saving the panel ratings or the bookmark list. A data migration.

## Verification

```
npx vitest run src/utils/__tests__/performanceLevels.test.js
               src/components/competencies/CompetencyWizard/steps/__tests__/performanceLevelsStep.test.jsx
  21 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2945 passed | 13 skipped (2958). 346 files. 73.52s.
```

There is no lint script and no ESLint config. `npm test` runs the repo guards that stand in for that. Those guards are in the full run above.

A live browser walk was not run. This environment has no `data/db.json`, and JSON mode does not seed a login. The worksheet was exercised in jsdom: type Angoff ratings and apply a probability cut, place a bookmark and apply a theta cut, and refuse an Angoff cut while the scale is theta.

## Calendar

Not D146. TU3 can call `levelForScore`. Do not merge without an explicit OK.
