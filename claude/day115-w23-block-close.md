# W23 session close — D114–D115 (block closed)

**Closed 2026-09-21.** W23 (D111–D115) is **closed**. Gate met at D115.
An earlier same-day close covered D111–D113 only (`claude/day113-w23-session-close.md`);
this close records D114–D115 and the block gate.

## Exit checks

| Unit | Exit check | Executed? |
|---|---|---|
| D114 | Delivery resolves Presentation Model without baking overlay into items; Storybook both themes; a11y still authored | **Yes** — premise rewritten (wizard was already D113); pointer + live resolve + Storybook. Handoff: `claude/day114-presentation-pointer-storybook.md` |
| D115 | Changing a PM changes what an examinee sees without touching item content (two PMs / one item); W23 gate | **Yes (tests)** — `presentationObedience` + `presentationLiveSelect`. **Partial (live `:6060` dual-PM browser walk)** — stack reachable; seeded end-to-end walk not completed. Gate still recorded as met on the demonstrated behavioural tests. Handoff: `claude/day115-sessionplayer-presentation-w23.md` |

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1909 passed | 9 skipped (1918) — 168 files

npm run build
  green (13.52s); SessionPlayer chunk 44.44 kB
```

- `git status` — clean at product **`6ef8dab`** before this close; tip **`18232bd`** ≡ `main/master`.
- No half-applied work.
- Compression debt: D115 live dual-PM `:6060` walk open (discharge on next live admin/student walk).

## What landed this session (D114–D115)

| Unit | Commit | Became (vs plan) |
|---|---|---|
| D114 | `0e02795` | Calendar said “build authoring wizard” — already D113. Became ADR 0008 pointer bake + Storybook residual. |
| D115 | `6ef8dab` | SessionPlayer/ItemPresenter obey overlay; live-select operational PM; W23 gate. |

Earlier same day (prior close): D111–D113 at `daac216` / `f44f222` / `416d99d` (+ boot `3010a09`).

## What remains

- **D115 residual:** live `:6060` two-PM / one-item browser walk (screen recording if needed)
- **D116** — W24 begins: `taskModelVariables` schema (G13); vocabulary stays single source of truth
- Off-cal: Newtonian live promote / console walks still open
- Do not start W25 from this close

## Next

Calendar **D116** (W24 TMVs). Re-calibrate before starting — do not fork `ecdVocabulary.js`.
