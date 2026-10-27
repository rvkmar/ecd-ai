# Off-calendar: persistent student scoring record

**Not D146.** Not a calendar unit. The student model now survives the session. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Premise

Confirmed before the change. `applyPosteriorsToSession` writes `session.studentModel.smvPosteriors` for one occasion. The `students` collection is id and name. No collection kept those estimates after the session ended.

`session.studentIds` is not one kind of id. A row may name a `students` id or a user username (`stud1` is a user, and this store has no matching `students` row). `resolveStudentIdentity` treats a students-row id, that row's name, and the user id or username as one examinee when they overlap. Reports do not do this rollup. Learner, teacher, class, and district reports still read one session (`irtTheta`, `bnPosteriors`). They do not combine `smvPosteriors` across occasions.

## Why a collection

A field on `students` would miss examinees who exist only as users, and it would put a growing occasion history on a roster row. `studentModelRecords` matches the other runtime collections (`sessions`, `tasks`): one row per student and competency model, tenant scoped, in the encrypted backup, absent from the design zip.

## What was delivered

One row holds the current `smvPosteriors`, a history entry per finished session (session id, timestamp, posterior snapshot), and provenance (session, parameter set, statistical model, evidence model, district, school).

The row is written when the session finishes: `POST /api/sessions/:id/finish`, the auto-finish sweep, and force-close. It is not written on each submit. An unfinished sitting must not replace the record the next occasion would carry forward. Finishing the same session again replaces that history entry. A session with no posterior does not create a row and does not erase an earlier one.

A new session stays empty unless carry-forward is on. `administration.carryForward` on the delivery model, or `carryForward: true` on the session create body, seeds `studentModel.smvPosteriors` from the record and sets `studentModel.carriedForward`. Absent means off, so legacy sessions and existing tests are unchanged.

Read API: `GET /api/studentModelRecords` and `GET /api/studentModelRecords/:id`. Admin, district, and teacher read inside their scope. A student reads only their own row. There is no authoring write. A `?studentId=` filter on the student role is forced back to that student.

Admin, district, and teacher have a Student model tab next to Reports. The student reports page shows the same panel for the signed-in student. The session builder and the delivery model administration form can turn carry-forward on. A seeded session card says "Estimates carried forward".

The collection is runtime data, so it is not in the design zip. It is in the backup inventory with the rest of the JSON store.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Record | `studentModelRecords`, keyed by student identity and competency model, with current posteriors, history, and provenance | **DONE** |
| Finish | Manual finish, auto-finish, and force-close update the row. A second finish of the same session does not duplicate history | **DONE** |
| Seed | Off unless the delivery model or the session body asks. A request with no record yet does not invent estimates | **DONE** |
| Identity | A students-row id and a username for the same examinee share one row | **DONE** |
| Read | List and get, role and tenancy scoped. Student self-read only | **DONE** |
| UI | Results / Delivery "Student model" tab, student reports panel, carry-forward on the delivery model and the session form | **DONE** |
| Zip | Not imported or exported. Backup inventory includes the collection | **DONE** |

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2468 passed | 9 skipped (283 files)

npm run build
  green

npm audit --audit-level=high
  found 0 vulnerabilities
```

This docs commit did not re-run the suite. The product commit is `b6f6662`.

## Browser

Local Vite `http://localhost:5173`, API on `:3000`, `DB_MODE=json`, signed in as `admin1` / `WalkPass!2026`. Settings, Data, Upload. "Keep original ids and statuses" was on. The file was `samples/ecd-sample-complete.zip`. Import finished: 45 created, 0 failed, including Delivery models 1 created.

The sample cannot be sat as imported. It has no `tasks`. `tm-plant` is draft and unlocked, so the composite library compiles empty and submit refuses. `em-plant` is IRT with an empty parameter set, and `cm-plant` has two binary student model variables, so an IRT posterior is refused. The only activation pattern on `it-leaf` is the keyed option, so a distractor stays unscored (`activated` null) and does not replace a carried estimate.

After the import, the walk prepared one runtime task (`task-plant-leaf`, item `it-leaf`) and the minimum delivery state the scorer already requires: `tm-plant` confirmed and locked, `it-leaf` confirmed with `evidenceModelId` `em-plant`, the active statistical model set to `ctt` with `structureConfig.smvId` `smv-names-part`, non-activating patterns for the three distractors, and `POST /api/compositeLibrary/rebuild/tm-plant`. Student self-scope hides a task the examinee did not create, and submit reads that scoped list (`GET /api/tasks/:id` already falls back for an assigned session). The task's `createdBy` was set to `stud1`. The admin-created session had no `districtId`, which student tenancy hides, so the session was stamped with `stud1`'s district `tn-chennai` and school `sch-1`.

Session 1, student `stud1`, delivery model `dm-plant`, carry-forward off. The examinee chose Leaf and submitted. Admin, Results, Student model, student id `stud1`: Plant part naming, `smv-names-part` estimate 1.000, one history row.

Session 2, same student and task, "Carry estimates forward" checked. The session card read "Estimates carried forward (cm-plant)". Evidence Accumulation (inspect), before the answer, showed `smv-names-part: 1.00` on the new session. The examinee chose Root and submitted. The same Student model panel then showed estimate 0.000, with history 1.000 then 0.000.

## Half-applied work

Submit still does not use the assignee fallback that `GET /api/tasks/:id` uses, so a student cannot score a task they did not create. Session create does not copy the assignee's district onto the session, so student tenancy hides an admin-created session that has no `districtId`. Neither was changed here.

Reports still do not read `studentModelRecords`.

## Compression debt

None new.

## Calendar

D146 was not marked. This collection has no calendar event.

## Next

Do not treat this collection as D146. W29 stays open. Calendar next stays D151 alone.
