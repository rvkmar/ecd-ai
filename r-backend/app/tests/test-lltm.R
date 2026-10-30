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
# Names with '=' are what the node design sends (tmv=level). lm() would
# rewrite those, so the lookup is by column position.
W_small <- rbind(c(0, 0), c(1, 0), c(0, 1), c(1, 1))
eq_names <- c("bloom=apply", "register=informal")
colnames(W_small) <- eq_names
true_small <- c(0.8, -0.5)
b_small <- as.numeric(W_small %*% true_small) + 0.35
projected <- .lltm_project_difficulties(b_small, W_small, eq_names)
.stop_if(abs(projected$effects[[1]]$estimate - 0.8) > 1e-8, "projection bloom=apply")
.stop_if(abs(projected$effects[[2]]$estimate - (-0.5)) > 1e-8, "projection register=informal")
.stop_if(!identical(projected$effects[[1]]$name, "bloom=apply"), "effect name keeps the equals sign")
.stop_if(abs(projected$intercept$estimate - 0.35) > 1e-8, "projection intercept absorbs the shift")
contrast <- projected$fitted[2] - projected$fitted[1]
.stop_if(abs(contrast - 0.8) > 1e-8, "projected difficulty contrast")

has_erm <- requireNamespace("eRm", quietly = TRUE)
has_mirt <- requireNamespace("mirt", quietly = TRUE)
require_engine <- identical(Sys.getenv("ECD_REQUIRE_LLTM_PACKAGES", unset = ""), "1")
# CI's r-backend image has mirt and not eRm. The flag means that mirt path
# must run. eRm is optional and is not required on the image.
if (require_engine && !has_mirt) {
  stop("LLTM recovery in CI needs mirt (eRm is not required)", call. = FALSE)
}
if (!has_erm && !has_mirt) {
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

check_recovery <- function(fitted, label) {
  .stop_if(!isTRUE(fitted$ok), paste(label, "fit failed:", fitted$message))
  .stop_if(!nzchar(fitted$sourceModel), paste(label, "source model"))
  for (name in column_names) {
    estimate <- effect_named(fitted, name)
    truth <- true_effects[[name]]
    .stop_if(
      abs(estimate - truth) > 0.20,
      paste(label, name, "estimate", estimate, "truth", truth)
    )
    .stop_if(sign(estimate) != sign(truth), paste(label, name, "has the wrong sign"))
  }
  pred_b <- vapply(fitted$predictions, function(row) row$b, numeric(1))
  .stop_if(
    abs((pred_b[2] - pred_b[1]) - effect_named(fitted, "bloom=understand")) > 1e-6,
    paste(label, "understand contrast does not match the effect")
  )
  .stop_if(
    abs((pred_b[5] - pred_b[1]) - effect_named(fitted, "register=informal")) > 1e-6,
    paste(label, "informal contrast does not match the effect")
  )
  message("LLTM recovery passed (", label, ", ", fitted$sourceModel, ")")
}

# Default engine: eRm when installed, otherwise mirt. CI has only mirt.
fitted <- fit_lltm_matrix(X, W, item_ids, column_names)
if (has_erm) {
  .stop_if(fitted$sourceModel != "eRm::LLTM", "eRm is installed, so the default fit should be the joint LLTM")
}
if (!has_erm && has_mirt) {
  .stop_if(
    fitted$sourceModel != "mirt Rasch linear item covariates",
    "without eRm the default fit should be the mirt projection"
  )
}
check_recovery(fitted, "default")

# The published image has mirt and not eRm. Run that path even when eRm
# is also installed, so a name with '=' cannot regress unnoticed.
if (has_mirt) {
  mirt_fit <- fit_lltm_matrix(X, W, item_ids, column_names, engine = "mirt")
  .stop_if(
    mirt_fit$sourceModel != "mirt Rasch linear item covariates",
    "engine mirt source model"
  )
  check_recovery(mirt_fit, "mirt")
}
