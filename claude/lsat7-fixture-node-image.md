# LSAT7 fixture ENOENT in the node Docker image

**Status: DONE.** `POST /api/calibrationJobs` with `{ fixture: "lsat7" }`
must load the published frequency table from a path that exists inside
the compose node container, not only in a full repo checkout.

## What broke

`server/r/lsat7Fixture.js` resolved

`../../r-backend/app/tests/fixtures/lsat7-frequency-table.json`

relative to the module. That works in CI / vitest (full tree).
`Dockerfile.node` copies only `server/` and `src/utils`, so the live
node image 500'd:

`ENOENT: ... open '/app/r-backend/app/tests/fixtures/lsat7-frequency-table.json'`

That blocked the D65 W13 gate live walk (admin start without a shell).

COPY-ing `r-backend/app/tests/fixtures` into the node image would have
kept the old path but would have coupled a production image to R test
layout. Shipping the table next to the Node loader fits the existing
Dockerfile with no image-layout change.

## What shipped

- `server/r/fixtures/lsat7-frequency-table.json` — same published matrix
  as the R-side twin. Do not invent psychometric numbers; do not edit
  pattern frequencies.
- `lsat7Fixture.js` loads that sibling path.
- Regression: resolved path is under `server/r/fixtures/` (would have
  caught the ENOENT even when `r-backend/` exists in the checkout).
- Drift: when both files exist, parsed JSON must be equal.

Matrix contents are unchanged.
