# r-backend/Dockerfile
# D61: pinned R + dated Posit Package Manager snapshot.
# A committed renv.lock that renv::restore() can consume needs a successful
# image build to snapshot hashes. The snapshot URL is the pin until then.

FROM rocker/r-ver:4.4.2

# Dated CRAN snapshot -- the reproducibility pin ADR 0002's packageVersion
# field is meant to be checked against. Change the date deliberately when
# bumping packages, then rebuild and record the new versions from /health.
ENV CRAN=https://packagemanager.posit.co/cran/__linux__/jammy/2025-01-15
ENV RENV_CONFIG_REPOS_OVERRIDE=https://packagemanager.posit.co/cran/__linux__/jammy/2025-01-15

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libfontconfig1-dev \
    libcairo2-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/app

COPY install-packages.R /tmp/install-packages.R
RUN Rscript /tmp/install-packages.R

COPY app /home/app

# Private compose-network service. Main compose uses expose, not host ports.
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["Rscript", "/home/app/start.R"]
