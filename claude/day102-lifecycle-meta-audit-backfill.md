# D102 — Migrate ad hoc lifecycle fields onto the audit log (never-compress)

**Status: DONE.** Calendar unit **D102** complete 2026-09-20.

## Premise on contact

Calendar: backfill `activatedAt` / `suspendedAt` / `reviewMeta.*` into
`auditLog` as **reconstructed** history (no invented actors); fields stay
one release; a dry-run reports what a removal migration would delete;
nothing deleted yet. D8 runner + version log.

**Code at calibration:** D101 `auditLog` + `saveDB` chokepoint live. EM/CM
still write `operationalMeta` / `reviewMeta`; task models write
`deactivation`. UI panels still read those fields. Migrations 001–002 exist.

**Became:** collectors + migration **003** (backfill reconstructed rows,
fields retained) and **004** (removal preview that never deletes, even
without `--dry-run`).

## Exit check

| Claim | Executed? |
|---|---|
| Every existing entity's known lifecycle history appears in auditLog, marked reconstructed | **Yes** — `003-backfill-lifecycle-audit` + tests |
| A dry run reports exactly what a removal migration would delete, and nothing is deleted yet | **Yes** — `004-preview-remove-lifecycle-meta` dry-run and apply both report; fields remain |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1747 passed | 9 skipped (1756) — 150 files (~39s)

npm run build
  green (recharts 451.37 kB) — from prior D102 build pass; suite re-verify above
```

```
node server/migrations/run.js 003-backfill-lifecycle-audit --dry-run
node server/migrations/run.js 004-preview-remove-lifecycle-meta --dry-run
```

## Delivered

| Area | Change |
|---|---|
| `server/migrations/lifecycleMetaAudit.js` | Collect reconstructed entries + removable paths |
| `003-backfill-lifecycle-audit.js` | Idempotent audit backfill; source fields retained |
| `004-preview-remove-lifecycle-meta.js` | Report-only removal preview (never strips) |
| `server/migrations/run.js` | Registry + CLI |
| `server/migrations/runner.js` | Resolve `ECD_DB_FILE` / log path at call time |
| Tests | `d102LifecycleMetaAudit.test.js` |

Reconstructed row shape:

```
{ id: "aud-recon-…", at, actor{userId|null, role:null},
  action: "lifecycle.reconstructed",
  entity{collection,id,version},
  detail{ reconstructed:true, source, inferredTo, … },
  requestId: null }
```

## Readers that still need the ad hoc fields (do not strip yet)

- `EvidenceModelLifecyclePanel.jsx` / `OperationalActivationPanel.jsx`
- `Step9Confirmation.jsx` (CM `reviewMeta.submittedBy`)
- `competencyModels.js` confirm/review gates
- Lifecycle route tests asserting `operationalMeta` / `reviewMeta`

## Next

Calendar **D103** — structured logging + request-id propagation (Tier 2).
Actual field removal waits until readers move to auditLog (later / D109 chain).
