# D79 — Attribute-profile cohort summaries (W16)

**Status: DONE** for the calendar exit check: a seeded cohort with known
profiles produces the expected mastery rates; probability-averaged and
classification-counted figures are both present and labelled. Tenancy
scope fields are shaped on the artefact. Informs only — never
`activeParameterSetId`.

## Premise on contact (rewritten)

The calendar read as another R `/analyse/*` job. Code said otherwise:
`classifyAttributeProfile` (ADR 0004) already owns the individual rule;
no `attribute-profile*` job kind existed; artefact scope had no
tenant/district/school fields. D79 is a **Node-only** cohort aggregate
through the calibration job queue (no R path), recomputing every label
through `classifyAttributeProfile`. Population CA (`GDINA::CA` / Wang)
remains out of scope and is named as such in diagnostics.

## Authority decision (must not drift)

1. **Individual classification** = `classifyAttributeProfile` / ADR 0004.
   Cohort figures recompute through that export; no stored mastery labels.
2. **Cohort summary** = job kind `attribute-profile-summary` →
   `analysisArtefacts`. Informs only.
3. **Two estimands, both labelled**:
   - `probabilityAveragedMasteryRate` — mean of posterior.estimate
   - `classificationCountedMasteryRate` — nMaster / nAssigned
     (indeterminate excluded from the denominator)
4. **`meanExpectedClassificationAccuracy`** on the artefact is the mean
   of individual conditional accuracies among assigned classifications.
   It is **not** population classification accuracy (ADR 0004 binding).
5. **Scope shaping for W20**: `tenantId` / `districtId` / `schoolId` /
   `cohort` on the artefact. Enforcement is not this unit.

## Hand-verified fixture (threshold 0.5)

Four persons × attrs A,B:

| person | A | B | A class | B class |
|---|---|---|---|---|
| p1 | 0.9 | 0.8 | master | master |
| p2 | 0.9 | 0.2 | master | nonmaster |
| p3 | 0.1 | 0.2 | nonmaster | nonmaster |
| p4 | 0.5 | 0.7 | indeterminate | master |

| | probability-averaged | classification-counted |
|---|---|---|
| attrA | 0.6 | 2/3 |
| attrB | 0.475 | 0.5 |

## Exit checks

| Claim | Executed? |
|---|---|
| Kind `attribute-profile-summary` + family `attribute-profile` | **Yes** |
| Node worker path; `rPathForJobKind` is null | **Yes** |
| Fixture `known-attribute-profile-cohort` + console bind | **Yes** |
| Enqueue → process → ingest → `analysisArtefacts`; nested EM empty | **Yes** |
| Hand rates match; both estimands labelled in diagnostics | **Yes** |
| Scope carries tenant/district/school/cohort | **Yes** |

## What shipped

| Area | Change |
|---|---|
| `server/delivery/attributeProfileCohortSummary.js` | Aggregate + Node job runner |
| `server/r/knownAttributeProfileCohortFixture.js` | Seeded cohort + hand rates |
| Vocabulary / contract / readiness / ingest / worker | Kind, family, Node branch, tenancy scope |
| Console + sample | `known-attribute-profile-cohort` |
| Tests | `attributeProfileSummaryPipeline.test.js` |
| `contract.R` | Family listed (twin); no R endpoint |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  116 passed (116)
  Tests  1504 passed | 9 skipped (1513)
  Duration  85.41s

npm run build
  largest JS chunk recharts 446.89 kB
  built in 17.21s
```

## What remains

- D84 dashboards that render these artefacts (labelled distinctly)
- W20 server-side tenancy enforcement on the new scope fields
- Live `:6060` console walk of the new fixture (suite covers the path)
- EM-R1…EM-R5 off-cal residual (not this unit)

## Next

**D80** — Scheduled recalibration + W16 handoff (enqueue only; never ingest).
