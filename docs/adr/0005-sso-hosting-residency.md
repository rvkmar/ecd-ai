# ADR 0005 — SSO / IdP, hosting target, and data residency (W19)

**Status:** Accepted (with named open questions) — **amended 2026-09-18** for Tamil Nadu roster facts
**Date:** 2026-09-18 (Day 95, Week 19)
**Deciders:** ecd-claude build
**Companions:** `docs/security/threat-model.md` (T-AUTH-05, T-AVL-03),
`docs/security/session-policy.md`, enterprise-readiness §1.2 / §9,
calendar D95 exit check, `server/data/tamilNaduDistricts.js`

## Context

W19 closes with three procurement-shaped questions that the readiness brief
deliberately left undecided (§9): SSO/IdP, hosting target, and data residency
for Indian state education bodies. Calendar D95 requires them recorded as
**ADRs or as explicitly open questions with owners** — not as speculative
SAML/OIDC code.

### What is true of the product today

| Fact | Evidence |
|---|---|
| Identity is **local accounts** (username + bcrypt password → JWT) | `server/routes/usersRoutes.js` login; seed users in `initMongo` |
| Access tokens are short-lived with refresh rotation/revocation | D92 / `docs/security/session-policy.md` |
| No SAML, OIDC, OAuth, or external IdP client exists | No passport/OIDC deps; no IdP routes |
| Roles are app-owned (`admin` / `district` / `teacher` / `student`) | JWT claims + `authorizeRole` |
| Runtime shape is **docker-compose** (nginx + node + mongo + r-backend) on one host | `docker-compose.yml`; live walk stack `:6060` |
| No named district has supplied IdP metadata, federation policy, or hosting RFP into this repo | Search of ADRs, threat model, readiness brief, and handoffs — none |

### What the calendar forbids

Building SSO against **imagined** district requirements (same class of error as
schema declared fifty days before first use — Part 0.1). Evaluate SAML vs OIDC
only against **actual** identity infrastructure.

## Decision

### 1. SSO / identity provider → **local accounts remain correct for this deployment**

Until a real district IdP requirement is in hand:

- **Do not** implement SAML or OIDC in D95–W20.
- Keep the current local-account + JWT session policy (D92) as the production
  identity path for the compose deployment.
- Treat T-AUTH-05 residual risk (password sharing / weak institutional binding)
  as **Accepted for the current deployment**, mitigated by password policy,
  lockout, short access tokens, and refresh revocation — not by speculative
  federation.

**If / when a district requirement arrives**, prefer in this order:

1. **OIDC** (Authorization Code + PKCE for browser; confidential client for
   server) when the district IdP is Azure AD / Entra, Google Workspace,
   Keycloak, or any OIDC-conformant OP — majority path for new Indian state
   education IT, and maps cleanly onto existing JWT issuance (exchange IdP
   tokens for our access/refresh pair; keep `authEpoch` / role as app claims).
2. **SAML 2.0** only when the district’s stated IdP is SAML-only (legacy
   on-prem AD FS / some state SSO stacks). Do not lead with SAML.
3. **Hybrid**: staff (district/teacher/admin) via IdP; examinees
   (`student`) may remain local or roster-provisioned — decide per RFP, do not
   assume one binding for all four roles.

**Open question (blocks any SSO build):**

| Question | Owner | Due |
|---|---|---|
| Which target district(s), and what IdP product + protocol do they actually run? | Product owner (Ravikumar) with district IT contact | Before any SSO implementation PR; not before W20 tenancy work |

No SSO code lands until that row is filled with a named IdP and a written
protocol choice (OIDC vs SAML) for that IdP.

### 2. Hosting target → **single hardened host running current compose (interim)**

| Option | Verdict for now |
|---|---|
| Current compose on one host | **Chosen interim** — matches what is built, tested, and walked (`:6060`) |
| Managed Kubernetes | **Deferred** — no multi-replica requirement yet; HA is Accepted (T-AVL-03) until scale/procurement demands it |
| On-premise per district | **Contingent** — only if residency or procurement forces air-gapped / district-owned hardware |

Consequences of the interim choice:

- W22 DR runbook is written for **compose on one host** (backup/restore of
  Mongo volume + `ecd_data`, R image pin, nginx). Revisit if hosting changes.
- Do not invent a second deployment topology in code until this ADR is revised.
- D106 (JSON vs Mongo) should assume the interim host runs **Mongo in
  compose** for any real deployment; JSON stays a harness (direction already
  sketched in readiness §4.1 — final call remains D106).

**Open question:**

| Question | Owner | Due |
|---|---|---|
| Final procurement hosting (single host vs managed K8s vs on-prem per district) | Product owner + ops | Before W22 DR rehearsal is treated as production-binding |

### 3. Data residency → **working assumption: data stays on the chosen host’s region / premises; cloud multi-region not authorized**

Student responses and roster PII are the sensitive class (threat model §1).
No statute text or state MoU is in-repo, so we cannot claim a closed legal
opinion. We **do** record an operational assumption that unblocks W20–W22
design without pretending the law is settled:

- All student PII, responses, and calibration matrices remain on storage
  attached to the hosting target in §2 (compose volumes / that host’s region).
- No third-party analytics, multi-region DB replicas, or foreign-region IdP
  that holds student attributes is authorized by default.
- If a future OIDC IdP is outside India, the open question below must be
  re-answered **before** federation of student accounts (staff-only IdP may
  still be acceptable — decide per RFP).

**Open question:**

| Question | Owner | Due |
|---|---|---|
| Confirm residency / cross-border rules for the first paying state or district body | Product owner with legal / district counsel | Before any cloud or foreign-region hosting or student-IdP federation |

Retention periods (responses, audit, artefacts) remain a separate non-decision
(threat model §6) — not closed here.

## Amendment — Tamil Nadu deployment facts (2026-09-18)

Product owner supplied concrete roster constraints after D95:

| Fact | Implication |
|---|---|
| ≥5 admin accounts | Seed `admin1`…`admin5` |
| 38 TN districts | Registry in `server/data/tamilNaduDistricts.js`; one `dist-<slug>` each |
| Teachers / students carry EMIS / UDISE | Stored on `user.profile`; login accepts EMIS or UDISE as the username field |
| Shared temporary password `WalkPass!2026` | `SEED_TEMP_PASSWORD` / default in `tnSeedUsers.js`; `mustChangePassword: true` |
| SSO **may** be required | Keep local password login; mark accounts `authProvider: "local"`; refuse password login when `authProvider` is `oidc`/`saml` so federation can land later without breaking local admins |

**Revised SSO stance:** local accounts remain the production path **and** the
identity seam is SSO-ready. Still **do not** ship an OIDC/SAML client until the
IdP product is named — but do not block TN roster seeding on that.

Seed commands: `npm run seed:tn-users` or first-boot `initMongo.js`.

## Consequences

- **No OIDC/SAML client** until the IdP open question is answered; local JWT
  login (username / EMIS / UDISE + password) stays the live path.
- Threat model: T-AUTH-05 → Accepted (current deployment) + Scheduled
  (OIDC/SAML client only after IdP named); T-AVL-03 stays Accepted under the
  interim single-host decision.
- W22 DR and D106 storage ADR take **single-host compose + Mongo** as the
  default topology unless this ADR is revised.
- A future SSO PR must cite this ADR, name the district IdP, and choose
  OIDC or SAML explicitly — otherwise it is out of process.
- W20 tenancy should key district scope off `profile.districtId` (`tn-*`).

## Exit check (this ADR)

| Requirement | Met? |
|---|---|
| SSO evaluated against actual known requirements (not invented IdP) | **Yes** — TN may require SSO later; local remains; seam ready |
| Hosting recorded | **Yes** — interim single hardened host / compose |
| Residency recorded | **Yes** — working assumption + open question with owner |
| Open gaps have owners | **Yes** — three tables above |
| No speculative IdP client | **Yes** — local auth + refusal seam only |
| TN roster seedable without breaking walk logins | **Yes** — `admin1`/`dist1`/`teach1`/`stud1` retained |
