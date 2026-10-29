# Off-calendar: admin-only /api/metrics

**Not D146.** Not a calendar unit. Does not start D154.

Handoff id: day146l.

## Premise

On the Docker deployment, nginx publishes port 6060 and proxies `/api` to the node server. `GET /api/metrics` answered with no token. The body includes process, database, R URL, queue depth, migration ids, and backup age. Other `/api` routes require a logged-in user. `/api/ops/health-summary` is already admin-only.

## Choice

`GET /api/metrics` uses the same gate as `/api/ops`: `authenticateToken`, then `authorizeRole(["admin"])`.

- No `Authorization` header: 401.
- A token that is not an admin access token (teacher, district, student, or garbage): 403.
- An admin access token: 200, same JSON as before.

`GET /api/health` and `GET /api/ready` stay public. `POST /api/client-errors` stays public and rate-limited.

Checked for a caller that scrapes metrics without a user session:

- `docker-compose.yml` and `docker-compose.override.yml`: no scrape. The R healthcheck hits the R container's own `/health`.
- `nginx.conf`: proxies `/api`. No metrics bypass.
- Scripts and the load rehearsal: no HTTP call to `/api/metrics`.
- Frontend: System Health (`Settings` → System → Health, admin shell) reads `/api/ops/health-summary` through `apiFetch`, which sends the logged-in user's token. Nothing in `src/` calls `/api/metrics`.

No scrape token was added. There is no consumer to keep alive. Operator docs now say metrics needs an admin access token.

No migration. No new environment variable.

## Rollback

Revert this change. Health and ready were not retargeted.

## Verification

```
npx vitest run server/routes/__tests__/d104HealthReadiness.test.js
  7 passed

NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2757 passed | 13 skipped (2770)

npm run build
  green (1.40s). Largest JS chunk EvidenceModelBuilder 374.61 kB (gzip 83.05 kB).

npm audit --audit-level=high
  exit 0. One pre-existing moderate (seroval), not introduced here.
```

There is no lint script and no ESLint config. CI does not run one.

The System Health screen was not changed. It still loads `/api/ops/health-summary` for an admin session.

## Calendar

D146 was not marked. D154 stays next.
