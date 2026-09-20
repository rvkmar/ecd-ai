# W19 session close — D91 (gate met; not full block close)

**Closed 2026-09-17.** W19 **gate** (written threat model, every threat
dispositioned) is **met** by D91. D92–D95 still close the block. This close
records D91 only.

## Exit checks (executed)

| Unit | Exit check | Executed? |
|---|---|---|
| D91 | Written threat model with every threat dispositioned, under `docs/adr/` or `docs/security/`; no fixes in-unit | **Yes** — `docs/security/threat-model.md`; docs-only commit `725ef0c` |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1611 passed | 9 skipped (1620)
  Test Files  135 passed (135)

npm run build
  green (~14s)
```

- `git status` — clean at product **`725ef0c`** (`D91 completed -- …`) before this close commit.
- `master` tracks `main/master` (ahead until this close is pushed).
- No half-applied work. No new compression debt.

## What landed this session

| Unit | Commit | Became (vs plan) |
|---|---|---|
| D91 | `725ef0c` | Readiness brief still claimed client-posted scores and unthrottled login — both already closed/partially controlled. Model grounded in live code; every threat Control \| Accepted \| Scheduled → D92–D95 / W20–W22 |

Handoff: `claude/day91-threat-model.md`. Model: `docs/security/threat-model.md`.

## What remains

- **D92** — token life, refresh/revocation (T-AUTH-01/02)
- **D93** — input validation sweep + session-submit rate limit
- **D94** — nginx security headers + prod CORS posture
- **D95** — dependency + secret scanning CI; git-history secret scan
- W19 SSO ADR (decide only — do not build)
- W20 tenancy (roster dump, artefact list, `viewScope` server mirror)
- Carried: D68 mid-flight ingest live walk; D90 deferred ingest TOCTOU / classical null-totals

## Next

Calendar **D92** — authentication and session policy.

## Calendar

D91 already ✅ (date not moved). W19 gate closed; block not closed until D95.
