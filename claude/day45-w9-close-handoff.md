# Day 45 — W9 close, handoff

**Exit check (build reference):** Full suite green; handoff doc written to the project — **W9
deliverables due**.

**Status: DONE.**

## Verification

- `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run` — **852/852 tests passing**, 42 test
  files, no skips.
- `npm run build` — clean production build (the pre-existing >500kB single-chunk warning is
  unrelated to Week 9's work; no new warnings introduced).
- `git fetch origin main` — sandbox is at `18034eb`, byte-identical to `origin/main`. Nothing
  uncommitted, nothing unpushed.

## What Week 9 (Days 41-44) actually delivered

**Day 41 — Design tokens.** An audit (`grep -rhoE 'text-\[[0-9.]+(px|rem)\]'`) found three ad hoc
pixel sizes already reinvented at 90+ call sites; named as `text-2xs`/`text-label`/`text-caption`
in `tailwind.config.js`. Spacing audit found no stray arbitrary values except the wizard sidebar's
width, hardcoded identically in three files — named `wizard-rail`/`wizard-rail-collapsed`, later
consumed by Day 44's extraction. Colour, light/dark, and radius tokens pre-existed and were left
alone. Additive only: CSS byte-identical, 838/838 tests passing before and after.

**Day 42 — Missing shared primitives: Dialog and Combobox.** `npx shadcn add` was blocked by the
sandbox's egress proxy (confirmed via direct `curl`, not assumed); worked around by installing the
underlying `@radix-ui/react-dialog`/`@radix-ui/react-popover`/`cmdk` packages directly and
hand-writing `dialog.tsx`/`popover.tsx`/`command.tsx`/`combobox.tsx` to match the existing shadcn
conventions exactly, so a future `shadcn add` (once network allows it) diffs cleanly against them.
Two jsdom polyfills added to `src/test/setup.js` (`ResizeObserver`, `Element.scrollIntoView`) that
`cmdk` needs.

**Day 43 — Toast accessibility + Storybook.** The D43 calendar event (written Day 41) assumed
`src/components/ui/Toast.jsx` was the app's real, if under-built, toast system. It was dead code —
zero live importers, only a stale commented-out import — while `react-hot-toast`'s globally-mounted
`<Toaster>` was the actual system driving 100+ call sites, defaulting every toast (success or
error) to the same `aria-live="polite"` and a flat 3-second duration. Fixed centrally in `App.jsx`'s
single `toastOptions` — every existing call site inherits the fix with zero per-site changes.
Storybook installed (`@storybook/react-vite` + `addon-a11y`), ten real component stories replacing
the CLI's demo scaffolding, a custom light/dark toolbar toggle exercising the app's actual `.dark`
class rather than a generic Storybook theme addon. Verified via both a static build and a running
dev server whose `/index.json` story index was queried directly.

**Day 44 — The wizard shell.** The single highest-risk item in the block (flagged Day 41 as
"a mistake here breaks authoring for the whole app"). A line-by-line audit found the Day 41
three-way "duplication" assumption was only two-thirds right: Competency's and Evidence's
`WizardSidebar`/`WizardStepContainer` pairs were genuinely near-identical (only an adaptive
Cancel/OK label and the model name in the locked notice actually differed) and merged safely into
`src/components/wizard/`; Task Model's pair turned out to be a materially different,
context-driven architecture (`useTaskModelWizard()`) with its own stricter navigation-gating rule,
an extra per-step readiness indicator, and a step container that doubles as the step router. Its
re-pointing (and Item's — an already-known 4th, differently-structured wizard) was explicitly
deferred rather than forced into the shared shell or silently dropped. 10 new tests target exactly
the behaviors the merge had to preserve.

## The pattern across all four days

Every day this week started from a plan written on Day 41 before the relevant code had been read
closely, and every day's actual work began by checking that plan against the real repository state
before writing anything: Day 41 confirmed the type-scale/spacing audit before naming tokens; Day 42
discovered network access, not `shadcn`'s templates, was the actual obstacle; Day 43 discovered the
component it was sent to fix wasn't the one users ever saw; Day 44 discovered one of its three
"duplicates" wasn't a duplicate at all. In each case the plan was revised and the revision was
documented in the day's own writeup and in `claude/design-tokens.md`, rather than executing the
stale assumption or quietly expanding scope to cover it. Nothing shipped this week was defect-driven
backfill outside that scope, per Part 5.3's "no wholesale migration" rule — existing `text-[11px]`
call sites, the pre-Day-44 wizard files' behavior, and every other untouched surface were
deliberately left as-is.

## Part 5.4 foundation-block scorecard

| Deliverable | Status |
|---|---|
| Design tokens (colour, spacing, type scale, light/dark) | ✅ Day 41 (colour/light-dark/radius pre-existing; type scale + wizard-rail spacing added) |
| Button, Input, Select, Tabs, Table, Badge, Card | ✅ pre-existing, confirmed Day 41 |
| Dialog, Combobox | ✅ Day 42 |
| Toast | ✅ Day 43 (real system fixed; bespoke dead component removed) |
| Storybook / component gallery | ✅ Day 43 |
| Reusable wizard shell | ✅ Day 44 for Competency + Evidence; **Task Model and Item explicitly deferred** (Task Model discharged D111 as convention B; Item remains D112) |

## What remains before the next pass touches these surfaces

Recorded here so a future session starts from an accurate list rather than rediscovering these:

1. **Task Model's and Item's wizards are not on the shared shell.** `taskModels/TaskWizard/` keeps
   its own `WizardSidebar.jsx`/`WizardStepContainer.jsx`, and `ItemWizard/` was already a known,
   differently-structured 4th wizard before Day 44 started. Folding Task Model in means either
   reconciling its context-driven (`useTaskModelWizard()`) data flow with the shared shell's
   props-driven contract, or growing the shared component a second calling convention — a real,
   separately-scoped piece of work, not a styling pass. See `claude/day44-wizard-shell.md`.
2. **Existing `text-[11px]` (and similar arbitrary-value) call sites were not migrated** to the new
   named tokens. Per Part 5.3, migrate opportunistically as a drive-by edit next time a file is
   already open for another reason — not a task to schedule on its own.
3. **The shadcn-generated primitives are `.tsx`** in an otherwise plain JS/JSX repo (from
   `components.json`'s `"tsx": true`). Left alone deliberately — this is cosmetic, not a defect.
4. **`ui.shadcn.com` is blocked by the sandbox's egress proxy.** Confirmed via direct `curl`
   returning a `403`/tunnel failure, not assumed from the CLI's ambiguous error. Any future
   `shadcn add` needs either an allowlist change or the same hand-write-to-match-convention
   workaround Day 42 used.
5. **`Accordion`, `Checkbox`, `Label`, `Tooltip`** (shadcn) plus `Modal.jsx`, `Spinner.jsx`,
   `ErrorBoundary.jsx`, `NavBar.jsx`, `TopBar.jsx`, `DashboardLayout.jsx`, `Footer.jsx`,
   `LifecycleStatusBadge.jsx`, `InfoTooltip.jsx`, `LegacyCard.jsx` are shared infrastructure outside
   Part 5.4's ten-item list — noted Day 41, unchanged this week, and not a gap since they were never
   in scope.
6. **Everything from the Day 40 handoff's "what remains" list is still exactly where it was** —
   Week 9 was a frontend-only pass and touched none of `delivery/`, `activitySelection.js`, the
   stopping rule, or the R/plumber IRT service. See `claude/day40-w7-8-close-handoff-w9-prep.md`
   for that list; it carries forward unchanged into whatever week resumes the delivery-engine work.

## Next

Week 9 (the design-system foundation block) is closed. The next build-reference item is the
Q-matrix editor and DINA config panel (Part 5's stated reason for landing the design system ahead
of them) — these are the first surfaces expected to consume the tokens and primitives shipped this
week from day one, per Part 5.3.
