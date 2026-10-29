# Off-calendar: Wave 4 recorded design limits

**Not D146.** Not a calendar unit. Record pass only. Closes remaining through-D153 ledger leftovers as recorded limits, and writes off standing walks that this store cannot host. Does not start D155. D129 was not reopened. No application files changed.

Handoff id: day146ae.

**Status: DONE.** Exit check: the ledger’s carried-forward list through D153 has no unmarked **open** rows; standing walks are closed or written off with a reason; next queued remains D155, never-compress, not started.

## Premise (held, one rewrite)

Checked on HEAD `7fb4bef`. Remaining unmarked rows through D153 are **decisions**, not unfinished product. Closing them as limits is the same pattern as R10 / R12.

One rewrite: the plan said “binding `assemblyModelId` is schema/UI, its own unit.” G19 already binds a session that cites a delivery model to that model’s `assemblyModelId`. The remaining hole is the inferred path: a session with no delivery model still matches by competency model, and two governing Assembly Models apply none (`AMBIGUOUS`). A first-class `session.assemblyModelId` without a delivery model is still a later unit.

Did not author a mastery threshold. Did not add `session.assemblyModelId`. Did not retire `curricularPolicies`. Did not re-home the Q-matrix. Did not add sociocultural / process-trace advisories. Did not put perspective on the Item wizard. Did not add a Competency Wizard `jointPrior` editor. Did not turn on AuditLog TTL or prune calibration payloads. Did not invent a two-item in-flight session, a Continue wizard, or a Newtonian pack.

## Recorded limits

| Item | What the code actually is | Recorded as |
|---|---|---|
| Mastery cut 0.5 | `DEFAULT_MASTERY_THRESHOLD = 0.5` in `attributeClassification.js`. ADR 0004 decision 5: a stated constant, not a schema field. `p === tau` is `indeterminate`. | ADR 0004. Authorable per Assembly Model or SMV is a later unit. |
| Two governing Assembly Models | `resolveAssemblyModelForSession`: a cited delivery model is authoritative. Otherwise infer; `governing.length > 1` returns `AMBIGUOUS` and applies none. | Warned since D60. G19 already binds via delivery model. Inferred-path `AMBIGUOUS` stays. |
| DINA calibration keyed by item | `liveResponseMatrix.js`: slip/guess stay keyed by item id at calibration (R1). Scoring looks up observableId first, then itemId (R9). | R9 remainder. Not a scoring hole. |
| Settings Curricular Policies still mounted | Competency Wizard Step 3 still calls `useCurricularPolicies`. ADR 0011: retire the Settings surface only when nothing reads `/api/curricularPolicies`. | D143 stay. Still read, so still mounted. |
| Q-matrix on the DINA store | `/api/qMatrixModels` remains the store. Knowledge–task statements are `{ label }`. | ADR 0012 / D144 stay. |
| Sociocultural / process-trace advisories | D147 kept trait + DINA/G-DINA only. | Left out of D147 on purpose. |
| Item wizard perspective | D148 showed perspective at the statistical-model choice and the template Student Model binding. | Explicitly not D148. |
| Competency Wizard `jointPrior` editor | No wizard field. Confirm/scoring share `JOINT_PRIOR_MAX_CORRELATED_PARTNERS = 1`. | R10. No multivariate EAP. D129 stays closed. |
| AuditLog TTL / calibration `retainUntil` prune | `AUDITLOG_RETENTION_DAYS` off unless > 0. Jobs stamp `retainUntil` (~182 days); response and artefact payload are not pruned on write. | Ops, after the Mongo moves already shipped. |
| Dead-export shared-name hole | Guard matches export name across `server/`. Two modules that share a name cover for each other. | Guard limitation, not a product gap. |
| PCM, Sympson–Hetter, full joint EAP, default carry-forward | PCM not scored (R5). No P(A) table (R13). One correlated partner (R10). Carry-forward default off (R11); `administration.carryForward` or an explicit session option turns it on. | Already recorded. |

## Standing walks written off

These were not product fails. Wave 1 already found this store cannot host them without a setup the walk plan forbade inventing.

| Walk | Why it was not executed | Recorded as |
|---|---|---|
| D68 mid-flight ingest | 600 sessions, all `completed`. No unstopped two-item session to ingest against. Product already met in tests (`c4e5d77`). | Written off. Do not invent a live in-flight session. |
| Student wizard Continue | No in-progress wizard session; `wizardPhaseTimings` not exercised across devices. API tests only. | Written off. |
| Newtonian live promote | Live store has Part naming, Part function, Fraction. No Newtonian pack. | Written off. Do not bulk-upload Newtonian here. |
| Newtonian console ingest | Same store. | Written off. |
| CM archive of live confirmed parents | Archive UI/API exists. Wave 2 closed the Step 9 `CheckCircle2` crash. Archiving **Plant part naming** or **Grade 6 Numeracy - Fractions** would mutate operational Student Models. | Written off. Do not archive live confirmed parents to discharge a walk. |

## What was not done

D155. Reopening D129. Any product. `docker compose build r-backend`. Suite / build / live `:6060` re-run (no application files changed). Calendar event (Wave 4 is off-calendar; D155 stays unmarked). Commit (not asked).

## Rollback

Delete this handoff and revert the ledger / CHANGELOG strikes. No application files to revert.

## Verification

Exit check is the ledger: no unmarked **open** row through D153; standing walks closed or limited; next queued D155.

Existing tests pin the two code-backed limits. They were not re-run this close (no product):

- `server/delivery/__tests__/attributeClassification.test.js` — `classifyMastery` records `DEFAULT_MASTERY_THRESHOLD` (0.5).
- `server/delivery/__tests__/activitySelection.test.js` — “refuses to guess between two governing models”; a named delivery-model assembly wins when another governing model exists.

```
git rev-parse --short HEAD
  7fb4bef

git status -sb
  clean at start of Wave 4; this handoff and ledger/CHANGELOG uncommitted at close
```

There is no lint script and no ESLint config. Live `:6060` was not rebuilt.

## Calendar

Not a calendar unit. Last completed calendar unit stays D154. Next remains D155, never-compress, not started. W29 stays closed from Wave 3. D129 stays closed.

## Next

D155 if still wanted, after its own calibration, never-compress. Do not start D155 from this close.
