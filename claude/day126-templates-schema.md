# D126 — Templates schema (four CAF bindings)

**Status: DONE.** Calendar unit **D126**, alone (Tier 2). Started from
`2adaa16` (W26 calibration). Did not start D127 / D128 / D129.

## Exit check

> A template validates its four bindings and refuses an incoherent one
> (a Presentation Model bound to a different Task Model's materials);
> the D48 collection guard passes.

| Claim | Executed? |
|---|---|
| `templates` in schema + validateEntity | **Yes** |
| Four bindings: competencyModelId, evidenceModelId, taskModelId, presentationModelId | **Yes** |
| Refuse PM bound to a different Task Model | **Yes** — `templateBindingErrors` / `d126TemplatesBindings.test.js` |
| EM must sit on the bound CM (via competency.modelId) and on the TM's evidenceModelIds | **Yes** |
| Confirm requires all four + coherence | **Yes** — `POST /:id/confirm` |
| D48 collectionSurfaceGuard green | **Yes** — mounted `/api/templates` + rolePermissions |
| React Query hooks ship with the collection | **Yes** — `src/api/queries/templates.js` |
| No builder UI / no generation | **Yes** — deferred to D127 / W31 |

## Premise on contact (held / applied)

- Collection was absent — greenfield seven-artefact.
- D120 TMV settings stay on the Task Model; template does not store a second copy.
- PM↔TM coherence reuses the compositeLibrary / ADR 0008 rule.
- AIG `templateId` left untouched (different concept).

## Delivered

| Piece | Where |
|---|---|
| Schema + `templateBindingErrors` | `src/utils/schema.js` |
| Readiness mirror | `src/utils/templateReadiness.js` |
| Routes | `server/routes/templatesRoutes.js` |
| Mount | `server/index.js` |
| RBAC | `src/config/rolePermissions.js` (admin write; district view) |
| Queries | `src/api/queries/templates.js` |
| Tests | `d126TemplatesBindings.test.js`, `d126TemplatesRoutes.test.js` |

status: `draft` \| `confirmed` (confirm = bindings coherent; no CAF operational until generation).

## Verification

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run
  2067 passed | 9 skipped (2076) — 193 files

npm run build
  green (~18s)
```

D125 close: **2047 passed / 9 skipped**. Delta: **+20 tests**.

## Next

**D127** alone — Template builder UI (family-size live readout from bound TM
settings). Do not start D128 (second schema) or D129 (never-compress) casually.
