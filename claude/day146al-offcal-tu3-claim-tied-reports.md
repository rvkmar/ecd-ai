# Off-calendar: TU3 claim-tied score reports

**Not D146.** Closes textbook gap T1. Lane A (TU1, TU2, TU3) is complete. Does not start TU4.

Handoff id: day146al. TU1 took `day146aj`. TU2 took `day146ak`.

**Status: DONE.**

## What changed

Session, learner-feedback, teacher, class, and district reports now quote the Evidence Model `claimStatement` for the competency they report, show a standard error for theta or a posterior SD for a probability, and resolve the level in one module.

`server/delivery/reportLevels.js` is that module.

- Continuous scores call `levelForScore`. When it returns a level, `level` is the label, `levelText` is the descriptor (or the label when no descriptor was written), and `levelSource` is `authored`.
- When `levelForScore` returns null (nothing authored, the scale does not match, or the score sits below every cut), the historical cuts apply and `levelSource` is `default`, with `levelNote` `default cut`. Theta: above 1 Advanced, above 0 Proficient, otherwise Needs Support. Probability: above 0.7 Strong, above 0.4 Developing, otherwise Needs Support. Unauthored reports keep today's level words.
- Mastery stays `classifyByRule` (SMV cut, Assembly Model cut, mastery `decisionRule`, else 0.5). That classification is added on a mastery posterior. It does not replace the level word, so a probability of 0.8 with no performance levels is still Strong, and a cut of 0.9 can still say nonmaster.

Theta SE prefers `studentModel.irtSe`, then an EAP posterior `sem`, then the old `1/sqrt(n)` approximation. The teacher report still sends `stderr` as `1/sqrt(n)`. `standardError` is the preferred SE. A Bayesian network row sends `posteriorSd` from `sem`, or from `precision` when `sem` is absent. Class and district means send the standard error of the mean, and the mean of the person posterior SDs. A cell under the small-cell rule still hides the score. The claim stays, because it names the construct, not the students.

The session ECD document quotes the same claim on the evidence and competency rows, and puts the theta level on the overview. Percent bands (Secure, Mostly secure, Developing, Emerging) are unchanged.

The learner summary, Bayesian network lists, attribute profile, teacher IRT line, ECD theta line, and class report show the claim, the SE or SD, and the words `default cut` when `levelSource` is `default`. Layout changes are a line under the existing level. There is no district screen for `GET /api/reports/teacher/district/:districtId`. The payload carries the same fields. `ClassReport` is not mounted on a dashboard; it now renders the fields the class route returns.

No fields were removed. No migration.

## What was not done

TU4 and the rest of T1–T28. A live browser walk. This environment has no seeded database and no login. The changed screens were rendered in jsdom: the ECD session document, the class report, and the existing session-report role split.

The commented-out feedback handler in `reportsRoutes.js` still contains the old ternaries. It is not mounted.

## Rollback

Revert this change. Reports go back to inline Advanced / Proficient / Needs Support and Strong / Developing / Needs Support, with no claim and no posterior SD. Authored performance levels and mastery cuts remain, and reports stop reading them.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2995 passed | 13 skipped (3008). 350 files. 75.63s.
```

There is no lint script and no ESLint config. The repo guard tests ran inside the suite, including the dead-export guard. After that green run, one class recommendation sentence lost an em dash (`More data needed for ${node}. Assign additional tasks.`). No test reads that sentence.

Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

Not D146. Lane A is complete. Do not merge without an explicit OK.
