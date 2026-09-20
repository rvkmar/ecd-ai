# Git-history secret audit (D94)

**Date:** 2026-09-18  
**Scope:** Full git history of this repository (not HEAD-only).  
**Tools:** `git log` / `git grep` across revisions; Gitleaks v8.24.3 (`detect` over 211 commits).

## Questions answered

1. Was a real `.env` (or other secret file) ever committed?
2. Do any commits embed literal `JWT_SECRET` / `MONGO_ROOT_PASSWORD` / `R_SERVICE_TOKEN` values?
3. Do private-key or cloud-credential markers appear in history?
4. Does Gitleaks report leaks that would fail CI?

## Findings

| Probe | Result |
|---|---|
| Commits touching `.env` (excluding templates) | **None** |
| Files named `.env` ever added | **None** — only `.env.example` was added |
| `JWT_SECRET=` / `MONGO_ROOT_PASSWORD=` / `R_SERVICE_TOKEN=` across blobs | Only **env interpolations** (`${JWT_SECRET}`, `process.env.JWT_SECRET`, empty template lines in `.env.example`) — no literal secret values |
| Private key / `AKIA…` markers (sampled recent history) | **None** |
| Gitleaks full-history scan | **no leaks found** (211 commits, ~8.9 MB) |

`.env` and `.env.*` remain gitignored at HEAD; `.env.example` is the committed template with empty secret fields.

Known **non-secret** fixtures that appear in docs/tests (walk account password shapes, local seed helpers under `server/utils/hashUsers.js`) are intentional development aids, not production credentials, and did not trip Gitleaks.

## Rotations

**None required.** No production credential was found committed in history.

If a future Gitleaks finding names a live secret: rotate that credential immediately; rewriting history alone does not un-leak it. Record the rotation here.

## Ongoing control

- CI job `security-scanners` runs `npm audit --audit-level=high` and `gitleaks/gitleaks-action` with `fetch-depth: 0` — both fail the build on findings.
- Dependabot (`.github/dependabot.yml`) opens weekly npm and monthly Actions PRs.
