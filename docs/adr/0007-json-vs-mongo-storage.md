# ADR 0007 — JSON vs Mongo storage (W22 / D106)

**Status:** Accepted  
**Date:** 2026-09-20 (Day 106, Week 22)  
**Deciders:** ecd-claude build  
**Companions:** `docs/adr/0005-sso-hosting-residency.md`,
`docs/adr/0006-tenancy-model.md`, `claude/day101-auditlog-write-path.md`,
`claude/day71-core-browser-pass.md`, `server/utils/dbAdapter.js`,
`src/utils/db-server.js`, `docker-compose.yml`

---

## Context

W22's plan said the JSON-vs-Mongo decision would be **executed** rather than
both surfaces maintained. Calibration on 2026-09-20 found that premise only
partly true: two stacks are still live, and `DB_MODE=mongo` does not mean
one store.

This unit records the verified map and picks the target store. It does **not**
cut over. "Decision executed" is defined below so D107–D109 can do the work
without re-litigating the choice.

### Hypothesis checked (do not treat CLAUDE.md as the map)

CLAUDE.md still says `dbAdapter.js` is "the only thing that talks to storage."
That is false today. Two modules persist, with different files, env vars, and
callers.

| Claim on contact | Verdict | Evidence |
|---|---|---|
| `dbAdapter` defaults `DB_MODE` to `"mongo"`, also supports `"json"` writing `./data/db.json` | **Confirmed** | `server/utils/dbAdapter.js` L59, L62; `loadJSON`/`saveJSON` use a hardcoded `path.resolve("./data/db.json")` |
| That JSON path honours `ECD_DB_FILE` | **False** | Hardcoded `./data/db.json`. D72 already filed this as P2: "JSON `dbAdapter` ignores `ECD_DB_FILE`." |
| `db-server.js` is `saveDB` / `readRawDB` / `ECD_DB_FILE` (default `db.json` in cwd) + `ECD_BACKUP_DIR` | **Confirmed** | `src/utils/db-server.js` L15–20, L69–120 |
| D101 audit choke point is `saveDB` | **Confirmed** | `saveDB` → `applySaveAudits`; `recordAuditEvent` for auth/user events; `auditLogRoutes` reads `loadDB().auditLog` |
| `.cursor/install.sh` pins `DB_MODE=json` and `ECD_DB_FILE=./data/db.json` | **Not in repo** | No `.cursor/install.sh` (or `.cursor/` tree) on this checkout. Cloud Agent JSON mode is still a real local path via tests (`src/test/setup.js` sets `DB_MODE \|\|= "json"`) and per-test `ECD_DB_FILE` scratch files |
| `dbAdapter` is what users / students / tenancy / reports / questions / migrations use | **Partly false** | Users and auth epoch: yes. Students **CRUD**: `loadDB`/`saveDB`. Students **assignable**: `dbAdapter.list("users")` then fallback `db.users`. Questions: `questionsRoutes.js` is `loadDB`/`saveDB` only. Reports: session/teacher/learner paths are `loadDB`; **dashboard** is `dbAdapter.list` of sessions/tasks/students. Migrations: 001/003/004 → `db-server`; 002 → `dbAdapter.list("taskModels")` even though Task Models are authored through `saveDB` |
| `DB_MODE=mongo` means one store | **False** | Compose sets `DB_MODE=mongo` **and** `ECD_DB_FILE=/data/db.json`. D71 P0: switching session reports to `dbAdapter` 404'd because Mongo had no session rows |

---

## Current dual-stack map (verified)

### Stack A — `server/utils/dbAdapter.js`

| | |
|---|---|
| Switch | `process.env.DB_MODE \|\| "mongo"` (`"json"` \| `"mongo"`) |
| JSON file | **Hardcoded** `./data/db.json` — not `ECD_DB_FILE` |
| Mongo | `MONGO_URI` default `mongodb://localhost:27017/ecd_assessment`; `dbName: "ecd_assessment"` |
| API | `list` / `get` / `insert` / `update` / `remove` plus `updateWhere` / `removeWhere` |
| Tenancy | D97 ALS filters on list/get/write (`tenancyScope.js`) |
| Audit | User create/update/delete call `recordAuditEvent` → **Stack B's JSON file** |
| Explicit schemas | `User`, `Question` (legacy). Other names via `ensureMongoModel` + naive singularize (`policies` → `Policie`) |

### Stack B — `src/utils/db-server.js`

| | |
|---|---|
| File | `ECD_DB_FILE` or `path.join(process.cwd(), "db.json")` |
| Backups | `ECD_BACKUP_DIR` or `<dirname(db file)>/backups`; `saveDB` copies before write |
| API | `loadDB` (tenant-filtered view), `readRawDB` (full file), `saveDB` (merge-on-save + audit diff) |
| Default keys | `items`, `evidenceModels`, `tasks`, `sessions`, `competencyModels`, `competencies`, `taskModels`, `students`, `questions`, `calibrationJobs`, `analysisArtefacts`, `announcements`, `auditLog` |
| Also written here in practice | `policies`, `curricularPolicies`, `assemblyModels`, `qMatrixModels`, `compositeLibraries` (not in `defaultDB()`, created on first save) |
| Audit | **The** W21 write path. Routes must not import the audit module; a transition that is not logged is a transition that did not go through `saveDB` |

Even when both stacks are in JSON mode they can be **two files**:
`./data/db.json` (adapter) vs `ECD_DB_FILE` / cwd `db.json` (db-server).

### Env pins by environment

| Environment | `DB_MODE` | `ECD_DB_FILE` | What that actually persists |
|---|---|---|---|
| Compose (`docker-compose.yml`) | `mongo` | `/data/db.json` (`ecd_data` volume) | Users/auth → Mongo volume. ECD chain, sessions, jobs, artefacts, announcements, audit → `/data/db.json`. Health probe (`systemStatus.js`) reports **both** (`database.ecd` + `database.userStore`) |
| Vitest (`src/test/setup.js`) | `json` if unset | Per-test scratch, or cwd `db.json` | Adapter users → `./data/db.json`. Entity/audit tests that set `ECD_DB_FILE` → that file. Same process, two paths |
| Cloud Agent / local `npm run dev` | unset → adapter default **mongo** (needs `MONGO_URI` or localhost) | unset → cwd `db.json` | Same split as compose unless the operator pins both. No in-repo install script overrides this |
| `.env.example` | **omits** `DB_MODE` and `ECD_DB_FILE` | — | Documented secrets only (`MONGO_URI` via compose `MONGO_ROOT_*`) |

### Who writes which collection today

**Stack B (`loadDB` / `saveDB`) — production content, delivery, and audit**

| Collection | Call sites |
|---|---|
| `competencyModels` | `competencyModels.js` |
| `evidenceModels` | `evidenceModels.js`; calibration ingest via jobs/worker |
| `taskModels` | `taskModelsRoutes.js` |
| `items` | `itemsRoutes.js` |
| `questions` | `questionsRoutes.js` (legacy bank; not `dbAdapter`) |
| `tasks` | `tasksRoutes.js` |
| `sessions` | `sessionRoutes.js`, `autoFinish.js`, `autoFinishRoutes.js`; helpers in `db-server.js` |
| `students` | `studentsRoutes.js` GET/POST/PATCH/DELETE |
| `policies`, `curricularPolicies` | `policiesRoutes.js`, `curricularPoliciesRoutes.js` |
| `assemblyModels`, `qMatrixModels`, `compositeLibraries` | matching route files |
| `calibrationJobs` | `calibrationJobsRoutes.js`, `calibrationWorker.js`, `scheduledCalibrationCron.js` |
| `analysisArtefacts` | `analysisArtefactsRoutes.js` (read); ingest writes via `saveDB` |
| `announcements` | `announcementsRoutes.js` |
| `auditLog` | `saveDB` / `recordAuditEvent` only; `auditLogRoutes.js` + Settings viewer read |
| Session reports / Play measurement | `reportsRoutes.js` session / teacher-report / learner-feedback: `loadDB()` (D71 revert) |
| Ops / health / queue | `opsRoutes.js`, `systemStatus.js` (`loadDB` + backup dir) |
| Migrations 001, 003, 004 | session status; lifecycle-meta → `auditLog` |

**Stack A (`dbAdapter`) — roster / auth / a few cross-stack readers**

| Collection | Call sites |
|---|---|
| `users` | `usersRoutes.js` (login, CRUD); `authMiddleware.js` (`authEpoch` lookup, unscoped); `studentsRoutes.js` assignable roster; `initMongo.js` seed (Mongo-only) |
| `sessions`, `tasks`, `students` | `reportsRoutes.js` **dashboard only** (`dbAdapter.list`) |
| All `TENANT_SCOPED_COLLECTIONS` (`users`, `students`, `sessions`, `tasks`, `announcements`, `analysisArtefacts`, `calibrationJobs`) | `tenancyRoutes.js` directory + scope inspector |
| `taskModels` | migration `002-normalize-tools-allowed.js` (comment claims Task Models "are behind dbAdapter"; routes contradict that) |

**Split-brain cases (same name, two stores, or reader ≠ writer)**

1. **Compose production.** `DB_MODE=mongo` for users; everything the W21 gate and session path care about is still `ECD_DB_FILE`. D71 already proved `dbAdapter.list("sessions")` against Mongo is empty while Play writes sessions to JSON.
2. **Dashboard vs session reports.** `/api/reports/session/:id` reads Stack B; `/api/reports/dashboard` lists sessions/tasks/students from Stack A. Under compose those lists are the Mongo copies (usually empty).
3. **Tenancy inspector.** D100 loads scoped collections via `dbAdapter`. Under compose it sees Mongo `users` and misses JSON `sessions` / `students` / `tasks` / jobs / artefacts / announcements.
4. **Session district resolution.** `dbAdapter.peerSnapshotFor("sessions")` loads `students`/`users` from **the same** `DB_MODE`. JSON sessions + Mongo users cannot resolve district through that helper.
5. **Assignable roster.** Prefers `dbAdapter.list("users")` (Mongo on compose) then `db.users` from `loadDB()` (usually absent). Examinees exist as Mongo users; `students` collection is the JSON roster (often empty — comment on `studentsRoutes.js`).
6. **Audit of Mongo users.** User role/district changes persist in Mongo; the audit row is appended to the JSON `auditLog` via `recordAuditEvent`. Two volumes for one fact.
7. **Migration 002 vs 001/003/004.** Tools-allowed walks `dbAdapter` Task Models; session-status and lifecycle-audit walk `saveDB`. On compose, 002 no-ops an empty Mongo collection while 003 backfills the JSON file the authoring UI actually uses.
8. **JSON–JSON file split.** Adapter JSON ≠ `ECD_DB_FILE`. Tests that set only `ECD_DB_FILE` still send adapter writes to `./data/db.json`.

---

## Decision

### 1. Production target store → **Mongo**

One store for the compose deployment: every collection that is durable in
production, including the ECD chain, sessions, jobs, artefacts, announcements,
users, and `auditLog`, lives in Mongo (`ecd_assessment` / `mongo_data`).

Reasons, from the map — not from ADR 0005's hunch alone:

- The interim host **already runs Mongo** for the only records with uniqueness
  and PII indexes (`users.username`, sparse `profile.emisId` / `udiseId`;
  `initMongo.js`). Retiring Mongo would move the TN roster and login off that
  path. Retiring JSON as the *production content/session/audit* store
  consolidates onto infrastructure compose already operates.
- Shared `saveDB` is a known lost-update risk (D72 P1-8: concurrent session
  writes clobber). That is acceptable for a test harness; it is not acceptable
  as the production session log.
- Split-brain is already a shipped defect (D71 P0 404s). Keeping JSON as a
  second production surface makes W20 tenancy inspectors and W21 audit lie
  whenever a reader picks the wrong stack.
- W22 DR is specified for **one host / compose** (ADR 0005). A restore that
  must replay `mongo_data` *and* `ecd_data` *and* keep them consistent is two
  recovery stories. The target is one.

**Hypothesis from ADR 0005** ("D106 should assume the interim host runs Mongo
in compose; JSON stays a harness"): **confirmed** as the production direction,
and **rejected** as a description of today. Compose Mongo is the user store
only. JSON is not "just a harness" on `:6060` — it is the live ECD / session /
audit disk.

**Hypothesis discarded:** "JSON wins because that is where the chain actually
lives." That is the current map, not the target. Choosing JSON would mean
moving users off Mongo, dropping indexes, and keeping the clobber-prone
single-file writer as the session store. The volume of Stack B callers is
why cutover is D107–D109, not why JSON should remain production.

### 2. Local / dev / test → **JSON remains a first-class harness until the production write path moves**

Cloud Agent and Vitest JSON mode is a real path (`DB_MODE=json`, scratch
`ECD_DB_FILE`). D106 does not delete it.

Until D109 lands:

- Tests may keep pinning `DB_MODE=json` and a temp `ECD_DB_FILE`.
- Local compose / `:6060` stays the dual-stack topology this ADR documents.
- A later unit may keep a JSON adapter as a **test double** after production
  writes stop. That is an implementation choice for D109, not a second
  production store.

### 3. What "decision executed" means (without doing it here)

The W22 premise becomes true when **all** of the following hold on the
compose deployment:

1. Production routes persist every durable collection through **one** adapter
   (`dbAdapter` in `DB_MODE=mongo`, or a successor with the same boundary).
2. `ECD_DB_FILE` is not a live production write path. `saveDB` is either gone
   or is a thin wrapper over that adapter (tests only).
3. `DB_MODE=mongo` means users **and** sessions **and** Task Models **and**
   `auditLog` are in Mongo. Health no longer reports two stores as required
   for serving sessions.
4. The W21 query
   `GET /api/auditLog?entityCollection=taskModels&entityId=…&action=lifecycle.transition&toStatus=operational`
   still returns actor, `at`, and `detail` in one response — because
   `auditLog` moved **with** the entity write path, not after it.
5. ADR 0006 filters still apply at the adapter boundary
   (`TENANT_SCOPED_COLLECTIONS` + session peer snapshot that can see Mongo
   `users` and Mongo `sessions` in one snapshot).

Until those five are true, both surfaces are maintained. This ADR is the
choice, not the execution.

---

## Retirement sequence (losing surface = production JSON via `db-server.js`)

D106 stops here. Later units, in order:

| Unit | Job | Notes |
|---|---|---|
| **D107** | Backup of **both** current volumes (`mongo_data` + `ecd_data` / `ECD_DB_FILE` + `ECD_BACKUP_DIR`) | Cannot drop JSON backups until migration. Runbook only / first backup — not this ADR |
| **D108** | Timed restore of the **target** store (Mongo) | Never-compress. W22 block gate. Restoring JSON alone is not the gate once this ADR stands |
| **D109** | Production-shaped migration: copy Stack B collections (including `auditLog`) into Mongo; move the D101 choke point so a lifecycle `update` through `dbAdapter` appends the same audit row; point routes at the adapter; stop compose from mounting a live `ECD_DB_FILE` write path | Never-compress. Dual-write or freeze-window is an implementation detail for that unit. Must not break the W21 one-query gate |
| **D110** | Load test | Never-compress. Not a storage decision |

Suggested D109 order (guidance, not work):

1. Put `auditLog` behind the same adapter the entity write will use, **before**
   moving Task Model / Item / session writes — otherwise promotions go
   unaudited and W21 fails.
2. Move tenant-scoped JSON collections (`sessions`, `students`, `tasks`,
   `announcements`, `calibrationJobs`, `analysisArtefacts`) together with the
   session peer snapshot so district resolution does not straddle stores.
3. Move global content (`competencyModels` → `items`, policies, libraries).
4. Delete or test-gate `saveDB` production callers. Fix migration 002 to
   read the store Task Models actually live in (or they will, after this step).
5. Collapse `systemStatus` to one database probe. Keep `ECD_BACKUP_DIR` only
   if D107 still snapshots a file; otherwise backup is `mongodump` / volume.

Losing surface after D109: **production use of `src/utils/db-server.js` as
the entity/session/audit disk.** The file module may remain as a test helper
until a cleanup unit removes it. Mongo is **not** the losing surface.

---

## Non-goals for D106

- No storage-cutover code (no route rewires, no dual-write, no `DB_MODE` flip
  in compose).
- No backup / restore implementation (D107 / D108).
- No production-shaped migration (D109).
- No load test (D110).
- No threat-model or CHANGELOG rewrite. ADR 0005/0006 were not indexed in
  `CHANGELOG.md`; this file follows that convention.
- No `.env` / secret edits.

---

## Interaction with ADR 0006 and D101 / W21

**Tenancy (0006 / D97).** Filters are duplicated on purpose today: `loadDB` /
`mergeScopedDbSave` **and** `dbAdapter` list/get/write. A cutover that moves
sessions to Mongo and leaves `loadDB` as the session reader (or the reverse)
reopens the D71 404 and makes `tenancyRoutes` / dashboard / Play disagree.
Session district is resolved via assignees → `students` / `users` (ADR 0006
§2). After cutover, `peerSnapshotFor` must read those three collections from
the **same** Mongo snapshot. `auditLog` stays **out** of
`TENANT_SCOPED_COLLECTIONS` (D105: admin-global accountability). Do not
"fix" that during migration.

**Audit (D101) and the W21 gate (D105).** "Who promoted this Task Model to
operational, when, and on what evidence" is one query against `auditLog`
rows produced by `saveDB`'s diff. User/auth events already hop stacks
(`recordAuditEvent` → JSON). If D109 moves Task Model writes to Mongo and
leaves `applySaveAudits` on the JSON file, the viewer will not see the
promotion. The choke point must travel with the write: same request, same
store, still not imported by routes.

**ADR 0005.** Hosting stays single-host compose. This ADR fills the open
line "whether JSON store survives outside the test harness" (threat model
§6 / D95 leftover): **not as a production store.** JSON survives as a
harness until D109, optionally as a test double after.

---

## Consequences

- W22 DR and D108 time a **Mongo** restore, while D107 still backs up the
  live JSON file until D109 empties that role.
- Compose `ECD_DB_FILE=/data/db.json` stays required until cutover — do not
  remove it in a "cleanup" PR or Play/audit go silent.
- Readers that already use the wrong stack (dashboard, tenancy inspector,
  migration 002) stay wrong until D109; this ADR names them so they are
  migrated, not treated as source of truth.
- CLAUDE.md's "dbAdapter is the only thing that talks to storage" becomes
  true only after D109. Until then the map in this file wins.

## Exit check (D106)

| Requirement | Met? |
|---|---|
| Written ADR: verified dual-stack map with file evidence | **Yes** — map above |
| Production vs local/dev target named, with discarded hunches | **Yes** — Mongo production; JSON harness |
| "Decision executed" defined without implementing it | **Yes** — five bullets in §3 |
| Retirement sequence for D107–D109; never-compress units named | **Yes** |
| Non-goals: no cutover / backup / load-test code | **Yes** — this file only |
| W21 one-query gate + ADR 0006 called out for the later cutover | **Yes** |
