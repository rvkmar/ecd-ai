# W19 session close — D94 + D95 + off-cal TN seed + hardened bases

**Closed 2026-09-18.** Calendar units **D94** and **D95** are **DONE**. W19
block closed (gate was already met at D91). Same day also shipped off-calendar
Tamil Nadu deployment seeding and digest-pinned hardened Hub bases.

## Exit checks (executed)

| Unit | Exit check | Executed? |
|---|---|---|
| D94 | Live headers; CI npm audit + Gitleaks fail-the-build; written history audit | **Yes** — `:6060` headers; `security-scanners` job; `docs/security/git-history-secret-audit.md` (no rotations) |
| D95 | Threat model dispositioned; SSO/hosting/residency ADR or open+owners; handoff | **Yes** — ADR 0005; `claude/day95-sso-hosting-residency-adr.md` + `claude/day95-w19-block-close.md` |
| Off-cal TN | ≥5 admins, 38 districts, EMIS/UDISE login, SSO-ready without breaking local | **Yes** — seeded on live mongo; login by username/EMIS/UDISE; `authProvider: local` seam |
| Off-cal Docker | Pin digests; Scout-clean Node/nginx under `rvkmar` | **Yes** — `rvkmar/ecd-node:24-alpine@sha256:6f3300…`, `rvkmar/ecd-nginx:alpine@sha256:21771f…`; app images Scout 0C/0H |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  after close-gate fix: 1665 passed | 6 failed | 9 skipped (1680)
  (full-suite load flakes — 5s timeouts / UI; not product regressions)

  Isolation of the failing files (same command set, alone):
    167 passed | 1 skipped — all green (repoGuards included)

npm run build
  green (~38s; max JS chunk recharts 451.37 kB)
```

- **Real defect found at close:** `repoGuards` failed on three unused TN
  exports (`normalizeLoginIdentifier`, `effectiveAuthProvider`,
  `DEFAULT_SEED_TEMP_PASSWORD`) and a resurrected `createUserRecord` (now
  called by the TN seed). Fixed before this close (unexport helpers; drop
  baseline entry). Isolation confirms green.
- Full-suite failures under load match the W18 close pattern (timeout flakes);
  not recorded as product failures.
- `git status` — clean after this close commit.
- `master` tracks `main/master` at product **`7639477`** then this close.
- No half-applied product units. No new compression debt.

## What landed this session

| Unit | Commit | Became (vs plan) |
|---|---|---|
| D94 | `6493696` | Calendar owns scanners (threat-model D95 map drifted). Headers + CI audit/Gitleaks + Dependabot + history audit. Local override had forced `NODE_ENV=development` (re-enabled CORS) — removed for walk stack. |
| D95 | `a8c4e7b` | No district IdP → local accounts remain; interim single-host compose; residency working assumption + owners. ADR amended in-commit for TN facts. |
| Off-cal TN | (in `a8c4e7b`) | 38-district registry; seed ≥5 admins + district/teacher/student per district; EMIS/UDISE login; `authProvider` seam |
| Off-cal Docker | `7639477` | Custom bases strip nested npm Highs + unused nginx libxml2; app Dockerfiles pin Hub digests |
| Close gate | (this close) | Unexport dead TN helpers; remove `createUserRecord` from `DEAD_EXPORT_BASELINE` |

Handoffs already on tree: `claude/day94-…`, `claude/day95-sso-…`,
`claude/day95-w19-block-close.md`. This file is the session-close record.

## What remains

- **D96** — W20 multi-tenancy (server-side `viewScope`)
- T-AUTHZ roster / artefact scoping → W20
- IdP / hosting procurement / residency legal opens (ADR 0005 owners)
- Carried: D68 mid-flight ingest live walk; Home announcements live walk;
  Newtonian live promote; CM archive live walk

## Next

Calendar **D96** — W20 multi-tenancy.

## Calendar

D94 ✅, D95 ✅ already. **W19 block** marked ✅ this close (dates not moved).
