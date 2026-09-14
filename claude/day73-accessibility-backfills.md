# D73 — Accessibility backfills (defect-driven)

**Exit check:** Each backfill traces to a numbered audit finding; no
backfill lands that the audit did not require.

**Status: DONE** for the six required findings named on the D55 calendar
event. This is **not** a new WCAG 2.2 AA pass of all nine surfaces.

## Premise on contact

D73 assumed D55 produced a numbered required-backfill list in
`claude/day56-accessibility-audit.md`. That file was **never committed**.
Git's `claude/day55-w11-accessibility-audit-not-run.md` still says the
audit was not run. The calendar D55 event is marked ✅ with F-A1–F-A6.

Rewrite: recover those six required findings from the calendar text,
**re-verify each against source at `c2f387b`**, then backfill only those
that were still present. Do not invent axe scores. Do not restyle for
consistency.

Surfaces: SessionPlayer (via shared `Modal`), Q-matrix grid, shared /
Task Model / Item wizard chrome, Evidence Model selection cards,
Combobox, Item Wizard Step 1 selects.

## Findings still present (source-verified)

| Id | Defect | Still true | Backfill |
|---|---|---|---|
| F-A1 | Confirm/discard overlays have no dialog semantics, focus trap, or Escape | `Modal.jsx` was a plain `div`; wizard copies duplicated it | Shared `Modal` now wraps Radix `Dialog`. Wizard discard + Item lifecycle confirm use it. SessionPlayer Finish already used `Modal`. |
| F-A2 | Pending step labels `text-slate-400` fail 1.4.3 | Shared + Task Model sidebars | Pending labels/circles/footers `text-slate-600`. |
| F-A3 | `ModelSelectionCard` is a click-only `div` | Yes | Native `button` with `aria-pressed`. |
| F-A4 | Unlabeled controls | Combobox search input; Item Wizard Task Model / Observation `<select>`s had a visual label without `htmlFor` | `aria-label` on CommandInput; `htmlFor`/`id` on those two selects. Other Item Wizard `<select>`s left recorded, not bulk-labeled. |
| F-A5 | Unfocusable overflow regions | Shared/Task/Item sidebar `overflow-y-auto`; Q-matrix `overflow-x-auto` | `tabIndex={0}` + `aria-label`. |
| F-A6 | Q-matrix checkbox below 24×24 (2.5.8) | Native checkbox, no size class | `h-6 w-6 min-h-6 min-w-6`. |

Q-matrix **grid pattern** (roles, headers, roving tabindex) was already
sound (D51). No extra grid work.

## What was not done

- Automated Storybook addon-a11y / live axe on all nine surfaces.
- Keyboard-only completion of every item interaction type in SessionPlayer
  (calendar priority; no numbered D55 finding named a specific interaction
  widget).
- Remaining Item Wizard `<select>`s without `htmlFor`.
- `TaskModelList`'s private overlay (it already refuses `ui/Modal`).

## Session-close verification (2026-09-14 IST)

- Product commit: `ff71b21`. Working tree clean; `master` tracks `main/master`.
- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **1382
  passed / 6 skipped** (93 files). Product-commit run 59.01s; close re-run
  **53.85s**. Same count. Recorded as-run.
- `npm run build` — Vite 7.3.6. Product-commit **17.08s**; close re-run
  **12.97s**. Chunk `index-B3fI_ElH.js` 2,274.94 kB — D74.
- Exit check: each landed change maps to F-A1–F-A6. Not a nine-surface
  axe/keyboard/SR pass. Keyboard-only completion of every item interaction
  was calendar priority text, not a numbered required finding.

## Next

Calendar **D74** — split the >500 kB bundle. **D75** is W15 close
(never-compress behavioural sign-off); do not start it on a thin budget.
