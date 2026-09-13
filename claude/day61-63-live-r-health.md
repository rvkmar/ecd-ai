# D61–D63 close — live `/health` on the published R image

**Status: D61 live exit check DONE. D62/D63 remain DONE in tests; live enqueue → process → ingest was not walked.**

Do not confuse with `claude/day61-staff-session-operate-and-assignment.md` (a D50 leftover). Product code for D61–D63 shipped earlier (`fc0da07` / #17; image path `1b56720` / #18). This close records what the live stack actually does.

## Exit checks this session

| Day | Exit check | This session |
|---|---|---|
| D61 | Container answers `/health` with exact package versions | **Executed live.** `GET http://127.0.0.1:4000/health` → HTTP 200. Body: `status: healthy`, R `4.6.1`, packages `mirt 1.47`, `GDINA 2.9.12`, `TAM 4.3.25`, `difR 6.1.0`, `plumber 1.3.3`, `jsonlite 2.0.0`. Node boot log: `R backend http://r-backend:4000 /health -> 200`. |
| D62 | Job survives restart; failed job inspectable; no session path touches R | Tests already met (`recoverRunningJobs`, boundary guard). **Live** restart + inspect of a failed job **not** run. |
| D63 | Contract test both sides; non-converged fixture refused | Tests already met. **Live** ingest of a real R response **not** run (no admin token; `/admin/calibration` is D65). |

## Verification

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1287 passed / 80 files**, 74.83s.
- `npm run build` — Vite 7.3.6, **built in 25.00s**. Chunk warning still present (`index-ByZFq6le.js` 2,254 kB / gzip 629 kB) — D74.
- `git status` — clean. `master` matches `main/master` at `edea9f5`.
- `GET /api/health` on nginx `:6060` is 404 (there is no such route). Node↔R health is the compose boot probe, not a public nginx path.

Browser (`http://localhost:6060/admin`):

- Unauthenticated `/admin` **redirects to `/login`**. Sign-in form renders (username, password, role, Sign In).
- `POST /api/users/login` with the old `hashUsers.js` password for `admin1` returns **401**. That is by design: `initMongo.js` seeds random (or `SEED_*`) passwords on first boot and **skips** existing users, so a later compose up does not reprint credentials. The live dashboard was not reached. Do not treat `admin123` as the deployed password.

## What landed before this close

- Compose default: `image: rvkmar/r-backend:latest` + bind-mount `./r-backend/app:/home/app`. Local override publishes `4000:4000` and uses `dev-start.sh` (reload). Main compose uses `expose`, not host ports.
- `r-backend/Dockerfile` is a thin overlay on that image; do not `docker compose build r-backend` as the default path.
- `edea9f5` gitignores extra walk scripts (`scripts-cal-walk.cjs` among them).

Where the plan was wrong: D61's calendar text still says "Dockerfile with a pinned R version from a dated Posit snapshot" and "committed renv.lock". The live path is the published psychometric image; **`renv.lock` is still absent**; `/health` on that image is the version record.

## What remains

- **D64** — LSAT7 through the full pipeline in CI.
- **D65** — `/admin/calibration` console (W13 gate). Hooks exist; no screen. This close could not start/watch/ingest a job from the UI.
- Live D62 restart recovery and D63 ingest against real R — still a gap until D65 or a scripted admin token.
- Seed-account recovery: operator must have captured first-boot passwords or set `SEED_*` before first init.

## Next

Calendar **D64** (LSAT7), then **D65** (calibration console). Do not start D64 on a thin budget — it is the never-compress psychometric acceptance test.
