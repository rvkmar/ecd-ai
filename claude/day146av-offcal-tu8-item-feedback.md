# Off-calendar: TU8 authored item feedback

**Not D146.** Not a calendar unit. Closes textbook gap T7. Does not start TU7 or TU9.

Handoff id: day146av. `day146au` is reserved for TU7 (accommodations). `day146aw` is reserved for TU9 (response timing). `day146at` was already used for the r-backend image recipe.

**Status: DONE.** Exit check: an item with no `feedback` field scores and displays as before. When `items.feedback` is present, response processing stores the resolved text and the rule that matched. A learner sees that text only when the existing feedback timing allows it.

## Premise

Response processing could return task-level feedback in the textbook four-process model. Items had no learner-facing feedback field. `ItemResponseFeedback` could render `response.feedback.message`, but the server never wrote it, so the player fell through to the scoring rationale, a correct or incorrect line, or a score line.

## Choice

`items.feedback` is optional:

- `byOption`: text keyed by option id
- `byScore`: text keyed by a score (`1`) or an inclusive range (`0..1`, or `0-1` when both ends are non-negative)
- `general`: fallback

`resolveItemFeedback` in `src/utils/itemFeedback.js` picks one rule. An option match wins, then an exact score, then a range, then `general`. Overlapping ranges are refused. A blank object is the same as an absent field.

`stampItemFeedback` writes `response.feedback` as `{ text, rule, key }` on item submit, and again when a human rating supplies a score. No item feedback leaves the response without that object.

Timing is the existing gate, not a second clock. `feedback` is one of the keys `presentSession` removes from a student payload when `feedbackMode` is `none`, or `delayed_end` before the session is closed. Immediate mode, a closed delayed session, staff, and a session with no mode keep the object. The player shows `feedback.text` only while `feedbackVisibleNow` says the phase may show it, and that text replaces the scoring fallbacks. Absent text keeps those fallbacks.

The learner-feedback report adds `itemFeedback` from the same redaction. The learner report view lists that text.

The item wizard scores step edits the three fields. Review shows a short count. Create and update keep the object. Validation runs on draft and on confirm. No migration.

## What was not done

TU7 and TU9. A logged-in browser walk of the wizard: this environment has no `.env` and no author session. The editor, the player panel, and the report section are covered by component tests.

## Rollback

Revert this change. Items that already stored `feedback` are ignored again, because the field is optional and nothing else reads it. Responses that already stored `response.feedback` keep the object, and the player treats `text` as a line only while this code is present.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3134 passed | 13 skipped (3147)
```

`npm run lint` has no script, and there is no ESLint config. The repo guard tests ran inside the suite.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. TU7 and TU9 were not started.
