# Off-calendar: TU10 task time limits and attempt caps

**Not D146.** Textbook gap T19. `day146au` is TU7. `day146av` is TU8. `day146aw` is TU9.

Handoff id: day146ax.

**Status: DONE.**

Built on main `ed275ad` (TU9). `stampItemFeedback` still writes `response.feedback`. TU9 timing fields stay on the same row. No migration.

## Timeout policy

Policy id: `record-current-work`.

The limit is `deliveryAdministration.taskTimeLimits[taskId]` when that key is a positive number. Those seconds already include the student accommodation factor. This unit does not call `applyAccommodationTiming` again. A missing key uses `taskStructure.timingConstraint.timeLimitSeconds`. Zero, blank, or absent means no task limit, and submit behaves as before.

The clock is the TU9 server presentation visit: accrued closed visits, plus the open visit's wall time, plus `timeOnItemMs` already stored on that task. Equal to the limit is on time. Strictly past the limit is late. A client `timedOut` flag is ignored. If the server never received `POST /present` for the task, the limit is not applied, because there is no server clock to judge.

A late submit with no stored response for that task is accepted and scored, including an empty answer. Every row from that submit gets `timedOut: true`, `timeoutPolicy: "record-current-work"`, `taskTimeLimitSeconds`, and `taskTimeLimitSource` (`taskTimeLimits` or `timingConstraint`). A later submit is **409** `task_timed_out`. The stored answer stays.

The player shows a per-task countdown from the present clock and that limit. At zero it disables input and submits the current answer once. If that save fails for a reason other than the lock, the learner can save again without editing. A 409 shows the server message on the question.

Session pause does not freeze this clock. That matches TU9. The player does not auto-submit while the session is paused. The session deadline is unchanged.

## Attempts

`taskStructure.resourceConstraints.maxAttempts` counts scored submits for one task in one session. Only an integer of at least 1 is a cap. The number is stored on `response.attempt`. One submit that writes several observable rows shares that number. A further try under the cap replaces those rows. The next one is **409** `task_attempts_exhausted`.

A task retry is allowed even when delivery review is off. The delivery-model attempt cap still applies, and the smaller cap wins. With no task cap, review-off and the historical item-path 409 are unchanged. A question-path task with no cap still appends.

A revision after the time limit is refused even when attempts remain.

## What was not done

A logged-in browser walk. This environment has no `.env` and no author session. The countdown component tests and the existing player tests cover the clock. Route tests cover late submit, the exact limit, the accommodated stamp, attempt counting, and a task with empty constraints.

## Rollback

Revert this change. Older responses have no `timedOut` field. Responses that already stored it keep the field, and scoring does not read it. A task cap stops being enforced. TU8 feedback and TU9 timing are unchanged by the revert of this commit.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3215 passed | 13 skipped (3228). 382 files.
```

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked.
