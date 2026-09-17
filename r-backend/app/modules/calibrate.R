# modules/calibrate.R
# ADR 0002 calibration endpoints. IRT (mirt), DINA/G-DINA (GDINA), and
# CTT (TAM::tam.ctt). Null in the response matrix means not administered,
# never 0.

.parse_json_body <- function(req) {
  # Programmatic plumber sometimes fills req$body (already parsed) and
  # leaves postBody empty, or gives postBody as raw bytes.
  if (is.list(req$body) && !is.null(req$body$model)) {
    return(req$body)
  }
  raw <- req$postBody
  if (is.raw(raw)) raw <- rawToChar(raw)
  if (is.null(raw) || (is.character(raw) && !any(nzchar(raw)))) {
    return(NULL)
  }
  tryCatch(
    # simplifyVector=TRUE turns the 1000x5 LSAT7 array into a matrix.
    # simplifyVector=FALSE keeps a list-of-lists; both are accepted by
    # response_matrix_to_df.
    jsonlite::fromJSON(raw, simplifyVector = TRUE, simplifyDataFrame = FALSE),
    error = function(e) NULL
  )
}

.failure <- function(job_id, message, r_class = "simpleError", stderr = "") {
  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = if (is.null(job_id) || !nzchar(.as_char(job_id))) "unknown" else .as_char(job_id),
    converged = FALSE,
    error = list(
      message = message,
      rClass = r_class,
      stderr = stderr
    )
  )
}

# Finite integer seed or NULL (caller returns .failure). D90: never set.seed(NA).
.require_seed <- function(opts) {
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  if (is.null(opts) || is.null(opts$seed)) return(NULL)
  seed <- suppressWarnings(as.integer(.first(opts$seed)))
  if (length(seed) == 0 || is.na(seed)) NULL else seed
}

calibrate_not_implemented <- function(req, res, family, day) {
  body <- .parse_json_body(req)
  job_id <- if (!is.null(body$jobId)) .as_char(body$jobId) else "unknown"
  res$status <- 501
  .failure(
    job_id,
    paste0(family, " calibration is not implemented until ", day),
    r_class = "NotImplemented"
  )
}

calibrate_dispatch <- function(req, res, family) {
  body <- .parse_json_body(req)
  if (is.null(body)) {
    res$status <- 400
    return(.failure(NULL, "Invalid JSON body", "InvalidJSON"))
  }

  req_errors <- validate_calibration_request(body)
  if (!is.null(req_errors)) {
    res$status <- 400
    return(.failure(body$jobId, paste(req_errors, collapse = "; "), "ContractError"))
  }

  requested_family <- .as_char(body$model$family)
  if (identical(family, "irt")) {
    if (!identical(requested_family, "irt")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'irt', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_irt(body, res))
  }

  if (family %in% c("dina", "gdina")) {
    if (!requested_family %in% c("dina", "gdina")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'dina' or 'gdina', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_diagnostic(body, res))
  }

  if (identical(family, "ctt")) {
    if (!identical(requested_family, "ctt")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'ctt', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_ctt(body, res))
  }

  if (identical(family, "dif")) {
    if (!identical(requested_family, "dif")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'dif', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_dif(body, res))
  }

  if (identical(family, "equating")) {
    if (!identical(requested_family, "equating")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'equating', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_equating(body, res))
  }

  if (identical(family, "item-analysis")) {
    if (!identical(requested_family, "item-analysis")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'item-analysis', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_item_analysis(body, res))
  }

  if (identical(family, "test-information")) {
    if (!identical(requested_family, "test-information")) {
      res$status <- 400
      return(.failure(
        body$jobId,
        paste0("This endpoint calibrates family 'test-information', not '", requested_family, "'"),
        "FamilyMismatch"
      ))
    }
    return(calibrate_test_information(body, res))
  }

  res$status <- 501
  .failure(body$jobId, paste0("Unsupported family: ", family), "NotImplemented")
}

calibrate_irt <- function(body, res) {
  if (!requireNamespace("mirt", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package mirt is not installed", "MissingPackage"))
  }
  # mirt's IRT objects are S4. requireNamespace() loads the namespace;
  # attach so method dispatch is the same as the documented mirt(dat, 1).
  suppressPackageStartupMessages(library(mirt, quietly = TRUE))

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  max_iter <- if (!is.null(opts$maxIterations)) as.integer(.first(opts$maxIterations)) else 500L
  if (is.na(max_iter) || max_iter < 1) max_iter <- 500L
  tol <- if (!is.null(opts$convergenceTolerance)) as.numeric(.first(opts$convergenceTolerance)) else 1e-4
  if (is.na(tol) || tol <= 0) tol <- 1e-4
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }
  subtype <- .as_char(body$model$subtype)
  itemtype <- switch(subtype, "2PL" = "2PL", "3PL" = "3PL", "Rasch" = "Rasch", "2PL")

  resp_df <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(resp_df)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }
  message(sprintf(
    "calibrate_irt job=%s dim=%dx%d itemtype=%s",
    .as_char(body$jobId), nrow(resp_df), ncol(resp_df), itemtype
  ))

  set.seed(seed)

  # Do not wrap mirt() in withCallingHandlers(muffleWarning): muffling
  # mirt's own restarts left fit=NULL and an empty stderr in CI (both
  # LSAT7 1000x5 and the 4x3 contract fixture). try() keeps the text.
  .run_mirt <- function(se) {
    # TOL is top-level (mirt 1.47 rejects it inside technical).
    mirt::mirt(
      resp_df,
      1,
      itemtype = itemtype,
      SE = se,
      verbose = FALSE,
      TOL = tol,
      technical = list(NCYCLES = max_iter)
    )
  }
  fit_try <- try(.run_mirt(TRUE), silent = TRUE)
  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    fit_try <- try(.run_mirt(FALSE), silent = TRUE)
  }
  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    # Last resort: the call in mirt's own LSAT7 example.
    fit_try <- try(mirt::mirt(resp_df, 1), silent = TRUE)
  }
  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    fit <- NULL
  } else {
    fit <- fit_try
  }

  elapsed <- proc.time()[["elapsed"]] - started
  pkg_ver <- paste("mirt", as.character(utils::packageVersion("mirt")))

  if (is.null(fit)) {
    res$status <- 200
    dim_note <- sprintf(" [%dx%d]", nrow(resp_df), ncol(resp_df))
    return(.failure(
      body$jobId,
      if (length(stderr_lines)) {
        paste0(paste(stderr_lines, collapse = "; "), dim_note)
      } else {
        paste0("mirt failed to fit", dim_note)
      },
      "mirtError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  converged <- isTRUE(tryCatch(mirt::extract.mirt(fit, "converged"), error = function(e) FALSE))
  if (!converged) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      "mirt did not converge",
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- nrow(resp_df)
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      iterations = tryCatch(mirt::extract.mirt(fit, "iterations"), error = function(e) NA_integer_),
      elapsedSeconds = elapsed,
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  coefs <- tryCatch(
    mirt::coef(fit, IRTpars = TRUE, simplify = TRUE)$items,
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(coefs)) {
    res$status <- 200
    return(.failure(body$jobId, "Unable to extract IRT coefficients", "ExtractError", paste(stderr_lines, collapse = "\n")))
  }

  item_ids <- rownames(coefs)
  if (is.null(item_ids)) item_ids <- colnames(resp_df)

  parameters <- list()
  for (i in seq_len(nrow(coefs))) {
    id <- item_ids[[i]]
    a <- if ("a" %in% colnames(coefs)) unname(coefs[i, "a"]) else if ("a1" %in% colnames(coefs)) unname(coefs[i, "a1"]) else 1
    b <- if ("b" %in% colnames(coefs)) unname(coefs[i, "b"]) else 0
    c <- if ("g" %in% colnames(coefs)) unname(coefs[i, "g"]) else 0
    parameters[[id]] <- list(a = as.numeric(a), b = as.numeric(b), c = as.numeric(c))
  }

  standard_errors <- NULL
  se_try <- tryCatch({
    raw <- capture.output({
      se_tab <- mirt::coef(fit, IRTpars = TRUE, printSE = TRUE)
      se_tab
    })
    stderr_lines <<- c(stderr_lines, raw)
    NULL
  }, error = function(e) NULL)

  fit_stats <- tryCatch({
    m2 <- mirt::M2(fit, type = "C2")
    list(global = as.list(as.data.frame(m2)[1, , drop = TRUE]))
  }, error = function(e) {
    list(global = list(note = conditionMessage(e)))
  })

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = nrow(resp_df),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = parameters,
    standardErrors = standard_errors,
    fitStatistics = fit_stats,
    diagnostics = list(
      iterations = tryCatch(mirt::extract.mirt(fit, "iterations"), error = function(e) NA_integer_),
      elapsedSeconds = elapsed,
      warnings = as.list(warnings_acc)
    )
  )
}

calibrate_diagnostic <- function(body, res) {
  if (!requireNamespace("GDINA", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package GDINA is not installed", "MissingPackage"))
  }
  suppressPackageStartupMessages(library(GDINA, quietly = TRUE))

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  max_iter <- if (!is.null(opts$maxIterations)) as.integer(.first(opts$maxIterations)) else 2000L
  if (is.na(max_iter) || max_iter < 1) max_iter <- 2000L
  tol <- if (!is.null(opts$convergenceTolerance)) as.numeric(.first(opts$convergenceTolerance)) else 1e-4
  if (is.na(tol) || tol <= 0) tol <- 1e-4
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }
  family <- .as_char(body$model$family)
  gdina_model <- if (identical(family, "dina")) "DINA" else "GDINA"

  resp_df <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(resp_df)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }

  Q <- tryCatch(
    q_matrix_to_matrix(body$qMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(Q)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce qMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }

  message(sprintf(
    "calibrate_diagnostic job=%s family=%s dim=%dx%d Q=%dx%d model=%s",
    .as_char(body$jobId), family, nrow(resp_df), ncol(resp_df), nrow(Q), ncol(Q), gdina_model
  ))

  set.seed(seed)
  # GDINA defaults item.names to "Item 1", "Item 2", ... (space, not
  # a dot). CI on D66 returned those keys, so request itemIds like
  # Item.1 were missing on the Node side. Pass the ADR 0002 ids through
  # and key the response by the same vector.
  request_item_ids <- vapply(as.list(body$model$itemIds), .as_char, character(1))
  colnames(resp_df) <- request_item_ids

  .run_gdina <- function() {
    GDINA::GDINA(
      dat = resp_df,
      Q = Q,
      model = gdina_model,
      item.names = request_item_ids,
      verbose = 0,
      control = list(
        maxitr = max_iter,
        conv.crit = tol,
        randomseed = seed
      )
    )
  }

  fit_try <- try(.run_gdina(), silent = TRUE)
  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    # Retry keeps control (incl. randomseed) — dropping it made the
    # converging path non-reproducible (D90 P1).
    fit_try <- try(
      GDINA::GDINA(
        dat = resp_df,
        Q = Q,
        model = gdina_model,
        item.names = request_item_ids,
        verbose = 0,
        control = list(
          maxitr = max_iter,
          conv.crit = tol,
          randomseed = seed
        )
      ),
      silent = TRUE
    )
  }
  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    fit <- NULL
  } else {
    fit <- fit_try
  }

  elapsed <- proc.time()[["elapsed"]] - started
  pkg_ver <- paste("GDINA", as.character(utils::packageVersion("GDINA")))

  if (is.null(fit)) {
    res$status <- 200
    dim_note <- sprintf(" [%dx%d]", nrow(resp_df), ncol(resp_df))
    return(.failure(
      body$jobId,
      if (length(stderr_lines)) {
        paste0(paste(stderr_lines, collapse = "; "), dim_note)
      } else {
        paste0("GDINA failed to fit", dim_note)
      },
      "GDINAError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  conv_raw <- tryCatch(GDINA::extract(fit, what = "convergence"), error = function(e) FALSE)
  if (length(conv_raw) != 1 || is.na(conv_raw)) {
    itr <- tryCatch(as.integer(fit$options$itr), error = function(e) NA_integer_)
    conv_raw <- is.finite(itr) && itr < max_iter
  }
  converged <- isTRUE(conv_raw)

  if (!converged) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      paste0(gdina_model, " did not converge"),
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- nrow(resp_df)
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      iterations = tryCatch(as.integer(fit$options$itr), error = function(e) NA_integer_),
      elapsedSeconds = elapsed,
      model = gdina_model,
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  catprob <- tryCatch(
    GDINA::extract(fit, what = "catprob.parm"),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(catprob) || length(catprob) == 0) {
    res$status <- 200
    return(.failure(body$jobId, "Unable to extract DINA/G-DINA category probabilities", "ExtractError", paste(stderr_lines, collapse = "\n")))
  }

  if (length(catprob) != length(request_item_ids)) {
    res$status <- 200
    return(.failure(
      body$jobId,
      sprintf(
        "GDINA returned %d item parameter vectors, expected %d (model.itemIds)",
        length(catprob), length(request_item_ids)
      ),
      "ExtractError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  parameters <- list()
  for (i in seq_along(catprob)) {
    id <- request_item_ids[[i]]
    probs <- as.numeric(unname(catprob[[i]]))
    if (identical(family, "dina")) {
      guess <- probs[[1]]
      slip <- 1 - probs[[length(probs)]]
      parameters[[id]] <- list(guess = as.numeric(guess), slip = as.numeric(slip))
    } else {
      parameters[[id]] <- list(probabilities = as.numeric(probs))
    }
  }

  fit_stats <- tryCatch({
    list(
      AIC = as.numeric(AIC(fit)),
      BIC = as.numeric(BIC(fit)),
      logLik = as.numeric(logLik(fit)),
      deviance = as.numeric(deviance(fit))
    )
  }, error = function(e) {
    list(note = conditionMessage(e))
  })

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = nrow(resp_df),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = parameters,
    standardErrors = NULL,
    fitStatistics = fit_stats,
    diagnostics = list(
      iterations = tryCatch(as.integer(fit$options$itr), error = function(e) NA_integer_),
      elapsedSeconds = elapsed,
      model = gdina_model,
      warnings = as.list(warnings_acc)
    )
  )
}

# KR-20 (Kuder & Richardson 1937). For complete dichotomous data this is
# Cronbach's alpha. Sample variance of the total score (R's var, n-1).
# Not a published coefficient table -- a textbook formula on the matrix.
.kr20 <- function(mat) {
  k <- ncol(mat)
  if (is.null(k) || k < 2L) return(NA_real_)
  p <- colMeans(mat, na.rm = TRUE)
  totals <- rowSums(mat, na.rm = TRUE)
  var_t <- stats::var(totals)
  if (!is.finite(var_t) || var_t <= 0) return(NA_real_)
  sum_pq <- sum(p * (1 - p), na.rm = TRUE)
  as.numeric((k / (k - 1)) * (1 - sum_pq / var_t))
}

.run_tam_ctt <- function(resp_mat, score) {
  # tam.ctt2 is the faster Rcpp path and accepts wlescore. tam.ctt is
  # the documented fallback. wlescore here is the raw total, not an
  # IRT WLE -- TAM's rpb.WLE is then the ordinary item-total
  # point-biserial (TAM help: "for dichotomously scored data, rpb.WLE
  # is the ordinary point biserial correlation of an item and a test
  # score (here the WLE)").
  out2 <- try(TAM::tam.ctt2(resp_mat, wlescore = score, progress = FALSE), silent = TRUE)
  if (!inherits(out2, "try-error") && is.data.frame(out2) && "rpb.WLE" %in% names(out2) &&
      any(is.finite(out2$rpb.WLE))) {
    return(list(dfr = out2, method = "TAM::tam.ctt2"))
  }
  out <- TAM::tam.ctt(resp_mat, wlescore = score, progress = FALSE)
  list(dfr = out, method = "TAM::tam.ctt")
}

.ctt_parameters_from_tam <- function(dfr, item_ids) {
  if (is.null(dfr) || !is.data.frame(dfr) || nrow(dfr) == 0) {
    stop("tam.ctt returned no item statistics")
  }
  if (!("item" %in% names(dfr))) {
    stop("tam.ctt output has no item column")
  }
  parameters <- list()
  for (id in item_ids) {
    item_rows <- dfr[as.character(dfr$item) == id, , drop = FALSE]
    if (nrow(item_rows) == 0) {
      stop(sprintf("tam.ctt did not return rows for item '%s'", id))
    }
    correct <- item_rows[as.character(item_rows$Categ) == "1", , drop = FALSE]
    if (nrow(correct) == 0) {
      # All-incorrect item: p = 0, no category-1 point-biserial.
      n <- if ("N" %in% names(item_rows)) as.integer(item_rows$N[[1]]) else NA_integer_
      parameters[[id]] <- list(
        difficulty = 0,
        discrimination = NA_real_,
        n = n
      )
      next
    }
    p <- if ("RelFreq" %in% names(correct)) as.numeric(correct$RelFreq[[1]]) else NA_real_
    rpb <- if ("rpb.WLE" %in% names(correct)) as.numeric(correct$rpb.WLE[[1]]) else NA_real_
    n <- if ("N" %in% names(correct)) as.integer(correct$N[[1]]) else NA_integer_
    parameters[[id]] <- list(
      difficulty = p,
      discrimination = rpb,
      n = n
    )
  }
  parameters
}

calibrate_ctt <- function(body, res) {
  if (!requireNamespace("TAM", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package TAM is not installed", "MissingPackage"))
  }
  suppressPackageStartupMessages(library(TAM, quietly = TRUE))

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }

  resp_df <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(resp_df)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }

  request_item_ids <- vapply(as.list(body$model$itemIds), .as_char, character(1))
  colnames(resp_df) <- request_item_ids
  resp_mat <- as.matrix(resp_df)
  storage.mode(resp_mat) <- "numeric"

  message(sprintf(
    "calibrate_ctt job=%s dim=%dx%d",
    .as_char(body$jobId), nrow(resp_mat), ncol(resp_mat)
  ))

  set.seed(seed)
  score <- rowSums(resp_mat, na.rm = TRUE)

  fit_try <- try(.run_tam_ctt(resp_mat, score), silent = TRUE)
  elapsed <- proc.time()[["elapsed"]] - started
  pkg_ver <- paste("TAM", as.character(utils::packageVersion("TAM")))

  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    res$status <- 200
    dim_note <- sprintf(" [%dx%d]", nrow(resp_mat), ncol(resp_mat))
    return(.failure(
      body$jobId,
      paste0(paste(stderr_lines, collapse = "; "), dim_note),
      "TAMError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  parameters <- tryCatch(
    .ctt_parameters_from_tam(fit_try$dfr, request_item_ids),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(parameters)) {
    res$status <- 200
    return(.failure(body$jobId, "Unable to extract CTT item statistics", "ExtractError", paste(stderr_lines, collapse = "\n")))
  }

  kr20 <- .kr20(resp_mat)
  mean_score <- mean(score)
  sd_score <- stats::sd(score)

  difficulties <- vapply(parameters, function(p) as.numeric(p$difficulty), numeric(1))
  discriminations <- vapply(parameters, function(p) as.numeric(p$discrimination), numeric(1))
  # CTT is not iterative. "Converged" means the statistics are identified:
  # finite p in [0,1] for every item, finite item-total rpb, finite KR-20
  # (total-score variance > 0). Ingest still refuses converged: false.
  converged <- all(is.finite(difficulties) & difficulties >= 0 & difficulties <= 1) &&
    all(is.finite(discriminations) & discriminations > -1 & discriminations < 1) &&
    is.finite(kr20)

  if (!converged) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      "CTT statistics were not identified (zero total-score variance or missing item stats)",
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- nrow(resp_mat)
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = fit_try$method,
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = nrow(resp_mat),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = parameters,
    standardErrors = NULL,
    fitStatistics = list(
      kr20 = as.numeric(kr20),
      meanScore = as.numeric(mean_score),
      sdScore = as.numeric(sd_score),
      nItems = ncol(resp_mat),
      nPersons = nrow(resp_mat)
    ),
    diagnostics = list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = fit_try$method,
      scoreForDiscrimination = "raw total (rowSums), not an IRT WLE",
      reliability = "KR-20 (Kuder & Richardson 1937); equals Cronbach's alpha for dichotomous complete data",
      warnings = as.list(warnings_acc)
    )
  )
}

# D77: dashboard item analysis. Same TAM classical engine as calibrate_ctt
# where p and rpb overlap; remapped field names for analysisArtefacts.
# Never writes parameterSets / never sets activeParameterSetId.
calibrate_item_analysis <- function(body, res) {
  if (!requireNamespace("TAM", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package TAM is not installed", "MissingPackage"))
  }
  suppressPackageStartupMessages(library(TAM, quietly = TRUE))

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }

  resp_df <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(resp_df)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }

  request_item_ids <- vapply(as.list(body$model$itemIds), .as_char, character(1))
  colnames(resp_df) <- request_item_ids
  resp_mat <- as.matrix(resp_df)
  storage.mode(resp_mat) <- "numeric"

  message(sprintf(
    "calibrate_item_analysis job=%s dim=%dx%d",
    .as_char(body$jobId), nrow(resp_mat), ncol(resp_mat)
  ))

  set.seed(seed)
  score <- rowSums(resp_mat, na.rm = TRUE)

  fit_try <- try(.run_tam_ctt(resp_mat, score), silent = TRUE)
  elapsed <- proc.time()[["elapsed"]] - started
  pkg_ver <- paste("TAM", as.character(utils::packageVersion("TAM")))

  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    res$status <- 200
    dim_note <- sprintf(" [%dx%d]", nrow(resp_mat), ncol(resp_mat))
    return(.failure(
      body$jobId,
      paste0(paste(stderr_lines, collapse = "; "), dim_note),
      "TAMError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  ctt_parameters <- tryCatch(
    .ctt_parameters_from_tam(fit_try$dfr, request_item_ids),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(ctt_parameters)) {
    res$status <- 200
    return(.failure(body$jobId, "Unable to extract item-analysis statistics", "ExtractError", paste(stderr_lines, collapse = "\n")))
  }

  # Remap CTT difficulty/discrimination → artefact pValue/pointBiserial.
  # distractors = NULL is kept by list() (not deleted) so JSON emits null.
  parameters <- lapply(ctt_parameters, function(p) {
    list(
      pValue = as.numeric(p$difficulty),
      pointBiserial = as.numeric(p$discrimination),
      n = as.integer(p$n),
      distractors = NULL
    )
  })

  kr20 <- .kr20(resp_mat)
  mean_score <- mean(score)
  sd_score <- stats::sd(score)

  p_values <- vapply(parameters, function(p) as.numeric(p$pValue), numeric(1))
  rpbs <- vapply(parameters, function(p) as.numeric(p$pointBiserial), numeric(1))
  converged <- all(is.finite(p_values) & p_values >= 0 & p_values <= 1) &&
    all(is.finite(rpbs) & rpbs > -1 & rpbs < 1) &&
    is.finite(kr20)

  overlap_note <- paste(
    "On dichotomous data, artefact pValue equals CTT parameter-set difficulty",
    "(published item mean) and artefact pointBiserial equals CTT discrimination",
    "(TAM item-total rpb). Both use the same TAM::tam.ctt2 engine."
  )
  authority_note <- paste(
    "Operational CTT readiness and activeParameterSetId come only from job kind",
    "ctt-statistics -> parameterSets (D67). item-analysis writes analysisArtefacts",
    "(D76/D77) and informs only; it never gates lifecycle.",
    "classicalCalibration.js is a provisional authoring approximation only and is",
    "not authoritative once R artefacts or parameter sets exist."
  )
  distractors_note <- paste(
    "Dichotomous 0/1 matrices (including LSAT7) have no option-level distractors;",
    "each item sets distractors: null explicitly (not omitted)."
  )

  if (!converged) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      "Item-analysis statistics were not identified (zero total-score variance or missing item stats)",
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- nrow(resp_mat)
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = fit_try$method,
      overlapWithCtt = overlap_note,
      authority = authority_note,
      distractorsNote = distractors_note,
      scoreForDiscrimination = "raw total (rowSums), not an IRT WLE",
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = nrow(resp_mat),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = parameters,
    standardErrors = NULL,
    fitStatistics = list(
      kr20 = as.numeric(kr20),
      meanScore = as.numeric(mean_score),
      sdScore = as.numeric(sd_score),
      nItems = ncol(resp_mat),
      nPersons = nrow(resp_mat)
    ),
    diagnostics = list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = fit_try$method,
      overlapWithCtt = overlap_note,
      authority = authority_note,
      distractorsNote = distractors_note,
      scoreForDiscrimination = "raw total (rowSums), not an IRT WLE",
      reliability = "KR-20 (Kuder & Richardson 1937); equals Cronbach's alpha for dichotomous complete data",
      warnings = as.list(warnings_acc)
    )
  )
}

# D78 helpers: Fisher information matching irtEngine.js itemInformation
# (3PL-aware). When c=0 this is a² P(1−P) with P = 1/(1+exp(−a(θ−b))).
.item_information_fisher <- function(theta, a, b, c = 0) {
  a <- as.numeric(a)
  b <- as.numeric(b)
  c <- as.numeric(c)
  if (!is.finite(c)) c <- 0
  if (c < 0) c <- 0
  if (c > 1) c <- 1
  expo <- a * (theta - b)
  L <- 1 / (1 + exp(-expo))
  p <- c + (1 - c) * L
  # Clamp for numerical safety at extremes
  p <- pmin(pmax(p, 1e-12), 1 - 1e-12)
  q <- 1 - p
  if (abs(1 - c) < 1e-12) return(0)
  Lstar <- (p - c) / (1 - c)
  as.numeric((a * a) * (q / p) * (Lstar * Lstar))
}

.test_information_at_theta <- function(theta, params) {
  sum(vapply(params, function(p) {
    .item_information_fisher(theta, p$a, p$b, if (is.null(p$c)) 0 else p$c)
  }, numeric(1)))
}

.coerce_abc_row <- function(row) {
  if (is.null(row)) return(NULL)
  get_num <- function(x, keys, default = 0) {
    for (k in keys) {
      if (!is.null(row[[k]]) && length(row[[k]]) >= 1) {
        v <- as.numeric(unlist(row[[k]], use.names = FALSE)[[1]])
        if (is.finite(v)) return(v)
      }
    }
    default
  }
  list(
    a = get_num(row, c("a", "a1"), 1),
    b = get_num(row, c("b"), 0),
    c = get_num(row, c("c", "g"), 0)
  )
}

.extract_source_parameters <- function(body, item_ids) {
  src <- body$model$parameters
  if (is.null(src)) src <- body$options$sourceParameters
  if (is.null(src)) return(NULL)

  out <- list()
  if (is.data.frame(src)) {
    ids <- rownames(src)
    if (is.null(ids) || !length(ids)) ids <- item_ids
    for (i in seq_len(nrow(src))) {
      id <- .as_char(ids[[i]])
      row <- as.list(src[i, , drop = FALSE])
      abc <- .coerce_abc_row(row)
      if (!is.null(abc)) out[[id]] <- abc
    }
  } else if (is.list(src)) {
    nms <- names(src)
    if (is.null(nms) || !any(nzchar(nms))) {
      if (length(src) == length(item_ids)) names(src) <- item_ids
      nms <- names(src)
    }
    for (nm in nms) {
      abc <- .coerce_abc_row(src[[nm]])
      if (!is.null(abc)) out[[.as_char(nm)]] <- abc
    }
  }
  if (!length(out)) return(NULL)
  out
}

.fit_2pl_parameters_from_matrix <- function(resp_mat, item_ids, seed) {
  if (!requireNamespace("mirt", quietly = TRUE)) {
    stop("Package mirt is not installed")
  }
  suppressPackageStartupMessages(library(mirt, quietly = TRUE))
  set.seed(seed)
  fit <- mirt::mirt(as.data.frame(resp_mat), 1, itemtype = "2PL", verbose = FALSE)
  converged <- isTRUE(tryCatch(mirt::extract.mirt(fit, "converged"), error = function(e) FALSE))
  if (!converged) stop("mirt did not converge")
  coefs <- mirt::coef(fit, IRTpars = TRUE, simplify = TRUE)$items
  ids <- rownames(coefs)
  if (is.null(ids)) ids <- item_ids
  parameters <- list()
  for (i in seq_len(nrow(coefs))) {
    id <- .as_char(ids[[i]])
    a <- if ("a" %in% colnames(coefs)) unname(coefs[i, "a"]) else if ("a1" %in% colnames(coefs)) unname(coefs[i, "a1"]) else 1
    b <- if ("b" %in% colnames(coefs)) unname(coefs[i, "b"]) else 0
    c <- if ("g" %in% colnames(coefs)) unname(coefs[i, "g"]) else 0
    parameters[[id]] <- list(a = as.numeric(a), b = as.numeric(b), c = as.numeric(c))
  }
  list(parameters = parameters, packageVersion = paste("mirt", as.character(utils::packageVersion("mirt"))))
}

.marginal_reliability_from_info <- function(theta, information) {
  # Under N(0,1) prior: ρ ≈ 1 − E[1/I(θ)]. Discrete grid weights = φ(θ).
  dens <- stats::dnorm(theta, mean = 0, sd = 1)
  ok <- is.finite(information) & information > 1e-12 & is.finite(dens)
  if (!any(ok)) return(NA_real_)
  w <- dens[ok]
  inv_i <- 1 / information[ok]
  e_inv <- sum(w * inv_i) / sum(w)
  as.numeric(1 - e_inv)
}

# D78: test information curve + conditional SEM + optional KR-20.
# Prefer known model.parameters / options.sourceParameters (no mirt fit).
# Else fit mirt 2PL on responseMatrix and compute I(θ) from fitted coefs
# with the same analytic Fisher formula (parity with irtEngine.js).
# Writes analysisArtefacts only — never activeParameterSetId.
calibrate_test_information <- function(body, res) {
  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }

  request_item_ids <- vapply(as.list(body$model$itemIds), .as_char, character(1))

  resp_mat <- NULL
  n_persons <- NA_integer_
  if (!is.null(body$responseMatrix)) {
    resp_df <- tryCatch(
      response_matrix_to_df(body$responseMatrix),
      error = function(e) {
        stderr_lines <<- c(stderr_lines, conditionMessage(e))
        NULL
      }
    )
    if (is.null(resp_df)) {
      res$status <- 400
      return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
    }
    colnames(resp_df) <- request_item_ids
    resp_mat <- as.matrix(resp_df)
    storage.mode(resp_mat) <- "numeric"
    n_persons <- nrow(resp_mat)
  }

  source_params <- tryCatch(
    .extract_source_parameters(body, request_item_ids),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )

  method <- "analytic-2PL-Fisher (irtEngine.js parity)"
  pkg_ver <- "analytic-2PL Fisher"
  known_path <- !is.null(source_params) && length(source_params) >= 2L

  if (known_path) {
    params <- source_params
  } else {
    if (is.null(resp_mat)) {
      res$status <- 400
      return(.failure(
        body$jobId,
        "test-information requires model.parameters (or options.sourceParameters) or a responseMatrix to fit",
        "MissingParameters"
      ))
    }
    fit_try <- try(.fit_2pl_parameters_from_matrix(resp_mat, request_item_ids, seed), silent = TRUE)
    if (inherits(fit_try, "try-error")) {
      stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
      res$status <- 200
      return(.failure(
        body$jobId,
        paste0(paste(stderr_lines, collapse = "; "), sprintf(" [%dx%d]", nrow(resp_mat), ncol(resp_mat))),
        "mirtError",
        paste(stderr_lines, collapse = "\n")
      ))
    }
    params <- fit_try$parameters
    pkg_ver <- fit_try$packageVersion
    method <- "mirt 2PL fit then analytic Fisher I(θ) (irtEngine.js parity; not mirt::testinfo)"
  }

  theta_min <- if (!is.null(opts$thetaMin)) as.numeric(.first(opts$thetaMin)) else -3
  theta_max <- if (!is.null(opts$thetaMax)) as.numeric(.first(opts$thetaMax)) else 3
  theta_step <- if (!is.null(opts$thetaStep)) as.numeric(.first(opts$thetaStep)) else 0.1
  if (!is.finite(theta_min) || !is.finite(theta_max) || !is.finite(theta_step) || theta_step <= 0) {
    theta_min <- -3; theta_max <- 3; theta_step <- 0.1
  }
  theta <- seq(theta_min, theta_max, by = theta_step)
  # Guarantee checkpoints −1, 0, 1 are on the grid
  for (cp in c(-1, 0, 1)) {
    if (!any(abs(theta - cp) < 1e-12)) theta <- sort(unique(c(theta, cp)))
  }

  information <- vapply(theta, function(th) .test_information_at_theta(th, params), numeric(1))
  conditional_sem <- lapply(information, function(ii) {
    if (!is.finite(ii) || ii < 1e-12) return(NULL)
    as.numeric(1 / sqrt(ii))
  })

  checkpoint_thetas <- c(-1, 0, 1)
  checkpoints <- list()
  for (th in checkpoint_thetas) {
    idx <- which.min(abs(theta - th))
    key <- as.character(th)
    ii <- information[[idx]]
    checkpoints[[key]] <- list(
      information = as.numeric(ii),
      conditionalSEM = if (!is.finite(ii) || ii < 1e-12) NULL else as.numeric(1 / sqrt(ii))
    )
  }

  source_out <- lapply(params, function(p) {
    list(a = as.numeric(p$a), b = as.numeric(p$b), c = as.numeric(if (is.null(p$c)) 0 else p$c))
  })

  kr20 <- if (!is.null(resp_mat)) .kr20(resp_mat) else NA_real_
  marg_rel <- .marginal_reliability_from_info(theta, information)

  elapsed <- proc.time()[["elapsed"]] - started
  sample_size <- if (is.finite(n_persons)) as.integer(n_persons) else length(params)

  authority_note <- paste(
    "Operational IRT readiness and activeParameterSetId come only from job kind",
    "irt-parameters -> parameterSets. test-information writes analysisArtefacts",
    "(D76/D78) and informs only; it never gates lifecycle or sets activeParameterSetId."
  )
  reliability_note <- paste(
    "fitStatistics.kr20 is classical KR-20 on the response matrix (same formula as",
    "ctt-statistics / item-analysis via .kr20). I(theta) and marginalReliability are IRT",
    "quantities from the Fisher information curve -- state both; do not conflate them."
  )
  formula_note <- paste(
    "I(theta)=sum a^2 (q/p) L^2 with L=(p-c)/(1-c), p=c+(1-c)/(1+exp(-a(theta-b))).",
    "When c=0 this is sum a^2 P(1-P). Matches src/.../irtEngine.js itemInformation / testInformation.",
    "Not mirt::testinfo."
  )

  converged <- all(is.finite(information)) &&
    all(vapply(checkpoint_thetas, function(th) {
      idx <- which.min(abs(theta - th))
      is.finite(information[[idx]]) && information[[idx]] > 0
    }, logical(1)))

  message(sprintf(
    "calibrate_test_information job=%s known=%s nItems=%d nPersons=%s",
    .as_char(body$jobId), known_path, length(params),
    if (is.finite(n_persons)) as.character(n_persons) else "NA"
  ))

  if (!converged) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      "Test information curve was not identified (non-finite I(θ) at required checkpoints)",
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- sample_size
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = method,
      formula = formula_note,
      authority = authority_note,
      reliabilityNote = reliability_note,
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  parameters <- list(
    theta = as.numeric(theta),
    information = as.numeric(information),
    conditionalSEM = conditional_sem,
    sourceParameters = source_out,
    checkpoints = checkpoints
  )

  fit_stats <- list(
    nItems = length(params),
    nPersons = if (is.finite(n_persons)) as.integer(n_persons) else NULL
  )
  if (is.finite(kr20)) fit_stats$kr20 <- as.numeric(kr20)
  if (is.finite(marg_rel) && marg_rel > 0 && marg_rel < 1) {
    fit_stats$marginalReliability <- as.numeric(marg_rel)
  }

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = sample_size,
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = parameters,
    standardErrors = NULL,
    fitStatistics = fit_stats,
    diagnostics = list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = method,
      formula = formula_note,
      authority = authority_note,
      reliabilityNote = reliability_note,
      sourceParameterSetId = if (!is.null(opts$sourceParameterSetId)) .as_char(.first(opts$sourceParameterSetId)) else NULL,
      knownParameterPath = known_path,
      warnings = as.list(warnings_acc)
    )
  )
}

.group_codes <- function(groups, n_persons) {
  labels <- vapply(as.list(groups$labels), .as_char, character(1))
  if (length(labels) != n_persons) {
    stop("groups.labels length does not match the response matrix")
  }
  reference <- .as_char(groups$reference)
  focal <- .as_char(groups$focal)
  codes <- ifelse(labels == focal, 1L, ifelse(labels == reference, 0L, NA_integer_))
  if (any(is.na(codes))) {
    stop("groups.labels contains a value that is neither reference nor focal")
  }
  list(codes = codes, reference = reference, focal = focal)
}

.dif_flagged_ids <- function(fit, item_ids) {
  flagged <- fit$DIFitems
  if (is.null(flagged) || (is.character(flagged) && grepl("No DIF", flagged[[1]], ignore.case = TRUE))) {
    return(character(0))
  }
  if (is.numeric(flagged)) {
    idx <- as.integer(flagged)
    idx <- idx[idx >= 1L & idx <= length(item_ids)]
    return(item_ids[idx])
  }
  as.character(flagged)
}

calibrate_dif <- function(body, res) {
  if (!requireNamespace("difR", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package difR is not installed", "MissingPackage"))
  }
  suppressPackageStartupMessages(library(difR, quietly = TRUE))

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }
  alpha <- if (!is.null(opts$convergenceTolerance)) as.numeric(.first(opts$convergenceTolerance)) else 0.05
  if (is.na(alpha) || alpha <= 0 || alpha >= 1) alpha <- 0.05

  resp_df <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(resp_df)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }

  request_item_ids <- vapply(as.list(body$model$itemIds), .as_char, character(1))
  colnames(resp_df) <- request_item_ids

  grouped <- tryCatch(
    .group_codes(body$groups, nrow(resp_df)),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(grouped)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce groups", "GroupError", paste(stderr_lines, collapse = "\n")))
  }

  message(sprintf(
    "calibrate_dif job=%s dim=%dx%d method=difR::difMH",
    .as_char(body$jobId), nrow(resp_df), ncol(resp_df)
  ))

  set.seed(seed)
  fit_try <- try(
    difR::difMH(
      Data = resp_df,
      group = grouped$codes,
      focal.name = 1,
      alpha = alpha,
      purify = FALSE,
      correct = TRUE
    ),
    silent = TRUE
  )
  elapsed <- proc.time()[["elapsed"]] - started
  pkg_ver <- paste("difR", as.character(utils::packageVersion("difR")))

  if (inherits(fit_try, "try-error")) {
    stderr_lines <- c(stderr_lines, paste(as.character(fit_try), collapse = "\n"))
    res$status <- 200
    return(.failure(
      body$jobId,
      paste0(paste(stderr_lines, collapse = "; "), sprintf(" [%dx%d]", nrow(resp_df), ncol(resp_df))),
      "difRError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  flagged_ids <- .dif_flagged_ids(fit_try, request_item_ids)
  p_values <- as.numeric(fit_try$p.value)
  mh_stats <- as.numeric(fit_try$MH)
  # difR stores alphaMH on the MH object; deltaMH is printed, not stored
  # (print.MH: -2.35 * log(alphaMH), Holland and Thayer 1985).
  alpha_mh <- as.numeric(fit_try$alphaMH)
  if (length(alpha_mh) == length(request_item_ids) && !is.null(names(fit_try$alphaMH))) {
    named <- as.numeric(fit_try$alphaMH[request_item_ids])
    if (all(is.finite(named))) alpha_mh <- named
  }
  delta_mh <- ifelse(is.finite(alpha_mh) & alpha_mh > 0, -2.35 * log(alpha_mh), NA_real_)
  if (length(p_values) != length(request_item_ids) || length(alpha_mh) != length(request_item_ids)) {
    res$status <- 200
    return(.failure(
      body$jobId,
      sprintf(
        "difMH returned %d p-values and %d alphaMH values, expected %d",
        length(p_values), length(alpha_mh), length(request_item_ids)
      ),
      "ExtractError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  parameters <- list()
  c_flagged <- character(0)
  for (i in seq_along(request_item_ids)) {
    id <- request_item_ids[[i]]
    p_i <- as.numeric(p_values[[i]])
    a_i <- if (length(alpha_mh) >= i) as.numeric(alpha_mh[[i]]) else NA_real_
    d_i <- if (length(delta_mh) >= i) as.numeric(delta_mh[[i]]) else NA_real_
    abs_d <- if (is.finite(d_i)) abs(d_i) else NA_real_
    ets <- if (!is.finite(abs_d)) "unclassified" else if (abs_d < 1) "A" else if (abs_d < 1.5) "B" else "C"
    # Stated tolerance (D69): a flag is ETS C (|deltaMH| >= 1.5), not
    # unadjusted MH p < 0.05. Eight tests at alpha=0.05 overflag.
    is_flag <- identical(ets, "C")
    if (is_flag) c_flagged <- c(c_flagged, id)
    mh_i <- if (length(mh_stats) >= i) as.numeric(mh_stats[[i]]) else NA_real_
    parameters[[id]] <- list(
      statistic = if (is.finite(mh_i)) mh_i else p_i,
      pValue = p_i,
      alphaMH = a_i,
      deltaMH = d_i,
      etsClass = ets,
      flag = is_flag,
      method = "Mantel-Haenszel",
      pair = paste0(grouped$focal, " vs ", grouped$reference)
    )
  }

  converged <- all(is.finite(p_values))

  if (!converged) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      "DIF statistics were not identified (non-finite Mantel-Haenszel p-values)",
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- nrow(resp_df)
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = "difR::difMH",
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = nrow(resp_df),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = parameters,
    standardErrors = NULL,
    fitStatistics = list(
      nItems = ncol(resp_df),
      nPersons = nrow(resp_df),
      nReference = as.integer(sum(grouped$codes == 0L)),
      nFocal = as.integer(sum(grouped$codes == 1L)),
      nFlagged = length(c_flagged),
      alpha = alpha
    ),
    diagnostics = list(
      iterations = 1L,
      elapsedSeconds = elapsed,
      method = "difR::difMH",
      purification = FALSE,
      continuityCorrection = TRUE,
      flaggedItemIds = as.list(c_flagged),
      mhSignificantItemIds = as.list(flagged_ids),
      flagRule = "ETS C: |deltaMH| >= 1.5 (Holland and Thayer / ETS). Unadjusted MH p < 0.05 is recorded, not the operational flag.",
      reference = grouped$reference,
      focal = grouped$focal,
      note = "A DIF flag is a prompt to investigate an item, not a finding about a group of students.",
      warnings = as.list(warnings_acc)
    )
  )
}

.form_row_index <- function(forms, n_persons) {
  labels <- vapply(as.list(forms$labels), .as_char, character(1))
  if (length(labels) != n_persons) {
    stop("forms.labels length does not match the response matrix")
  }
  form_x <- .as_char(forms$formX)
  form_y <- .as_char(forms$formY)
  list(
    x = which(labels == form_x),
    y = which(labels == form_y),
    formX = form_x,
    formY = form_y
  )
}

.rasch_b <- function(dat, seed, max_iter) {
  set.seed(seed)
  fit <- mirt::mirt(
    dat,
    1,
    itemtype = "Rasch",
    verbose = FALSE,
    technical = list(NCYCLES = max_iter)
  )
  converged <- isTRUE(tryCatch(mirt::extract.mirt(fit, "converged"), error = function(e) FALSE))
  if (!converged) {
    return(list(ok = FALSE, error = "mirt Rasch did not converge", fit = fit))
  }
  coefs <- mirt::coef(fit, IRTpars = TRUE, simplify = TRUE)$items
  if (is.null(coefs) || !("b" %in% colnames(coefs))) {
    return(list(ok = FALSE, error = "Unable to extract Rasch b", fit = fit))
  }
  b <- as.numeric(coefs[, "b"])
  names(b) <- rownames(coefs)
  list(
    ok = TRUE,
    b = b,
    iterations = tryCatch(mirt::extract.mirt(fit, "iterations"), error = function(e) NA_integer_)
  )
}

.observed_item_ids <- function(resp_df, row_idx) {
  keep <- vapply(seq_len(ncol(resp_df)), function(j) {
    any(is.finite(as.numeric(resp_df[row_idx, j])))
  }, logical(1))
  colnames(resp_df)[keep]
}

.plink_mean_sigma <- function(b_x, x_ids, b_y, y_ids, common_ids) {
  n_x <- length(x_ids)
  n_y <- length(y_ids)
  pars_x <- cbind(
    a = rep(1, n_x),
    b = as.numeric(b_x[x_ids]),
    c = rep(0, n_x)
  )
  pars_y <- cbind(
    a = rep(1, n_y),
    b = as.numeric(b_y[y_ids]),
    c = rep(0, n_y)
  )
  rownames(pars_x) <- x_ids
  rownames(pars_y) <- y_ids
  common <- cbind(match(common_ids, x_ids), match(common_ids, y_ids))
  if (any(is.na(common))) {
    stop("common items missing from a form's estimated b vector")
  }
  obj <- plink::as.irt.pars(
    list(pars_x, pars_y),
    common,
    list(rep(2L, n_x), rep(2L, n_y)),
    list(plink::as.poly.mod(n_x, "drm"), plink::as.poly.mod(n_y, "drm")),
    grp.names = c("X", "Y")
  )
  out <- plink::plink(obj, rescale = "MS")
  con <- plink::link.con(out)
  if (is.list(con)) con <- con[[1]]
  row <- con["Mean/Sigma", ]
  list(
    slope = as.numeric(row[["A"]]),
    intercept = as.numeric(row[["B"]]),
    constants = con
  )
}

calibrate_equating <- function(body, res) {
  if (!requireNamespace("mirt", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package mirt is not installed", "MissingPackage"))
  }
  if (!requireNamespace("plink", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package plink is not installed", "MissingPackage"))
  }
  suppressPackageStartupMessages(library(mirt, quietly = TRUE))
  suppressPackageStartupMessages(library(plink, quietly = TRUE))

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  seed <- .require_seed(opts)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(body$jobId, "options.seed must be a finite integer", "SeedError"))
  }
  max_iter <- if (!is.null(opts$maxIterations)) as.integer(.first(opts$maxIterations)) else 500L
  if (is.na(max_iter) || max_iter < 50L) max_iter <- 500L

  resp_df <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(resp_df)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce responseMatrix.data", "MatrixError", paste(stderr_lines, collapse = "\n")))
  }

  split <- tryCatch(
    .form_row_index(body$forms, nrow(resp_df)),
    error = function(e) {
      stderr_lines <<- c(stderr_lines, conditionMessage(e))
      NULL
    }
  )
  if (is.null(split)) {
    res$status <- 400
    return(.failure(body$jobId, "Could not coerce forms", "FormError", paste(stderr_lines, collapse = "\n")))
  }
  if (length(split$x) < 2L || length(split$y) < 2L) {
    res$status <- 400
    return(.failure(body$jobId, "Each form must have at least two persons", "FormError"))
  }

  common_ids <- vapply(as.list(body$forms$commonItemIds), .as_char, character(1))
  if (any(!common_ids %in% colnames(resp_df))) {
    res$status <- 400
    return(.failure(body$jobId, "forms.commonItemIds must be columns of the response matrix", "FormError"))
  }

  message(sprintf(
    "calibrate_equating job=%s dim=%dx%d method=plink Mean/Sigma",
    .as_char(body$jobId), nrow(resp_df), ncol(resp_df)
  ))

  x_items <- .observed_item_ids(resp_df, split$x)
  y_items <- .observed_item_ids(resp_df, split$y)
  if (!all(common_ids %in% x_items) || !all(common_ids %in% y_items)) {
    res$status <- 400
    return(.failure(body$jobId, "Every common item must be observed on both forms", "FormError"))
  }

  x_fit <- try(
    .rasch_b(resp_df[split$x, x_items, drop = FALSE], seed, max_iter),
    silent = TRUE
  )
  y_fit <- try(
    .rasch_b(resp_df[split$y, y_items, drop = FALSE], seed, max_iter),
    silent = TRUE
  )
  elapsed <- proc.time()[["elapsed"]] - started
  pkg_ver <- paste("plink", as.character(utils::packageVersion("plink")))
  mirt_ver <- paste("mirt", as.character(utils::packageVersion("mirt")))

  if (inherits(x_fit, "try-error") || inherits(y_fit, "try-error")) {
    err <- if (inherits(x_fit, "try-error")) x_fit else y_fit
    res$status <- 200
    return(.failure(
      body$jobId,
      paste(c("mirt failed to fit a form", as.character(err)), collapse = "\n"),
      "mirtError",
      paste(stderr_lines, collapse = "\n")
    ))
  }
  if (!isTRUE(x_fit$ok) || !isTRUE(y_fit$ok)) {
    res$status <- 200
    out <- .failure(
      body$jobId,
      paste(c(x_fit$error, y_fit$error), collapse = "; "),
      "NotConverged",
      paste(stderr_lines, collapse = "\n")
    )
    out$packageVersion <- pkg_ver
    out$sampleSize <- nrow(resp_df)
    out$calibratedAt <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    out$diagnostics <- list(
      elapsedSeconds = elapsed,
      method = "Mean/Sigma",
      warnings = as.list(warnings_acc)
    )
    return(out)
  }

  b_x <- as.numeric(x_fit$b[common_ids])
  b_y <- as.numeric(y_fit$b[common_ids])
  if (length(b_x) != length(common_ids) || length(b_y) != length(common_ids) ||
      any(!is.finite(b_x)) || any(!is.finite(b_y))) {
    res$status <- 200
    return(.failure(
      body$jobId,
      "Common-item Rasch difficulties were not identified",
      "ExtractError",
      paste(stderr_lines, collapse = "\n")
    ))
  }

  sd_x <- stats::sd(b_x)
  sd_y <- stats::sd(b_y)
  if (!is.finite(sd_y) || sd_y < 1e-8) {
    res$status <- 200
    return(.failure(
      body$jobId,
      "Form Y common-item difficulties have no spread; Mean/Sigma is unidentified",
      "NotConverged"
    ))
  }

  linked <- try(
    .plink_mean_sigma(x_fit$b, x_items, y_fit$b, y_items, common_ids),
    silent = TRUE
  )
  if (inherits(linked, "try-error")) {
    res$status <- 200
    return(.failure(
      body$jobId,
      paste(c("plink failed to link the forms", as.character(linked)), collapse = "\n"),
      "plinkError",
      paste(stderr_lines, collapse = "\n")
    ))
  }
  slope <- linked$slope
  intercept <- linked$intercept
  if (!is.finite(slope) || !is.finite(intercept)) {
    res$status <- 200
    return(.failure(body$jobId, "plink Mean/Sigma constants were not finite", "ExtractError"))
  }

  common <- list()
  for (i in seq_along(common_ids)) {
    id <- common_ids[[i]]
    common[[id]] <- list(
      bX = b_x[[i]],
      bY = b_y[[i]],
      bYOnX = slope * b_y[[i]] + intercept
    )
  }

  extra_methods <- list()
  if (!is.null(linked$constants) && is.matrix(linked$constants)) {
    rn <- rownames(linked$constants)
    for (i in seq_len(nrow(linked$constants))) {
      extra_methods[[rn[[i]]]] <- list(
        slope = as.numeric(linked$constants[i, "A"]),
        intercept = as.numeric(linked$constants[i, "B"])
      )
    }
  }

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = .as_char(body$jobId),
    converged = TRUE,
    packageVersion = pkg_ver,
    sampleSize = nrow(resp_df),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = list(
      slope = slope,
      intercept = intercept,
      method = "Mean/Sigma",
      from = split$formY,
      to = split$formX
    ),
    standardErrors = NULL,
    fitStatistics = list(
      nItems = ncol(resp_df),
      nPersons = nrow(resp_df),
      nFormX = length(split$x),
      nFormY = length(split$y),
      nCommon = length(common_ids),
      sdCommonX = sd_x,
      sdCommonY = sd_y
    ),
    diagnostics = list(
      iterationsX = x_fit$iterations,
      iterationsY = y_fit$iterations,
      elapsedSeconds = elapsed,
      method = "plink::plink Mean/Sigma after separate mirt Rasch calibrations",
      calibrationPackage = mirt_ver,
      commonItemIds = as.list(common_ids),
      commonItems = common,
      allLinkingMethods = extra_methods,
      formX = split$formX,
      formY = split$formY,
      note = "Item parameters are estimated with mirt. Linking constants come from plink (Weeks 2010). equate is available on this image for observed-score equating; this job is IRT common-item linking. Equating informs; it does not authorise a parameter set.",
      warnings = as.list(warnings_acc)
    )
  )
}
