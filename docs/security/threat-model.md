# ECD Assessment Platform — Threat Model

**Status:** Accepted for W19 gate (dispositioned; fixes not applied in this unit)  
**Date:** 2026-09-17 (D91)  
**Against:** `80d1c4b` (post–W18)  
**Governs:** W19–W22 hardening work; every threat below has a disposition  
**Companions:** `ecd-enterprise-readiness-security-ops-qa-docs.md` §0–§1; ADRs 0001–0004; `claude/day90-adversarial-r-track-w18-close.md`

---

## 0. Method and dispositions

This document is the W19 gate deliverable: **threat model before any security fix**.
It does not implement controls. Dispositions are one of:

| Disposition | Meaning |
|---|---|
| **Control** | Already enforced in code/tests at the cited path; treat as load-bearing |
| **Accepted** | Known residual risk with a stated reason; not scheduled to close in W19–W22 |
| **Scheduled** | Named calendar unit (or follow-on block) that must close it |

A row with no disposition is incomplete. None remain.

---

## 1. Why this platform is not a normal CRUD app

Three risks from the enterprise-readiness brief, restated against **current** code
(the readiness brief’s §0 still says the client posts its own score — that was F3;
D47 closed the item path):

1. **A wrong score is invisible.** A plausible posterior from a wrong or
   under-provenanced parameter set does not throw. Provenance, benchmarks,
   seed/reproducibility, and ingest refusal are **security controls**, not QoL.
2. **The examinee is an adversary with an incentive.** Item-path `/submit`
   ignores client `scoredValue` (D47). Legacy question path still accepts a
   client score — pinned, not endorsed. Adaptive selection and item content
   leakage remain examinee-facing attack surfaces.
3. **The data is about children.** Sessions, responses, and roster rows are the
   most sensitive class this system stores. Tenancy is still largely
   client-side intent (`rolePermissions.viewScope`) without a server data-layer
   counterpart (W20).

---

## 2. Actors

| Actor | Capabilities assumed |
|---|---|
| **A1 Anonymous internet** | Unauthenticated HTTP to nginx `:80` / API; can probe `/api/*`, static SPA |
| **A2 Authenticated student** | JWT with `role: student`; session play, own reports (after D72 ownership) |
| **A3 Authenticated teacher** | JWT `teacher`; create/run sessions for assigned learners; school-scoped UI intent |
| **A4 Authenticated district** | JWT `district`; district UI intent; currently broad API reads (artefacts, roster) |
| **A5 Authenticated admin** | JWT `admin`; authoring, calibration ingest, lifecycle, user admin |
| **A6 Compromised container on compose network** | Process inside `node`, `nginx`, `mongo`, or `r-backend`; can speak to peers on the internal network |
| **A7 Insider with database access** | Read/write Mongo or `data/db.json`; bypasses application auth |

---

## 3. Assets (what we are defending)

| Asset | Why it matters |
|---|---|
| **S1 Session responses + posteriors** | Child assessment data; wrong or leaked scores have institutional cost |
| **S2 Active parameter sets** | Drive live scoring; forged provenance → invisible wrong measurement |
| **S3 Analysis artefacts** | DIF/equating/cohort summaries; not scoring authority, but sensitive aggregates |
| **S4 Item bank / task content** | Exposure before assignment enables cheating and construct-irrelevant variance |
| **S5 User credentials / JWT** | Bearer access to everything the role can hit |
| **S6 Calibration jobs + R matrix payloads** | May contain response matrices; queue and R are calibration-only (ADR 0001) |
| **S7 Authoring chain (CM→EM→TM→Items)** | Integrity of the governed content chain |

---

## 4. Threat catalog

Each row: **Threat → Impact → Disposition → Evidence / next unit**.

### 4.1 Identity and session

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-AUTH-01 | Stolen JWT used until expiry | Full role impersonation for up to access-token life; refresh theft until rotation/revocation | **Control** (D92) | Access default **15m** + refresh rotation + logout denylist + `authEpoch` on password/role change. See `docs/security/session-policy.md` |
| T-AUTH-02 | Brute-force login | Account takeover | **Control** | Per-IP `loginLimiter` (10/min) + per-username lockout (5 fails / 15 min); password policy stated in `passwordPolicy.js` |
| T-AUTH-03 | Weak / default JWT secret | Forge any token | **Control** | Boot refuses `JWT_SECRET` &lt; 32 chars (`jwt.js`) |
| T-AUTH-04 | Password stored or logged in clear | Credential theft | **Control** | bcrypt on create/login path; `toSafeUser` strips password |
| T-AUTH-05 | Missing SSO / IdP for districts | Operational pressure to share passwords; weak identity binding | **Scheduled** (SSO ADR, W19 — not speculative build) | Calendar: evaluate SAML/OIDC against real district requirements; **do not implement in D91–D95 without ADR** |
| T-AUTH-06 | Client calls bypassing `apiFetch` | Unauthenticated or mis-attached requests | **Control** | D46 guard: no raw `fetch("/api…")` outside `apiClient.js` |

### 4.2 Authorisation and tenancy

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-AUTHZ-01 | Role spoofing via JWT claim edit | Privilege escalation | **Control** | Claims signed; role checked via `authorizeRole` on write routes (D13 static scan) |
| T-AUTHZ-02 | `viewScope` / `editableModels` only on client | Cross-district / cross-school data read | **Scheduled W20 (D96–D100)** | `rolePermissions.js` has scopes; server does not enforce at `dbAdapter` |
| T-AUTHZ-03 | `GET /api/students` returns full roster to any authenticated role | Child PII / roster dump | **Scheduled D92–D93 / W20** | `studentsRoutes.js` — authenticate only; no role or tenant filter on `GET /` |
| T-AUTHZ-04 | District can list all `analysisArtefacts` | Cross-tenant psychometric aggregates | **Scheduled W20** | D90 finding; scope fields stored, list API unscoped |
| T-AUTHZ-05 | Student reads another student’s session/report | Child data leak | **Control** (sessions/reports) | D72 ownership on session + session-report routes; regression tests |
| T-AUTHZ-06 | Teacher fetches teacher-report as student | Cross-role data leak | **Control** | D59 `authorizeRole` on teacher-report routes |
| T-AUTHZ-07 | Ungated write route added later | Silent auth regression | **Control** | D13 route-gating static scan |

### 4.3 Measurement integrity (platform-specific)

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-MEAS-01 | Client asserts `scoredValue` on item path | Examinee self-scores | **Control** | D47: item path uses `identifyEvidence()` only; falsified score ignored |
| T-MEAS-02 | Legacy question path still trusts client `scoredValue` | Same class of cheat on remaining legacy items | **Accepted** (until legacy retired) + monitor | Explicitly pinned in `d47ItemDelivery.test.js` — not endorsed; retire with questions→items completion |
| T-MEAS-03 | Active parameter set without provenance / job | Invisible wrong scoring | **Control** (hardened D90) + residual **Scheduled** | D90: `/recalibrate` and `/activate` require provenance; attach-seed no longer auto-activates. Residual: ingest TOCTOU; classical import still a parallel authority path — track under W21 audit + D90 deferred P1 |
| T-MEAS-04 | Analysis artefact mistaken for scoring params | Operator activates wrong authority | **Control** (code path) + **Accepted** (UX residual) | Ingest kinds split; delivery never reads artefacts. Copy clarified D90; operator education remains |
| T-MEAS-05 | R crash / poison affects delivery scoring | Session integrity failure | **Control** | ADR 0001 + D62 `rBoundaryGuard` + D89 live kill proof |
| T-MEAS-06 | Benchmark drift after package upgrade | Silent psychometric wrongness | **Control** | D64–D70 pipelines + D88 perturbation predicates + Hub package gate |
| T-MEAS-07 | Null treated as 0 in sparse matrices | Wrong equating / DIF / fit | **Control** (R HTTP path) + **Scheduled** (classical authoring) | Live R path NA; D90 hardened `unlist`. Classical person-totals null-as-0 remains authoring P1 (D90 deferred) |
| T-MEAS-08 | Item content returned before assignment | Pre-knowledge / cheating | **Scheduled** (verify / harden with delivery hardening — originally D50-class; confirm in W19 input sweep or W20) | Adaptive selection makes over-fetch easy; needs explicit route audit |
| T-MEAS-09 | Fixture keys (`Item.1`) ≠ live bank ids after ingest | Silent miss / wrong binding | **Scheduled** (carry D72#7) | Ingest does not assert keys ⊆ request `itemIds` |

### 4.4 Input, injection, and transport

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-INP-01 | Malicious query/path/filter params | Injection, NoSQL operator abuse, DoS | **Scheduled D93** | `validateEntity` covers entity insert shape, not query/path/filters |
| T-INP-02 | Oversized JSON bodies | DoS on node | **Accepted** (dev) → **Scheduled** (ops hardening) | `express.json()` default limits; no explicit cap documented for production |
| T-INP-03 | Missing security headers (CSP, HSTS, XCTO, Referrer-Policy) | XSS impact amplification, MIME sniffing | **Scheduled D94** | `nginx.conf` proxies `/api` only — no security headers today |
| T-INP-04 | CORS misconfiguration in production | Token theft via malicious origin | **Scheduled D94** | Dev CORS locked to `localhost:5173`; production relies on same-origin nginx — verify no open CORS in prod compose |
| T-INP-05 | Session submit flooding | Exhaustion / distorted exposure stats | **Scheduled D93** | Login limited; `/submit` not rate-limited |

### 4.5 Supply chain and secrets

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-SUP-01 | Vulnerable npm dependency | RCE / data exfil | **Scheduled D95** | No Dependabot / `npm audit` CI gate observed under `.github/` |
| T-SUP-02 | Secret committed in git history | Credential compromise | **Scheduled D95** | `.env` gitignored at HEAD; history scan not yet proven |
| T-SUP-03 | Hub `r-backend` image drift / missing packages | Silent calib failure or wrong estimates | **Control** | D88 CI package gate; D61 `/health` pin practice |
| T-SUP-04 | Compromised publish of Hub image | Malicious R code on calib path | **Accepted** (trust Hub + pin digest later) | Prefer digest pin in compose as follow-on; not W19 day-unit yet |

### 4.6 Compose network and insider

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-NET-01 | Compromised `node` reaches R or Mongo freely | Data exfil; calib abuse | **Accepted** (compose trust boundary) → harden in W22 | Internal network is flat; ADR 0001 only forbids delivery→R, not node→R |
| T-NET-02 | Compromised `r-backend` calls node APIs | If credentials present in env, lateral movement | **Accepted** + verify | R should not hold user JWTs; confirm env on compose |
| T-NET-03 | Insider edits Mongo / `db.json` | Arbitrary score/param rewrite | **Accepted** (insider) → **Scheduled W21** audit log detects app-path changes only | DB-level integrity needs backup + audit + access control outside app |
| T-NET-04 | JSON `saveDB` race clobbers concurrent writes | Lost updates / integrity | **Accepted** (known) → **Scheduled W22** storage ADR | Carried since D72 adversarial list |

### 4.7 Availability

| ID | Threat | Impact | Disposition | Notes |
|---|---|---|---|---|
| T-AVL-01 | Calibration queue exhaustion | Ops delay; not delivery outage | **Control** | D87 concurrency + queue alarm; D86 kill-on-timeout |
| T-AVL-02 | R container down | Calibration fails | **Control** | Delivery continues (D89); jobs fail with reason; restart drains queue |
| T-AVL-03 | Single-node API / no HA | Site outage | **Accepted** until hosting ADR | Hosting target undecided (readiness §9) |

---

## 5. Mapping to calendar units (so dispositions stay executable)

| Unit | Closes (primary threats) |
|---|---|
| **D91** (this doc) | Gate: every threat dispositioned |
| **D92** | ~~T-AUTH-01/02~~ **closed** — see `docs/security/session-policy.md` |
| **D93** | T-INP-01/05 input validation sweep + rate limit on session submit |
| **D94** | T-INP-03/04 nginx security headers + prod CORS posture |
| **D95** | T-SUP-01/02 dependency + secret scanning CI; history scan |
| **W19 SSO ADR** | T-AUTH-05 (decide only) |
| **W20 D96–D100** | T-AUTHZ-02/03/04 tenancy + artefact/roster scoping + mirror-drift |
| **W21** | Audit log for lifecycle / ingest / auth failures (insider app-path detection) |
| **W22** | Storage ADR (JSON vs Mongo), backup/restore, T-NET-01/04 operational hardening |

D91 **does not** implement any of the above.

---

## 6. Explicit non-decisions (named, not forgotten)

These remain ADRs or policy decisions when reached — not silent omissions:

- SSO / IdP product choice  
- Hosting target (compose vs managed K8s vs on-prem)  
- Data residency for Indian state education bodies  
- Retention periods for responses, audit, artefacts  
- Whether JSON store survives outside test harness (W22)

---

## 7. Exit check (D91)

| Requirement | Met? |
|---|---|
| Written threat model | **Yes** — this file |
| Actors include anonymous, student, teacher, district, admin, compromised container, insider | **Yes** — §2 |
| Three platform-specific risks addressed | **Yes** — §1 (with F3 premise corrected) |
| Every threat dispositioned (Control / Accepted / Scheduled) | **Yes** — §4 |
| No security fixes applied in this unit | **Yes** — documentation only |

---

*Prepared 2026-09-17 for D91 against repository `80d1c4b` and the enterprise-readiness security brief §0–§1.*
