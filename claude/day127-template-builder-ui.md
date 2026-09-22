# D127 — Template builder UI

**Status: DONE.** Calendar unit **D127**, alone (Tier 1). Started from
`915f765` (post-D126). Did not start D128 / D129.

## Exit check

> A template is authored and confirmed; the projected family size updates
> live as settings change; an incoherent binding shows the server's own
> message.

| Claim | Executed? |
|---|---|
| Author draft + confirm path in UI | **Yes** — `TemplateLibraryView` + `d127TemplateBuilder.test.jsx` |
| Live family size as TMV settings change | **Yes** — 6 → 2 when Bloom switches to fixed |
| Server binding error surfaced (not re-derived in JSX) | **Yes** — `apiErrorMessage` / `template-server-error` |
| Admin Models → Templates tab | **Yes** — `AdminPage` + IA test |
| No second TMV settings store on template | **Yes** — settings from bound Task Model; write-through only if TM unlocked |

## Premise on contact

Calendar said “configure TMV settings on the template.” D126 already put
fixed|varying on the **Task Model**. Unit shows/edits that TM’s settings
(preview on locked TMs; write-through on draft/unlocked) and projects
family size with `projectTaskSpecFamilySize` — no second copy on `templates`.

## Delivered

| Piece | Where |
|---|---|
| Builder | `src/components/templates/TemplateBuilder.jsx` |
| Tests | `src/components/templates/__tests__/d127TemplateBuilder.test.jsx` |
| Admin tab | Models → Templates |

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2073 passed | 9 skipped (2082) — 194 files

npm run build
  green (~23s)
```

D126 close: **2067 passed / 9 skipped**. Delta: **+6 tests**.

## Next

**D128** alone — Joint SMV prior schema (Tier 2). Never with D129
(never-compress). Do not start casually without budget for the schema exit
check.
