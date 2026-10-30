# modules/bundleScoring.R
# TU6. Optional scoring bundles for dichotomous IRT.
# Each bundle replaces its item columns with one integer sum and is fit
# as a graded (GRM) item. No bundles leaves the matrix unchanged.
# A missing member cell stays missing: it is not scored as zero.
# ASCII only.

.bundle_id_list <- function(x) {
  if (is.null(x)) return(character(0))
  if (is.character(x) && !is.list(x)) return(as.character(x))
  vals <- as.list(x)
  vapply(vals, function(v) {
    if (is.null(v) || length(v) == 0) return("")
    if (is.list(v)) v <- unlist(v, use.names = FALSE)
    as.character(v[[1]])
  }, character(1))
}

.bundle_rows <- function(bundles) {
  if (is.null(bundles)) return(list())
  if (is.data.frame(bundles)) {
    if (!nrow(bundles)) return(list())
    return(lapply(seq_len(nrow(bundles)), function(i) as.list(bundles[i, , drop = FALSE])))
  }
  if (!is.list(bundles)) return(list())
  # One bundle object has id and itemIds on itself. A list of bundles does not.
  if (!is.null(bundles$id) && !is.null(bundles$itemIds)) {
    first <- bundles[[1]]
    if (is.null(first) || !is.list(first)) return(list(bundles))
  }
  as.list(bundles)
}

.bundle_char <- function(x) {
  if (is.null(x) || length(x) == 0) return("")
  val <- unlist(x, use.names = FALSE)
  if (length(val) == 0 || is.na(val[[1]])) return("")
  as.character(val[[1]])
}

# resp_df: persons by items, numeric, NA where the item was not administered.
# bundles: list or data.frame of { id, itemIds, basis, sourceId }.
# Returns df, applied (small summaries), warnings. error is NULL.
.collapse_scoring_bundles <- function(resp_df, bundles) {
  rows <- .bundle_rows(bundles)
  empty <- list(df = resp_df, applied = list(), warnings = character(0), error = NULL)
  if (!length(rows)) return(empty)

  df <- resp_df
  applied <- list()
  warnings <- character(0)
  used <- character(0)

  for (row in rows) {
    if (!is.list(row)) next
    bid <- .bundle_char(row$id)
    members <- unique(.bundle_id_list(row$itemIds))
    members <- members[nzchar(members)]
    if (!nzchar(bid) || length(members) < 2L) {
      warnings <- c(warnings, sprintf("skipped a scoring bundle: id '%s' needs at least two item ids", bid))
      next
    }
    present <- members[members %in% colnames(df)]
    if (length(present) < 2L) {
      warnings <- c(warnings, sprintf("skipped bundle '%s': fewer than two member columns are in the matrix", bid))
      next
    }
    if (any(present %in% used)) {
      warnings <- c(warnings, sprintf("skipped bundle '%s': a member is already bundled", bid))
      next
    }
    if (bid %in% colnames(df) && !(bid %in% present)) {
      warnings <- c(warnings, sprintf("skipped bundle '%s': the id collides with another column", bid))
      next
    }

    mat <- as.matrix(df[, present, drop = FALSE])
    storage.mode(mat) <- "numeric"
    sums <- apply(mat, 1L, function(v) {
      if (any(!is.finite(v))) return(NA_integer_)
      as.integer(round(sum(v)))
    })

    first <- present[[1]]
    cols <- colnames(df)
    df[[bid]] <- as.integer(sums)
    new_order <- character(0)
    for (col in cols) {
      if (identical(col, first)) {
        new_order <- c(new_order, bid)
        next
      }
      if (col %in% present) next
      new_order <- c(new_order, col)
    }
    df <- df[, new_order, drop = FALSE]
    used <- c(used, present)

    basis <- .bundle_char(row$basis)
    source_id <- .bundle_char(row$sourceId)
    applied[[length(applied) + 1L]] <- list(
      id = bid,
      basis = if (nzchar(basis)) basis else NULL,
      sourceId = if (nzchar(source_id)) source_id else NULL,
      itemIds = as.list(present),
      model = "GRM",
      maxScore = as.integer(length(present))
    )
  }

  list(df = df, applied = applied, warnings = warnings, error = NULL)
}
