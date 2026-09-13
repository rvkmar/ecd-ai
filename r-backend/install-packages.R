# install-packages.R
# Installs the W13 psychometric stack from the dated CRAN snapshot set in
# the Dockerfile (CRAN / RENV_CONFIG_REPOS_OVERRIDE). ASCII only.

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
  "difR"
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
