# D115 — SessionPlayer obeys Presentation Model + W23 close

**Status: DONE.** Calendar unit **D115** complete 2026-09-21. **W23 gate met.**

## Exit check (W23 deliverable)

> Changing a Presentation Model changes what an examinee sees, WITHOUT
> touching item content — demonstrated with two presentation models over
> one item.

| Claim | Executed? |
|---|---|
| Two PMs → different examinee surface; same item stimulus | **Yes** — `presentationObedience.test.jsx` (ItemPresenter profile/chrome flip; stimulus text unchanged) + `presentationLiveSelect.test.js` (operational flip changes resolved overlay) |
| SessionPlayer applies overlay (progress / skip / a11y classes) | **Yes** — `presentation` from `/next-task`; `presentationChrome`; ItemPresenter `data-presentation-profile` |
| No overlay bake into items / compositeLibrary | **Yes** — ADR 0008 unchanged boundary |
| Live browser two-PM walk on `:6060` | **Yes** — 2026-09-21 on `s1789988990327` (`tm-d56` / `itemA`). Flipping operational PM (`large_text` ↔ `high_contrast`) changed `data-presentation-profile` / chrome classes without editing the item. Fixed student tenancy gaps that had blocked the walk (presentation attach + task GET). |

## Premise

HEAD after D114. Overlay already attached on `/next-task`. Player ignored it.
D115 wires SessionPlayer + ItemPresenter and prefers live-select of the
operational Presentation Model at delivery.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1909 passed | 9 skipped (1918) — 168 files

npm run build
  green (~17s)
```

## Delivered

| Area | Change |
|---|---|
| `presentationChrome.js` | Pure chrome from overlay |
| `ItemPresenter` | Applies profile / fontScale classes + data attrs |
| `SessionPlayer` | Stores `/next-task` presentation; gates progress + Skip |
| `sessionRoutes` attach | Live-select operational PM first |
| CSS | `.presentation-large-text` / `.presentation-high-contrast` |
| ADR 0008 | Obedience marked done |

## W23 block

| Unit | Outcome |
|---|---|
| D111 | Convention B TaskWizard |
| D112 | Convention C ItemWizard |
| D113 | Presentation Model authoring |
| D114 | Pointer + Storybook (premise rewritten) |
| D115 | Player obedience + **gate met** |

Gate: *Changing a Presentation Model changes what an examinee sees, without touching item content.*

## Next

Calendar **D116** / next block after W23. Do not start W25 from this close.
