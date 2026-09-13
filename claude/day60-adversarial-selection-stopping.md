# Day 60 — Adversarial review of selection and stopping

**Exit check (never-compress list):** Written findings ranked by severity; every P0 fixed the same day with a regression test. This is the real D60. Do not confuse with `claude/day60-staff-play-and-student-discovery.md` (a D50 leftover, misnamed).

**Status: DONE** in tests. No live-browser walk this unit (D56 adaptive walk remains D71).

Pattern: Day 39 (`claude/day39-adversarial-review-accumulation-math.md`) — a fresh review that tries to **REFUTE** the work by running code, not by trusting comments.

## Scope

What item comes next, when a session stops, and how that decision is persisted:

- `server/delivery/activitySelection.js` (fixed / IRT / BayesianNetwork, stopping)
- `server/delivery/assemblyProgress.js` (`resolveAssemblyProgress`, `evaluateDeclaredTargets`)
- `server/delivery/attributeClassification.js` (D57 decision rule, used by the above)
- `server/routes/sessionRoutes.js` — `/next-task` persist of `session.stopped`, `/submit` after stop, play/pause only as they affect stop authority
- Tests under `server/delivery/**` and the D58/D60 session-stop route tests

Out of scope: a11y (D73), calibration authoring (D61–D63), UI chrome, staff Play/Operate UX, `apiFetch`.

## Process

Started from current `main` (`896b3a5`). Inventory by reading the modules and the D56–D58 handoffs, then running the existing vitest files, then writing an adversarial file (`d60AdversarialSelectionStopping.test.js`) that tries to produce a wrong stop, an early stop, a never-stop, a silent fallback dressed as smart selection, or a re-opened stop.

Existing focused suite before the new file: `activitySelection`, `assemblyProgress`, `attributeClassification`, D58 persist tests — all green. The P0 below was **not** covered; the first new test failed on current `main` until the fix landed.

## Findings (ranked)

**P0 — a stop a user would trust, silently disabled:**

1. **A draft or archived sibling Assembly Model made `targetsMet` inert.** `resolveAssemblyModelForSession` correctly picks the unique confirmed/operational AM. `evaluateStoppingRules` then called `resolveAssemblyProgress`, which still treated *any* second AM for the same Competency Model as ambiguous (`candidates.length !== 1` → omit every SMV). Progress came back empty, `evaluateDeclaredTargets.allScoredAndMet` stayed false, and the session never stopped on measurement.

   This is the normal revision case: an operational AM in production plus a draft replacement, or an archived predecessor plus a confirmed replacement. Opening a revision, or archiving the old model, would quietly turn every live session on that competency model into a length-only (or never-stop) form. Confirmed by constructing that db and running `selectNextActivity` — targets that are trivially met did not fire.

**P1 — edge-case wrong or silent, fixed where cheap:**

2. **Assembly-model resolution reasons were computed and then dropped.** `resolveAssemblyModelForSession` writes a reason for draft-only and for two governing models. `selectNextActivity` never put that string on `warnings`. A session with two confirmed AMs, or only a draft, looked like a governed adaptive session and applied no stopping rule. F24-shaped. (A session with *no* AM at all stays silent — that is the D56 fixed-path byte-identical contract.)

3. **`POST /:id/submit` accepted responses after `session.stopped` was persisted.** `/next-task` correctly returns the frozen stop and will not hand out another task. An API client (or a stale tab) could still submit a remaining `taskId`. Accumulation would rewrite `smvPosteriors` and the report classification while the stop record stayed frozen — two sources of truth. Play/pause do **not** clear `stopped`; that half was already correct.

**P1 — deferred (not cheap, or a deliberate D56/D57 hold):**

4. **Dual-attribute *selection* hole remains.** The D56/D58 walk finding ("AM targeted attrA and attrB, stopped as 1 of 1") is **closed on the stopping side**: `evaluateDeclaredTargets` requires every declared `targetsBySMV` row to be scored and `stoppingCriterionMet === true`. Confirmed end-to-end through `selectNextActivity` (existing D57 tests + this unit).

   The *selection* side is not closed. BayesianNetwork ranks `session.studentModel.smvPosteriors` and skips any attribute with no finite estimate rather than using the SMV's declared prior (`masteryPrior`, default 0.5). An item that only measures an unmeasured attribute is unrankable. While any already-measured-attribute item remains, that item wins. Combined with a tight `maxItems`, the form can end on length without ever presenting an attrB item. Once only the unmeasured-attribute item is left, the documented first-unanswered fallback *does* present it.

   D56 refused to invent a 0.5 prior on purpose (F24). Closing this means ranking unmeasured attributes at the same prior accumulation already uses — a psychometric change, not a one-line bugfix.

5. **G-DINA BayesianNetwork is sequential.** `selectBayesianNetwork` accepts `family === "gdina"`, then `resolveDinaParameters` requires `family === "dina"` and slip/guess. A calibrated G-DINA probability table never ranks. Fallback is first-unanswered **with a warning**. Same costume as F24, now honest. Real G-DINA expected information gain is its own unit (`gdina` still has no pilot path either).

6. **Session is still not bound to an `assemblyModelId`.** Two confirmed/operational AMs for the session's competency model(s) → none applied. Now warned (P1-2). Schema/UI work; cadence hold.

7. **Mastery cut fixed at 0.5.** ADR 0004 decision 5. Authorable threshold is its own unit.

8. **IRT still ranks nearest difficulty, not maximum Fisher information.** Documented D56 hold for the benchmark unit (D64–D70). A characterisation test pins today's criterion so a quiet swap cannot land inside a cleanup.

**P2 — deferred:**

9. BayesianNetwork ranks **persisted** `smvPosteriors`; stopping **re-runs** `accumulateEvidence`. After a normal `/submit` they agree. A hand-edited response list that never went through `applyPosteriorsToSession` would rank stale (or fall back) while stopping uses live evidence.
10. `maxItems` is checked before `targetsMet`. When both fire on the same response count, the persisted rule is `maxItems` and the student sees a length cap, not the measurement target that was also met.
11. An unknown `selectionStrategy` still returns `{}` with no warning (pre-D56 fallthrough, pinned).
12. Multi-attribute DINA information gain **sums** independent single-attribute gains. It is not the conjunctive DINA likelihood (other required attributes held at current beliefs). Fine for single-attribute items; misprices conjunctive ones.
13. BayesianNetwork does not gate `posterior.method`. A non-mastery estimate keyed by an attribute id would be treated as P(mastery). Production DINA writes `attribute-mastery-posterior`; the collision is the same class as D39 P1-6 but needs a mixed/hand-edited session to reach.
14. `GET /next-task` on a session with `isCompleted: true` returns `{}` rather than the persisted stop (lookup filters completed out). After `/finish` the player is not on that route.

**Checked and found solid:**

- Dual-attribute **targetsMet** (declared vs reported) — closed; will not stop on "1 of 1" when two attributes were declared.
- Classification-accuracy vs CTT/sum/threshold weighted proportion — gated on `method === "attribute-mastery-posterior"`; a binary SMV with a CTT model does not stop on `requiredClassificationAccuracy`.
- DINA BayesianNetwork no longer silently sequential when live posteriors exist (F24). Expected information gain is still outcome-probability-weighted, not 0.5/0.5.
- Stop persistence: later `/next-task` returns the frozen record even if the AM is gone; play/pause do not clear it.
- Pilot vs calibrated parameter **source order** on the item path (calibrated wins; missing observable in an active set is refused, not piloted).
- `minItems` gates `targetsMet`; empty `targetsBySMV` is not vacuously met; accumulation throw → do not stop.
- `fixed` remains index-driven and byte-identical when no AM governs.

## Fixes applied

P0-1, P1-2, P1-3, each with a regression test:

- `assemblyProgress.js`: `GOVERNING_ASSEMBLY_MODEL_STATUSES` is the shared list. `resolveAssemblyProgress` now (a) accepts `options.assemblyModel` from Activity Selection so the already-resolved governing model cannot be vetoed, and (b) when looking up on its own, collapses several matches to the unique confirmed/operational AM instead of omitting everything. Two governing models still omit.
- `activitySelection.js`: `evaluateStoppingRules` passes the governing AM into `resolveAssemblyProgress`. `NONE_GOVERNING` and `AMBIGUOUS` resolution codes become `warnings`.
- `sessionRoutes.js`: `/submit` returns 409 when `session.stopped` is already a record; no further response is stored.

New/updated tests:

- `server/delivery/__tests__/d60AdversarialSelectionStopping.test.js` — P0 sibling-AM never-stop, P1 warning surface, CTT classification guard through `selectNextActivity`, dual-attribute stopping-closed + selection-hole characterisation, G-DINA sequential characterisation, nearest-difficulty characterisation.
- `assemblyProgress.test.js` — draft sibling, archived predecessor, two confirmed, caller-supplied AM.
- `sessionRoutes.test.js` — submit-after-stop 409; play does not clear stop.

Focused run after the fixes: **369/369** across `server/delivery` + session route/walkthrough files.

## Explicit answer: do D56 dual-attribute / selection fallthrough issues remain?

| Issue | Status |
|---|---|
| Dual-attribute AM stops after only attrA is reported ("1 of 1") | **Closed** (evaluateDeclaredTargets + this unit's re-run) |
| Dual-attribute *selection*: attrB items unrankable while attrA items remain | **Remains (P1-4)** |
| BayesianNetwork silent sequential for DINA (F24) | **Closed** — ranks when posteriors exist; fallback is named |
| BayesianNetwork sequential for G-DINA | **Remains (P1-5)** — warned, not silent |
| Unknown strategy dressed as sequential | **Closed** — still `{}`, no fake strategy name |
| AM resolution reason dropped (draft-only / two governing) | **Closed this unit (P1-2)** |
| Draft/archived sibling disables targetsMet | **Closed this unit (P0-1)** |

## Next

Calendar D61–D63: calibration authoring. Do not confuse with `claude/day61-staff-session-operate-and-assignment.md` (D50 leftover). D56 adaptive live-browser walk remains D71.
