# r-backend

Private Plumber service for IRT / diagnostic / CTT calibration. Node talks
to it only through the `calibrationJobs` queue (`R_BACKEND_URL`), never
from a session path.

## Default: published image

`docker-compose.yml` pulls **`rvkmar/r-backend:latest`** (R packages already
installed) and bind-mounts `./r-backend/app` onto `/home/app` so this repo's
plumber routes win over whatever is baked in the image.

```bash
docker compose pull r-backend
docker compose up -d
```

Do **not** run `docker compose build r-backend` as the default path. That
rebuilds nothing useful unless you uncomment `build:` in compose, and it is
slow.

A local `docker-compose.override.yml` may publish `4000:4000` and set
`container_name: r-backend`. Main compose omits `container_name` so that
override wins. The compose **service** name stays `r-backend`
(`http://r-backend:4000`).

## Optional: overlay Dockerfile

`Dockerfile` is `FROM rvkmar/r-backend:latest` plus `COPY app /home/app`.
Use it only when you want a derived image that bakes current app sources:

```bash
# after uncommenting build: in docker-compose.yml
docker compose build r-backend
# or
docker build -t ecd-r-backend:local ./r-backend
```

`install-packages.R` is leftover from the D61 Posit/rocker from-scratch
install. It is not required for compose up.

## LSAT7 fixture (D64)

`app/tests/fixtures/lsat7-frequency-table.json` is the published Bock &
Lieberman (1970) LSAT section-7 matrix: 32 response patterns that expand
to 1000 examinees × 5 items (`mirt::LSAT7` via `expand.table()`). Node
ships the same table at `server/r/fixtures/lsat7-frequency-table.json`
(the compose node image does not include `r-backend/`), expands it in
`server/r/lsat7Fixture.js`, and posts the ADR 0002 request to
`POST /calibrate/irt`. A drift test keeps the two copies equal. The 7
is the section number, not the item count.

## sim10GDINA fixture (D66)

`app/tests/fixtures/sim10gdina.json` is `GDINA::sim10GDINA` from GDINA
2.9.12 (`simdat` 1000×10, `simQ` 10×3, plus documented `simItempar`).
Node ships the same table at `server/r/fixtures/sim10gdina.json` and
expands it for `{ fixture: "sim10gdina" }`. `POST /calibrate/dina` and
`POST /calibrate/gdina` both call `GDINA::GDINA`. `model.family`
selects `"DINA"` or `"GDINA"`. The vignette Q around `simdat` is not
`simQ`; this fixture uses the package object's Q-matrix.

## LSAT7 CTT fixture (D67)

The same published Bock & Lieberman (1970) LSAT section-7 matrix is
analysed classically. `{ fixture: "lsat7-ctt" }` expands the Node copy
at `server/r/fixtures/lsat7-frequency-table.json` with
`model.family: "ctt"`. `POST /calibrate/ctt` calls `TAM::tam.ctt` (or
`tam.ctt2`) with the raw total as the score so `rpb.WLE` is the ordinary
item-total point-biserial. Difficulty is RelFreq of the keyed category
(the published item mean). KR-20 is the Kuder & Richardson (1937)
formula on that matrix — there is no published KR-20 table in this
pipeline. Ingest still refuses `converged: false`.

## Planted DIF fixture (D69)

`{ fixture: "planted-dif" }` expands a seeded 800-person × 8-item
Rasch matrix in Node (`server/r/plantedDifFixture.js`, seed 20261201).
The focal group answers Item.5 against a difficulty shifted +1.75
logits; ability is N(0,1) in both groups. `POST /calibrate/dif` calls
`difR::difMH` (Mantel-Haenszel, alpha 0.05, no purification). Ingest
writes `analysisArtefacts[]` on the evidence model. DIF informs; it
does not authorise a parameter set.
