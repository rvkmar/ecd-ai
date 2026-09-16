# modules/contract.R
# ADR 0002 request/response envelope. Same version string and required
# fields as server/r/calibrationContract.js. Keep the two in lockstep;
# contract tests on both sides read the same JSON fixtures.

CALIBRATION_CONTRACT_VERSION <- "1.0"

CALIBRATION_MODEL_FAMILIES <- c(
  "irt", "dina", "gdina", "ctt", "dif", "equating", "item-analysis",
  "test-information", "attribute-profile"
)
CALIBRATION_IRT_SUBTYPES <- c("2PL", "3PL", "Rasch")

.as_char <- function(x) {
  if (is.null(x)) return(NA_character_)
  as.character(x)
}

.null_to_na <- function(x) {
  if (is.null(x)) return(NA_real_)
  as.numeric(x)
}

validate_calibration_request <- function(body) {
  errors <- character(0)

  if (is.null(body) || !is.list(body)) {
    return("Request body must be a JSON object")
  }

  if (!identical(.as_char(body$contractVersion), CALIBRATION_CONTRACT_VERSION)) {
    errors <- c(errors, paste0(
      "contractVersion must be '", CALIBRATION_CONTRACT_VERSION, "'"
    ))
  }

  if (is.null(body$jobId) || !nzchar(.as_char(body$jobId))) {
    errors <- c(errors, "jobId is required")
  }

  model <- body$model
  if (is.null(model) || !is.list(model)) {
    errors <- c(errors, "model is required")
  } else {
    family <- .as_char(model$family)
    if (!family %in% CALIBRATION_MODEL_FAMILIES) {
      errors <- c(errors, paste0(
        "model.family must be one of: ",
        paste(CALIBRATION_MODEL_FAMILIES, collapse = ", ")
      ))
    }
    if (identical(family, "irt")) {
      subtype <- .as_char(model$subtype)
      if (!subtype %in% CALIBRATION_IRT_SUBTYPES) {
        errors <- c(errors, paste0(
          "model.subtype must be one of: ",
          paste(CALIBRATION_IRT_SUBTYPES, collapse = ", ")
        ))
      }
    }
    if (is.null(model$itemIds) || length(model$itemIds) < 2) {
      errors <- c(errors, "model.itemIds must name at least two items")
    }
  }

  rm <- body$responseMatrix
  if (is.null(rm) || !is.list(rm)) {
    errors <- c(errors, "responseMatrix is required")
  } else {
    if (is.null(rm$personIds) || length(rm$personIds) < 2) {
      errors <- c(errors, "responseMatrix.personIds must name at least two persons")
    }
    if (is.null(rm$itemIds) || length(rm$itemIds) < 2) {
      errors <- c(errors, "responseMatrix.itemIds must name at least two items")
    }
    if (!is.null(model$itemIds) && !is.null(rm$itemIds)) {
      model_ids <- vapply(model$itemIds, .as_char, character(1))
      rm_ids <- vapply(rm$itemIds, .as_char, character(1))
      if (!identical(model_ids, rm_ids)) {
        errors <- c(errors, "model.itemIds must match responseMatrix.itemIds in order")
      }
    }
    if (is.null(rm$data) || length(rm$data) == 0) {
      errors <- c(errors, "responseMatrix.data is required")
    }
  }

  opts <- body$options
  if (is.null(opts) || is.null(opts$seed)) {
    errors <- c(errors, "options.seed is required (reproducibility is provenance)")
  }

  family <- if (!is.null(model) && is.list(model)) .as_char(model$family) else NA_character_
  if (identical(family, "dif")) {
    groups <- body$groups
    if (is.null(groups) || !is.list(groups)) {
      errors <- c(errors, "groups is required for family dif")
    } else {
      if (is.null(groups$reference) || !nzchar(.as_char(groups$reference))) {
        errors <- c(errors, "groups.reference is required")
      }
      if (is.null(groups$focal) || !nzchar(.as_char(groups$focal))) {
        errors <- c(errors, "groups.focal is required")
      }
      if (!is.null(groups$reference) && !is.null(groups$focal) &&
          identical(.as_char(groups$reference), .as_char(groups$focal))) {
        errors <- c(errors, "groups.reference and groups.focal must differ")
      }
      if (is.null(groups$labels) || length(groups$labels) < 2) {
        errors <- c(errors, "groups.labels must name at least two persons")
      }
      if (!is.null(rm$personIds) && !is.null(groups$labels) &&
          length(groups$labels) != length(rm$personIds)) {
        errors <- c(errors, "groups.labels length must match responseMatrix.personIds")
      }
    }
  }
  if (identical(family, "equating")) {
    forms <- body$forms
    if (is.null(forms) || !is.list(forms)) {
      errors <- c(errors, "forms is required for family equating")
    } else {
      if (is.null(forms$formX) || !nzchar(.as_char(forms$formX))) {
        errors <- c(errors, "forms.formX is required")
      }
      if (is.null(forms$formY) || !nzchar(.as_char(forms$formY))) {
        errors <- c(errors, "forms.formY is required")
      }
      if (!is.null(forms$formX) && !is.null(forms$formY) &&
          identical(.as_char(forms$formX), .as_char(forms$formY))) {
        errors <- c(errors, "forms.formX and forms.formY must differ")
      }
      if (is.null(forms$labels) || length(forms$labels) < 2) {
        errors <- c(errors, "forms.labels must name at least two persons")
      }
      if (is.null(forms$commonItemIds) || length(forms$commonItemIds) < 2) {
        errors <- c(errors, "forms.commonItemIds must name at least two common items")
      }
      if (!is.null(rm$personIds) && !is.null(forms$labels) &&
          length(forms$labels) != length(rm$personIds)) {
        errors <- c(errors, "forms.labels length must match responseMatrix.personIds")
      }
    }
  }
  diagnostic <- identical(family, "dina") || identical(family, "gdina")
  if (isTRUE(diagnostic) && is.null(body$qMatrix)) {
    errors <- c(errors, "qMatrix is required for dina/gdina")
  }
  if (!is.null(body$qMatrix)) {
    qm <- body$qMatrix
    if (!is.list(qm) || is.null(qm$attributeIds) || length(qm$attributeIds) < 1) {
      errors <- c(errors, "qMatrix.attributeIds must name at least one attribute")
    }
    if (is.list(qm) && (is.null(qm$itemIds) || length(qm$itemIds) < 2)) {
      errors <- c(errors, "qMatrix.itemIds must name at least two items")
    }
    if (is.list(qm) && !is.null(model$itemIds) && !is.null(qm$itemIds)) {
      model_ids <- vapply(model$itemIds, .as_char, character(1))
      qm_ids <- vapply(qm$itemIds, .as_char, character(1))
      if (!identical(model_ids, qm_ids)) {
        errors <- c(errors, "qMatrix.itemIds must match model.itemIds in order")
      }
    }
    if (is.list(qm) && (is.null(qm$data) || length(qm$data) == 0)) {
      errors <- c(errors, "qMatrix.data is required")
    }
  }

  if (length(errors) == 0) NULL else errors
}

validate_calibration_response <- function(body) {
  errors <- character(0)
  if (is.null(body) || !is.list(body)) {
    return("Response body must be a JSON object")
  }
  if (!identical(.as_char(body$contractVersion), CALIBRATION_CONTRACT_VERSION)) {
    errors <- c(errors, paste0(
      "contractVersion must be '", CALIBRATION_CONTRACT_VERSION, "'"
    ))
  }
  if (is.null(body$jobId) || !nzchar(.as_char(body$jobId))) {
    errors <- c(errors, "jobId is required")
  }
  if (!is.logical(body$converged) || length(body$converged) != 1) {
    errors <- c(errors, "converged must be a boolean")
  }
  if (isTRUE(body$converged)) {
    if (is.null(body$packageVersion) || !nzchar(.as_char(body$packageVersion))) {
      errors <- c(errors, "packageVersion is required when converged is true")
    }
    if (is.null(body$sampleSize) || is.na(.null_to_na(body$sampleSize)) || .null_to_na(body$sampleSize) <= 0) {
      errors <- c(errors, "sampleSize must be a positive number when converged is true")
    }
    if (is.null(body$calibratedAt) || !nzchar(.as_char(body$calibratedAt))) {
      errors <- c(errors, "calibratedAt is required when converged is true")
    }
    if (is.null(body$parameters) || !is.list(body$parameters)) {
      errors <- c(errors, "parameters is required when converged is true")
    }
  }
  if (length(errors) == 0) NULL else errors
}

.response_to_matrix <- function(raw, n_items) {
  if (is.data.frame(raw)) {
    return(as.matrix(raw))
  }
  if (is.matrix(raw)) {
    return(raw)
  }
  if (!is.list(raw) || length(raw) == 0) {
    stop("responseMatrix.data must be a matrix or a list of rows")
  }

  # Column-oriented list (one numeric vector per item).
  if (length(raw) == n_items && all(vapply(raw, function(col) {
    is.atomic(col) && !is.list(col) && length(col) > 1
  }, logical(1)))) {
    return(do.call(cbind, lapply(raw, as.numeric)))
  }

  rows <- lapply(raw, function(row) {
    as.numeric(unlist(row, use.names = FALSE))
  })
  lengths <- vapply(rows, length, integer(1))
  if (length(unique(lengths)) != 1) {
    stop("responseMatrix.data rows do not share one length")
  }
  do.call(rbind, rows)
}

response_matrix_to_df <- function(rm) {
  item_ids <- vapply(as.list(rm$itemIds), .as_char, character(1))
  mat <- .response_to_matrix(rm$data, length(item_ids))

  # lapply() over a matrix walks columns. If we accidentally built
  # items x persons, transpose back to the ADR 0002 orientation.
  if (nrow(mat) == length(item_ids) && ncol(mat) != length(item_ids) && ncol(mat) > 2) {
    mat <- t(mat)
  }
  if (ncol(mat) != length(item_ids)) {
    stop(sprintf(
      "responseMatrix.data is %dx%d, expected %d columns (itemIds)",
      nrow(mat), ncol(mat), length(item_ids)
    ))
  }
  storage.mode(mat) <- "numeric"
  colnames(mat) <- item_ids
  as.data.frame(mat, stringsAsFactors = FALSE)
}

q_matrix_to_matrix <- function(qm) {
  item_ids <- vapply(as.list(qm$itemIds), .as_char, character(1))
  attr_ids <- vapply(as.list(qm$attributeIds), .as_char, character(1))
  mat <- .response_to_matrix(qm$data, length(attr_ids))

  if (nrow(mat) == length(attr_ids) && ncol(mat) == length(item_ids) &&
      length(attr_ids) != length(item_ids)) {
    mat <- t(mat)
  }
  if (nrow(mat) != length(item_ids) || ncol(mat) != length(attr_ids)) {
    stop(sprintf(
      "qMatrix.data is %dx%d, expected %dx%d (items x attributes)",
      nrow(mat), ncol(mat), length(item_ids), length(attr_ids)
    ))
  }
  storage.mode(mat) <- "numeric"
  rownames(mat) <- item_ids
  colnames(mat) <- attr_ids
  mat
}
