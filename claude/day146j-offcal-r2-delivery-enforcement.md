# Off-calendar: delivery administration is enforced

**Not D146.** Not a calendar unit. Does not start D154.

Handoff id: day146j.

## Premise

A delivery model already stores `administration.timeLimitMinutes`, `attempts`, `allowedReview`, and `feedbackMode` (`src/utils/deliveryModelReadiness.js`). Nothing read them during delivery. Auto-finish used `session.endTime`, or else the latest task `endTime` (`server/utils/autoFinish.js`).

R3 (draft PR #120) owns the session player. That player reads `session.endTime` as the deadline and does not scale it. It reads `session.administration.allowedReview` and `session.administration.feedbackMode` as the server ceiling. This change stamps those fields and enforces the rules on the server. `SessionPlayer.jsx` is not edited here.

## Choice

`server/delivery/deliveryAdministration.js` is the rule. `computeEffectiveDeadline` is the one deadline formula:

```
durationMs = timeLimitMinutes * timeMultiplier * 60000 + extraTimeMinutes * 60000
effectiveDeadline = clockStartedAt + durationMs + pausedMs
```

`extraTimeMinutes` defaults to 0. The presentation factor is `timeMultiplier`, not extra time. Passing the factor and also passing `factor - 1` as extra minutes would count it twice.

At session create, when the cited delivery model has any of these rules, the session stores `deliveryAdministration` (the copy the server enforces) and `administration` (the two fields the player reads). A later edit of the delivery model does not rewrite the stamp. There is no migration. A session that already exists, with no stamp, keeps today's behaviour even if its delivery model now has rules.

### Time limit

A positive `timeLimitMinutes` starts the clock at create, from `startedAt`. The presentation factor is read once, through `presentationTimeMultiplier`.

`presentationTimeMultiplier` in `server/delivery/presentationModelResolution.js` returns a factor in [1, 3], or 1 when the model or the field is missing. Session create calls that function. The factor is stored on the stamp as `timeMultiplier` and passed into `computeEffectiveDeadline` once.

If the delivery model cites a presentation model and that record still resolves, its factor is the one used. Otherwise each task's linkable presentation model is read and the largest factor is used.

`session.endTime` and `deliveryAdministration.effectiveDeadline` are that deadline. Responses also add `deliveryTiming` (`effectiveDeadline`, `remainingMs`, `paused`, and the stamped flags) when a stamp exists. An unstamped session does not gain those fields.

Pause freezes the server clock. Submit while paused returns 409 `session_paused`. The auto-finish sweep does not close a paused session. Resume adds the paused duration to `pausedMs` and rewrites `endTime`. The player is unchanged, so a countdown that only reads `endTime` can hit zero during the pause. Resume puts the remaining time back on `endTime`.

After the deadline, submit and play return 409 `time_limit` and the session is auto-finished (`status` submitted, `autoFinished`, responses locked). `GET /:id` and next-task do the same close. next-task returns `timeLimitReached: true` and no task. Finish after the deadline returns that auto-finished session with 200. An on-time finish stays `completed`.

When no time limit was saved, this code does not set `endTime`. The sweep still prefers an existing `session.endTime`, then the latest task `endTime`. A stamped limit whose clock has started does not also close on a task `endTime`. A stamp whose clock has not started still falls through to that older rule.

### Attempts

`attempts` is the maximum number of scored submits for one task in the session.

The first submit appends a response and advances `currentTaskIndex`, as today. A later submit for that same task replaces the stored response, sets `attempt`, does not advance the index again, and does not record item exposure again. Accumulation reruns on the replaced response.

If `reviewAllowed` is false, that later submit is refused even when attempts remain. The error is `Review is not allowed; earlier answers cannot be changed.` If review is allowed and the cap is used up, the error is `Task {id} has used all {n} attempts.`

With no stamp, the item path still returns `Task {id} already has a recorded response for this session.` The legacy question path still appends another response.

### Review

`reviewAllowed` is false when the delivery model's `allowedReview` is false, or when a presentation model considered above has `allowReview` false. The stricter flag wins. A missing delivery flag does not loosen a presentation model that set `allowReview` to false. If neither side constrains review, the field is absent.

The combined boolean is stored as `session.administration.allowedReview` and as `deliveryAdministration.reviewAllowed`. Submit enforces it. next-task returns 409 when it would hand back a task that already has a response and review is off. An unanswered task is unchanged.

### Feedback mode

`session.administration.feedbackMode` is the delivery model's mode (`none`, `immediate`, or `delayed_end`). It is not combined with the presentation model's `showFeedback`. R3's player takes the less revealing of the two.

For `role === "student"`:

| Mode | Student payload |
|---|---|
| `none` | Scores, correctness, and explanations are removed, including after finish. |
| `immediate` | Those fields stay. |
| `delayed_end` | Removed until the session is completed, submitted, or reviewed. |

Removed fields are `activated`, `direction`, `strength`, `rationale`, `scoredValue`, provisional scoring fields, `studentModel`, `assemblyProgress`, and `accumulationWarnings`. `rawAnswer` stays. The stored session is not rewritten. Staff roles (`admin`, `district`, `teacher`) receive the full session. A session with no `feedbackMode` is returned as the same object as before.

## What was not preserved

- The player is R3 (PR #120). It reads `endTime` and `administration`. This branch does not rescale the clock in the client.
- The deadline calls `presentationTimeMultiplier` from `presentationModelResolution.js`. There is no second copy of that rule.
- In-flight sessions are not backfilled. No migration.
- `extraTimeMinutes` is stored as 0. It is the hook for a later minute-based accommodation. The presentation factor does not go through that argument.
- CI does not start Mongo. One new round trip is skipped unless `MONGO_URI` is set. The catalog list projection includes `deliveryAdministration` and `administration`. `endTime` was already on that projection.

## Rollback

Revert this change. Session documents created after it carry `deliveryAdministration`, `administration`, and maybe `endTime`. Older builds ignore unknown fields. A session created here still has a deadline in `endTime`, which the older auto-finish sweep will honour for an in-progress session. There is no collection to restore.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2756 passed | 13 skipped (2769)

npm run build
  green (1.38s). Largest JS chunk EvidenceModelBuilder 374.61 kB (gzip 83.05 kB).

npm audit --audit-level=high
  found 0 vulnerabilities
```

The extra skip, beyond day146i's two Mongo skips and the 10 live-R skips, is the delivery-administration Mongo round trip. It runs when `MONGO_URI` is set.

## Calendar

D146 was not marked. D154 stays next.
