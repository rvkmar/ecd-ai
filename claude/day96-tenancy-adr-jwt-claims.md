# D96 ? Tenancy model ADR + JWT district/school claims (W20 start)

**Status: DONE.** Calendar unit **D96** complete. Session closed 2026-09-19.

## Premise on contact

Ledger: "W20 multi-tenancy (server-side viewScope)".

**Code at calibration:** `viewScope` still client-only; JWT claims were
`{ username, role, ae }` only; `profile.districtId` existed on TN seed plans
but pre-TN walk accounts in live Mongo had **no profile**, so even a correct
token path would have emitted nothing.

**Became:** ADR 0006 (scoped vs global collections + viewScope mirror table);
access tokens carry optional `districtId` / `schoolId` from profile; refresh
preserves them; initMongo **backfills** missing seed profile fields on existing
usernames (no password touch); `authenticateToken` sets `req.viewScope`.
**No data-layer enforcement** (that is D97).

## Exit check

| Claim | Executed? |
|---|---|
| Written ADR: scoped vs global | **Yes** ? `docs/adr/0006-tenancy-model.md` |
| Access token carries `districtId` from profile when set | **Yes** ? suite + live `:6060` |
| Refresh preserves tenancy claims | **Yes** ? suite + live |
| Login still works for walk users | **Yes** ? `dist1` / `teach1` / `stud1` / `admin1` |
| Admin omits `districtId` when profile has none | **Yes** ? `admin1` claim absent |
| No dbAdapter enforcement claimed | **Yes** ? deferred D97 |

### Live `:6060` (after node rebuild + initMongo backfill)

| User | `districtId` claim |
|---|---|
| `dist1` | `tn-chennai` |
| `teach1` | `tn-chennai` |
| `stud1` | `tn-chennai` |
| `admin1` | *(omitted)* |
| `dist1` after refresh | `tn-chennai` preserved |

## Verification (session close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1677 passed | 9 skipped (1686) ? 142 files (~73s)

npm run build
  green (~17s; max JS chunk recharts 451.37 kB)
```

- No half-applied product work. Product commit **`80afcfe`**; this close follows.
- Calendar mark: Google Calendar MCP not available in this Cursor session ? mark `ECD D96` ? manually if still open.
- Close-gate: IA tests wait for D74 `lazyPanel` Suspense; `repoGuards` required
  unexporting unused tenancy helpers and wiring `req.viewScope`.

## Delivered

- `docs/adr/0006-tenancy-model.md`
- `server/utils/tenancy.js` (`tenancyClaimsFromUser`, `viewScopeForRole`)
- `server/utils/tokenService.js` ? claim issuance + refresh persistence
- `server/routes/usersRoutes.js` ? login passes profile tenancy into tokens
- `server/utils/authMiddleware.js` ? `req.viewScope` from role
- `server/utils/initMongo.js` + `missingProfileFields` ? profile backfill
- `server/routes/__tests__/d96TenancyClaims.test.js`
- session-policy + threat-model T-AUTHZ-02 notes

## What remains

- **D97** (never-compress) ? data-layer scope enforcement
- **D98** ? row-level negative tests
- **D99** ? aggregate leakage review
- **D100** ? tenant admin UI + mirror-drift + W20 gate
- Carried open walks: D68 mid-flight ingest; CM archive; Home announcements;
  Newtonian live promote

## Next

Calendar **D97** ? alone, never-compress.
