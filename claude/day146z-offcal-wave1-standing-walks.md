# Off-calendar: Wave 1 standing walks

**Not D146.** Not a calendar unit. Seven live walks on the Wave 0 image (`cfa4b56` / `:6060` `index-BdsKVPkN.js`). Does not start D155. Does not start Wave 2 product. D129 was not reopened. W29 stays open.

Handoff id: day146z.

**Status: PARTIAL.** One walk passed. Two failed in a way that becomes Wave 2 product. Four were not executable on this store without a setup session the walk plan forbade inventing.

## Exit check (as planned)

| # | Walk | Result |
|---|---|---|
| 1 | D68 mid-flight ingest | **Not walked.** 600 sessions, all `completed`. No unstopped two-item session to ingest against. |
| 2 | Competency-model archive | **Failed.** Archive exists on a confirmed parent. A throwaway clone could not be confirmed: Step 9 crashed. |
| 3 | D115b Instantiated tasks | **Passed.** Implementation → Instantiated tasks opened, listed 23 rows, bound Leaf, deleted the extra row. |
| 4 | Home announcements | **Failed visibility.** Create and admin delete work. Teacher Home stayed empty. |
| 5 | Student wizard Continue | **Not walked.** No in-progress session; `wizardPhaseTimings` was not exercised across devices. |
| 6 | Newtonian promote | **Not walked.** Live store has three EMs (Part naming, Part function, Fraction). No Newtonian pack. |
| 7 | Newtonian console ingest | **Not walked.** Same store. |

## What the walks found

**D115b.** `/admin?tab=activities` binds instantiable Task Models (`Name the plant part`, `Name the plant function`, `Name the fraction`) to Item Bank items. Created `t1793267165006` (Leaf on the diagram) and deleted it. The original 23 rows remain.

**Announcements.** Admin posted `Wave 1 walk public` (deleted after the teacher check) and `Wave 1 walk teachers only` (restricted to `teacher`). `teach1` Home: “No announcements yet.” Cause: `buildAnnouncementRecord` does not stamp `districtId`. D97 `rowVisible` for announcements returns false when `!rowDistrict` for any non-admin. Role filters never run. The teachers-only row is still in the live file; admin GET also hides it because `announcementsForRole` omits admin.

**Archive.** Did not archive **Plant part naming** or **Grade 6 Numeracy - Fractions**. Cloned Plant part naming from Manage. The clone is a draft (second “Plant part naming” in the list). Step 9 rendered “This step could not be displayed” / `CheckCircle2 is not defined`. `VersionHistoryViewer.jsx` uses `<CheckCircle2>` and does not import it. Confirm and archive of the clone did not run. Discarded the unsaved rename.

**D68 / Continue / Newtonian.** Not a product fail in this session. D68 still needs a live two-item in-flight session plus ingest. Continue still needs a started-not-finished wizard. Newtonian still needs the enterprise pack on this store. Those remain standing walks.

## Wave 2 product this session must not start

1. Import `CheckCircle2` in `VersionHistoryViewer.jsx` (archive walk).
2. Stamp `districtId` on announcement create (or treat admin public rows as visible to tenant readers) so role visibility works.

Do not invent extra units. Do not archive the live confirmed Student Models. Do not bulk-upload Newtonian here.

## Leftovers on `:6060`

- Draft clone of Plant part naming (second row in Manage Student Model).
- Restricted announcement “Wave 1 walk teachers only” (not listed for admin).

## What was not done

Wave 2A D65 diff UI. Wave 2B D60 P1-4. Wave 3 W29 forward controls. Wave 4 limits pass. D155. Reopening D129. Suite re-run (no product). `docker compose build r-backend`.

## Rollback

No application files changed. Live leftovers are the draft clone and the hidden announcement.

## Verification

Browser on `http://localhost:6060` as `admin1` and `teach1` (`WalkPass!2026`). Health from Wave 0 still ok. Git at start `cfa4b56` ≡ `main/master`. This handoff uncommitted at close.

## Calendar

Not a calendar unit. Last completed unit stays D154. Next remains D155, never-compress, not started. W29 stays open.

## Next

Wave 2 product from the two failed walks, then the four unexecuted walks once the store can host them. Do not start D155 from this close.
