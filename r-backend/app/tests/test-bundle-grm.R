# test-bundle-grm.R
# TU6. Collapse a shared-stimulus group to one sum and fit it as GRM.
# The matrix is simulated. LSAT7 stays an unbundled 2PL in
# test-model-criticism.R. No bundles leaves that path unchanged.
#
#   Rscript r-backend/app/tests/test-bundle-grm.R

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
source(file.path(app_dir, "modules", "bundleScoring.R"), local = FALSE)
source(file.path(app_dir, "modules", "reportHtml.R"), local = FALSE)
source(file.path(app_dir, "modules", "modelCriticism.R"), local = FALSE)
source(file.path(app_dir, "modules", "calibrate.R"), local = FALSE)

.stop_if <- function(cond, msg) {
  if (isTRUE(cond)) stop(msg, call. = FALSE)
}

# Collapse without fitting. A missing member stays missing.
toy <- data.frame(
  A = c(1, 0, 1),
  P1 = c(1, 0, 1),
  B = c(0, 1, 1),
  P2 = c(1, 1, NA),
  P3 = c(0, 1, 1)
)
collapsed <- .collapse_scoring_bundles(toy, list(list(
  id = "passage_1",
  basis = "passage",
  sourceId = "stem",
  itemIds = c("P1", "P2", "P3")
)))
.stop_if(!identical(colnames(collapsed$df), c("A", "passage_1", "B")), "bundle replaces the first member and drops the rest")
.stop_if(!identical(as.integer(collapsed$df$passage_1), c(2L, 2L, NA_integer_)), "row 3 stays NA when a member is missing; rows 1 and 2 sum")
.stop_if(collapsed$applied[[1]]$model != "GRM", "applied bundle is GRM")
.stop_if(collapsed$applied[[1]]$maxScore != 3L, "max score is the member count")
.stop_if(!identical(unlist(collapsed$applied[[1]]$itemIds), c("P1", "P2", "P3")), "member ids are kept")

untouched <- .collapse_scoring_bundles(toy, NULL)
.stop_if(!identical(colnames(untouched$df), colnames(toy)), "no bundles leaves the columns")
.stop_if(length(untouched$applied) != 0L, "no bundles leaves the summary empty")

# jsonlite's simplifyVector=TRUE shape, the same parser calibrate.R uses.
payload <- jsonlite::fromJSON(
  '{"id":"passage_1","itemIds":["P1","P2","P3"],"basis":"passage","sourceId":"stem"}',
  simplifyVector = TRUE,
  simplifyDataFrame = FALSE
)
from_json <- .collapse_scoring_bundles(toy, list(payload))
.stop_if(!identical(colnames(from_json$df), c("A", "passage_1", "B")), "JSON bundle collapses the same way")

require_pkgs <- nzchar(Sys.getenv("ECD_REQUIRE_MODEL_CRITICISM_PACKAGES", unset = ""))
if (require_pkgs && !requireNamespace("mirt", quietly = TRUE)) {
  stop("mirt is required for the bundle GRM fixture", call. = FALSE)
}

if (requireNamespace("mirt", quietly = TRUE)) {
  set.seed(146062)
  n <- 500L
  theta <- rnorm(n)
  draw <- function(b) {
    p <- 1 / (1 + exp(-(theta - b)))
    rbinom(n, 1L, p)
  }
  flip <- function(x, rate = 0.12) {
    noise <- runif(n) < rate
    ifelse(noise, 1L - x, x)
  }
  latent <- draw(0)
  mat <- data.frame(
    A = draw(-0.6),
    B = draw(0.2),
    C = draw(0.8),
    P1 = flip(latent),
    P2 = flip(latent),
    P3 = flip(latent)
  )
  # The three passage items share one latent response, so their residual
  # correlation is the dependence the bundle is meant to absorb.
  person_ids <- as.list(sprintf("s%03d", seq_len(n)))
  item_ids <- as.list(colnames(mat))
  rows <- lapply(seq_len(n), function(i) as.numeric(mat[i, ]))
  body <- list(
    contractVersion = "1.0",
    jobId = "tu6-bundle",
    model = list(family = "irt", subtype = "2PL", itemIds = item_ids),
    responseMatrix = list(personIds = person_ids, itemIds = item_ids, data = rows),
    options = list(seed = 146062L, maxIterations = 500L, convergenceTolerance = 1e-4),
    bundles = list(list(
      id = "passage_1",
      basis = "passage",
      sourceId = "stem",
      itemIds = list("P1", "P2", "P3")
    ))
  )
  res <- new.env()
  out <- calibrate_irt(body, res)
  .stop_if(!isTRUE(out$converged), paste("bundle GRM did not converge:", out$error$message))
  .stop_if(is.null(out$parameters$passage_1), "bundle id is a parameter key")
  .stop_if(!is.null(out$parameters$P1) || !is.null(out$parameters$P2) || !is.null(out$parameters$P3), "member items are not separate parameters")
  .stop_if(is.null(out$parameters$A) || is.null(out$parameters$B) || is.null(out$parameters$C), "independent items stay")
  b <- unlist(out$parameters$passage_1$b, use.names = FALSE)
  .stop_if(length(b) < 2L, "GRM bundle has more than one threshold")
  .stop_if(!all(diff(b) > 0), "GRM thresholds increase")
  .stop_if(!identical(out$parameters$passage_1$model, "GRM"), "bundle model is GRM")
  .stop_if(length(unlist(out$parameters$A$b, use.names = FALSE)) != 1L, "a dichotomous item keeps a scalar difficulty")
  summary_row <- out$scoringBundles[[1]]
  .stop_if(is.null(summary_row), "response carries the bundle summary")
  .stop_if(summary_row$model != "GRM", "summary model is GRM")
  .stop_if(summary_row$maxScore != 3L, "summary max score")
  .stop_if(!identical(unlist(summary_row$itemIds), c("P1", "P2", "P3")), "summary lists the members")
  .stop_if(!is.null(out$fitStatistics$scoringBundles), "bundle summary stays off fitStatistics")
  .stop_if(is.null(out$q3Matrix) || !("passage_1" %in% unlist(out$q3Matrix$itemIds)), "Q3 is on the collapsed columns")
  .stop_if(any(c("P1", "P2", "P3") %in% unlist(out$q3Matrix$itemIds)), "Q3 does not keep the member columns")
  cat("bundle GRM fixture ok\n")
} else {
  cat("mirt not installed; skipped bundle GRM fixture\n")
}

cat("R bundle GRM tests passed\n")
