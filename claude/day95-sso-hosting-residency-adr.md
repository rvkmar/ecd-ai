# D95 — SSO / hosting / residency ADR + W19 handoff

**Status: DONE.** Docs only — no SSO code.

## Premise on contact

Calendar: evaluate SAML/OIDC against **actual** district requirements (not a
speculative build); also settle hosting target and data residency; W19
deliverables due (threat model dispositioned; decisions as ADRs or open
questions with owners; handoff written).

**Code / evidence at `6493696` (post-D94):**
- Auth is local username/password → JWT (D92 session policy).
- No IdP client, SAML, or OIDC dependency or route.
- No district has supplied IdP metadata into the repo or Drive readiness brief.
- Compose on one host is the only lived deployment topology.

**Became:** ADR 0005 records (1) local accounts remain correct, (2) interim
single-host compose, (3) residency working assumption + three open questions
with owners. W19 block handoff written. No federation code.

## Exit check (W19 deliverables)

| Claim | Executed? |
|---|---|
| Threat model complete and dispositioned | **Yes** — D91 doc; T-AUTH-05 / T-AVL-03 / §6 updated for ADR 0005 |
| SSO, hosting, residency as ADRs or open questions with owners | **Yes** — `docs/adr/0005-sso-hosting-residency.md` |
| Handoff doc written | **Yes** — this file + `claude/day95-w19-block-close.md` |

## Verification

```
Docs-only unit — no product behaviour change.

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1662 passed | 9 skipped (1671)

npm run build
  green (~34s)
```

## Delivered

- `docs/adr/0005-sso-hosting-residency.md`
- Threat model + session-policy SSO pointer updates
- W19 block close: `claude/day95-w19-block-close.md`

## What remains

- W20 (D96–D100) — server-side tenancy / viewScope / roster scoping
- IdP open question (product) before any SSO PR
- Hosting procurement open question before W22 DR is production-binding
- Residency legal confirmation before foreign-region or student IdP federation
- Retention periods; D106 JSON-vs-Mongo

## Next

Calendar **D96** (W20 multi-tenancy) — next queued after W19 close.
