# D115 debt — live `:6060` dual-PM walk (closed)

**Status: DONE.** Compression debt from the 2026-09-21 W23 close discharged
the same calendar day in a follow-on session.

## Exit check

> Changing a Presentation Model changes what an examinee sees, WITHOUT
> touching item content — demonstrated live in a browser with two
> presentation models over one item.

| Claim | Executed? |
|---|---|
| Student `/next-task` returns live presentation overlay | **Yes** — after tenancy fix; admin already worked; student was empty |
| Flip operational PM changes overlay (API) | **Yes** — `large_text` → `high_contrast` on `s1789988990327` |
| Browser chrome flips without item edits | **Yes** — `data-presentation-profile` / classes on student player; stimulus unchanged (`itemA`) |
| Item still loads for examinee | **Yes** — after rostered `GET /api/tasks/:id` fix |

## What was wrong (plan contact)

W23 close recorded the gate as met on tests and left the live walk open. On
contact, the walk was blocked by **student tenancy**, not missing PM code:

1. `tasks` are tenant-scoped; authored rows often have **no `districtId`**, so
   scoped `loadDB()` hides them from students.
2. `attachPresentationOverlay` looked up `task → taskModelId` in the scoped
   db → no task → **no `presentation`** on `/next-task` (admin unscoped OK).
3. `GET /api/tasks/:id` 404'd the same way → SessionPlayer never mounted
   ItemPresenter chrome.

Presentation Models do **not** instantiate tasks; they only overlay chrome.

## Delivered (product `17ce5c2`)

| Area | Change |
|---|---|
| `sessionRoutes` attach | Resolve overlay against `readRawDB()` (system content) |
| `tasksRoutes` GET `/:id` | Allow rostered task from raw store for assigned student |
| `SessionPlayer` | Student wizard root applies `presentationChrome`; `loadTaskById` refreshes overlay |
| Tests | `d115PresentationNextTaskTenancy`, `d115TaskDeliveryTenancy` (+ mock `readRawDB` on session importers) |

Live fixtures: session `s1789988990327`, TM `tm-d56`, item `itemA`, PMs
`pm1789988809911001` (large_text) / `pm1789988810055002` (high_contrast).
Password walk: `WalkPass!2026`.

## Verification (this close)

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  1913 passed | 9 skipped (1922) — 170 files

npm run build
  green (11.55s); SessionPlayer chunk 44.64 kB
```

- Product tip before this close record: **`17ce5c2`** ≡ `main/master`.
- No half-applied work.

## What remains / next

- **D115b (outlined)** — Instantiated tasks schema & item-bind authoring
  (Implementation). Not CAF full lifecycle. See
  `claude/day115b-instantiated-tasks-unit-outline.md`.
- Calendar **D116** — W24 TMVs schema (G13) still next in the block plan;
  D115b may be taken first as Implementation debt without renumbering W24.
- Do not start W25 from this close.
