# Off-calendar — Manage tab parity for Design Pattern and Domain Analysis

**Not D146.** Not a calendar unit. Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Layout | Manage Design Pattern and Manage Domain Analysis use the same list console as Manage Task Model: title and description, black New button with a plus icon, search, lifecycle filter, readiness filter, count, and expandable cards with a status badge | **DONE** |
| Actions | New opens the existing create flow. Edit opens the existing wizard or workspace on that record. Duplicate opens the create flow with the statements copied and a new name. Delete confirms, then calls the existing delete route. Design Pattern delete stays disabled while a template still cites the pattern | **DONE** |
| Domain Analysis extras | Guided setup stays on the list, beside New. It still opens the guided wizard. Cancel from a fresh guided setup returns to the list | **DONE** |
| Deep links | `?tab=designpatterns&focus=<id>` opens Manage on that pattern. Domain Analysis `focus`, `id`, and `domainAnalysisId` do the same | **DONE** |
| Untouched | Competency, Evidence, and Task pages are unchanged. Payload, readiness, and confirm rules are unchanged. There is no clone route, so Duplicate does not mint a version; it opens the create form | **DONE** |

## What was delivered

`ModelManageList` is the shared list chrome. Only Design Pattern and Domain Analysis use it. Manage renders that list. New, Edit, and Duplicate replace the list with the existing authoring surface (`DesignPatternLibraryView`, or `DomainAnalysisWorkspace` including Guided setup). Cancel or Back to list returns to the cards.

A Design Pattern copy keeps the menus and the domain-analysis citation. A Domain Analysis copy keeps the seven sections and the perspective. The curricular policy is not written from this form, so the copy does not pretend to store one.

Domain Analysis delete uses the route that was already on `DELETE /api/domainAnalyses/:id`. The client hook is new. The confirm copy says that design patterns and Q-matrices which name the analysis keep that citation.

## Verification

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  2296 passed | 9 skipped (2305)
  Test Files 248 passed
  52.24s, exit 0

npm run build
  green (1.39s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.87 kB (gzip 82.85 kB).
  DesignPatternBuilder 50.96 kB (gzip 13.98 kB).
  DomainAnalysisEditor 33.71 kB (gzip 9.14 kB).
```

Previous close on this tree was the Domain Analysis shell, **2290 passed / 9 skipped**. Delta: **+6 tests** in `designPatternTabs.test.jsx` and `domainAnalysisTabs.test.jsx`. Skips unchanged. Existing Design Pattern library tests and Domain Analysis workspace tests passed in the same run.

This VM ran the suite on Node 22. CI installs Node 24. `npm ci` printed an engine warning and still installed.

## Browser

Local Vite `http://127.0.0.1:5173` and the API on `:3000`, `DB_MODE=json`, signed in as `admin1`. The store held three patterns and three analyses, plus two task models for the comparison page.

Manage Design Pattern showed the title, New Design Pattern, search, status, readiness, and three cards. New opened the wizard with an empty title and Create draft. Cancel returned to the list. Edit on Name a plant part filled Title. `?tab=designpatterns&focus=dp-ready` opened that same wizard. Expanded cards showed Edit, Duplicate, and Delete.

Manage Domain Analysis showed the same chrome, plus Guided setup. New opened a blank name with Save draft disabled until a name is typed. Guided setup opened Name and perspective, and Cancel returned to the list. Edit filled Name with Plant structure. `domainAnalysisId=da-ready` did the same. Expanded cards showed Edit, Duplicate, and Delete.

Manage Task Model was opened on the same session and was not restyled. Light and dark were both readable: cards, badges, and the New button stayed distinct from the page surface. Live `:6060` was not rebuilt.

## Half-applied work

None on this screen. Confirm still lives in the existing wizard and workspace. Neither collection has a clone or version route.

## Compression debt

None new. D150 P1 stays open: deleting a pattern drops the seed back-link.

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D151, after the calibration already recorded. Do not treat this list as that unit. W29 stays open.
