# modules/modelCriticism.R
# TU4 model criticism. Summaries go on fitStatistics. Per-person Zh rows
# and the Q3 matrix stay beside the job (personFitRows, q3Matrix).
# Missing results leave the keys off, which is today's behaviour.
# ASCII only.

# Drasgow, Levine and Williams (1985). Zh below -2 flags an unexpected
# response pattern. The cutoff is recorded on the summary. It is not an
# activation rule (that is TU5).
PERSON_FIT_ZH_CUTOFF <- -2

# Yen (1984) Q3. Pairs with absolute residual correlation above 0.2
# are flagged. The full matrix is not part of the summary.
Q3_ABS_THRESHOLD <- 0.2

.criticism_number <- function(opts, key, default, valid) {
  if (is.null(opts) || is.null(opts[[key]])) return(default)
  v <- suppressWarnings(as.numeric(unlist(opts[[key]], use.names = FALSE)[[1]]))
  if (length(v) != 1 || !isTRUE(valid(v))) return(default)
  v
}

.scalar_or_na <- function(x) {
  if (is.null(x) || length(x) == 0) return(NA_real_)
  v <- suppressWarnings(as.numeric(unlist(x, use.names = FALSE)))
  v <- v[is.finite(v)]
  if (length(v) < 1) return(NA_real_)
  as.numeric(v[[1]])
}

.person_id_list <- function(person_ids, n) {
  ids <- if (!is.null(person_ids)) {
    vapply(as.list(person_ids), function(x) {
      if (is.null(x) || length(x) == 0) return("")
      as.character(unlist(x, use.names = FALSE)[[1]])
    }, character(1))
  } else {
    character(0)
  }
  if (length(ids) != n) ids <- as.character(seq_len(n))
  ids
}

# zh: numeric vector aligned to persons. cutoff: misfit when Zh < cutoff.
# Returns summary (no person ids) and rows (the sidecar).
.person_fit_summary <- function(zh, person_ids, cutoff) {
  zh <- as.numeric(zh)
  n <- length(zh)
  finite <- is.finite(zh)
  n_finite <- sum(finite)
  misfit <- finite & zh < cutoff
  n_misfit <- sum(misfit)
  ids <- .person_id_list(person_ids, n)
  rows <- lapply(seq_len(n), function(i) {
    list(
      personId = ids[[i]],
      Zh = if (isTRUE(finite[[i]])) as.numeric(zh[[i]]) else NULL,
      misfit = isTRUE(misfit[[i]])
    )
  })
  list(
    summary = list(
      statistic = "Zh",
      cutoff = as.numeric(cutoff),
      rule = "Zh < cutoff",
      nPersons = as.integer(n),
      nFinite = as.integer(n_finite),
      nMisfit = as.integer(n_misfit),
      proportionMisfit = if (n_finite > 0) as.numeric(n_misfit / n_finite) else NULL
    ),
    rows = rows
  )
}

# mat: item-by-item Q3. Diagonal is ignored. threshold: flag |Q3| above it.
.q3_summary <- function(mat, item_ids, threshold) {
  m <- as.matrix(mat)
  storage.mode(m) <- "numeric"
  n <- ncol(m)
  if (is.null(n) || nrow(m) != n || n < 2) {
    return(list(
      summary = list(
        available = FALSE,
        statistic = "Q3",
        threshold = as.numeric(threshold),
        note = "Q3 matrix was not square"
      ),
      matrix = NULL
    ))
  }
  ids <- as.character(unlist(item_ids, use.names = FALSE))
  if (length(ids) != n) {
    cn <- colnames(m)
    ids <- if (!is.null(cn) && length(cn) == n) as.character(cn) else as.character(seq_len(n))
  }
  colnames(m) <- ids
  rownames(m) <- ids
  abs_off <- numeric(0)
  flagged <- list()
  for (i in seq_len(n - 1L)) {
    for (j in seq(i + 1L, n)) {
      v <- m[i, j]
      if (!is.finite(v)) next
      abs_off <- c(abs_off, abs(v))
      if (abs(v) > threshold) {
        flagged[[length(flagged) + 1L]] <- list(
          itemId1 = ids[[i]],
          itemId2 = ids[[j]],
          q3 = as.numeric(v)
        )
      }
    }
  }
  if (length(flagged) > 1L) {
    ord <- order(vapply(flagged, function(p) -abs(p$q3), numeric(1)))
    flagged <- flagged[ord]
  }
  values <- lapply(seq_len(n), function(i) as.numeric(m[i, ]))
  list(
    summary = list(
      statistic = "Q3",
      threshold = as.numeric(threshold),
      maxAbsQ3 = if (length(abs_off)) as.numeric(max(abs_off)) else NULL,
      nPairs = as.integer(n * (n - 1L) / 2L),
      nFlaggedPairs = as.integer(length(flagged)),
      flaggedPairs = flagged
    ),
    matrix = list(itemIds = as.list(ids), values = values)
  )
}

.cdm_fit_summary <- function(mf) {
  if (inherits(mf, "error") || !is.list(mf)) {
    note <- if (inherits(mf, "error")) conditionMessage(mf) else "modelfit returned no fit object"
    return(list(available = FALSE, note = note))
  }
  out <- list(available = TRUE)
  m2 <- .scalar_or_na(mf$M2)
  if (is.finite(m2)) out$M2 <- m2
  df <- .scalar_or_na(mf$M2.df)
  if (!is.finite(df)) df <- .scalar_or_na(mf$df)
  if (is.finite(df)) out$df <- df
  p <- .scalar_or_na(mf$M2.pvalue)
  if (!is.finite(p)) p <- .scalar_or_na(mf$p)
  if (is.finite(p)) out$p <- p
  rmsea <- .scalar_or_na(mf$RMSEA2)
  if (is.finite(rmsea)) out$RMSEA2 <- rmsea
  srmsr <- .scalar_or_na(mf$SRMSR)
  if (is.finite(srmsr)) out$SRMSR <- srmsr
  ci <- mf$RMSEA2.CI
  if (is.numeric(ci) && length(ci) >= 2 && is.finite(ci[[1]]) && is.finite(ci[[2]])) {
    out$rmsea2Ci <- list(lower = as.numeric(ci[[1]]), upper = as.numeric(ci[[2]]))
  }
  if (is.null(out$M2) && is.null(out$RMSEA2) && is.null(out$SRMSR)) {
    return(list(available = FALSE, note = "modelfit returned no M2, RMSEA2, or SRMSR"))
  }
  out
}

.q_vec <- function(row) {
  as.list(as.integer(round(as.numeric(row))))
}

.q_same <- function(a, b) {
  aa <- as.integer(round(as.numeric(a)))
  bb <- as.integer(round(as.numeric(b)))
  length(aa) > 0 && length(aa) == length(bb) && all(aa == bb)
}

.align_item_matrix <- function(mat, item_ids) {
  if (is.null(mat)) return(NULL)
  m <- as.matrix(mat)
  storage.mode(m) <- "numeric"
  if (nrow(m) != length(item_ids) && ncol(m) == length(item_ids) &&
      nrow(m) != ncol(m)) {
    m <- t(m)
  }
  rn <- rownames(m)
  if (!is.null(rn) && all(item_ids %in% rn)) {
    m <- m[item_ids, , drop = FALSE]
  }
  if (nrow(m) != length(item_ids)) return(NULL)
  rownames(m) <- item_ids
  m
}

.tail_attributes <- function(mat, n_attr) {
  if (is.null(mat)) return(NULL)
  if (ncol(mat) == n_attr) return(mat)
  if (ncol(mat) > n_attr) {
    return(mat[, (ncol(mat) - n_attr + 1L):ncol(mat), drop = FALSE])
  }
  NULL
}

.pvaf_lookup <- function(pvaf, item_index, item_id, q_row) {
  if (is.null(pvaf)) return(NA_real_)
  bits <- as.integer(round(as.numeric(q_row)))
  label <- paste0(bits, collapse = "")
  label_sp <- paste(bits, collapse = " ")
  pick <- function(values, nms) {
    if (is.null(values)) return(NA_real_)
    values <- as.numeric(values)
    if (!is.null(nms)) {
      hit <- match(label, nms)
      if (is.na(hit)) hit <- match(label_sp, nms)
      if (!is.na(hit) && is.finite(values[[hit]])) return(as.numeric(values[[hit]]))
    }
    NA_real_
  }
  if (is.matrix(pvaf) || is.data.frame(pvaf)) {
    cn <- colnames(pvaf)
    rn <- rownames(pvaf)
    col_i <- if (!is.null(cn) && item_id %in% cn) match(item_id, cn) else item_index
    if (!is.na(col_i) && col_i <= ncol(pvaf) && nrow(pvaf) > 1) {
      found <- pick(pvaf[, col_i], rn)
      if (is.finite(found)) return(found)
    }
    row_i <- if (!is.null(rn) && item_id %in% rn) match(item_id, rn) else item_index
    if (!is.na(row_i) && row_i <= nrow(pvaf) && ncol(pvaf) > 1) {
      found <- pick(unlist(pvaf[row_i, ], use.names = FALSE), cn)
      if (is.finite(found)) return(found)
    }
  }
  if (is.list(pvaf)) {
    el <- pvaf[[item_id]]
    if (is.null(el) && length(pvaf) >= item_index) el <- pvaf[[item_index]]
    if (is.numeric(el) || is.matrix(el) || is.data.frame(el)) {
      found <- pick(as.numeric(unlist(el, use.names = TRUE)), names(unlist(el)))
      if (is.finite(found)) return(found)
    }
  }
  NA_real_
}

# sug/orig: items x attributes. pvaf: package PVAF element (often columns = items).
# Only q-vectors that differ are returned, each with the suggestion's PVAF.
.q_validation_summary <- function(sug, orig, pvaf, eps, item_ids, attribute_ids) {
  item_ids <- as.character(unlist(item_ids, use.names = FALSE))
  attribute_ids <- as.character(unlist(attribute_ids, use.names = FALSE))
  sug_m <- .tail_attributes(.align_item_matrix(sug, item_ids), length(attribute_ids))
  orig_m <- .tail_attributes(.align_item_matrix(orig, item_ids), length(attribute_ids))
  if (is.null(sug_m) || is.null(orig_m)) {
    return(list(available = FALSE, note = "Qval Q-matrix could not be aligned to item ids"))
  }
  eps_n <- .scalar_or_na(eps)
  suggestions <- list()
  for (i in seq_along(item_ids)) {
    if (.q_same(orig_m[i, ], sug_m[i, ])) next
    pv <- .pvaf_lookup(pvaf, i, item_ids[[i]], sug_m[i, ])
    suggestions[[length(suggestions) + 1L]] <- list(
      itemId = item_ids[[i]],
      original = .q_vec(orig_m[i, ]),
      suggested = .q_vec(sug_m[i, ]),
      pvaf = if (is.finite(pv)) as.numeric(pv) else NULL
    )
  }
  list(
    eps = if (is.finite(eps_n)) as.numeric(eps_n) else NULL,
    nItems = as.integer(length(item_ids)),
    nChanged = as.integer(length(suggestions)),
    attributeIds = as.list(attribute_ids),
    suggestions = suggestions
  )
}

# Qval rows follow GDINA item.names (the request item ids). Parameter
# maps may use a unique observable id (TU15). Rename suggestion item
# ids onto those keys. Item-keyed fits pass identical vectors.
.relabel_q_validation <- function(q_sum, from_ids, to_ids) {
  if (!is.list(q_sum) || isTRUE(q_sum$available == FALSE)) return(q_sum)
  if (!is.list(q_sum$suggestions) || !length(q_sum$suggestions)) return(q_sum)
  from_ids <- as.character(unlist(from_ids, use.names = FALSE))
  to_ids <- as.character(unlist(to_ids, use.names = FALSE))
  if (length(from_ids) != length(to_ids)) return(q_sum)
  for (i in seq_along(q_sum$suggestions)) {
    item <- as.character(q_sum$suggestions[[i]]$itemId)
    hit <- match(item, from_ids)
    if (!is.na(hit)) q_sum$suggestions[[i]]$itemId <- to_ids[[hit]]
  }
  q_sum
}

.qval_summary_from_obj <- function(qv, item_ids, attribute_ids) {
  sug <- tryCatch(GDINA::extract(qv, what = "sug.Q"), error = function(e) qv$sug.Q)
  orig <- tryCatch(GDINA::extract(qv, what = "Q"), error = function(e) qv$Q)
  pvaf <- tryCatch(GDINA::extract(qv, what = "PVAF"), error = function(e) qv$PVAF)
  eps <- tryCatch(GDINA::extract(qv, what = "eps"), error = function(e) qv$eps)
  .q_validation_summary(sug, orig, pvaf, eps, item_ids, attribute_ids)
}

.capture_call <- function(expr_fun) {
  tryCatch({
    box <- new.env()
    utils::capture.output(box$value <- expr_fun())
    if (is.null(box$value)) stop("call returned nothing")
    box$value
  }, error = function(e) e)
}

.call_personfit <- function(fit, Theta) {
  if (!is.null(Theta)) {
    pf <- .capture_call(function() mirt::personfit(fit, method = "EAP", Theta = Theta, stats.only = TRUE))
    if (!inherits(pf, "error")) return(pf)
    pf <- .capture_call(function() mirt::personfit(fit, method = "EAP", Theta = Theta))
    if (!inherits(pf, "error")) return(pf)
  }
  pf <- .capture_call(function() mirt::personfit(fit, method = "EAP", stats.only = TRUE))
  if (!inherits(pf, "error")) return(pf)
  .capture_call(function() mirt::personfit(fit, method = "EAP"))
}

.call_q3 <- function(fit, Theta) {
  if (!is.null(Theta)) {
    raw <- .capture_call(function() {
      mirt::residuals(fit, type = "Q3", Theta = Theta, verbose = FALSE, suppress = -1, df.p = FALSE)
    })
    if (!inherits(raw, "error")) return(raw)
  }
  raw <- .capture_call(function() {
    mirt::residuals(fit, type = "Q3", verbose = FALSE, suppress = -1, df.p = FALSE)
  })
  if (!inherits(raw, "error")) return(raw)
  .capture_call(function() mirt::residuals(fit, type = "Q3", verbose = FALSE))
}

.irt_model_criticism <- function(fit, person_ids, item_ids, opts, person_scores = NULL) {
  warnings <- character(0)
  cutoff <- .criticism_number(
    opts, "personFitZhCutoff", PERSON_FIT_ZH_CUTOFF, function(v) is.finite(v)
  )
  threshold <- .criticism_number(
    opts, "q3Threshold", Q3_ABS_THRESHOLD, function(v) is.finite(v) && v > 0 && v < 1
  )
  Theta <- NULL
  if (is.list(person_scores) && length(person_scores$theta)) {
    th <- as.numeric(person_scores$theta)
    if (length(th) > 1 && all(is.finite(th))) Theta <- matrix(th, ncol = 1)
  }

  person <- NULL
  rows <- NULL
  pf <- tryCatch(.call_personfit(fit, Theta), error = function(e) e)
  if (inherits(pf, "error") || is.null(pf)) {
    note <- if (inherits(pf, "error")) conditionMessage(pf) else "personfit returned nothing"
    warnings <- c(warnings, paste("person fit:", note))
    person <- list(available = FALSE, statistic = "Zh", cutoff = as.numeric(cutoff), note = note)
  } else {
    zh_name <- grep("^zh$", colnames(pf), ignore.case = TRUE, value = TRUE)
    if (length(zh_name) < 1) {
      warnings <- c(warnings, "person fit: Zh column missing")
      person <- list(
        available = FALSE,
        statistic = "Zh",
        cutoff = as.numeric(cutoff),
        note = "personfit did not return Zh"
      )
    } else {
      zh_vals <- if (is.data.frame(pf)) pf[[zh_name[[1]]]] else pf[, zh_name[[1]]]
      packed <- .person_fit_summary(zh_vals, person_ids, cutoff)
      person <- packed$summary
      rows <- packed$rows
    }
  }

  q3 <- NULL
  q3_matrix <- NULL
  raw <- tryCatch(.call_q3(fit, Theta), error = function(e) e)
  if (inherits(raw, "error") || is.null(raw)) {
    note <- if (inherits(raw, "error")) conditionMessage(raw) else "residuals returned nothing"
    warnings <- c(warnings, paste("Q3:", note))
    q3 <- list(available = FALSE, statistic = "Q3", threshold = as.numeric(threshold), note = note)
  } else {
    packed <- .q3_summary(raw, item_ids, threshold)
    q3 <- packed$summary
    q3_matrix <- packed$matrix
    if (isTRUE(q3$available == FALSE)) warnings <- c(warnings, paste("Q3:", q3$note))
  }

  list(
    personFit = person,
    localDependence = q3,
    personFitRows = rows,
    q3Matrix = q3_matrix,
    warnings = warnings
  )
}

.cdm_model_criticism <- function(fit, item_ids, attribute_ids, opts) {
  warnings <- character(0)
  mf <- tryCatch({
    box <- new.env()
    utils::capture.output(box$mf <- suppressWarnings(GDINA::modelfit(fit)))
    if (is.null(box$mf)) stop("modelfit returned nothing")
    box$mf
  }, error = function(e) e)
  if (inherits(mf, "error")) {
    warnings <- c(warnings, paste("modelfit:", conditionMessage(mf)))
    cdm <- list(available = FALSE, note = conditionMessage(mf))
  } else {
    cdm <- .cdm_fit_summary(mf)
    if (isTRUE(cdm$available == FALSE) && !is.null(cdm$note)) {
      warnings <- c(warnings, paste("modelfit:", cdm$note))
    }
  }

  eps_opt <- NA_real_
  if (!is.null(opts) && !is.null(opts$qvalEps)) {
    eps_opt <- .criticism_number(
      opts, "qvalEps", NA_real_, function(v) is.finite(v) && v > 0 && v < 1
    )
  }
  qv <- tryCatch({
    box <- new.env()
    utils::capture.output({
      box$qv <- if (is.finite(eps_opt)) GDINA::Qval(fit, eps = eps_opt) else GDINA::Qval(fit)
    })
    if (is.null(box$qv)) stop("Qval returned nothing")
    box$qv
  }, error = function(e) e)
  if (inherits(qv, "error")) {
    warnings <- c(warnings, paste("Qval:", conditionMessage(qv)))
    q_sum <- list(available = FALSE, note = conditionMessage(qv))
  } else {
    q_sum <- .qval_summary_from_obj(qv, item_ids, attribute_ids)
    if (isTRUE(q_sum$available == FALSE) && !is.null(q_sum$note)) {
      warnings <- c(warnings, paste("Qval:", q_sum$note))
    }
  }
  list(cdmFit = cdm, qValidation = q_sum, warnings = warnings)
}
