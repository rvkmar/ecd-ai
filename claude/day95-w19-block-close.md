# W19 block close — Security (D91–D95)

**Status: DONE.** Gate was met at D91 (threat model); block closes with D95 ADR.

## Block units

| Unit | Commit (product / docs) | What closed |
|---|---|---|
| D91 | `725ef0c` / `33b0c9c` | Written threat model; every threat dispositioned |
| D92 | `9169119` | 15m access + refresh rotation/revocation; password policy |
| D93 | `5a2bcf7` | Path/query sanitize; submit rate limit; filter hardening |
| D94 | `6493696` | nginx headers; CI npm audit + Gitleaks; history audit |
| D95 | (this close) | ADR 0005 SSO/hosting/residency; W19 handoff |

## W19 exit (calendar D95)

| Deliverable | Status |
|---|---|
| Threat model complete and dispositioned | **Met** (`docs/security/threat-model.md`) |
| SSO / hosting / residency as ADR or open+owner | **Met** (`docs/adr/0005-sso-hosting-residency.md`) |
| Handoff | **Met** (`claude/day95-sso-hosting-residency-adr.md` + this file) |

## Explicitly not built in W19

- SAML / OIDC (forbidden without a named district IdP — ADR 0005)
- Server-side tenancy (W20)
- Audit log collection (W21)
- JSON-vs-Mongo final call / DR rehearsal (W22)

## Residual accepted risks carried forward

- T-AUTH-05 password-sharing pressure under local accounts (until IdP known)
- T-AVL-03 single-host outage (until procurement revises hosting)
- T-AUTHZ-02/03/04 unscoped reads → W20
- Retention periods still unnamed

## Next block

**W20** — Multi-tenancy and data isolation (D96–D100). Gate: a district user
cannot read another district’s data through any endpoint, proven by test.
