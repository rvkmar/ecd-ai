# modules/lltm.R
# TU19. Linear logistic test model (Fischer 1973). Task Model Variable
# assignments are the item covariates. Item difficulty is a linear
# combination of those covariates.
#
# eRm::LLTM is the joint conditional maximum likelihood fit. eRm's basic
# parameters are easiness, so difficulty effects are their negatives.
# The design has no intercept column: the reference pattern (a row of
# zeros) is fixed at difficulty 0. An intercept is not identified by
# conditional likelihood.
#
# When eRm is not installed, mirt fits a Rasch model (latent mean 0) and
# the difficulties are projected onto the same design plus an intercept.
# That intercept is the reference-pattern difficulty on the mirt scale.
# The column effects are still the contrasts. This path is labeled as a
# linear item-covariate projection, not as eRm::LLTM.

.lltm_num <- function(x) {
  if (is.null(x) || length(x) == 0) return(NA_real_)
  value <- suppressWarnings(as.numeric(x[[1]]))
  if (length(value) != 1 || !is.finite(value)) return(NA_real_)
  value
}

.lltm_finite <- function(x) {
  value <- .lltm_num(x)
  if (!is.finite(value)) NULL else value
}

.lltm_parse_body <- function(req) {
  if (is.list(req$body) && !is.null(req$body$design)) return(req$body)
  raw <- req$postBody
  if (is.raw(raw)) raw <- rawToChar(raw)
  if (is.null(raw) || (is.character(raw) && !any(nzchar(raw)))) return(NULL)
  tryCatch(
    jsonlite::fromJSON(raw, simplifyVector = TRUE, simplifyDataFrame = FALSE),
    error = function(e) NULL
  )
}

.lltm_failure <- function(job_id, message, r_class = "simpleError") {
  list(
    jobId = if (is.null(job_id) || !nzchar(as.character(job_id))) "unknown" else as.character(job_id)[[1]],
    converged = FALSE,
    parameterStatus = "predicted",
    error = list(message = message, rClass = r_class, stderr = "")
  )
}

.lltm_matrix_from_rows <- function(data, n_items) {
  if (is.matrix(data)) return(data)
  if (!is.list(data) || !length(data)) return(NULL)
  rows <- lapply(data, function(row) {
    if (is.null(row)) return(rep(NA_real_, n_items))
    as.numeric(unlist(row, use.names = FALSE))
  })
  widths <- vapply(rows, length, integer(1))
  if (any(widths != n_items)) return(NULL)
  do.call(rbind, rows)
}

# b is a vector of difficulties already on the Rasch scale.
# W has no intercept. The regression adds one, so a constant shift of b
# is absorbed and the column coefficients stay the contrasts.
.lltm_project_difficulties <- function(b, W, column_names) {
  # A perfect projection (the unit check) warns from summary.lm. Real
  # Rasch difficulties are not an exact linear fit, so the warning is noise.
  suppressWarnings(.lltm_project_difficulties_fit(b, W, column_names))
}

.lltm_project_difficulties_fit <- function(b, W, column_names) {
  frame <- as.data.frame(W)
  names(frame) <- column_names
  frame$b <- as.numeric(b)
  fit <- stats::lm(b ~ ., data = frame)
  coefs <- stats::coef(fit)
  ses <- summary(fit)$coefficients[, "Std. Error"]
  V <- stats::vcov(fit)
  intercept <- list(
    estimate = .lltm_finite(coefs[["(Intercept)"]]),
    se = .lltm_finite(ses[["(Intercept)"]])
  )
  effects <- lapply(column_names, function(name) {
    list(
      name = name,
      estimate = .lltm_finite(coefs[[name]]),
      se = .lltm_finite(ses[[name]])
    )
  })
  order_names <- c("(Intercept)", column_names)
  V <- V[order_names, order_names, drop = FALSE]
  list(intercept = intercept, effects = unname(effects), vcov = V, fitted = as.numeric(stats::fitted(fit)))
}

.lltm_delta_se <- function(x, V) {
  if (is.null(V)) return(NULL)
  variance <- as.numeric(t(x) %*% V %*% x)
  if (!is.finite(variance) || variance < 0) return(NULL)
  sqrt(variance)
}

.lltm_effect_list <- function(column_names, estimates, ses) {
  lapply(seq_along(column_names), function(j) {
    list(
      name = column_names[[j]],
      estimate = .lltm_finite(estimates[[j]]),
      se = .lltm_finite(ses[[j]])
    )
  })
}

.lltm_prediction_list <- function(item_ids, b, b_se) {
  lapply(seq_along(item_ids), function(i) {
    list(
      itemId = as.character(item_ids[[i]]),
      b = .lltm_finite(b[[i]]),
      bSe = .lltm_finite(b_se[[i]])
    )
  })
}

.lltm_vcov_rows <- function(V) {
  if (is.null(V)) return(NULL)
  rows <- lapply(seq_len(nrow(V)), function(i) as.numeric(V[i, ]))
  unname(rows)
}

.lltm_fit_erm <- function(X, W, item_ids, column_names) {
  colnames(W) <- column_names
  fit <- eRm::LLTM(X, W, se = TRUE, sum0 = FALSE)
  conv <- fit$convergence
  ok <- isTRUE(conv) || identical(as.integer(conv), 1L) || identical(as.integer(conv), 2L)
  if (!ok) {
    return(list(ok = FALSE, message = paste0("eRm::LLTM did not converge (code ", conv, ").")))
  }
  eta <- fit$etapar
  if (is.null(names(eta)) || !all(column_names %in% names(eta))) {
    if (length(eta) != length(column_names)) {
      return(list(ok = FALSE, message = "eRm::LLTM returned a parameter vector that does not match the design."))
    }
    names(eta) <- column_names
  }
  # eRm basic parameters are easiness. Difficulty = -easiness.
  difficulty <- -as.numeric(eta[column_names])
  names(difficulty) <- column_names
  se <- rep(NA_real_, length(column_names))
  if (!is.null(fit$se.eta) && length(fit$se.eta) == length(eta)) {
    se_eta <- as.numeric(fit$se.eta)
    names(se_eta) <- names(eta)
    se <- as.numeric(se_eta[column_names])
  }
  V <- NULL
  if (!is.null(fit$hessian)) {
    solved <- try(solve(fit$hessian), silent = TRUE)
    if (!inherits(solved, "try-error")) {
      if (is.null(rownames(solved))) {
        rownames(solved) <- names(eta)
        colnames(solved) <- names(eta)
      }
      if (all(column_names %in% rownames(solved))) {
        # Negating every parameter does not change the covariance.
        V <- solved[column_names, column_names, drop = FALSE]
      }
    }
  }
  b <- as.numeric(W %*% difficulty)
  b_se <- vapply(seq_len(nrow(W)), function(i) {
    se_i <- .lltm_delta_se(W[i, ], V)
    if (is.null(se_i)) NA_real_ else se_i
  }, numeric(1))
  version <- paste("eRm", as.character(utils::packageVersion("eRm")))
  list(
    ok = TRUE,
    sourceModel = "eRm::LLTM",
    packageVersion = version,
    normalization = paste(
      "Conditional maximum likelihood (eRm::LLTM).",
      "Difficulty is the negative of eRm easiness.",
      "The reference pattern, every covariate at its reference level, is fixed at 0.",
      "A positive effect means that level is harder than the reference."
    ),
    seMethod = "eRm conditional maximum likelihood",
    logLik = .lltm_finite(fit$loglik),
    intercept = NULL,
    effects = .lltm_effect_list(column_names, difficulty, se),
    predictions = .lltm_prediction_list(item_ids, b, b_se),
    vcov = .lltm_vcov_rows(V),
    sampleSize = nrow(X)
  )
}

.lltm_fit_mirt <- function(X, W, item_ids, column_names) {
  frame <- as.data.frame(X)
  names(frame) <- make.names(item_ids, unique = TRUE)
  fit <- mirt::mirt(frame, 1, itemtype = "Rasch", verbose = FALSE)
  converged <- isTRUE(tryCatch(mirt::extract.mirt(fit, "converged"), error = function(e) FALSE))
  if (!converged) {
    return(list(ok = FALSE, message = "mirt Rasch fit did not converge, so the covariate projection was not run."))
  }
  coefs <- mirt::coef(fit, IRTpars = TRUE, simplify = TRUE)$items
  if (is.null(coefs) || !"b" %in% colnames(coefs)) {
    return(list(ok = FALSE, message = "mirt did not return Rasch difficulties."))
  }
  b <- as.numeric(coefs[, "b"])
  if (length(b) != nrow(W)) {
    return(list(ok = FALSE, message = "mirt difficulty vector does not match the design."))
  }
  projected <- .lltm_project_difficulties(b, W, column_names)
  if (any(vapply(projected$effects, function(effect) is.null(effect$estimate), logical(1)))) {
    return(list(ok = FALSE, message = "The covariate design is singular after the mirt Rasch fit."))
  }
  ones <- rep(1, nrow(W))
  weights <- cbind(ones, W)
  V <- projected$vcov
  b_se <- vapply(seq_len(nrow(W)), function(i) {
    se_i <- .lltm_delta_se(weights[i, ], V)
    if (is.null(se_i)) NA_real_ else se_i
  }, numeric(1))
  version <- paste("mirt", as.character(utils::packageVersion("mirt")))
  list(
    ok = TRUE,
    sourceModel = "mirt Rasch linear item covariates",
    packageVersion = version,
    normalization = paste(
      "mirt Rasch fit with the latent mean fixed at 0, then a linear projection",
      "of those difficulties onto the Task Model Variable design.",
      "Effects are contrasts against the reference level.",
      "The intercept is the reference pattern difficulty on the mirt scale.",
      "This is an item-covariate projection, used when eRm is not installed."
    ),
    seMethod = "linear projection of mirt Rasch difficulties; standard errors ignore first-stage estimation error",
    logLik = NULL,
    intercept = projected$intercept,
    effects = projected$effects,
    predictions = .lltm_prediction_list(item_ids, projected$fitted, b_se),
    vcov = .lltm_vcov_rows(V),
    sampleSize = nrow(X)
  )
}

# responses: persons x items, 0/1, NA allowed.
# W: items x covariates, no intercept column, full column rank.
fit_lltm_matrix <- function(X, W, item_ids, column_names) {
  if (!is.matrix(X) || !is.numeric(X)) {
    return(list(ok = FALSE, message = "Response matrix must be numeric."))
  }
  if (!is.matrix(W) || !is.numeric(W)) {
    return(list(ok = FALSE, message = "Design matrix must be numeric."))
  }
  if (nrow(W) != ncol(X)) {
    return(list(ok = FALSE, message = "Design rows must match response columns."))
  }
  if (length(column_names) != ncol(W)) {
    return(list(ok = FALSE, message = "columnNames must match the design width."))
  }
  if (length(item_ids) != ncol(X)) {
    return(list(ok = FALSE, message = "itemIds must match the response columns."))
  }
  complete <- stats::complete.cases(X)
  if (sum(complete) < 2) {
    return(list(ok = FALSE, message = "LLTM needs at least two persons with a response on every fitted item."))
  }
  X <- X[complete, , drop = FALSE]
  varying <- apply(W, 2, function(col) length(unique(col[is.finite(col)])) > 1)
  if (any(!varying)) {
    return(list(ok = FALSE, message = "A design column does not vary. Drop it before fitting."))
  }
  if (qr(W)$rank < ncol(W)) {
    return(list(ok = FALSE, message = "The covariate design is not full rank."))
  }
  if (requireNamespace("eRm", quietly = TRUE)) {
    return(.lltm_fit_erm(X, W, item_ids, column_names))
  }
  if (requireNamespace("mirt", quietly = TRUE)) {
    return(.lltm_fit_mirt(X, W, item_ids, column_names))
  }
  list(ok = FALSE, message = "LLTM needs eRm or mirt, and neither is installed.")
}

lltm_dispatch <- function(req, res) {
  body <- .lltm_parse_body(req)
  job_id <- if (is.list(body)) body$jobId else NULL
  if (is.null(body) || !is.list(body)) {
    res$status <- 400
    return(.lltm_failure(job_id, "Request body must be a JSON object."))
  }
  rm <- body$responseMatrix
  design <- body$design
  if (is.null(rm) || is.null(design)) {
    res$status <- 400
    return(.lltm_failure(job_id, "responseMatrix and design are required."))
  }
  item_ids <- as.character(unlist(rm$itemIds, use.names = FALSE))
  column_names <- as.character(unlist(design$columnNames, use.names = FALSE))
  if (length(item_ids) < 2) {
    res$status <- 400
    return(.lltm_failure(job_id, "responseMatrix.itemIds must name at least two items."))
  }
  if (length(column_names) < 1) {
    res$status <- 400
    return(.lltm_failure(job_id, "design.columnNames must name at least one covariate."))
  }
  X <- .lltm_matrix_from_rows(rm$data, length(item_ids))
  W <- .lltm_matrix_from_rows(design$rows, length(column_names))
  if (is.null(X) || is.null(W)) {
    res$status <- 400
    return(.lltm_failure(job_id, "Response rows must match itemIds, and design rows must match columnNames."))
  }
  if (nrow(W) != length(item_ids)) {
    res$status <- 400
    return(.lltm_failure(job_id, "design.rows must have one row per itemId."))
  }
  fitted <- tryCatch(
    fit_lltm_matrix(X, W, item_ids, column_names),
    error = function(e) list(ok = FALSE, message = conditionMessage(e))
  )
  if (!isTRUE(fitted$ok)) {
    res$status <- 400
    return(.lltm_failure(job_id, fitted$message))
  }
  fitted$ok <- NULL
  fitted$jobId <- if (is.null(job_id)) "lltm" else as.character(job_id)[[1]]
  fitted$converged <- TRUE
  fitted$parameterStatus <- "predicted"
  fitted
}
