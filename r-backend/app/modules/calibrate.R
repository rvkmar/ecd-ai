# modules/calibrate.R
# ADR 0002 calibration endpoints. IRT (mirt) is implemented here; DINA and
# CTT return a contract-shaped 501 until D66 / D67.
# Null in the response matrix means not administered, never 0.

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
  if (!identical(requested_family, family)) {
    res$status <- 400
    return(.failure(
      body$jobId,
      paste0("This endpoint calibrates family '", family, "', not '", requested_family, "'"),
      "FamilyMismatch"
    ))
  }

  if (identical(family, "irt")) {
    return(calibrate_irt(body, res))
  }

  res$status <- 501
  .failure(body$jobId, paste0("Unsupported family: ", family), "NotImplemented")
}

calibrate_irt <- function(body, res) {
  if (!requireNamespace("mirt", quietly = TRUE)) {
    res$status <- 500
    return(.failure(body$jobId, "Package mirt is not installed", "MissingPackage"))
  }

  started <- proc.time()[["elapsed"]]
  stderr_lines <- character(0)
  warnings_acc <- character(0)

  opts <- body$options
  .first <- function(x) unlist(x, use.names = FALSE)[[1]]
  max_iter <- if (!is.null(opts$maxIterations)) as.integer(.first(opts$maxIterations)) else 500L
  if (is.na(max_iter) || max_iter < 1) max_iter <- 500L
  tol <- if (!is.null(opts$convergenceTolerance)) as.numeric(.first(opts$convergenceTolerance)) else 1e-4
  if (is.na(tol) || tol <= 0) tol <- 1e-4
  seed <- as.integer(.first(opts$seed))
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

  fit <- NULL
  tryCatch({
    withCallingHandlers(
      {
        # mirt 1.47 rejects TOL inside technical ("inputs to technical
        # are invalid: TOL"). TOL is a top-level mirt() argument; NCYCLES
        # stays in technical. Confirmed on live LSAT7 in CI (1000x5).
        fit <<- mirt::mirt(
          resp_df,
          1,
          itemtype = itemtype,
          SE = TRUE,
          verbose = FALSE,
          TOL = tol,
          technical = list(NCYCLES = max_iter)
        )
      },
      warning = function(w) {
        warnings_acc <<- c(warnings_acc, conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    )
  }, error = function(e) {
    stderr_lines <<- c(stderr_lines, conditionMessage(e))
  })

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
