# Session close — D143 curricular policies as content standards

**Closed 2026-10-15.** A curricular policy stays a goal tree. It is stored on a Domain Analysis as `contentStandards`. It is not copied into valued-knowledge labels.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D143 | Every existing curricular policy is reachable through its Domain Analysis; Competency Wizard Step 3 citations still resolve; a dry run precedes any write | **DONE** |

Live `/data/db.json` in the node container, after `docker compose up -d --build node nginx`. The dry-run of `006-domain-analysis-content-standards` ran first and printed: “Every curricular policy is already reachable through a Domain Analysis; nothing to do.” The inventory was **0** curricular policies and **0** competency models citing a `policyId`. The apply that followed wrote only the migration log, at `2026-10-15T03:57:26.183Z`. Draft **`da1792032778751000`** (Explaining a labelled scientific diagram) is still a draft and still has no content standards.

The copy itself is the migration test, because the live store had nothing to copy. A policy `cp-ncf` with goal `CG-1`, competency `C-1.1`, and learning outcome “Points to the link” landed on a draft Domain Analysis as `contentStandards`. `valuedKnowledge` stayed `[]`. The collection row stayed. The competency model’s `constructFramework.policyId` and goal snapshot stayed. A second apply changed nothing. `GET /api/curricularPolicies` returns that content-standards object when the collection row is absent, which is how Step 3 resolves `policyId`.

Settings → Policies was not removed. Step 3 and that screen still read `/api/curricularPolicies`.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2170 passed | 9 skipped (2179)
  Test Files 219 passed
  244.02s, exit 0
  (the product run earlier the same day was the same count)

npm run build
  green (1m 16s). Largest JS chunk recharts 488.42 kB (gzip 139.42 kB).
  index-mqJPK3MB.js 33.18 kB; schema-DsaUInwG.js 49.69 kB.
```

Product commit `2d64b38`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar asked to absorb a policy into valued knowledge and then retire Settings. `valuedKnowledge` is `{ label }`, and a `curricularPolicyId` on a statement is refused. A policy is `curricularGoals` → competencies → learning outcomes. ADR 0011 stores that tree as `contentStandards` on the Domain Analysis, with the same id Step 3 already stores. The collection stays. Reads prefer the Domain Analysis copy, so an unmigrated row still resolves and a migrated row resolves through the analysis. New Settings writes update both the collection and the analysis. The dry-run runner is `server/migrations/runner.js`.

## Half-applied work

None. The live set was empty, so the apply did not copy some policies and leave others. The existing Domain Analysis was not given a policy it did not have. The Settings surface is still the reader of the route, which is the condition for leaving it up.

## Compression debt

None new. Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through

## Calendar

D143 marked ✅. The 2027-03-15 date was not moved.

## Next

D144, alone. Re-home Q-matrices. Never-compress migration. Dry-run first. `QMatrixGrid` is presentational. `QMatrixEditor` is bound to competency models and `/api/qMatrixModels`. Knowledge–task relationships are labels and refuse `qMatrixId`. Do not start it here. W29 is not closed. D145 and D150 stay never-compress.
