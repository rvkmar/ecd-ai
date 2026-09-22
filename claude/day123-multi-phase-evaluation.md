# D123 — Multi-phase evaluation procedures (W25 G11)

**Status: DONE.** Calendar unit **D123**, alone (Tier 3, never-compress).
Started from `919bbce` (post-D122). Did not start D124 (HumanRatingQueue UI).

## Exit check

> A two-phase procedure runs its automated phase, holds, and completes on
> human input; a session with a pending human phase reports its state
> honestly rather than showing a provisional score as final.

| Claim | Executed? |
|---|---|
| `phases` on existing `evaluationProcedures[]` (not a new collection) | **Yes** |
| Builder bakes `phases` into composite library | **Yes** |
| Identification applies phase gate → `pending_human`, `activated: null` | **Yes** |
| Provisional never masquerades as final OV / Accumulation skips it | **Yes** |
| Staff `POST /:id/human-rating` completes + adjudicates | **Yes** |
| GET/submit surfaces `pendingHumanRatings` with `activated: null` | **Yes** |
| HumanRatingQueue UI | **No** — D124 owns it |

## Premise on contact

Calendar rewrite held: procedures already exist; missing was phases + async
pause. Unit added the gate onto Identification/submit, not a parallel
evaluationProcedures invent.

## Design

| Piece | Where |
|---|---|
| Phase runner + adjudication | `server/delivery/evaluationPhases.js` |
| Gate on Identification | `applyPhaseGate` in `evidenceIdentification.js` |
| Bake | `builder.js` → `evaluationProcedure.phases` |
| Schema shape check | `schema.js` phases kind / adjudicationRule |
| Complete rating | `POST /api/sessions/:id/human-rating` (admin/district/teacher) |
| Honest report | `pendingHumanRatings` on GET/submit |

Adjudication rules: `human_wins` (default) | `automated_wins` | `require_agreement`.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2039 passed | 9 skipped (2048) — 189 files

npm run build
  green (~1m 40s)
```

D122 close: **2030 passed / 9 skipped**. Delta: **+9 tests**.

Product tip: **`687c382`**. Session close tip ≡ `main/master`
(re-verified 2026-09-22: **2039 passed / 9 skipped**; build green).
Session close: `claude/day123-w25-session-close.md`.

## Next

**D124** — Human-rating queue and adjudication UI (blinding: no automated
result / examinee identity before rating). Do not start W26 casually.
