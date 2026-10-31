# install-packages.R
# Optional / orphan. Not used by `docker compose up`.
# The published image rvkmar/r-backend:latest already has these packages.
# Keep this script only if you rebuild a from-scratch rocker image.
# Dated CRAN snapshot below is leftover from the D61 Posit pin. ASCII only.
# eRm 1.0.10, bnlearn, and gRain are not in that snapshot. The script
# sources install-cran-delta.R at the end (the same file the Dockerfile
# runs) so a from-scratch rebuild gets the v2.7 set from current CRAN.

repos <- Sys.getenv(
  "CRAN",
  unset = "https://packagemanager.posit.co/cran/__linux__/jammy/2025-01-15"
)
options(repos = c(CRAN = repos))

pkgs <- c(
  "plumber",
  "jsonlite",
  "mirt",
  "GDINA",
  "TAM",
  "difR",
  "equate",
  "plink",
  "ggplot2",
  "svglite"
)

install.packages(pkgs, dependencies = TRUE, Ncpus = max(1L, parallel::detectCores() - 1L))

missing <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing) > 0) {
  stop("Failed to install: ", paste(missing, collapse = ", "))
}

cat("Installed package versions:\n")
for (p in pkgs) {
  cat(sprintf("  %s %s\n", p, as.character(utils::packageVersion(p))))
}

delta_path <- "install-cran-delta.R"
cmd_args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", cmd_args, value = TRUE)
if (length(file_arg)) {
  delta_path <- file.path(
    dirname(normalizePath(sub("^--file=", "", file_arg[[1]]))),
    "install-cran-delta.R"
  )
}
if (!file.exists(delta_path)) {
  stop("install-cran-delta.R not found next to install-packages.R", call. = FALSE)
}
source(delta_path)
