# Session close — D141 domainAnalyses schema

**Closed 2026-10-15.** One `domainAnalyses` record holds PADI’s seven Layer-1 entities. It does not authorise student delivery.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D141 | Schema covers all seven entities; a Domain Analysis is created, validated and persisted; the D48 collection guard passes | **DONE** |

The seven fields are labelled statements: valued work, task features, representational forms, performance outcomes, valued knowledge, knowledge structure, and knowledge–task relationships. Confirm requires a name, one non-empty label in each section, and a perspective from the existing `PSYCHOLOGICAL_PERSPECTIVES` enum. `operational` is refused. A row that carries `curricularPolicyId`, `qMatrixId`, or `competencyModelId` is refused. Draft may omit sections.

There is no D141 screen. Persistence of the schema unit is the live record **`da1792032778751000`** (name **Explaining a labelled scientific diagram**), written later the same day through the D142 bulk route, which calls the same validator. It is stored as **draft**. The D48 guard passes because the schema key, the mounted `/api/domainAnalyses` route, and the role entry landed together.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run (with D142): 2164 passed | 9 skipped (2173)
  Test Files 216 passed
  160.51s, exit 0
  D141 product run, before D142: 2159 passed | 9 skipped

npm run build
  green (45.66s). Largest JS chunk recharts 488.42 kB (gzip 139.42 kB).
  index-j6eKL5q5.js 33.18 kB.
```

Product commit `686f328`. Calibration `9addd9e`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar asked for schema only and left the HTTP surface to D142. `collectionSurfaceGuard` fails a schema key with no mounted route and no role entry, so the minimum gated surface landed here, the same way D131 did. ADR `docs/adr/0010-domain-analysis-collection.md` records that `capitalize()` strips a trailing `s`, so the collection persists as the Mongoose model **DomainAnalyse**.

Admin may view, edit, and delete. District may read. Writes are admin-only. The route requires a bearer token. The perspective is stored on the Domain Analysis as a declared value. It is not copied onto competency models and it is not inherited. `curricularPolicies` and `/api/qMatrixModels` were left where they are.

## Half-applied work

None. Lifecycle is `draft` | `confirmed` only. No migration of policies or Q-matrices. No bulk route in the D141 commit; that is D142.

## Compression debt

None new. Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through

## Calendar

D141 marked ✅. The 2027-03-11 date was not moved.

## Next

D142 is the upload and the correction form. It is recorded in `claude/day142-domain-analysis-upload.md`. After that, D143 alone: absorb `curricularPolicies`. Never-compress. Do not start it in this close.
