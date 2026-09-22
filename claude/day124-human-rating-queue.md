# D124 — Human-rating queue and adjudication (W25 G11)

**Status: DONE.** Calendar unit **D124**, alone (Tier 2). Started from
`70697ba` (W25 calibration). Did not start D125 or W26.

## Exit check

> A rater completes a queued rating without seeing the automated result or
> the examinee's identity; disagreement triggers the declared adjudication
> rule; every rating is in the audit log.

| Claim | Executed? |
|---|---|
| Blinded `GET /api/sessions/rating-queue` (no provisional / no student id) | **Yes** |
| Blinded `GET /:id/rating/:responseIndex` + rubric exemplars | **Yes** |
| `POST /human-rating` completes; `require_agreement` → adjudication | **Yes** |
| `human_rating.complete` via saveDB audit chokepoint (ids only) | **Yes** |
| HumanRatingQueue + AdjudicationPanel on Admin/District/Teacher Delivery | **Yes** |
| Live `:6060` | **Partial** — rebuilt `node`+`nginx`; `rating-queue` 200 for `admin1`; admin chrome blanked after login (shell); exit behaviour covered by suite |

## Premise on contact

D123 already shipped human-rating + adjudication. Unit was blinding,
audit, tenancy (loadDB scope), and rater UI — not a second phase runner.

## Design

| Piece | Where |
|---|---|
| Blinded projections | `server/delivery/raterQueue.js` |
| Audit on save | `auditLog.collectSaveAudits` → `human_rating.complete` |
| Queue / card / rate routes | `sessionRoutes.js` |
| UI | `HumanRatingQueue.jsx`, `AdjudicationPanel.jsx` |
| Pending list honesty | `pendingHumanRatingsFromSession` no longer leaks provisional |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2043 passed | 9 skipped (2052) — 190 files

npm run build
  green (~19s)

Live :6060
  docker compose build/up node+nginx
  admin1 / WalkPass!2026 → GET /api/sessions/rating-queue → { items: [] }
```

D123 close: **2039 passed / 9 skipped**. Delta: **+4 tests**.

## Next

**D125** alone — performance WP dispositions + W25 handoff.
Do not start W26 casually.
