# test-bn-calibration.R
# TU12. A small simulated latent tree. EM should recover the conditional
# probability tables that generated the responses. Base R only.
#
#   Rscript r-backend/app/tests/test-bn-calibration.R

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
source(file.path(app_dir, "modules", "bnCalibrate.R"), local = FALSE)

.stop_if <- function(cond, msg) {
  if (isTRUE(cond)) stop(msg, call. = FALSE)
}

.near <- function(got, expected, tol, label) {
  if (!is.finite(got) || abs(got - expected) > tol) {
    stop(sprintf("%s got %.4f, expected %.4f (tol %.3f)", label, got, expected, tol), call. = FALSE)
  }
}

.roundtrip <- function(body) {
  json <- jsonlite::toJSON(body, auto_unbox = TRUE, null = "null", digits = 10)
  jsonlite::fromJSON(json, simplifyVector = TRUE, simplifyDataFrame = FALSE)
}

.res <- function() {
  env <- new.env(parent = emptyenv())
  env$status <- 200L
  env
}

minimal_matrix <- function() {
  list(
    personIds = c("p1", "p2"),
    itemIds = c("o1", "o2"),
    data = list(c(1, 0), c(0, 1))
  )
}

star_network <- function() {
  list(
    latents = list(list(
      id = "smvA",
      states = c("not_mastered", "mastered"),
      parentId = NULL
    )),
    observables = list(
      list(id = "o1", parentId = "smvA"),
      list(id = "o2", parentId = "smvA"),
      list(id = "o3", parentId = "smvA")
    )
  )
}

tree_network <- function() {
  list(
    latents = list(
      list(id = "smvA", states = c("not_mastered", "mastered"), parentId = NULL),
      list(id = "smvB", states = c("low", "high"), parentId = "smvA")
    ),
    observables = list(
      list(id = "o1", parentId = "smvA"),
      list(id = "o2", parentId = "smvA"),
      list(id = "o3", parentId = "smvB"),
      list(id = "o4", parentId = "smvB")
    )
  )
}

# Contract refuses a bn request that does not name the tree.
bare <- list(
  contractVersion = "1.0",
  jobId = "job-bare",
  model = list(family = "bn", itemIds = c("o1", "o2")),
  responseMatrix = minimal_matrix(),
  options = list(seed = 1)
)
bare_errors <- validate_calibration_request(.roundtrip(bare))
.stop_if(is.null(bare_errors), "a bn request without a network must be refused")
.stop_if(!any(grepl("model.network", bare_errors)), "missing network must be named")

cycle <- bare
cycle$model$network <- list(
  latents = list(
    list(id = "a", states = c("no", "yes"), parentId = "b"),
    list(id = "b", states = c("no", "yes"), parentId = "a")
  ),
  observables = list(
    list(id = "o1", parentId = "a"),
    list(id = "o2", parentId = "b")
  )
)
cycle$model$itemIds <- c("o1", "o2")
cycle_errors <- validate_calibration_request(.roundtrip(cycle))
.stop_if(is.null(cycle_errors) || !any(grepl("cycle", cycle_errors)), "a latent cycle must be refused")

# Draw binary responses from a known star, then from a known tree.
draw_bernoulli <- function(parent_state, probs) {
  stats::rbinom(length(parent_state), 1, probs[parent_state])
}

sample_star <- function(n, seed) {
  set.seed(seed)
  # P(mastered) = 0.55. P(u=1 | not, mastered) below.
  latent <- sample.int(2, n, replace = TRUE, prob = c(0.45, 0.55))
  p1 <- c(0.20, 0.80)
  p2 <- c(0.30, 0.90)
  p3 <- c(0.15, 0.75)
  data <- cbind(
    draw_bernoulli(latent, p1),
    draw_bernoulli(latent, p2),
    draw_bernoulli(latent, p3)
  )
  # A handful of missing cells. They must not be treated as wrong.
  data[1, 2] <- NA
  data[2, 3] <- NA
  list(data = data, latent = latent)
}

sample_tree <- function(n, seed) {
  set.seed(seed)
  # P(mastered) = 0.60
  # P(high | not) = 0.20, P(high | mastered) = 0.80
  parent <- sample.int(2, n, replace = TRUE, prob = c(0.40, 0.60))
  child <- integer(n)
  child[parent == 1] <- sample.int(2, sum(parent == 1), replace = TRUE, prob = c(0.80, 0.20))
  child[parent == 2] <- sample.int(2, sum(parent == 2), replace = TRUE, prob = c(0.20, 0.80))
  data <- cbind(
    draw_bernoulli(parent, c(0.25, 0.85)),
    draw_bernoulli(parent, c(0.15, 0.75)),
    draw_bernoulli(child, c(0.20, 0.90)),
    draw_bernoulli(child, c(0.30, 0.80))
  )
  data[3, 1] <- NA
  data[4, 4] <- NA
  list(data = data)
}

run_bn <- function(network, item_ids, data, seed) {
  n <- nrow(data)
  rows <- lapply(seq_len(n), function(i) as.numeric(data[i, ]))
  body <- list(
    contractVersion = "1.0",
    jobId = "job-bn",
    model = list(family = "bn", itemIds = item_ids, network = network),
    responseMatrix = list(
      personIds = sprintf("p%03d", seq_len(n)),
      itemIds = item_ids,
      data = rows
    ),
    options = list(seed = seed, maxIterations = 300)
  )
  res <- .res()
  out <- calibrate_bn(.roundtrip(body), res)
  if (res$status != 200 && res$status != 200L) {
    msg <- if (!is.null(out$error$message)) out$error$message else paste("status", res$status)
    stop(paste("bn fit failed:", msg), call. = FALSE)
  }
  .stop_if(!isTRUE(out$converged), "EM did not converge")
  .stop_if(is.null(out$fitStatistics$bnFit), "bnFit summary missing")
  .stop_if(!is.null(out$fitStatistics$bnFit$persons), "bnFit must not carry person rows")
  .stop_if(length(out$bnPersonPosteriors) != n, "one posterior row per person")
  .stop_if(!identical(out$parameters$`_kind`, "bayesian-cpt"), "parameters must be a bayesian-cpt")
  out
}

tol <- 0.08
star <- sample_star(2000, 1461201)
star_out <- run_bn(star_network(), c("o1", "o2", "o3"), star$data, 14612)
.near(star_out$parameters$`_prior`[["mastered"]], 0.55, tol, "star prior mastered")
.near(star_out$parameters$o1$levels[["not_mastered"]], 0.20, tol, "star o1 not_mastered")
.near(star_out$parameters$o1$levels[["mastered"]], 0.80, tol, "star o1 mastered")
.near(star_out$parameters$o2$levels[["not_mastered"]], 0.30, tol, "star o2 not_mastered")
.near(star_out$parameters$o2$levels[["mastered"]], 0.90, tol, "star o2 mastered")
.near(star_out$parameters$o3$levels[["not_mastered"]], 0.15, tol, "star o3 not_mastered")
.near(star_out$parameters$o3$levels[["mastered"]], 0.75, tol, "star o3 mastered")
.stop_if(star_out$fitStatistics$bnFit$meanAbsResidual > 0.05, "star mean absolute residual is too large")
.stop_if(!is.finite(star_out$fitStatistics$bnFit$logLik), "star logLik")
.stop_if(!is.finite(star_out$fitStatistics$bnFit$aic), "star AIC")
.stop_if(!is.finite(star_out$fitStatistics$bnFit$bic), "star BIC")
.stop_if(!is.null(star_out$parameters$`_tree`), "a one-latent network is a star, not a tree")
cat("star CPT recovery ok\n")

tree <- sample_tree(2500, 1461202)
tree_out <- run_bn(tree_network(), c("o1", "o2", "o3", "o4"), tree$data, 14613)
.near(tree_out$parameters$`_prior`$smvA[["mastered"]], 0.60, tol, "tree prior mastered")
.near(tree_out$parameters$smvB$not_mastered[["high"]], 0.20, tol, "tree P(high|not)")
.near(tree_out$parameters$smvB$mastered[["high"]], 0.80, tol, "tree P(high|mastered)")
.near(tree_out$parameters$o1$levels[["not_mastered"]], 0.25, tol, "tree o1 not")
.near(tree_out$parameters$o1$levels[["mastered"]], 0.85, tol, "tree o1 mastered")
.near(tree_out$parameters$o3$levels[["low"]], 0.20, tol, "tree o3 low")
.near(tree_out$parameters$o3$levels[["high"]], 0.90, tol, "tree o3 high")
.near(tree_out$parameters$o4$levels[["low"]], 0.30, tol, "tree o4 low")
.near(tree_out$parameters$o4$levels[["high"]], 0.80, tol, "tree o4 high")
.stop_if(!isTRUE(tree_out$parameters$`_tree`), "a two-latent network must set _tree")
.stop_if(tree_out$fitStatistics$bnFit$meanAbsResidual > 0.05, "tree mean absolute residual is too large")
.stop_if(tree_out$fitStatistics$bnFit$nParameters < 1, "tree nParameters")
cat("tree CPT recovery ok\n")

# A non-binary cell is refused. It is not scored as a category.
bad <- list(
  contractVersion = "1.0",
  jobId = "job-bad",
  model = list(family = "bn", itemIds = c("o1", "o2", "o3"), network = star_network()),
  responseMatrix = list(
    personIds = c("p1", "p2"),
    itemIds = c("o1", "o2", "o3"),
    data = list(c(1, 0, 2), c(0, 1, 0))
  ),
  options = list(seed = 1)
)
bad_res <- .res()
bad_out <- calibrate_bn(.roundtrip(bad), bad_res)
.stop_if(bad_res$status != 400, "a non-binary cell must be HTTP 400")
.stop_if(isTRUE(bad_out$converged), "a non-binary cell must not converge")
cat("non-binary refusal ok\n")

cat("R Bayesian network calibration tests passed\n")
