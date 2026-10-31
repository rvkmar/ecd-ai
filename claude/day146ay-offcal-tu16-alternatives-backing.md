# Off-calendar: TU16 alternative explanations and warrant backing

**Not D146.** Not a calendar unit. Closes textbook gap T4. Does not start TU17.

Handoff id: day146ay. `day146ax` is TU10 (task time and attempt limits).

**Status: DONE.** Exit check: a draft evidence model with no backing and no alternative explanations still validates. A draft that is sent to review with a warrant and no backing is refused. An already-reviewed model that never stored those fields warns and stays valid.

## Premise

The Toulmin argument needs claim, data, warrant, backing, and alternative explanations. WarrantBuilder captured backing as `backingEvidence`. The schema had no `backing` field, so that text was not part of the reviewed argument. Construct-irrelevant KSAs lived only on design patterns.

## Choice

Two optional fields on an evidence model:

- `warrants.backing` (string). `backingEvidence` is still written by the builder and the card. Save copies whichever side is filled onto the other.
- `alternativeExplanations[{text, additionalKsaRef, addressedBy}]`. Absent or empty is allowed at every status.

From `reviewed`, `confirmed`, `operational`, `suspended`, and `archived`:

- Each warrant that exists needs backing (`backing` or `backingEvidence`).
- Each alternative explanation needs non-empty `text` and `addressedBy`.
- `addressedBy` must be an observable id on that model, or a task model variable id, when the database is available to check.
- `additionalKsaRef` is optional. When it is set it must match an additional KSA: entry id, label, `patternId:label`, `patternId:index`, `competencyId`, or `valuedKnowledgeId`.

Drafts stay permissive, including a half-filled explanation. An empty warrant list is not a new review gate. Strict confirm still requires at least one warrant. Review of a seeded draft that has no warrants is unchanged. A non-strict check of a confirmed model that omits warrants on purpose stays clean. The new rule is the backing on warrants that are actually there.

Already-reviewed models follow the same idea as an already-active parameter set. If the stored row is already past draft and never recorded backing or an alternative explanation, missing backing is a warning. `valid` stays true, so a read or an unchanged save does not fail. A validation with no database (the wizard audit) does the same for an already-reviewed shape that never recorded the fields. Promoting a draft is not in that set: the stored status is still draft, and missing backing is an error. A new alternative explanation on a grandfathered model is still checked. Incomplete text or addressedBy is an error.

No migration. The fields are optional. Nothing rewrites existing rows. `samples/ecd-sample-complete` warrants gained a `backing` string so that worked example can still move to review. That is sample data, not a migration.

`slimParameterSet` and migration 015 are unchanged. Parameter sets are not embedded again.

The warrants step of the evidence model editor edits alternative explanations: text, an additional KSA from design patterns, and an observable or task model variable.

## What was not done

TU17 (`validityEvidence`). A signed-in browser walk of the wizard. The editor and WarrantBuilder were exercised with Testing Library (type, select, create). The full vitest suite passed.

## Rollback

Revert this change. Drafts are unchanged. A model that stored `backing` or `alternativeExplanations` keeps those keys, and older code ignores them. The sample zip warrants keep the extra `backing` string, which older validation does not read.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3237 passed | 13 skipped (3250)
```

`npm run lint` has no script, and there is no ESLint config. The repo guard tests ran inside the suite.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. TU17 was not started.
