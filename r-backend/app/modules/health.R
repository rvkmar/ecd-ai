# modules/health.R
# GET /health reports exact running package versions (ADR 0002 provenance).
# Versions are read from the session, never hardcoded.

HEALTH_PACKAGES <- c("mirt", "GDINA", "TAM", "difR", "plumber", "jsonlite")

.pkg_version <- function(pkg) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    as.character(utils::packageVersion(pkg))
  } else {
    NA_character_
  }
}

health_payload <- function() {
  versions <- lapply(HEALTH_PACKAGES, .pkg_version)
  names(versions) <- HEALTH_PACKAGES
  list(
    status = "healthy",
    timestamp = format(Sys.time(), tz = "UTC", usetz = TRUE),
    rVersion = paste(R.version$major, R.version$minor, sep = "."),
    packages = versions
  )
}
