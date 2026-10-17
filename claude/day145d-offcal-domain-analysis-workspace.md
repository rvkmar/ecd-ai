# Off-calendar — Domain Analysis workspace

**Not D146.** Not a schema unit. The W29 gate stays open: a Domain Analysis still does not produce a Competency Model.

## Exit check

| Work | Exit check | Status |
|---|---|---|
| Workspace | Admin → Models → Domain Analysis (`?tab=domainanalyses`) is a tabbed workspace: Overview, the seven statement sections, Curriculum, and Q-matrices. The confirm checklist lists the seven sections and the perspective, and each item opens its tab. Save draft, Confirm, and the readiness error strings are unchanged | **DONE** |
| Guided setup | Optional and skippable. Offered when the list is empty and from a Guided setup button. Shared wizard shell, convention A (the rail click reaches the parent, and the parent decides). Step 2 links to Curricular policies and writes no `contentStandards`. Review saves a draft and opens the workspace | **DONE** |
| Stored row | Payload, routes, `domainAnalysisReadiness.js`, and `domainAnalysisSectionErrors` are unchanged. `contentStandards` stays read-only (ADR 0011) | **DONE** |

## Verification

```
npx vitest run
  2246 passed | 9 skipped (2255)
  Test Files 236 passed
  41.89s, exit 0
  Uncaught PsychometricFigure provenance errors printed during the run.
  They are the provenance tests throwing. The run still exited 0.

npm run build
  green (1.23s). Largest JS chunk recharts 425.06 kB (gzip 117.21 kB).
  EvidenceModelBuilder 373.86 kB (gzip 82.79 kB).
  DomainAnalysisEditor 19.35 kB (gzip 5.28 kB).
```

## What was delivered

The correction form is now a workspace. Overview holds the name and the psychological perspective. Each of the seven Layer-1 sections has its own tab, still one statement per line. Curriculum shows the copied curricular policy and does not edit it. Q-matrices keeps the existing panel and the button that opens Diagnostic design with `domainAnalysisId`.

The checklist is the confirm requirements only: psychological perspective and the seven sections. It is read from `domainAnalysisReadiness` errors. The name rule stays on Save draft and in the error list. It is not a checklist item. Save draft, Confirm, and the error strings are the same sentences as before.

Guided setup is not required. An empty list still says to upload JSON or start one here, and Guided setup is on the list. The four steps are Name and perspective, Curricular policy, Valued knowledge and performance outcomes, and Review. The policy step explains the copy, links to `/admin?tab=curricular-policies`, and can be skipped. It does not write `contentStandards`. Review saves a draft and lands on Overview. Cancel returns to the analysis that was open.

The shell is convention A. Forward rail clicks are accepted by the sidebar and applied only when the parent allows them. Step 1 requires a name before a later step opens. There is no reviewed status on a Domain Analysis, so the shell's final button is labelled Save draft for this setup only.

## Half-applied work

None in this screen. The collection, the confirm rules, and the curricular-policy copy are unchanged.

## Compression debt

None new. Standing risks, still open:

- D68 live mid-flight ingest on `:6060`
- Competency-model archive live walk on `:6060`
- D115b instantiated-tasks click-through
- W29 gate: an author still cannot start at a Domain Analysis and reach a Competency Model

## Calendar

D146 was not marked. This screen has no calendar event.

## Next

D146, alone, after the calibration already recorded on 2026-10-17. Do not treat this workspace as that unit. The W30 gate is an advisory sourced from the Domain Analysis and visible at every layer. That was not checked here.
