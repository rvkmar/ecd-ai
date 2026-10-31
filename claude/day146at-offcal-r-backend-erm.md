# Off-calendar: r-backend image gets eRm 1.0.10

**Not D146.** The published image `rvkmar/r-backend:latest` is the same package set as v2.6. TU19 (PR #137) prefers `eRm::LLTM` and falls back to mirt. A hand install of eRm 1.0.10 inside a running container is lost when that container is recreated. This change is the rebuild recipe, not a new calibration feature.

Handoff id: day146at. day146as is TU19. day146ar is TU12.

**Status: DONE in git. The Docker Hub tag is not pushed from this run.**

Base: main `3d86bbe` (TU19, PR #137).

## What changed

`r-backend/Dockerfile` is still `FROM rvkmar/r-backend:latest`. Before it copies the app it installs compilers (the published image may have dropped them after mirt was built) and runs `install-cran-delta.R`.

That script uses free CRAN (`https://cloud.r-project.org`) only:

- `eRm` is pinned to **1.0.10** with `remotes::install_version`. CRAN records that release as `1.0-10`. The build stops if `packageVersion("eRm")` is not `1.0.10`, and it calls `library(eRm)`.
- `bnlearn` and `gRain` are current CRAN, not pinned. The build calls `library(bnlearn)` and `library(gRain)`.
- `dependencies = NA` (Depends, Imports, LinkingTo). Suggests are not installed. gRain Suggests `Rgraphviz`, which is Bioconductor.
- `upgrade = "never"`, so mirt and the rest of the v2.6 set are not upgraded.

The install is its own image layer, before `COPY app`, so an app edit does not reinstall CRAN packages. `install-packages.R` (the from-scratch Posit snapshot, still not used by compose) sources the same delta. That snapshot date does not contain eRm 1.0.10.

`GET /health` reports `eRm`, `bnlearn`, and `gRain` the same way it reports mirt and TAM: a version string read from the session, or JSON null when the package is absent. Versions are not hardcoded.

Compose still pulls `rvkmar/r-backend:latest` and bind-mounts `./r-backend/app`. Do not `docker compose build r-backend` as the everyday path.

## CI

`.github/workflows/ci.yml` `lsat7-pipeline` pulls the published image. It does not build `r-backend/Dockerfile`. Until v2.7 is pushed as `latest`, that image has mirt and not eRm, so `test-lltm.R` keeps the mirt path. The D88 Hub gate still requires only mirt, GDINA, TAM, difR, and plink. Null `eRm` / `bnlearn` / `gRain` must not fail that gate.

After v2.7 is `latest`, the same CI step runs `eRm::LLTM` as the default (the test already requires that when eRm loads) and still runs the mirt path.

## What was not done

This environment has no Docker, so the image was not built or pushed. The BN estimator in `bnCalibrate.R` is still base R. It does not call `bnlearn` or `gRain`. Those two packages are on the image and on `/health` so the next image has them. TU12 behaviour is unchanged.

No migration. TU19 scoring and the predicted-parameter refusal are unchanged.

## Push on a machine that can reach Docker Hub

Pull first so `FROM rvkmar/r-backend:latest` is the published v2.6 image, not an older local tag.

```bash
docker pull rvkmar/r-backend:latest
docker build -t rvkmar/r-backend:v2.7 -t rvkmar/r-backend:latest ./r-backend
docker push rvkmar/r-backend:v2.7
docker push rvkmar/r-backend:latest
```

Then recreate the compose service (`docker compose pull r-backend && docker compose up -d r-backend`). `GET /health` should show `packages.eRm` of `1.0.10` and version strings for `bnlearn` and `gRain`.

## Rollback

Revert this change. Compose keeps pulling `latest`. If v2.7 was already pushed, retag `latest` back to the v2.6 image. A container recreated from v2.6 loses eRm again, and LLTM falls back to mirt. `/health` on the repo app still names eRm, as null.

## Verification

Local R is 4.3.3. No Docker. Current `bnlearn` on CRAN needs R >= 4.4, so it was not installed here. Ubuntu's `r-cran-erm` is 1.0-4, which is not the pin, so it was not used. CRAN source `eRm_1.0-10.tar.gz` installed as 1.0.10 and `library(eRm)` loaded. mirt is not on this machine, so the mirt fallback was not re-run. That path is what CI runs until v2.7 is pushed.

```
Rscript r-backend/app/tests/test-contract.R
  R contract tests passed
Rscript r-backend/app/tests/test-diagnostic-keys.R
  R diagnostic key tests passed (GDINA not installed; fit skipped)
Rscript r-backend/app/tests/test-lltm.R
  LLTM recovery passed (default, eRm::LLTM)
Rscript r-backend/app/tests/test-bundle-grm.R
  mirt not installed; skipped bundle GRM fixture
  R bundle GRM tests passed
Rscript r-backend/app/tests/test-model-criticism.R
  mirt not installed; skipped LSAT7 fixture
  GDINA not installed; skipped sim10GDINA fixture
  R model criticism tests passed
Rscript r-backend/app/tests/test-bn-calibration.R
  star CPT recovery ok
  tree CPT recovery ok
  non-binary refusal ok
  R Bayesian network calibration tests passed
```

```
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
  3115 passed | 13 skipped (3128). 365 files.
```

TU19 reported 3112 passed and 13 skipped. The three new tests are the Hub gate staying green when eRm, bnlearn, and gRain are null, the `/health` name list, and the eRm 1.0.10 pin in the image recipe.

There is no lint script and no ESLint config. Node on this machine is v22.23.4. `package.json` asks for `>=24`. The suite passed on 22.

## Calendar

Not D146. Draft PR only. Do not merge from this change.
