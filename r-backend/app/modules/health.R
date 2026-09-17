# modules/health.R
# GET /health reports exact running package versions (ADR 0002 provenance).
# Versions are read from the session, never hardcoded.

HEALTH_PACKAGES <- c("mirt", "GDINA", "TAM", "difR", "equate", "plink", "plumber", "jsonlite")

# jsonlite is a declared runtime package (see Dockerfile /health). Used
# here only to unbox length-1 character vectors in the payload.
library(jsonlite)

.pkg_version <- function(pkg) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    as.character(utils::packageVersion(pkg))
  } else {
    NA_character_
  }
}

.unbox_chr <- function(x) {
  if (is.na(x) || is.null(x)) return(NA_character_)
  jsonlite::unbox(as.character(x))
}

health_payload <- function() {
  versions <- lapply(HEALTH_PACKAGES, function(pkg) .unbox_chr(.pkg_version(pkg)))
  names(versions) <- HEALTH_PACKAGES
  workers_env <- Sys.getenv("R_WORKERS", unset = "1")
  workers <- suppressWarnings(as.integer(workers_env))
  if (is.na(workers) || workers < 1L) workers <- 1L
  list(
    status = jsonlite::unbox("healthy"),
    timestamp = .unbox_chr(format(Sys.time(), tz = "UTC", usetz = TRUE)),
    rVersion = .unbox_chr(paste(R.version$major, R.version$minor, sep = ".")),
    packages = versions,
    # D87: pin reported workers to R_WORKERS (compose sets 1).
    workers = jsonlite::unbox(workers),
    plan = jsonlite::unbox("sequential")
  )
}
