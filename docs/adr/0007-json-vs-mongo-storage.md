# ADR 0007 — JSON vs Mongo storage (W22 / D106)

**Status:** Accepted  
**Date:** 2026-09-20 (Day 106, Week 22)  
**Deciders:** ecd-claude build  
**Companions:** `docs/adr/0005-sso-hosting-residency.md` (§2 hosting),
`docs/adr/0006-tenancy-model.md`, `server/utils/dbAdapter.js`,
`src/utils/db-server.js`, `docker-compose.yml`, enterprise-readiness §4.1,
calendar D106 exit check

---

## Context

Calendar D106 requires the JSON-vs-Mongo story settled **as an ADR**, because
backup, restore, tenancy, and audit retention otherwise have to be designed
twice. The exit check is: decision + consequences for those four + a
**boundary that keeps the retained (harness) mode from drifting into
production**.

### What is true of the product today (two stores, not one)

| Path | Mechanism | What lives there in practice |
|---|---|---|
| **ECD file store** | `loadDB` / `saveDB` (`src/utils/db-server.js`), path `ECD_DB_FILE` (compose: `/data/db.json`) | Competency / evidence / task models, items, tasks, students, announcements, `calibrationJobs`, `analysisArtefacts`, composite libraries, policies, … — almost all ECD routes. Production keeps `sessions` and `auditLog` in Mongo (see below). |
| **dbAdapter** | `DB_MODE` = `mongo` (default) or `json` (`./data/db.json`) | Users (auth/roster) and questions; optional Mongo models via `ensureMongoModel` |

Compose already pins `NODE_ENV=production` and `DB_MODE=mongo`, and still mounts
`ECD_DB_FILE=/data/db.json`. So “Mongo in production” today means **users**,
not “the whole ECD bank.” That ambiguity is what this ADR ends.

### Hosting constraint (from ADR 0005)

Interim production topology is **single hardened host + docker-compose with
Mongo**. On-premise per-district (where a file store might look attractive)
remains an open procurement question — it is **not** the current hosting
decision. Therefore a file-backed production store is **not** chosen for the
interim deploy.

---

## Decision

### 1. Production database → **Mongo only**

For any real deployment (compose interim host, and any later topology that
still runs this app):

- **Mongo** is the sole production database of record.
- That covers both today’s `dbAdapter` collections **and** the ECD collections
  that currently sit in `ECD_DB_FILE`.
- Do not invent a second production topology that keeps ECD on a JSON file
  permanently. Revisiting requires amending this ADR (e.g. if procurement
  forces air-gapped file-only hosting).

### 2. JSON → **test / development harness only**

JSON remains for:

- Vitest and CI (`src/test/setup.js` sets `DB_MODE=json`; scratch `ECD_DB_FILE`)
- Local authoring without a Mongo daemon when `NODE_ENV !== "production"`

JSON is **not** a production deployment mode.

### 3. Interim honesty (until cutover — not a reopening)

Until ECD collections are migrated onto Mongo (scheduled under W22 migration
safety / D109 rehearsal):

- Compose may continue to mount `ECD_DB_FILE` so the live walk stack keeps
  working.
- That file is **interim operational debt**, not the decided architecture.
- D107+ backup/restore design against **Mongo volume + (interim) ECD file
  volume**, with the ECD file path scheduled for retirement after cutover.
- No new production feature may treat the ECD JSON file as the permanent
  store of record.

### 4. Enforced boundary (this unit)

| Guard | Behaviour |
|---|---|
| Boot | `NODE_ENV=production` **refuses** `DB_MODE=json` (and any value other than `mongo`) — process exits before listen |
| Boot | `NODE_ENV=production` with `DB_MODE=mongo` **requires** a non-empty `MONGO_URI` |
| Compose | Node service **pins** `DB_MODE=mongo` (asserted in suite, same class as `NODE_ENV=production`) |
| Docs | `.env.example` states production may not use `DB_MODE=json` |

Implementation: `server/config/storageMode.js`, called from `server/index.js`
after dotenv (mirrors `JWT_SECRET` refuse-to-start).

**Out of scope for D106 (explicit):** moving `loadDB`/`saveDB` collections onto
Mongo, deleting the JSON harness, or changing tenancy filter placement. Those
are cutover / D107–D109 work guided by this ADR.

---

## Consequences

### Backup / restore (D107–D108)

- Production backup target is the **Mongo data volume** (and, while interim
  debt remains, the **`ecd_data` volume** holding `ECD_DB_FILE` + materials).
- After ECD cutover, drop the ECD JSON file from the production backup set;
  keep harness JSON out of DR runbooks.
- Encrypted-at-rest and key management stay outside the compose file (calendar
  W22). Restore rehearsal (D108, never-compress) times a Mongo-shaped restore,
  not a “JSON is production” story.

### Tenancy (ADR 0006 / D97)

- Filters already apply on **both** `loadDB`/`saveDB` and `dbAdapter`. The
  decision does not reopen that design.
- Cutover must preserve ALS tenancy on the Mongo path for every collection
  that moves; no “Mongo = skip filter” shortcut.
- Global vs tenant-scoped collection lists in ADR 0006 stay authoritative.

### Audit (D101–D105)

- `auditLog` appends via the `saveDB` chokepoint. Production and
  `DB_MODE=mongo` store rows in the Mongo `auditLog` collection
  (`server/auditLog/`, migration `012-auditlog-to-mongo`). The JSON harness
  used by Vitest and `npm run dev` still keeps the array in the ECD file.
- Optional `AUDITLOG_RETENTION_DAYS` TTL is off by default.
- Admin-global (not tenant-scoped) read policy is unchanged.

### Ops / threat model

- T-NET-04 (JSON `saveDB` race) is accepted **only** for the harness and the
  interim ECD file; production direction removes that race class for ECD by
  moving to Mongo.
- Threat-model open question “whether JSON survives outside the harness” →
  **answered: harness (+ interim ECD file until cutover) only.**

---

## Exit check (D106)

| Requirement | Met? |
|---|---|
| Written ADR with a decision (not a deferral) | **Yes** — §1–§2 |
| Consequences for backup / restore / tenancy / audit | **Yes** — Consequences |
| Boundary keeping harness JSON out of production | **Yes** — §4 + `storageMode.js` + compose pin test |
| No ECD cutover code claimed | **Yes** — §4 out of scope |
| Hosting open question does not silently flip storage | **Yes** — uses ADR 0005 interim compose+Mongo |
