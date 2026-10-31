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

`Dockerfile` is `FROM rvkmar/r-backend:latest`, then a CRAN install of
the packages v2.6 does not ship, then `COPY app /home/app`.

v2.6 (`latest` until the commands below are pushed) has mirt, GDINA,
TAM, difR, equate, plink, plumber, jsonlite, ggplot2, and svglite. It
does not have eRm. A copy of eRm installed by hand inside a running
container disappears when that container is recreated.

`install-cran-delta.R` pins **eRm 1.0.10** with `remotes::install_version`
and installs current **bnlearn** and **gRain**. Dependencies are
Depends, Imports, and LinkingTo only. Suggests stay off, so the build
does not pull Bioconductor `Rgraphviz`. Existing packages are not
upgraded. The install is its own image layer, before `COPY app`, so
editing plumber sources does not reinstall CRAN packages.

`/health` reports `eRm`, `bnlearn`, and `gRain` the same way it reports
mirt and TAM: a version string when the package loads, JSON null when
it does not. On a v2.6 container with this repo's app mounted, those
three are null. CI (`lsat7-pipeline`) pulls the published image and
bind-mounts the app. `test-lltm.R` therefore keeps the mirt path until
v2.7 is `latest`. After that push the same CI step runs `eRm::LLTM`
as the default and still runs the mirt path. The D88 Hub package gate
does not require eRm, bnlearn, or gRain, so the job stays green before
the push.

Build and push from a machine that can reach Docker Hub. Pull first so
`FROM rvkmar/r-backend:latest` is the published v2.6 image, not an
older local tag.

```bash
docker pull rvkmar/r-backend:latest
docker build -t rvkmar/r-backend:v2.7 -t rvkmar/r-backend:latest ./r-backend
docker push rvkmar/r-backend:v2.7
docker push rvkmar/r-backend:latest
```

Then recreate the compose service so it picks up the new image. Do not
use `docker compose build r-backend` as the everyday path. That
rebuilds only if `build:` is uncommented in `docker-compose.yml`.

```bash
docker compose pull r-backend
docker compose up -d r-backend
```

`install-packages.R` is leftover from the D61 Posit/rocker from-scratch
install. It is not required for compose up. It sources
`install-cran-delta.R` so a from-scratch rebuild gets the same three
packages. The dated Posit snapshot in that file does not contain
eRm 1.0.10.

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
The focal group answers Item.5 against a difficulty shifted +2.5
logits; ability is N(0,1) in both groups. `POST /calibrate/dif` calls
`difR::difMH` (Mantel-Haenszel, alpha 0.05, no purification). ETS
delta is computed from stored `alphaMH` (`-2.35 * log(alphaMH)`);
difR does not put `deltaMH` on the MH object. The operational flag is
ETS C (`|deltaMH| >= 1.5`). Unadjusted MH p < 0.05 overflags.

## Known equating fixture (D70)

`{ fixture: "known-equating" }` expands a seeded NEAT common-item
design in Node (`server/r/knownEquatingFixture.js`, seed 20261202).
Two independent samples of 400, six common items, Form Y generated
0.5 logits harder. `POST /calibrate/equating` fits a `mirt` Rasch
model on each form, then `plink::plink` Mean/Sigma constants that put
Form Y on Form X. `equate` is installed for observed-score work; this
job is IRT linking. Ingest writes `analysisArtefacts[]`.
