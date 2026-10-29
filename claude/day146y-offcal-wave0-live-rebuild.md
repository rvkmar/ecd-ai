# Off-calendar: Wave 0 live image rebuild

**Not D146.** Not a calendar unit. Rebuilds live `ecd-node` and `ecd-nginx` from current master so `:6060` matches git. Does not start D155. Does not start Wave 1 walks. D129 was not reopened. W29 stays open.

Handoff id: day146y.

**Status: DONE.** Exit check: `admin1` can sign in on `http://localhost:6060`, and Domain Analysis, Design Pattern, and Student Model match git at `79ea093`.

## Premise

HEAD was D154 close `79ea093` (`itemMappings` derived; Step 6 a readout). Live containers had been recreated about eight minutes earlier from the same context. The hypothesis was that `:6060` already served that build; Wave 0 still rebuilds and recreates so the next walks are not on a stale image.

`r-backend` stays the pulled `rvkmar/r-backend:latest`. Do not `docker compose build r-backend`.

## Choice

```
docker compose build node nginx
docker compose up -d --force-recreate node nginx
```

Mongo and R were left running. The build was fully CACHED, including `COPY . .` and `npm run build`, because the image already matched the current context. Force-recreate still ran: `ecd-node` and `ecd-nginx` Recreated / Started at 2026-10-29T09:27Z.

No product code. No suite re-run: the D154 close already recorded **2862 passed / 3 skipped**.

## Live match against git

| Surface | Live on `:6060` | Git |
|---|---|---|
| Login | `admin1` as Admin reaches Admin Control Center | Walk account |
| Domain Analysis | Confirmed **Fractions** (`damvrvcqgfcc86cc`). Q-matrices tab lists Fraction equivalence Q-matrix and **Author a Q-matrix for this analysis**. No “Author a Student Model” / “Author a Design Pattern”. | `DomainAnalysisEditor.jsx` — Q-matrix handoff only. W29 still open. |
| Design Pattern | Identity step has a Domain Analysis select (Fractions, Plant structure, …). Copy: the psychological perspective is read from the Domain Analysis; the pattern does not store one. | `DesignPatternBuilder.jsx` `form.domainAnalysisId` |
| Student Model | Step 1 — Model Identity has Domain Analysis. Copy: perspective is declared on the Domain Analysis and inherited here. Options include Fractions — Trait. | `Step1ModelIdentity.jsx` `domainAnalysisId` |
| D154 | Not walked on Task Model Step 6 this wave. Source still says readout. | `Step6ItemMapping.jsx` |

Health after recreate:

```
{"status":"ok",...,"database":{"ok":true,"mode":"ecd-json","sessionsBackend":"mongo","auditLogBackend":"mongo","calibrationJobsBackend":"mongo","analysisArtefactsBackend":"mongo","studentModelRecordsBackend":"mongo"},"r":{"reachable":true,"url":"http://r-backend:4000"},"servingSessions":true}
```

HTML: nginx 1.31.6, `Last-Modified: Thu, 29 Oct 2026 09:17:32 GMT`, index `/assets/index-BdsKVPkN.js`. Same asset as the pre-Wave-0 image, which is what a fully cached rebuild predicts.

## What was not done

Wave 1 seven live walks. D65 parameter-set diff UI. D60 P1-4 dual-attribute selection. W29 forward controls from a confirmed Domain Analysis. D155. Reopening D129. `docker compose build r-backend`.

## Rollback

`docker compose up -d --force-recreate node nginx` from an older commit. No application files changed.

## Verification

```
docker compose build node nginx
  CACHED through COPY / npm run build

docker compose up -d --force-recreate node nginx
  ecd-node Recreated / Started
  ecd-nginx Recreated / Started
  ecd-mongo and r-backend left Up

curl.exe http://localhost:6060/api/health
  status ok, R reachable, servingSessions true

curl.exe http://localhost:6060/
  /assets/index-BdsKVPkN.js
```

Browser: sign-in as `admin1` / Admin on `:6060` → Models → Domain Analysis (Fractions Q-matrices) → Design Patterns (Identity Domain Analysis select) → Student Model (Step 1 Domain Analysis). No draft was saved.

Git: tree clean at start on `79ea093` ≡ `main/master`. This handoff and the ledger row are uncommitted at close. Calendar D155 was not marked.

## Calendar

Not a calendar unit. D154 stays the last completed unit. Next remains D155, never-compress, not started. W29 stays open.

## Next

Wave 1 of the through-D153 plan: seven live walks on this image. Do not start D155 from this close.
