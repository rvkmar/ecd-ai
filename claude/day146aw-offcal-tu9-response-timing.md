# Off-calendar: TU9 response timing

**Not D146.** Textbook gap T18. `day146au` is TU7. `day146av` is TU8.

Handoff id: day146aw.

**Status: DONE.**

Rebased onto main `7466af4` (TU7, PR #141), which includes TU8 `89f76b7`. `stampItemFeedback` still writes `response.feedback`. Timing fields sit on the same row.

Session and task time limits already include the student accommodation factor (`applyAccommodationTiming`, `deliveryAdministration.taskTimeLimits`). `timeOnItemMs` is the visible clock. It is not multiplied again. An accommodated session still presents and submits.

## What changed

`POST /api/sessions/:id/present` records the server clock the first time a task is on screen. A second present while that visit is still open does not reset it. Moving to another task closes the visit and keeps the visible time on `session.responseTiming.tasks[taskId]`.

Submit writes these optional fields when a clock exists:

- `presentedAt`: server time of the first present, or the client timestamp when the server never saw a present (`presentedAtSource` is `server` or `client`)
- `clientPresentedAt` when the client sent one
- `timeOnItemMs`: visible time, summed across revisits, including time already stored on a replaced response
- `timeOnItemSource`
- `rapidGuess`, `rapidGuessStatus` (`rapid` or `engaged`), the threshold, the basis, and the rule id

Tab-hidden time is subtracted when `hiddenMs` falls inside the server-measured visit, plus 1.5 s of slack. A client `visibleMs` cannot raise the total above that window. A shorter client figure is kept, so time the server cannot see as hidden is still excluded.

Rapid-guess rule `normative-threshold-v1` (Wise and Ma 2012, adapted to the median):

`threshold = min(10 s, max(floor, 0.10 * median timeOnItemMs for that item))`

The floor is 3 s. Fewer than 5 peer times from other sessions use the floor. `item.rapidGuessMinimumMs` or `taskStructure.timingConstraint.minimumResponseMs`, when higher, replaces the floor. An authored minimum above 10 s is kept. The 10 s cap bounds the percentage only. This unit does not enforce `timingConstraint.timeLimitSeconds` or `maxAttempts`.

A response with no finite `timeOnItemMs` is not a rapid guess. The teacher report renders that as unknown, including a stored `rapidGuess` flag with no time. The rate is rapid guesses divided by timed responses. Unknown responses stay out of the denominator. One task counts once when several observable rows share it.

TU10 can read `taskResponseTiming(session, taskId)` (`presentedAt`, `accruedMs`, `openPresentedAt`, `openElapsedMs`) and the fields on the response. The present response returns that view.

Pause time is not removed from the item clock. The session pause clock stays on delivery administration.

No migration.

## What was not done

TU10. A live browser walk. Present is ownership-scoped like submit, not a role list.

## Rollback

Revert this change. Older responses have no timing fields. Responses that already stored them keep the fields, and scoring does not read them. The teacher report stops showing the rate. TU8 feedback is unchanged by the revert of this commit.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3192 passed | 13 skipped (3205). 379 files.
```

Rebased onto main `7466af4` (TU7). The suite includes the TU8 feedback tests, the TU7 accommodation tests, a submit that stores `response.feedback` and the timing fields on the same row, and a present plus submit on a session whose deadline and task limit already include the accommodation factor.

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. TU10 was not started.
