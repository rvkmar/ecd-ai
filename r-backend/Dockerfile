# r-backend/Dockerfile
# Rebuild recipe for the published psychometric image.
#
# v2.6 (what `rvkmar/r-backend:latest` is until this recipe is pushed)
# already has mirt, GDINA, TAM, difR, equate, plink, plumber, jsonlite,
# ggplot2, and svglite. It does not have eRm. A hand install of eRm
# inside a running container is lost on recreate.
#
# This file installs eRm 1.0.10, bnlearn, and gRain from CRAN, then
# copies repo app sources. Tag and push the result as
# rvkmar/r-backend:v2.7 and rvkmar/r-backend:latest.
#
# Compose still pulls that published tag and bind-mounts
# ./r-backend/app. Do not `docker compose build r-backend` as the
# default path. Build context is ./r-backend.
#
# The package RUN is its own layer, before COPY app, so plumber edits
# do not reinstall CRAN packages.

FROM rvkmar/r-backend:latest

# Source installs (eRm, bnlearn, gRain, gRbase) need a compiler. The
# published image may have removed it after mirt was built.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       build-essential \
       gfortran \
       libblas-dev \
       liblapack-dev \
  && rm -rf /var/lib/apt/lists/*

COPY install-cran-delta.R /tmp/install-cran-delta.R
RUN Rscript /tmp/install-cran-delta.R \
  && rm -f /tmp/install-cran-delta.R

WORKDIR /home/app

COPY app /home/app

# Private compose-network service. Main compose uses expose, not host ports.
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["Rscript", "/home/app/start.R"]
