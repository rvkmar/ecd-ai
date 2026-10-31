# install-cran-delta.R
# Packages missing from rvkmar/r-backend:v2.6 (the tag published as
# latest until v2.7 is pushed). Free CRAN only.
#
# eRm is pinned to 1.0.10 (CRAN version string 1.0-10). bnlearn and
# gRain follow current CRAN. dependencies = NA installs Depends,
# Imports, and LinkingTo, and does not install Suggests. gRain Suggests
# Rgraphviz, which is Bioconductor, so Suggests stay off this image.
# upgrade = "never" leaves mirt, GDINA, TAM, and the rest of v2.6 alone.
#
# The Dockerfile runs this file on its own, before COPY app.
# install-packages.R sources it for a from-scratch rocker rebuild.

repos <- "https://cloud.r-project.org"
options(repos = c(CRAN = repos))
options(Ncpus = max(1L, parallel::detectCores() - 1L))

if (!requireNamespace("remotes", quietly = TRUE)) {
  install.packages("remotes", dependencies = NA)
}

remotes::install_version(
  "eRm",
  version = "1.0.10",
  repos = repos,
  upgrade = "never",
  dependencies = NA,
  build_vignettes = FALSE
)
remotes::install_cran(
  c("bnlearn", "gRain"),
  repos = repos,
  upgrade = "never",
  dependencies = NA,
  build_vignettes = FALSE
)

library(eRm)
library(bnlearn)
library(gRain)

erm_ver <- as.character(utils::packageVersion("eRm"))
if (!identical(erm_ver, "1.0.10")) {
  stop("eRm pin failed: expected 1.0.10, got ", erm_ver, call. = FALSE)
}

cat("Installed package versions:\n")
for (p in c("eRm", "bnlearn", "gRain")) {
  cat(sprintf("  %s %s\n", p, as.character(utils::packageVersion(p))))
}
