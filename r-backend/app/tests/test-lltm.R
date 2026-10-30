# test-lltm.R
# TU19. Recover known Task Model Variable effects on a simulated Rasch
# sample. eRm::LLTM is the joint fit. The linear projection used when
# only mirt is installed is checked on a shifted difficulty vector, and
# the full mirt path runs when mirt is installed.
#
#   Rscript r-backend/app/tests/test-lltm.R

app_dir <- Sys.getenv("R_BACKEND_APP_DIR", unset = "")
if (!nzchar(app_dir)) {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  if (length(file_arg)) {
    here <- dirname(normalizePath(sub("^--file=", "", file_arg[[1]])))
    app_dir <- dirname(here)
  } else {
    app_dir <- file.path(getwd(), "r-backend", "app")
  }
}

source(file.path(app_dir, "modules", "lltm.R"), local = FALSE)

.stop_if <- function(cond, msg) {
  if (isTRUE(cond)) stop(msg, call. = FALSE)
}

effect_named <- function(fit, name) {
  hits <- Filter(function(effect) identical(effect$name, name), fit$effects)
  .stop_if(length(hits) != 1, paste("missing effect", name))
  hits[[1]]$estimate
}

# Projection: a constant shift of difficulty must not change contrasts.
W_small <- rbind(c(0, 0), c(1, 0), c(0, 1), c(1, 1))
colnames(W_small) <- c("c1", "c2")
true_small <- c(0.8, -0.5)
b_small <- as.numeric(W_small %*% true_small) + 0.35
projected <- .lltm_project_difficulties(b_small, W_small, c("c1", "c2"))
.stop_if(abs(projected$effects[[1]]$estimate - 0.8) > 1e-8, "projection c1")
.stop_if(abs(projected$effects[[2]]$estimate - (-0.5)) > 1e-8, "projection c2")
.stop_if(abs(projected$intercept$estimate - 0.35) > 1e-8, "projection intercept absorbs the shift")
contrast <- projected$fitted[2] - projected$fitted[1]
.stop_if(abs(contrast - 0.8) > 1e-8, "projected difficulty contrast")

has_erm <- requireNamespace("eRm", quietly = TRUE)
has_mirt <- requireNamespace("mirt", quietly = TRUE)
require_engine <- identical(Sys.getenv("ECD_REQUIRE_LLTM_PACKAGES", unset = ""), "1")
if (!has_erm && !has_mirt) {
  if (require_engine) stop("LLTM recovery needs eRm or mirt", call. = FALSE)
  message("LLTM recovery skipped: neither eRm nor mirt is installed")
  quit(status = 0)
}

# D155-shaped family: bloom (remember is the reference) x register
# (formal is the reference). Eight items, four covariates, no intercept.
set.seed(20261030)
bloom <- c("remember", "understand", "apply", "analyze")
register <- c("formal", "informal")
grid <- expand.grid(bloom = bloom, register = register, stringsAsFactors = FALSE)
# Column order: understand, apply, analyze, informal.
W <- cbind(
  as.numeric(grid$bloom == "understand"),
  as.numeric(grid$bloom == "apply"),
  as.numeric(grid$bloom == "analyze"),
  as.numeric(grid$register == "informal")
)
column_names <- c("bloom=understand", "bloom=apply", "bloom=analyze", "register=informal")
colnames(W) <- column_names
true_effects <- c(0.30, 0.70, 1.10, -0.40)
names(true_effects) <- column_names
b <- as.numeric(W %*% true_effects)
n_persons <- 1500
theta <- rnorm(n_persons)
prob <- plogis(outer(theta, b, "-"))
X <- matrix(rbinom(length(prob), 1, prob), n_persons, nrow(W))
item_ids <- paste0("item-", seq_len(nrow(W)))

fitted <- fit_lltm_matrix(X, W, item_ids, column_names)
.stop_if(!isTRUE(fitted$ok), paste("fit failed:", fitted$message))
.stop_if(!nzchar(fitted$sourceModel), "source model")
if (has_erm) {
  .stop_if(fitted$sourceModel != "eRm::LLTM", "eRm is installed, so the joint LLTM should run")
}

for (name in column_names) {
  estimate <- effect_named(fitted, name)
  truth <- true_effects[[name]]
  .stop_if(
    abs(estimate - truth) > 0.20,
    paste(name, "estimate", estimate, "truth", truth)
  )
  .stop_if(sign(estimate) != sign(truth), paste(name, "has the wrong sign"))
}

# Item contrasts equal the covariate effects under this coding.
# remember/formal is row 1 (all zeros). understand/formal is row 2.
pred_b <- vapply(fitted$predictions, function(row) row$b, numeric(1))
.stop_if(abs((pred_b[2] - pred_b[1]) - effect_named(fitted, "bloom=understand")) > 1e-6,
  "understand contrast does not match the effect")
# informal on remember is the last of the formal block? expand.grid varies
# bloom fastest, so row 5 is remember/informal.
.stop_if(abs((pred_b[5] - pred_b[1]) - effect_named(fitted, "register=informal")) > 1e-6,
  "informal contrast does not match the effect")

if (has_mirt && !has_erm) {
  .stop_if(
    fitted$sourceModel != "mirt Rasch linear item covariates",
    "mirt fallback source model"
  )
}

message("LLTM recovery passed (", fitted$sourceModel, ")")
