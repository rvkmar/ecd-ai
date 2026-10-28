# D151 — taskSpecs schema (derived, never authored)

**Closed 2026-10-28.** Calendar unit **D151**, alone (Tier 2). Conformance G15 / W31. Started from `2152fa7` (re-check). Did not start D152 / D153 / D155.

**Status: DONE.**

## Exit check (executed)

| Claim | Executed? |
|---|---|
| Authored `POST /api/taskSpecs` refused | **Yes** — 405, body `"Task specs are generated, not authored."`, store unchanged. `d151TaskSpecsRoutes.test.js` |
| A spec without `templateId` and `tmvAssignment` fails validation | **Yes** — `validateEntity("taskSpecs", …)` in `d151TaskSpecs.test.js` |
| Template-change policy recorded | **Yes** — ADR 0003b: mark stale, do not regenerate, do not freeze |
| A PUT (or confirm) of the source template marks existing specs stale | **Yes** — both routes covered in `d151TaskSpecsRoutes.test.js` |
| D48 collection guard green | **Yes** — mounted `/api/taskSpecs`, gated, `rolePermissions` entry |

A task spec cannot be created except by generation. HTTP POST is 405 even for admin. The only insert is `insertGeneratedTaskSpec`.

## Verification

Product commit `d3477b0` ≡ `main/master` before this close. Remote is named `main`, tracking `master`.

Product-tree full suite (after the allowlist, before this close): **1 failed / 2607 passed / 10 skipped** (305 files, 317.52s). The one fail was `insertGeneratedTaskSpec` with no production caller. Allowlisted; `repoGuards` then 43/43.

Close re-run, concurrent with `npm run build`:

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  7 failed | 2602 passed | 10 skipped (2619) — 305 files (459.72s)
  All 7 failures are 15s timeouts under load:
    d133DesignPatternBuilder, d134DesignPatternMenus, d139PatternRelations,
    designPatternWizardShell (2), ksaLinkEditor, d142DomainAnalysisEditor.

npx vitest run <those 6 files> + D151 exit-check files + repoGuards
  99 passed (10 files, 18.19s)

npm run build
  green (5m 41s; ran beside the suite). Largest JS chunk
  EvidenceModelBuilder-CDLW_omS.js 371.68 kB (gzip 87.60 kB).
```

The timeouts are machine load, the same class recorded at the 2026-10-28 not-started close. Isolated they pass. They are not a D151 defect.

## What the plan got wrong

The 2026-10-26 rewrite held: seven-artefact collection plus the D48 surface; authored POST refused; stale on template change; family generation is D152.

Two contact findings, neither a rewrite:

1. **Dead export.** `insertGeneratedTaskSpec` is the legal insert, but D152 is the first production caller. `repoGuards` does not count tests. The helper is allowlisted until D152 loops it. POST stays 405.
2. **Textbook G15 is not this G15.** Delivery Model (PR #103) is a different list. Copied its D48 surface (mount + admin write/delete + district view), not the collection.

Empty `tmvAssignment` is valid (family size 1 / no discrete axes). Specs have no CAF status; `stale` is the marker. Recalibration of an Evidence Model does not stale specs.

## What was delivered

| Piece | Where |
|---|---|
| Schema | `src/utils/schema.js` `taskSpecs` |
| Readiness / stale | `src/utils/taskSpecReadiness.js` |
| Generate-only insert | `server/services/insertGeneratedTaskSpec.js` |
| Routes | `server/routes/taskSpecsRoutes.js` (GET list/read; POST/PUT 405; DELETE admin) |
| Mount | `server/index.js` `/api/taskSpecs` |
| Template PUT/confirm → stale; DELETE 409 while cited | `server/routes/templatesRoutes.js` |
| RBAC | admin view+delete; district view; nobody creates or edits |
| Queries | `src/api/queries/taskSpecs.js` (read-only) |
| ADR | `docs/adr/0003b-task-spec-stale-on-template-change.md` |
| Tests | `d151TaskSpecs.test.js`, `d151TaskSpecsRoutes.test.js`, D48 + RBAC |

Collection name `taskSpecs` so the singularizer yields `TaskSpec`.

## Half-applied work

None. No family generator. No builder UI. Item POST unchanged. AIG still unmounted. Specs are not in zip `IMPORT_ORDER`.

## Compression debt

None new. Standing, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through
- P1: deleting a Design Pattern drops `seededFrom.designPatternId`

## Calendar

D151 marked ✅. The 2027-03-25 date was not moved. W31 was not marked. W29 was not marked.

## Next

Re-calibrate before **D152** (generate the family from template TMV settings). Do not start D153 or D155 from this close. W29 stays open.
