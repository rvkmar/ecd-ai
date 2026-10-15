# Session close — D142 Domain Analysis upload and correction form

**Closed 2026-10-15.** A Layer-1 document uploads as a draft and is correctable on one form. The form is not a wizard.

## Exit check

| Unit | Exit check | Status |
|---|---|---|
| D142 | A Domain Analysis document uploads, validates, and is correctable in the form editor; no ungated write route | **DONE** |

Live Admin (`admin1`) on `:6060` after `docker compose up -d --build nginx node`. A logged-in `POST /api/domainAnalyses/bulk` whose body said `status: "confirmed"` returned **207**, created **1**, failed **0**. The stored row is **`da1792032778751000`**, name **Explaining a labelled scientific diagram**, `recordStatus` **draft**. The Settings → Data → Upload card for Domain Analyses was visible, including the sample-file sentence. The file input on that card was not the gesture; the POST was the card’s endpoint from the logged-in session.

The form at `/admin?tab=domainanalyses` listed that row as draft and filled all seven statements plus Information Processing. Valued knowledge was changed to **How the parts of a system relate** and Save draft persisted it. GET returned 200 with that label and perspective `information_processing`. `router.use(authenticateToken)` is on the route file. Writes stay admin-only.

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  close re-run: 2164 passed | 9 skipped (2173)
  Test Files 216 passed
  160.51s, exit 0
  (the product run earlier the same morning was the same count)

npm run build
  green (45.66s). Largest JS chunk recharts 488.42 kB (gzip 139.42 kB).
  index-j6eKL5q5.js 33.18 kB; DomainAnalysisEditor-CtxMgRFk.js 5.77 kB.
```

Product commit `97e9a45`. Tip matches `main/master` before this close commit. Close commit follows.

## What was delivered

The calendar asked this unit to add routes, lifecycle, and upload. Routes and the reduced lifecycle had already landed in D141, because the D48 guard cannot wait. D142 is the intake: `POST /api/domainAnalyses/bulk` always stores draft, even when the file says confirmed, and a `curricularPolicyId` or `qMatrixId` fails that row. The same validator as single create runs. Unified bulk classifies a Layer-1 file before the competency-model check, because both carry `psychologicalPerspective`.

Admin → Models → Domain Analysis is one screen: name, perspective select, seven textareas (one statement per line), Save draft, Confirm. Hints say valued knowledge is not a curricular policy and knowledge–task relationships are not a Q-matrix. Settings has upload and download cards. Sample `samples/sample-domain-analyses.json` uploads as-is.

## Half-applied work

None. The live draft is the force-draft proof. Competency models were not given a Domain Analysis parent. Policies and Q-matrices were not moved.

## Compression debt

None new. Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through

## Calendar

D142 marked ✅. The 2027-03-12 date was not moved.

## Next

D143, alone. Absorb `curricularPolicies` into the Domain Analysis. Never-compress migration. Dry-run first. Do not start it here. W29 is not closed: an author still cannot start at a Domain Analysis and reach a Competency Model. D144, D145, and D150 stay never-compress.
