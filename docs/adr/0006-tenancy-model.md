# ADR 0006 — Tenancy model and JWT scope claims (W20 / D96)

**Status:** Accepted  
**Date:** 2026-09-19 (Day 96, Week 20)  
**Deciders:** ecd-claude build  
**Companions:** `docs/security/threat-model.md` (T-AUTHZ-02/03/04),
`docs/adr/0005-sso-hosting-residency.md`, `src/config/rolePermissions.js`,
`server/utils/tenancy.js`, `server/utils/tokenService.js`, enterprise-readiness §2

---

## Context

W20 must close the client/server asymmetry where `rolePermissions.restrictions.viewScope`
(`district` | `school` | `self`) is UI intent only. Before D97 can enforce scope at
the data layer, two facts must be settled in writing and in the access token:

1. Which collections are **tenant-scoped** vs **global** (content bank).
2. How a request knows the caller's district / school without a second DB round-trip
   on every list.

Tamil Nadu seeding (off-cal 2026-09-18) already stores `profile.districtId` as
`tn-*` keys (ADR 0005). Access tokens carried only `{ username, role, ae }` — so
even a correct data-layer filter had nothing trustworthy to filter *with*.

## Decision

### 1. Hierarchy

```
state (TN) → district → school → class/cohort → student (examinee)
```

- **District key:** `user.profile.districtId` (e.g. `tn-chennai`). Stable; never
  rename in place — mint a new id if a district splits.
- **School key:** `user.profile.schoolId` when present. Seed data today often has
  UDISE on teachers but not a separate `schoolId`; until school records are
  authored, **teacher scope falls back to district** (see §3).
- **Self:** the authenticated `username` / user id — already enforced for
  session ownership (D72).

### 2. Scoped vs global collections

| Kind | Collections | Rule |
|---|---|---|
| **Global (content chain)** | `competencyModels`, `evidenceModels`, `taskModels`, `items`, `questions`, `qMatrixModels`, `assemblyModels`, `policies`, `curricularPolicies`, `compositeLibraries`, parameter sets on EMs | Shared measurement design. Any authenticated role that `canView` the entity may read any row. Writes stay role-gated (`authorizeRole`), not tenant-gated. |
| **Tenant-scoped (PII / local ops)** | `users` (roster), `students`, `sessions`, `tasks` (local delivery instances), `announcements`, teacher/learner **reports** payloads | Filtered by the caller's scope (§3). A district officer must not read another district's roster, sessions, or local tasks. |
| **Tenant-scoped artefacts** | `analysisArtefacts`, `calibrationJobs` (operator metadata) | Rows may carry `scope.districtId` / `schoolId` / `cohort` (shaped since D79). **List and get** for non-admin roles filter to the caller's district (and school when claim present). Admin remains unscoped. Artefacts without a district scope are **admin-only** on read (D97), so an unscoped psychometric aggregate cannot leak through a district account. |
| **Out of band** | R container, Mongo / `db.json` at rest | Compose trust boundary (T-NET-*); not app tenancy. |

Global content is intentional: one item bank and one Student/Evidence/Task model
library for the deployment. Isolation is on **who took which session** and **who
sees which roster / local task / aggregate**, not on cloning the bank per district.

### 3. Server mirror of `viewScope` (enforcement = D97)

| Role | Client `viewScope` | Server rule (D97+) |
|---|---|---|
| `admin` | (none) | **Unscoped.** Missing `districtId` claim is normal. |
| `district` | `district` | Require `districtId` claim; filter tenant-scoped reads to that id. Refuse other districts' path params. |
| `teacher` | `school` | Prefer `schoolId` when present; else **district fallback** until school hierarchy is authored. |
| `student` | `self` | Own sessions/reports only (D72 already); roster endpoints must not dump peers (T-AUTHZ-03 → D97). |

**Missing claim policy:** only `admin` may operate without `districtId`. A
`district` / `teacher` / `student` token without `districtId` is a **data defect**
— D97 must refuse tenant-scoped reads (403), not silently return the full store.

### 4. JWT claims (this unit)

Access tokens gain optional claims copied from `user.profile` at login and
preserved across refresh rotation:

| Claim | Source | When present |
|---|---|---|
| `districtId` | `profile.districtId` | Non-empty string |
| `schoolId` | `profile.schoolId` | Non-empty string (optional today) |

Claims are **omitted** when absent (admins, unfinished profiles). They are not
client-editable; only re-login / refresh after a profile change updates them.
Profile district moves should bump `authEpoch` in a later unit if operators
reassign users across districts in-app.

Helpers: `server/utils/tenancy.js` (`tenancyClaimsFromUser`, `viewScopeForRole`).

### 5. Explicitly not in D96

- Data-layer filtering in `dbAdapter` / list routes (**D97**, never-compress).
- Row-level negative tests (**D98**).
- Aggregate leakage review of every report/dashboard path (**D99**).
- Tenant administration UI + `rolePermissions`↔server mirror-drift test (**D100**).

## Consequences

- D97 can trust `req.user.districtId` / `schoolId` after `authenticateToken`.
- Live walk users (`dist1`, `teach1`, `stud1`, `dist-chennai`, …) receive
  `districtId: tn-chennai` (or their district) on login once profiles are seeded.
- Threat T-AUTHZ-02 moves from "no server counterpart" to "claims present;
  enforcement scheduled D97–D100".
- ADR 0005's guidance to key district scope off `profile.districtId` (`tn-*`)
  is now the token path as well as the roster path.

## Exit check (D96)

| Requirement | Met? |
|---|---|
| Written ADR: scoped vs global collections | **Yes** — §2 |
| Access token carries `districtId` from profile when set | **Yes** — `tokenService` + login |
| Refresh rotation preserves tenancy claims | **Yes** |
| Login/refresh still works for walk users | **Yes** — suite + live `:6060` |
| No data-layer enforcement claimed | **Yes** — deferred D97 |
