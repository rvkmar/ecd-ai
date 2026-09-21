# W23 session close — D111–D113 (not full block close)

**Closed 2026-09-21.** W23 (D111–D115) is **in progress**, not closed.
D111–D113 are DONE; D114–D115 remain. Block gate (changing a Presentation
Model changes what an examinee sees without touching item content) is **not**
met — SessionPlayer obedience is still later W23.

This close records work that landed on tip before this session-close ran.
Product commits were authored in a prior working pass the same calendar day;
this session verified them and wrote the recording half of the cadence.

## Exit checks (executed)

| Unit | Exit check | Executed? |
|---|---|---|
| D111 | Task Model authoring behaves identically — gating, readiness, routing — proven by behavioural tests for the gating rule the shell did not previously carry | **Yes** — convention B on shared shell; see `claude/day111-taskwizard-shared-shell.md` |
| D112 | All four wizards share one shell; Item authoring identical (single promotion path + Step 7 pilot/calibrated intact), proven by test | **Yes** — convention C; see `claude/day112-itemwizard-shared-shell.md` |
| D113 | Presentation Model authored, validated, promoted; D48 guard; library-compilation decision in ADR | **Yes** — stub gone; ADR 0008 pointer-bake; SessionPlayer obedience out of scope; see `claude/day113-presentation-model-authoring.md` |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1894 passed | 9 skipped (1903)
  Test Files  165 passed (165)
  Duration  67.19s

npm run build
  green (21.21s); PresentationModelBuilder 18.21 kB (peer of Assembly 18.40 kB)
```

- `git status` — clean at product **`3010a09`** before this close commit; close tip **`5d747ac`** ≡ `main/master`.
- No half-applied work. No new compression debt.

## What landed (commits already on tip)

| Unit | Commit | Became (vs plan) |
|---|---|---|
| D111 | `daac216` | Not a props-only drop-in of convention A. Shared shell grew **convention B** (gated rail, amber-dots, named blocking toasts). CM/EM stay A. |
| D112 | `f44f222` | Not reuse of B. Shared shell grew **convention C** (real completion ticks, named Next-blocker banner, Step-8 confirm + extra lifecycle toolbar). |
| D113 | `416d99d` | Real G8 authoring start (calendar), not the day81 inventory that once labeled W23 = Presentation alone. Overlay fields + ADR 0008 (pointer, not bake). SessionPlayer still ignores the model. |
| boot fix | `3010a09` | Duplicate `isInstantiableTaskModel` import crash on Node boot (#39). |

## What remains

- **D114** — next queued (calendar; not started)
- Remaining W23: composite-library pointer bake (if that is the calendar unit) + **SessionPlayer obedience** (block gate)
- Do not start W25 / W27 from this close
- Newtonian live promote / console walks — still open (off-cal EM residual)

## Next

Calendar **D114**. Re-calibrate before starting — do not assume D114’s premise from the day81 file list alone.
