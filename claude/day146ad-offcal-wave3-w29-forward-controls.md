# Off-calendar: Wave 3 W29 forward controls

**Not D146.** Not a calendar unit. Closes W29: an author can start at a **confirmed** Domain Analysis and reach a Competency Model (Student Model). Forward controls only. Does not start D155. D129 was not reopened. Not D154.

Handoff id: day146ad.

**Status: DONE.** Exit check: live `:6060` confirm a Domain Analysis, from that record author **and confirm** a Student Model that names the analysis and shows the inherited perspective; New Student Model with no analysis still opens.

## Premise (held)

D141–D145 shipped Domain Analysis, patterns, and the chain walk. D146 already copies perspective onto a Student Model when the stored value is empty. Domain Analysis Overview still only offered **Author a Q-matrix**. The Student Model and Design Pattern wizards already had a Domain Analysis select. The missing piece was the same URL handoff the Q-matrix already uses: `?tab=student|designpatterns&domainAnalysisId=`.

Wave 3 is therefore: from a confirmed analysis, open a Student Model or a Design Pattern with that analysis named. It does not create either record. A draft analysis tells the author to confirm first. New Student Model with no analysis still opens.

Did not auto-create a Competency Model. Did not absorb `curricularPolicies` (D143). Did not re-home the Q-matrix (D144). Did not require a pattern before a Student Model.

## Choice

- `openFromDomainAnalysis(searchParams, { tab, domainAnalysisId })` sets `tab` and `domainAnalysisId`, clears `focus` and `id`.
- Confirmed Overview: **Author from this analysis** with **Author a Student Model** (`tab=student`) and **Author a Design Pattern** (`tab=designpatterns`).
- Draft Overview: “Confirm this analysis to author a Student Model or a Design Pattern from it. A Student Model can still be started with no analysis.”
- Q-matrices tab still has **Author a Q-matrix for this analysis**.
- Student Model create reads `domainAnalysisId`, waits until analyses have loaded, then `applyDomainAnalysisChoice`. Confirm and cancel clear the handoff query. Edit of an existing model does not take the URL id as a rewrite.
- Design Pattern Manage create prefills `{ ...emptyForm(), domainAnalysisId }`. Clearing focus also drops `domainAnalysisId`.

## Live walk on `:6060`

Health ok; hybrid `ecd-json` + mongo backends; R reachable. Index `/assets/index-CcflFHJL.js` after nginx recreate.

`admin1` → Models → Domain Analysis → **Fractions** (`damvrvcqgfcc86cc`, confirmed, Trait). Overview showed Author a Student Model and Author a Design Pattern.

Author a Student Model opened `/admin?tab=student&domainAnalysisId=damvrvcqgfcc86cc`. Step 1 named **Fractions — Trait** and **Perspective: Trait Inherited from Fractions.** Authored **W29 Fractions Student Model** (unidimensional, NCF-SE Mathematics CG-1, one continuous competency Fraction proficiency −3 to 3, normal prior mean 0 sd 1). Structural audit all passed. Save for Review then Lock & Confirm. Toast: “Model confirmed successfully.” List: Confirmed ▸ W29 Fractions Student Model.

New Student Model with no analysis opened Step 1 as **Choose a Domain Analysis** (empty select). Cancelled; no extra record.

Author a Design Pattern opened `/admin?tab=designpatterns&domainAnalysisId=damvrvcqgfcc86cc` with Fractions selected and **Trait. Declared on Fractions.** Cancelled; no extra record.

Draft **NCF-SE 2023 - Mathematics, Middle Stage** Overview had no Author buttons and the confirm-first copy. Fractions Q-matrices tab still listed **Author a Q-matrix for this analysis** and Fraction equivalence Q-matrix.

Did not archive confirmed Student Models. Did not revert Part naming `ps1793177976685`.

## What was not done

D155. Reopening D129. Wave 4 limits. PCM, Sympson–Hetter, multivariate EAP, default carry-forward. `docker compose build r-backend`. Did not commit (not asked). Did not create a Design Pattern or a second Student Model from the unpatterned path.

## Rollback

Revert the product files. Recreate `ecd-nginx` from the previous image. The live confirmed Student Model **W29 Fractions Student Model** is store data and is not removed by a code revert.

## Verification

```
npx vitest run (related)
  domainAnalysisWorkspace, designPatternTabs, competencyWizardDomainHandoff
  plus CompetencyWizard suite: 70 passed

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  333 passed (333)
  Tests  2884 passed | 3 skipped (2887)
  Duration  263.56s

npm run build
  EvidenceModelBuilder 369.20 kB gzip 87.22 kB
  DomainAnalysisEditor 35.71 kB gzip 10.14 kB
  built in 3m 37s

docker compose up -d --force-recreate nginx
  ecd-nginx Recreated / Started
  nginx DomainAnalysisEditor-WswmciLv.js 36.00 kB gzip 9.70 kB
  nginx CompetencyModelBuilder-CKzG9HD6.js 121.92 kB gzip 27.24 kB
  nginx index /assets/index-CcflFHJL.js

curl.exe http://localhost:6060/api/health
  status ok, R reachable, servingSessions true
```

Browser: confirmed Fractions → Author a Student Model → inherited Trait → confirmed **W29 Fractions Student Model**. Unpatterned New Student Model still opened. Design Pattern prefilled Fractions. Draft NCF hid the buttons. Q-matrix authoring unchanged.

## Calendar

Not a calendar unit. Last completed calendar unit stays D154. Next remains D155, never-compress, not started. W29 is closed off-calendar.

## Next

D155 if still wanted, after its own calibration, never-compress. Unexecuted standing walks once the store can host them (D68, Continue, Newtonian). Do not start D155 from this close.
