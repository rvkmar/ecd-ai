# Day 44 — The wizard shell as a reusable component

**Exit check (as originally scoped):** the duplicated `WizardSidebar`/`WizardStepContainer` pair
found across the Competency/Evidence/Task wizards is extracted into one reusable shell (step
rail, per-step gating, readiness panel, error boundary) and all three wizards are re-pointed at
it.

**Status: DONE, scope narrowed after audit — see below.** D111 (2026-09-21)
discharged the Task Model deferral onto the shared shell as convention B —
see `claude/day111-taskwizard-shared-shell.md`. ItemWizard remains deferred
(D112).

## Why the plan changed before any code was written

This was flagged on Day 41 as the highest-risk item in Week 9 ("a mistake here breaks authoring
for the whole app"), so it got an audit pass before any extraction, same discipline as Days 41 and
43. The audit read all three wizards' `WizardSidebar.jsx`/`WizardStepContainer.jsx` pairs and their
parent wizard files line by line, rather than trusting the Day 41 line-count comparison that
originally called this a three-way duplication.

**Competency vs Evidence — genuinely safe to merge.** Their `WizardStepContainer.jsx` files were
byte-identical except for two things: Competency's Cancel button always shows the X icon and the
word "Cancel"; Evidence's swaps to a bare "OK" (no icon) once the model is no longer editable. And
the locked-model notice names the model type ("This Competency Model is confirmed and locked." vs
"This Evidence Model..."). Their `WizardSidebar.jsx` files were likewise identical apart from
branding text (title, brand-initial letter, footer layer name) and a prop-naming convention
mismatch: Competency thinks in 1-based step ids (`currentStep`, `onStepClick(stepId)`, steps shaped
`{id, label}`), Evidence thinks in 0-based indices (`currentStepIndex`, `goToStep(index)`, steps
iterated by array position). Neither sidebar gates navigation itself — both call their click
callback unconditionally — so the actual navigation rules live one level up, in the parent wizard
files:

- Competency (`CompetencyWizard.jsx`): `onStepClick={(stepId) => { if (stepId <= currentStep ||
  canProceed(currentStep)) setCurrentStep(stepId); }}` — backward navigation always allowed,
  forward only if the current step's required fields validate.
- Evidence (`EvidenceWizard.jsx`): `goToStep = (index) => setCurrentStepIndex(index)` — completely
  ungated; any step is reachable by clicking the rail at any time.

These are two real, different behaviors, not a difference to paper over. Whatever shared sidebar
got built had to let each wizard keep gating its own way through an external callback, not bake
either rule in.

**Task Model — not a styling variant of the same component.** `TaskWizard/WizardSidebar.jsx` reads
`{ STEPS, currentStep, setCurrentStep, lifecycleStatus, isEditable, readiness, draft }` from
`useTaskModelWizard()` context instead of taking props, renders an extra per-step "outstanding
readiness work" amber-dot indicator that Competency and Evidence have no equivalent of, and bakes
in a stricter, different gating rule directly in the component:
`canNavigateBack = isEditable ? index < currentStep : true`, with the step button itself
`disabled={!canNavigateBack}` — forward navigation via the rail is never allowed, only via `Next`.
`TaskWizard/WizardStepContainer.jsx` is a deeper divergence still: it takes almost no props
(`{ onCancel }`), pulls its entire lifecycle (`draft`, `canGoNext`, `goNext`, `goBack`, readiness,
`isStructurallyComplete`, `handleSaveDraft`, `handlePromote`, ...) from the same context, and
directly imports and switches between `Step1Identity`..`Step8Review` itself — it is both the chrome
*and* the step router, where Competency/Evidence's containers just render externally-provided
`children`. Its lifecycle buttons also differ in substance, not just styling: a named
blocking-reason toast (`readiness.checks.filter(c => !c.valid)[0].detail`, so the field failing is
actually named), and `Save for Review`/`Lock & Confirm` wired to `handlePromote` rather than
separate `onSaveAndReview`/`onConfirm` props.

Forcing Task Model into today's shell would mean one of: dropping its readiness indicator and
named-blocking-reason toast (a real regression), rearchitecting its context-driven data flow to be
props-driven as a side effect of a styling extraction (out of scope and risky on its own), or
growing the shared component a second, structurally different calling convention just to fit one
caller (defeats the point of sharing it). None of those is a Day 44-sized change, so **Task
Model's (and Item's — already a known 4th, differently-structured wizard) re-pointing is
explicitly deferred**, not silently dropped.

## What was built

`src/components/wizard/WizardSidebar.jsx` and `WizardStepContainer.jsx` — extracted from
Competency's and Evidence's pairs, standardized on 0-based indices (Competency's call site adapts
with a couple of lines rather than the shared component supporting two numbering conventions), and
using the Day 41 `wizard-rail`/`wizard-rail-collapsed` Tailwind tokens in place of the `w-72`/
`w-[72px]` literals duplicated in all three original sidebar files.

The two real cosmetic differences are now explicit props rather than hardcoded per copy:
- `adaptiveCancelLabel` (Evidence passes `true`; Competency omits it, keeping its old "always
  Cancel" behavior).
- `modelLabel` (Competency passes `"Competency Model"`, Evidence `"Evidence Model"`) for the
  locked-notice text.

Both wizards' external gating callbacks are preserved exactly:
`CompetencyWizard.jsx`'s `onStepClick` still runs the same `stepId <= currentStep ||
canProceed(currentStep)` check (adapted to translate the shared component's 0-based index to its
own 1-based `stepId`), and `EvidenceWizard.jsx`'s `goToStep` is passed straight through as
`onStepClick`, still completely ungated.

`CompetencyWizard/WizardSidebar.jsx`, `WizardStepContainer.jsx`, `EvidenceWizard/WizardSidebar.jsx`,
`WizardStepContainer.jsx` — all four now-duplicate files deleted; both wizards import the shared
versions from `@/components/wizard/`.

## Tests and build

New `src/components/wizard/__tests__/wizardShell.test.jsx` (10 tests) targets exactly the
behaviors the audit found and the merge had to preserve: 0-based `onStepClick` index, no internal
gating (a locked sidebar still fires the click callback so a parent's own gating decision is what
governs, matching both wizards' real behavior), caller-supplied branding, the adaptive Cancel/OK
label in both states, the model-specific locked-notice text, `Next` disabled by `canProceed` while
editing but not while locked, and the `Save for Review`/`Lock & Confirm`/`Return to draft`
lifecycle-button visibility rules. Full suite: **852/852 passing** (842 prior + 10 new; no existing
test imported the deleted files directly, so nothing needed updating elsewhere). Production build:
clean.

## Next

Day 45: Week 9 walkthrough and handoff — closing out the design-system pass (tokens, primitives,
Toast fix, Storybook, and this narrowed wizard-shell extraction) with a summary of what shipped,
what was deliberately deferred (Task Model's and Item's wizard re-pointing chief among it), and
what Week 10 should pick up. **Update (D111):** Task Model re-pointing
shipped as a tested second calling convention on the same shared shell;
Item remains D112.
