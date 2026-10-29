# Off-calendar: Wave 2 walk-fail product

**Not D146.** Not a calendar unit. Closes the two Wave 1 product fails: Student Model Step 9 `CheckCircle2` crash, and Home announcement tenancy. Does not start D155. Does not start Wave 2A (D65 diff UI) or Wave 2B (D60 P1-4). D129 was not reopened. W29 stays open.

Handoff id: day146aa.

**Status: DONE.** Exit check: clone Step 9 renders Version History; `teach1` Home lists admin public and teachers-only posts.

## Premise

Wave 1 (`de44c60`) left two product fails and four unexecuted walks. The queued product was:

1. Import `CheckCircle2` in `VersionHistoryViewer.jsx`.
2. Stamp `districtId` on announcement create, or treat admin public rows as visible to tenant readers.

Both premises still held: the viewer used `<CheckCircle2>` and `<Eye>` with no lucide import; `buildAnnouncementRecord` did not stamp a claim; D97 `rowVisible` hid announcements with no `districtId` before role filters ran. Student `viewScope: "self"` would also have hidden every admin/district post (`createdBy` never matches the student).

## Choice

- Import `CheckCircle2` and `Eye` from `lucide-react`.
- Stamp `districtId` / `schoolId` from the authoring JWT. District posts stay tenant-scoped.
- Admin posts with no `districtId` are platform-wide (`authorRole === "admin"`). Unscoped non-admin rows stay hidden.
- Announcements skip student self-scope and match on district (plus admin unscoped).
- The author sees their own role-restricted post, so admin can list and delete a teachers-only notice.

Did not treat every missing `districtId` as public. Foreign-district rows still fail the match. Did not archive the live confirmed Student Models. Did not confirm the leftover clone.

## Live walk on `:6060`

Rebuilt and recreated `ecd-node` + `ecd-nginx` from this tree. Index `/assets/index-BDA9pVz6.js`. Health ok; R reachable.

**Step 9.** First click on the leftover clone used the pre-rebuild SPA and still showed `CheckCircle2 is not defined`. After a full navigation to the new index: Manage → draft **Plant part naming** → Edit → Step 9 Confirmation. Version History listed Version 1 Confirmed and Version 2 Draft **Current**. No error boundary. Did not confirm. Did not archive.

**Announcements.** Admin Home listed the leftover **Wave 1 walk teachers only** (author-sees-own). Posted **Wave 2 walk public**. `teach1` / `WalkPass!2026` Home listed both. Wave 1 teacher Home had been empty.

## What was not done

Wave 2A D65 parameter-set diff UI. Wave 2B D60 P1-4. Wave 3 W29. Wave 4 limits. D68 / Continue / Newtonian still need a store that can host them. D155. Reopening D129. `docker compose build r-backend`. Did not commit (not asked).

## Leftovers on `:6060`

- Draft clone of Plant part naming (first Manage row; Edit/Delete).
- **Wave 1 walk teachers only**.
- **Wave 2 walk public**.

## Rollback

Revert the product files. Recreate `ecd-node` + `ecd-nginx` from the previous image.

## Verification

```
npx vitest run (related)
  5 files, 48 passed

NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  Test Files  330 passed (330)
  Tests  2869 passed | 4 skipped (2873)
  Duration  199.49s

npm run build
  EvidenceModelBuilder 372.26 kB gzip 87.78 kB
  built in 22.82s

docker compose build node nginx
docker compose up -d --force-recreate node nginx
  ecd-node Recreated / Started
  ecd-nginx Recreated / Started

curl.exe http://localhost:6060/api/health
  status ok, R reachable, servingSessions true

curl.exe http://localhost:6060/
  /assets/index-BDA9pVz6.js
```

Browser: clone Step 9 Version History Current; `teach1` Home shows both posts.

## Calendar

Not a calendar unit. Last completed unit stays D154. Next remains D155, never-compress, not started. W29 stays open.

## Next

Unexecuted standing walks once the store can host them (D68, Continue, Newtonian). Then Wave 2A/2B if still wanted. Do not start D155 from this close.
