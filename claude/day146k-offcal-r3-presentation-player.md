# Off-calendar: the session player follows the presentation model

**Not D146.** Not a calendar unit. Does not start D154.

Handoff id: day146k.

## Premise

Re-audit R3 (Med) in `claude/day146b-offcal-ecd-gap-reaudit.md` and `claude/progress-ledger.md`. `presentationChrome` computed `timeMultiplier`, `allowReview`, and `showFeedback`. `SessionPlayer` used `showProgress`, `allowSkip`, and styling. `layout` returned by `resolvePresentationModel` was never read. The extra-time accommodation had no effect on the clock the examinee sees.

R2 owns the server deadline (`timeLimitMinutes` times the presentation multiplier, stamped at session create) and server-side review enforcement (the stricter of delivery review and presentation `allowReview`). This change is the client player, plus an additive multiplier on the resolver so R2 can read one number.

## Choice

`presentationPlayer.js` is the player policy. `SessionPlayer` and `StudentSessionWizard` read it. A missing presentation model keeps today's player. A missing key on a model keeps today's behaviour for that key. `showProgress` and `allowSkip` stay opt-in when an overlay is present (D115).

### Layout

| Setting | Player |
|---|---|
| `layout.itemOrder` `authored`, or the key missing | Question rail follows `session.taskIds`. |
| `layout.itemOrder` `random` | Stable shuffle of that list, seeded by the session id. `/next-task` still picks the adaptive item. |
| `layout.grouping` `single_item` or `section` | Shared stimulus pane is hidden. The item's own stimulus stays in `ItemPresenter`. |
| `layout.grouping` `section` | The rail has one "Section" heading. The model has no section list, so the items are one section. |
| `layout.grouping` `shared_stimulus` | Parent task description and reading passage stay pinned above the item. |
| grouping key missing | Today's two stimulus blocks, when that text exists. |
| `layout.navigation` `linear` | Only the current item is selectable. The review screen is closed. The footer offers Submit session once the session can close. |
| `layout.navigation` `reviewable` | During draft, only the current item is selectable. Enter review opens the review screen, and answered items can be opened there. |
| `layout.navigation` `free` | Any item in the list can be opened. Enter review stays. |
| navigation key missing | Today's rail: any item, and Enter review. |

### Review

Back navigation and the review screen close when any of these is set:

- `conditionalDisplay.allowReview` is `false`
- `layout.navigation` is `linear`
- `session.administration.allowedReview` is `false`

A missing `allowReview` key leaves review open. A missing `session.administration` object means the server has not published a ceiling. `allowedReview: true` leaves a presentation-model closure in place. The player shows review only when the presentation model allows it and the server ceiling allows it.

R2 enforces that ceiling on the server. When R2 writes the stricter flag, put it on `session.administration.allowedReview`. The player already reads that boolean.

### Feedback

The panel copies fields the server stored on the response, in this order: `feedback.message`, `feedback.correct`, `rationale`, then `activated` when nothing above is present, then `scoredValue` when nothing above is present. An item key is not an input. A response with only `rawAnswer` renders no panel.

Timing is the stricter of `conditionalDisplay.showFeedback` and `session.administration.feedbackMode` when the server string is `none`, `delayed_end`, or `immediate`. From least shown to most shown: `none`, `delayed_end`, `immediate`. The less revealing value is what the player uses.

| Timing | What the examinee sees |
|---|---|
| `none`, a missing timing, or no overlay | No panel. A stored rationale stays hidden. |
| `immediate` | The panel on the current item once the response exists. Submit stays on that item until Continue when the response has lines to show. |
| `delayed_end` | The panel on the review, completed, or submitted phase, and when the session is closed. |

Presentation `immediate` with server `feedbackMode` `none` shows nothing. Presentation `none` with server `immediate` shows nothing. The player shows the overlap of the two settings, and only the lines the response already carries.

When R2 strips or withholds feedback, write the ceiling on `session.administration.feedbackMode`. The player already reads it.

### Extra time, and the R2 deadline helper

`presentationTimeMultiplier` in `server/delivery/presentationModelResolution.js` returns the factor in [1, 3]. A missing model, a missing field, or a value outside that range returns 1. `resolvePresentationModel` puts that number on `overlay.timeMultiplier`. `GET /api/sessions/:id/next-task` stamps the same number on `presentation.timeMultiplier`.

The countdown reads `session.endTime`, otherwise the latest task `endTime`. The banner states the factor when it is above 1, and the remaining time is that server deadline. The player leaves the deadline as stored.

R2 should call `presentationTimeMultiplier(overlay)` once, when it stamps `endTime` at session create. `overlay` is the object from `resolvePresentationModel`, or the presentation record. The product is `timeLimitMinutes * factor`.

R2's helper takes an extra-time input that defaults to 0. Pass `presentationTimeMultiplier(overlay) - 1` as that input when the helper computes `timeLimitMinutes * (1 + extraTime)`. A model with no accommodation then passes 0 and the limit is unchanged. A factor of 2 passes 1, and the limit doubles. If the helper instead multiplies by a factor argument, pass `presentationTimeMultiplier(overlay)` itself (identity 1). Use one of those two calls. Using both would apply the accommodation twice. The player will not scale `endTime` after R2 writes it.

## Precedence

1. Server ceiling on `session.administration`, when the boolean or the feedback string is present.
2. Presentation `allowReview: false` and `layout.navigation: "linear"` each close review.
3. Feedback timing is the less revealing of the presentation timing and the server mode.
4. The panel never invents a score. Empty server fields mean an empty panel even when the timing is `immediate`.
5. The clock is the stored deadline. The multiplier is a label beside it until R2 has folded the factor into `endTime`.

## What was not preserved

- Staff review keeps the legacy item layout. The student wizard is the examinee surface. The countdown banner is shared, so staff see the same remaining time and the extra-time line.
- Random order changes the rail. It does not reorder adaptive selection.
- Section grouping is one heading. Authors do not name sections on the model.
- This change does not enforce `timeLimitMinutes`, attempts, or review inside submit, next-task, or finish. That is R2.

## Rollback

Revert this change. There is no migration. Session documents are unchanged. The new `timeMultiplier` field on the next-task payload is additive.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2723 passed | 12 skipped (2735)

npm run build
  green (1.37s). Largest JS chunk EvidenceModelBuilder 374.61 kB (gzip 83.06 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

The 12 skips are the existing live-R and Mongo cases. Component coverage for each setting is in `src/components/sessions/__tests__/presentationPlayer.test.jsx`. The multiplier default is in `server/delivery/__tests__/presentationModelResolution.test.js`.

A logged-in browser session was not walked. The player tests mount `SessionPlayer`, click Enter review, and assert the rail, the feedback panel, the shared stimulus, and the unscaled clock.

## Calendar

D146 was not marked. D154 stays next.
