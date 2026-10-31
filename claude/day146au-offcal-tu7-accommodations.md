# Off-calendar: TU7 per-examinee accommodations

**Not D146.** Not a calendar unit. Closes textbook gap T6. Does not start TU9 or TU10.

Handoff id: day146au. `day146at` was already used for the r-backend image recipe. `day146av` is TU8 (item feedback), merged as `89f76b7` before this rebase. `day146aw` stays reserved for TU9 (response timing).

**Status: DONE.** Exit check: a student with no `accommodations` field is delivered as before. When the profile is present, session and task time limits take the extra minutes and the multiplier, and the player applies font scale, high contrast, and read-aloud.

## Premise

Presentation accessibility (font scale, high contrast, time multiplier) lived on the Presentation Model and applied to everyone. `deliveryAdministration` could add `extraTimeMinutes`, but nothing set that per student. There was no read-aloud.

## Choice

`students.accommodations` is optional:

- `extraTimeMinutes`: non-negative number
- `timeMultiplier`: number in [1, 3]
- `fontScale`: number in [1, 2]
- `highContrast`: boolean
- `readAloud`: boolean

Absent, empty, or invalid-on-read fields do not change delivery. Stored profiles drop the defaults, so a multiplier of 1 is not written. No migration.

`resolveAccommodations` and `applyAccommodationTiming` live in `src/utils/resolveAccommodations.js`. One formula covers a session limit in minutes and a task limit in seconds:

`duration = base * presentationMultiplier * studentTimeMultiplier + extraTimeMinutes`

The presentation factor is already on the session deadline. Task limits pass the raw `timingConstraint.timeLimitSeconds` and leave the presentation multiplier at 1, so that factor is not counted twice. TU10 should use `deliveryAdministration.taskTimeLimits[taskId]` when that key is present. Those seconds already include the student factor. Applying `applyAccommodationTiming` again would count it twice. A missing key means the raw task limit stands.

At session create, the stamp stores the profile, `extraTimeMinutes`, `accommodationTimeMultiplier` when it is not 1, and adjusted `taskTimeLimits`. The session deadline is `endTime`. The player reads `endTime` and does not multiply again. Chrome `timeMultiplier` stays the presentation factor.

`presentationChrome` takes the larger font scale, turns high contrast on when the profile or the presentation model asks, and sets `readAloud`. A profile with no presentation overlay still applies those three and leaves progress and skip on.

Read-aloud is a toggle on the item and on the legacy question. It speaks the stem and the options through `window.speechSynthesis`. A missing API or a thrown speak is a no-op.

Staff edit is `PUT /api/students/:id/accommodations`. Admin, district, and teacher only. A district user must share `districtId`. A teacher must share `schoolId` when both sides have one, otherwise the district. `profile.classId` or `classIds` (token or stored user) narrows that to the student's class. A student may read their own row and may not write it. Out of scope is 404. A real change writes `student.accommodations.update` on the audit log with before and after. An unchanged put does not.

Rebased onto TU8 `89f76b7`. Authored item feedback is unchanged.

## What was not done

TU9 (presentedAt and time on item). TU10 enforcement of the task limit and `maxAttempts` (the adjusted seconds are stored for that unit). A logged-in browser walk: this environment has no author session. Route, chrome, and speechSynthesis tests cover the behaviour.

## Rollback

Revert this change. A student profile that was already stored is ignored again, because the field is optional. A session stamped with `accommodationTimeMultiplier` loses that factor, because the previous deadline formula does not read it. `extraTimeMinutes` on that stamp is still added, because that field already existed. `taskTimeLimits` is ignored until TU10.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3168 passed | 13 skipped (3181)
```

`npm run lint` has no script, and there is no ESLint config. The repo guard tests ran inside the suite.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

D146 was not marked. TU9 and TU10 were not started.
