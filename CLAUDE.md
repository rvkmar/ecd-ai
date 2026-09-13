# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Evidence-Centered Design (ECD) assessment platform: authors build a governed content chain
(Competency Models → Evidence Models → Task Models → Items), deliver adaptive test Sessions built
from that chain, and calibrate item parameters (IRT / Bayesian networks). React (Vite) frontend,
Express backend, MongoDB (or a flat-file JSON store) for persistence, and an optional R/plumber
service for parallel IRT computation.

## Commands

```bash
npm run dev            # vite (client, :5173) + nodemon on server/ (api, :3000), concurrently
npm run build           # vite build (frontend only)
npm start                # NODE_ENV=production node server/index.js — serves API only, no static files
npm test                 # vitest run (frontend + server tests in one pass)
npm run test:watch       # vitest watch mode
npm run test:coverage    # vitest run --coverage
```

Run a single test file or test name with vitest directly, e.g.:
```bash
npx vitest run server/routes/__tests__/itemLifecycle.test.js
npx vitest run -t "confirms an item"
```

There is no lint script or ESLint config in this repo.

Vite proxies `/api` to `http://localhost:3000` in dev (`vite.config.js`), so the frontend dev
server and the Express server must both be running (`npm run dev` starts both). In production,
nginx serves the built frontend and proxies `/api` to the node container — the Express server
itself does not serve static files (see the comment at the bottom of `server/index.js`).

Local env vars go in `.env` (copy from `.env.example`, gitignored). Notably: `JWT_SECRET` (server
refuses to start without one ≥32 chars — see `server/config/jwt.js`), `DB_MODE` (`json` or
`mongo`), `MONGO_URI`, `VITE_AUTH_URL`.

### Docker

`docker-compose.yml` defines `node` + `mongo` + `nginx` + `r-backend` (mongo not published to the host — add a
port mapping in a local `docker-compose.override.yml` for GUI inspection). `r-backend` pulls
`rvkmar/r-backend:latest` and bind-mounts `./r-backend/app`; do not `docker compose build r-backend`
as the default path (see AIG/R section below).

## Architecture

### The ECD content chain and its lifecycle

Everything authored in this app is one of: `competencyModels`, `evidenceModels`, `taskModels`,
`items` — plus `tasks`/`sessions` for delivery, and `policies`/`curricularPolicies` for
selection/curriculum grounding. Each governed entity moves through the same status machine:

```
draft → reviewed → confirmed → operational ⇄ suspended
                       ↓             ↓            ↓
                    archived     archived     archived
```

This is defined once in `server/utils/lifecycleMatrix.js` (`STATUS`, `TRANSITIONS`,
`canTransition`) and imported by both sides of the app — `src/utils/schema.js` for client-side
wizard validation and `server/utils/lifecycleValidation.js` for server-side write validation.
Don't hardcode status lists or transitions elsewhere; import from here.

Referential integrity across the chain is enforced at write time, not just by convention:
- An Item's `observationId` must be declared in its Task Model's `expectedObservations`.
- A Task Model's `primaryEvidenceModelId` must be one of its `evidenceModelIds`.
- Promoting a Task Model to `operational` additionally requires every bound Evidence Model to
  already be `operational`, and at least one `confirmed` Item instantiating that exact Task Model
  version (see `server/utils/lifecycleValidation.js` and `samples/README.md` for the worked
  example).
- Bulk/staged imports (`Settings > Data > Upload`) are the one exception: they pass
  `allowDraftParents` so an imported record can cite a still-draft parent (nothing is confirmed
  during import), whereas the single-entity wizards always refuse a draft parent.

`src/utils/schema.js` is the single source of truth for entity shape and validation
(`validateEntity(collection, obj, db, options)`) — it's large (~3,600 lines) because it documents
the full ECD field structure per entity inline. Read the relevant section rather than the whole
file. `server/utils/dbAdapter.js` calls `validateEntity` on every `insert`.

Response/observable compatibility (which `interaction.type` values are valid for which
`scoring.method`, etc.) lives in `src/utils/ecdVocabulary.js` and is imported by `schema.js` — it
replaced an earlier direct string-equality check between two incompatible enums, so treat it as
the authority on interaction/scoring compatibility rather than re-deriving it.

### Data layer: dual-mode adapter

`server/utils/dbAdapter.js` is the only thing that talks to storage. It exposes
`list/get/insert/update/remove` (id-keyed) and `updateWhere/removeWhere` (filter-keyed, needed for
records like seed users that have no synthetic `id`), and switches its implementation on
`DB_MODE`:
- `json` — reads/writes a single `./data/db.json` file.
- `mongo` (default) — connects via mongoose; most collections use a generic permissive
  (`strict: false`) schema built on demand (`ensureModel`), except `Question` and `User` which
  have explicit schemas because their fields need real validation/uniqueness.

Collection name → Mongoose model name is singularized by naively stripping a trailing "s"
(`capitalize()` in `dbAdapter.js`) — keep collection names simple plurals for this to work.

### Auth and permissions

JWT-based. `authenticateToken` (verifies bearer token → `req.user`) and `authorizeRole(roles)`
live in `server/utils/authMiddleware.js`. Every route file mounts its own
`router.use(authenticateToken)` plus per-route `authorizeRole([...])` — there is no global
auth gate in `server/index.js`, so a new route file must apply auth itself or it is open to any
caller. Four roles: `admin`, `district`, `teacher`, `student`.

Frontend permission gating is a separate, parallel system: `src/config/rolePermissions.js`
defines `canView/canEdit/canCreate/canDelete/canApprove` per role and the `can(role, action,
entity)` helper; `src/auth/RequirePermission.jsx` and `ProtectedRoute.jsx` consume it. When adding
a new entity type or role capability, update both this file and the corresponding server-side
`authorizeRole([...])` calls — they are not derived from each other and have drifted before (see
inline comments in `rolePermissions.js` about `items` and the `student` role once being entirely
missing).

Route access by top-level path in `src/App.jsx`: `/admin/*`, `/district/*`, `/teacher/*`,
`/student/*`, each wrapped in `<ProtectedRoute expectedRole="...">`.

### Frontend data fetching

`src/api/apiClient.js`'s `apiFetch(url, options, auth)` is the one fetch wrapper — it attaches the
bearer token, handles empty `204` bodies, and attaches the parsed error body to thrown `Error`s as
`.body` for `apiErrorMessage(err, fallback)` to read. `src/api/queries/*.js` are React Query hooks
per entity (`useItems`, `useItem`, mutations, etc.) built on top of `apiFetch` — follow this
pattern (query key helpers + hooks reading `auth` from `useAuth()`) for any new entity's queries
rather than calling `fetch`/`apiFetch` directly from components.

### AIG (Automatic Item Generation) and the R backend

`server/aig/` generates items programmatically from templates (`ITEM_MODEL_REGISTRY` in
`server/aig/index.js`); its routes (`server/routes/aigRoutes.js`) are currently **unmounted** in
`server/index.js` — AIG generation is out of scope for the current pass. The R/plumber IRT service
is a private compose service: `image: rvkmar/r-backend:latest`, `expose: 4000`,
`R_BACKEND_URL=http://r-backend:4000`. AIG remains unmounted; do not assume AIG is live.

### Bulk/staged import

`Settings > Data > Upload` walks competency models → evidence models → task models → items in
dependency order, since cross-file references are real generated ids with no by-name resolution.
See `samples/README.md` for the full mechanics, required placeholders, and a worked end-to-end
example — read it before changing anything under `src/components/*/BulkUpload*` or the bulk
routes.

## Testing

Vitest for both frontend (`jsdom` environment, `src/**/*.test.{js,jsx,ts,tsx}`) and backend
(`server/**/*.test.{js,jsx}`) in one run — configured in `vite.config.js` under `test:` (there is
no separate vitest.config file). React component tests use `@testing-library/react`; server route
tests use `supertest` against the Express app. Setup file: `src/test/setup.js`.
