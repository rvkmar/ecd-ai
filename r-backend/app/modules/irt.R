# modules/irt.R
# Legacy IRT helpers. The live plumber router lives in api.R and does not
# call irt_api(). Per-student /irt/estimate is scoring and is not mounted
# (ADR 0001: R is never in a session path).
#
# Parallel futures() is not used. GET /irt/parallel-status used to throw
# "no applicable method for 'futures' applied to an object of class logical"
# because future::futures() does not list running futures.

library(jsonlite)

.as_num <- function(x, default = NA_real_) {
  if (is.null(x)) return(default)
  suppressWarnings(as.numeric(x))
}

# Kept for local experiments. Not attached to the live router.
irt_api_is_mounted <- FALSE
