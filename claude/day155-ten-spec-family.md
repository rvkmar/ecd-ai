# D155 — generate a real family end to end (W31 gate)

**Closed 2026-10-29.** Calendar unit **D155**, alone, never-compress. W31. Calibrated from `7e44136` (D155-not-started close). Product and this close land together. Did not start D156.

**Status: DONE.**

## Exit check (executed)

| Claim | Executed? |
|---|---|
| One template generates a family of at least ten task specs, each differing only in declared TMV values | **Yes** — live `:6060`, template `tpl1793289069252000` (**D155 plant-part ten-spec family**). Preview count 10. `POST /api/templates/:id/generate-task-specs` returned 10. Assignments are Bloom `{remember,understand,apply,analyze,evaluate}` × register `{formal,informal}` with stimulus held `static`. |
| One generated spec becomes an item | **Yes, as a citation.** Item `it_mvtq0dnj_000` stores `taskSpecId=tspec1793289069305000` (`remember,formal,static`). Stimulus and key stayed authored. AIG stayed unmounted. Authored `POST /api/taskSpecs` is 405. |
| That item is delivered in a session | **Yes** — task `t1793289069498`, session `s1793289069569` assigned to `stud1`, Fixed Form policy `pmvrvcqgea71400`. |
| It scores through its Evidence Model | **Yes** — `POST /api/sessions/s1793289069569/submit` `{ itemId, rawAnswer: "opt_a" }` returned `activated: true`, `evidenceModelId=emmvrvcqgr9d3318`, `observationId=obs-plant-name`. |

Host: **http://localhost:6060** after `docker compose up -d --build node nginx`. Frontend asset `index-CYgp0svI.js`. Login `admin1` / `WalkPass!2026`. Walk ids: `claude/day155-walk-result.json`. User path: `claude/day155-assessment-walkthrough.md`.

Tests that resemble the walk (`d155W31Walk.test.js`) are not the exit check. The live generate / cite / submit is.

## Verification

On the product tree before this close commit:

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2889 passed | 3 skipped (2892) — 335 files (180.53s)

npm run build
  green (21.31s). Largest JS chunk
  EvidenceModelBuilder-BFFHwtIA.js 369.20 kB (gzip 87.23 kB).
  TaskModelBuilder-CSa6aJlK.js 108.61 kB (gzip 27.97 kB).
```

PsychometricFigure uncaught errors still print from tests that expect a throw; they are not failures. Skip count 3 is live-R auto-detect (plumber healthy). +5 tests vs the D155-not-started close (2884): the W31 walk, two item-POST citation cases, two Step 1 spec-picker cases.

Live `:6060` was rebuilt this session. Docker nginx build used Vite 8 (`EvidenceModelBuilder-KFp1xrXx.js` 371.78 kB gzip 82.68 kB); local `npm run build` is Vite 7 as above. Both include the citation UI.

Tree was dirty at `7e44136` with the product; this close commits it.

## What the plan got wrong

Calendar said generate the D120 ten-spec family “to deliverable items” and that a generated spec “becomes an item.” Generate/preview/replace/retire already existed (D152–D153). Specs are `{ templateId, tmvAssignment, stale }` only. Item POST is authored. AIG is unmounted until D157. Confirmed Task Models are locked, so the live plant-part TM could not receive D120 settings.

The existing plant-part template already had a family of **three** (diagram × Bloom fixed remember), not ten. Live Bloom demand only has three levels. Binding a TMV with `valueSet: stimulusPolicy` fixed at `static` made `taskStructure.stimulusPolicy = parameterized` illegal, and IRT confirmation refuses a fully static structure.

**Became:** do not mount AIG. Put D120 settings on a **clone** Task Model. Generate 10 specs from a confirmed template bound to that clone. Instantiate **one** item via existing Item POST with optional `taskSpecId` (pointer, not a spec-to-item engine). Confirm, bind a task, deliver, submit. Record every unanticipated manual step. That list is the finding the calendar asked for; it is in the walkthrough §14.

## What was delivered

| Piece | Where |
|---|---|
| Optional `taskSpecId` on items | `src/utils/schema.js` — must name a generated spec whose template is bound to this item's Task Model |
| Item POST copies the citation | `server/routes/itemsRoutes.js` `createItemRecord` |
| Item wizard Step 1 picker | `Step1Instantiation.jsx` + `bindTaskSpec` |
| W31 walk test | `server/routes/__tests__/d155W31Walk.test.js` |
| Citation route tests | `itemLifecycle.test.js` |
| Spec-picker tests | `steps/__tests__/step1TaskSpec.test.jsx` |
| Live walk | `:6060` clone `tm1793288978071000` → template `tpl1793289069252000` → 10 specs → item `it_mvtq0dnj_000` → session `s1793289069569` → `activated: true` |
| User walkthrough | `claude/day155-assessment-walkthrough.md` |

AIG still unmounted. Item POST is still the authored-item path.

## Unanticipated manual steps (the W31 finding)

1. Clone the locked plant-part Task Model before changing TMV settings.
2. Create new TMVs (5-level Bloom subset, register, stimulus axis). Do not use `valueSet: stimulusPolicy` on this IRT Task Model.
3. New Presentation Model bound to the clone; the v1 overlay stays on v1.
4. Confirm the template, then **Generate family**. Confirm does not generate.
5. Cite the spec in Step 1; write stimulus and scoring by hand.
6. Activating scoring rules must award a score greater than 0.
7. Sessions need a selection policy (Fixed Form on this walk).

## Half-applied work

None. Ten specs exist on the live template. One citing item is confirmed, delivered, and scored. The other nine specs are not items, by design.

## Compression debt

None new. Standing, still written off Wave 4:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`

D115b instantiated-tasks click-through closed Wave 1.

## Calendar

D155 marked ✅ (`jiafccqah8hcqdus8nb5dficds`). W31 marked ✅ (`sn83tnnpb01v00pag38itae3ps`). Dates were not moved. T13 in the T1–T28 audit is this unit and is closed.

## Next

**D156** (W32, G5): AIG generator bound to templates. Re-calibrate first. Do not start it from this close. Do not mount `aigRoutes.js` until D157. T1–T28 remainder (TU1–TU27 except T13) stays recorded, not started.
