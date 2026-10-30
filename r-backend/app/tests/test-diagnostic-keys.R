# TU15: DINA/G-DINA output keys. The helper cases always run.
# When GDINA is installed, a tiny fit must emit those keys.
# Run with:
#   Rscript r-backend/app/tests/test-diagnostic-keys.R

app_dir <- Sys.getenv("R_BACKEND_APP_DIR", unset = "")
if (!nzchar(app_dir)) {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  if (length(file_arg)) {
    here <- dirname(normalizePath(sub("^--file=", "", file_arg)))
    app_dir <- dirname(here)
  } else {
    app_dir <- file.path(getwd(), "r-backend", "app")
  }
}

source(file.path(app_dir, "modules", "contract.R"), local = FALSE)
source(file.path(app_dir, "modules", "calibrate.R"), local = FALSE)

.stop_if <- function(cond, msg) {
  if (cond) stop(msg, call. = FALSE)
}

items <- c("item-a", "item-b", "item-c")
legacy <- diagnostic_parameter_keys(items, NULL)
.stop_if(!identical(legacy$keys, items), "legacy keys must be the item ids")

fresh <- diagnostic_parameter_keys(items, c("obs-a", "obs-b", "obs-c"))
.stop_if(!identical(fresh$keys, c("obs-a", "obs-b", "obs-c")), "new keys must be observable ids")

mixed <- diagnostic_parameter_keys(items, c("obs-a", "", "obs-c"))
.stop_if(!identical(mixed$keys, c("obs-a", "item-b", "obs-c")), "mixed keys must keep the blank column on the item id")

shared <- diagnostic_parameter_keys(items, c("obs-a", "obs-a", "obs-c"))
.stop_if(
  !identical(shared$keys, c("item-a", "item-b", "obs-c")),
  "a repeated observable must not shadow the other column"
)

if (!requireNamespace("GDINA", quietly = TRUE)) {
  cat("R diagnostic key tests passed (GDINA not installed; fit skipped)\n")
  quit(status = 0)
}

set.seed(20261120)
n <- 400L
alpha <- stats::rbinom(n, 1L, 0.5)
draw <- function(slip, guess) {
  ifelse(alpha == 1, stats::rbinom(n, 1L, 1 - slip), stats::rbinom(n, 1L, guess))
}
dat <- cbind(draw(0.1, 0.2), draw(0.15, 0.1), draw(0.05, 0.25))
rows <- lapply(seq_len(n), function(i) as.list(dat[i, ]))

base <- list(
  jobId = "job-tu15",
  contractVersion = "1.0",
  model = list(
    family = "dina",
    itemIds = as.list(items)
  ),
  responseMatrix = list(
    personIds = as.list(sprintf("p%03d", seq_len(n))),
    itemIds = as.list(items),
    data = rows
  ),
  qMatrix = list(
    attributeIds = list("A1"),
    itemIds = as.list(items),
    data = list(list(1), list(1), list(1))
  ),
  options = list(seed = 20261120L, maxIterations = 500L, convergenceTolerance = 1e-3)
)

.fit <- function(family, observable_ids) {
  body <- base
  body$model$family <- family
  if (!is.null(observable_ids)) body$model$observableIds <- as.list(observable_ids)
  res <- new.env(parent = emptyenv())
  out <- calibrate_diagnostic(body, res)
  .stop_if(!isTRUE(out$converged), paste0(
    family, " fit did not converge: ",
    tryCatch(out$error$message, error = function(e) "no message")
  ))
  out
}

observable_fit <- .fit("dina", c("obs-a", "obs-b", "obs-c"))
.stop_if(
  !identical(names(observable_fit$parameters), c("obs-a", "obs-b", "obs-c")),
  paste0("DINA output keys were ", paste(names(observable_fit$parameters), collapse = ", "))
)
.stop_if(is.null(observable_fit$parameters[["obs-a"]]$slip), "DINA slip missing under the observable id")
.stop_if(is.null(observable_fit$parameters[["obs-a"]]$guess), "DINA guess missing under the observable id")

legacy_fit <- .fit("dina", NULL)
.stop_if(
  !identical(names(legacy_fit$parameters), items),
  "a request with no observableIds must still key slip/guess by item id"
)

mixed_fit <- .fit("gdina", c("obs-a", "", "obs-c"))
.stop_if(
  !identical(names(mixed_fit$parameters), c("obs-a", "item-b", "obs-c")),
  paste0("G-DINA mixed keys were ", paste(names(mixed_fit$parameters), collapse = ", "))
)
.stop_if(
  is.null(mixed_fit$parameters[["obs-a"]]$probabilities),
  "G-DINA probabilities missing under the observable id"
)
.stop_if(
  is.null(mixed_fit$parameters[["item-b"]]$probabilities),
  "G-DINA probabilities missing under the item fallback"
)

cat("R diagnostic key tests passed\n")
