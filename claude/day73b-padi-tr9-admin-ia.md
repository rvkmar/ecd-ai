# D73b — Admin CAF/Delivery information architecture

**Status: DONE.** Nested TR9 chrome on Admin, then the same workbench on District / Teacher / Student. Live `:6060` after nginx rebuild; four-role walk on this close.

**Exit check (calendar):** Admin shows Models containing Assembly, Q-Matrix, and Calibration; Competency labeled Student Model; Analytics lives under Delivery → Reports; no CAF entity named Delivery Model. **Met** on live `:6060` and in tests.

Calendar also said “District tabs unchanged unless a one-line note says otherwise.” That premise did not survive contact: Activities is Implementation (task specs), not Presentation; Q-Matrix and Calibration belong on Admin Models only. District, Teacher, and Student were aligned in the same session. Recorded below under *Units revised*.

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  98 passed (98)
  Tests  1399 passed | 6 skipped (1405)
  Duration  96.10s

npm run build
  dist/assets/index-CWS7Hg6h.js  2,280.50 kB
  built in 24.49s
  chunk >500 kB warning still present (D74)
```

Live exit check (behaviour, not only tests):

| Role | Account | What was demonstrated |
|---|---|---|
| Admin | `admin1` | Models / Implementation / Delivery; Assembly nested; Student Model label; Reports under Delivery; EA inspector; Presentation stub |
| District | `dist1` | Implementation (Item Bank, Activities) + Delivery (Sessions, Evidence Accumulation, Reports). No Q-Matrix, Calibration, or Models. Activities caption: instantiated Task Models, not Presentation |
| Teacher | `teach1` | Same chrome as District |
| Student | `stud1` | Delivery only: My Sessions, Reports. No Analytics label |

Product `6ba447d`. Close `12dbca2`.

## What was delivered

PADI TR9 (Mislevy & Riconscente 2005): five **layers**, not five CAF siblings. CAF is Student / Evidence / Task / Assembly. Delivery is Fig. 12 processes around the composite library. There is no CAF “Delivery Model.”

- Shared `RoleWorkbench` (`src/components/ui/RoleWorkbench.jsx`) — group tabs + nested tabs, `?tab=` for session-list deep links.
- **Admin:** Models (Student Model, Evidence, Task Model, Assembly, Q-Matrix, Calibration); Implementation (Item Bank, Activities); Delivery (Sessions, Evidence Accumulation inspector, Presentation stub W23, Reports).
- **District / Teacher:** Implementation + Delivery only. Bookmark routes `/district/q-matrices` and `/district/calibration` may remain; they are not tabs.
- **Student:** Delivery only.
- `EvidenceAccumulationInspector` — read-only sessions + `studentModel.smvPosteriors`.
- `PresentationModelStub` — W23 placeholder, not an authoring wizard.
- Activities copy in `TasksManager`: TR9 §2.4 task specs; Presentation is SessionPlayer.

Where the plan was wrong: the unit was written as Admin-only so District would not move before D74. After the Admin walk, leaving staff on the old peer tabs (including Q-Matrix / Calibration / Analytics) contradicted the same TR9 reading. Chrome-only alignment was cheaper than a second calendar unit; D74 still owns the chunk.

## What remains

- D74 bundle split (chunk 2,280.50 kB, `index-CWS7Hg6h.js`).
- D75 never-compress W15 close.
- Admin session Operate / player URL (`sessionPlayerPath` still excludes admin).
- Inner wizard copy still says “Competency Model” (chrome rename only).
- CM Archive live click on `:6060` Operate (dashboard loaded; dedicated archive walk still open).
- D68 mid-flight ingest on `:6060`.
- Hub image for live equating.

## Next

Calendar **D74** — route-level split; measure dashboard and composite-library build. Do not start D75 thin in the same session.
