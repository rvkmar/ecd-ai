# test-model-criticism.R
# TU4. Summary helpers always run. When mirt and GDINA are installed,
# the published LSAT7 and sim10GDINA fixtures are fit and checked.
# CI sets ECD_REQUIRE_MODEL_CRITICISM_PACKAGES=1 so a missing package fails.
#
#   Rscript r-backend/app/tests/test-model-criticism.R

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
source(file.path(app_dir, "modules", "reportHtml.R"), local = FALSE)
source(file.path(app_dir, "modules", "modelCriticism.R"), local = FALSE)
source(file.path(app_dir, "modules", "calibrate.R"), local = FALSE)

.stop_if <- function(cond, msg) {
  if (isTRUE(cond)) stop(msg, call. = FALSE)
}

packed <- .person_fit_summary(c(-2.5, -2, 0, NA), list("a", "b", "c", "d"), -2)
.stop_if(packed$summary$nPersons != 4L, "person summary nPersons")
.stop_if(packed$summary$nFinite != 3L, "person summary nFinite drops NA")
.stop_if(packed$summary$nMisfit != 1L, "only Zh < -2 is a misfit")
.stop_if(abs(packed$summary$proportionMisfit - 1 / 3) > 1e-9, "proportion uses finite Zh")
.stop_if(!is.null(packed$summary$persons), "summary must not carry person rows")
.stop_if(!is.null(packed$summary$rows), "summary must not carry rows")
.stop_if(length(packed$rows) != 4L, "sidecar lists every person")
.stop_if(!isTRUE(packed$rows[[1]]$misfit), "first person is a misfit")
.stop_if(isTRUE(packed$rows[[2]]$misfit), "Zh equal to the cutoff is not a misfit")
.stop_if(!identical(packed$rows[[1]]$personId, "a"), "person id is kept on the sidecar")

mat <- matrix(c(
  1, 0.25, 0.2,
  0.25, 1, -0.4,
  0.2, -0.4, 1
), nrow = 3, byrow = TRUE)
q3 <- .q3_summary(mat, c("A", "B", "C"), 0.2)
.stop_if(abs(q3$summary$maxAbsQ3 - 0.4) > 1e-9, "max |Q3| ignores the diagonal")
.stop_if(q3$summary$nFlaggedPairs != 2L, "0.2 is not above the threshold; 0.25 and 0.4 are")
.stop_if(!is.null(q3$summary$matrix), "summary must not carry the matrix")
.stop_if(!is.null(q3$summary$values), "summary must not carry matrix values")
.stop_if(q3$summary$flaggedPairs[[1]]$itemId1 != "B", "largest |Q3| pair comes first")
.stop_if(q3$summary$flaggedPairs[[1]]$itemId2 != "C", "largest |Q3| pair is B,C")
.stop_if(length(q3$matrix$values) != 3L, "sidecar keeps the square matrix")
.stop_if(length(q3$matrix$values[[1]]) != 3L, "sidecar row width")

sug <- rbind(c(1, 0, 0), c(0, 1, 0))
orig <- rbind(c(1, 0, 0), c(1, 0, 0))
rownames(sug) <- rownames(orig) <- c("Item.1", "Item.2")
pvaf <- matrix(c(0.99, 0.40, 0.20, 0.50, 0.97, 0.30), nrow = 3)
rownames(pvaf) <- c("100", "010", "001")
colnames(pvaf) <- c("Item.1", "Item.2")
qv <- .q_validation_summary(
  sug, orig, pvaf, 0.95,
  c("Item.1", "Item.2"), c("A1", "A2", "A3")
)
.stop_if(qv$nChanged != 1L, "only the changed q-vector is a suggestion")
.stop_if(qv$suggestions[[1]]$itemId != "Item.2", "Item.2 changed")
.stop_if(abs(qv$suggestions[[1]]$pvaf - 0.97) > 1e-9, "PVAF is the suggested q-vector, not the original")
.stop_if(!identical(unlist(qv$suggestions[[1]]$suggested), c(0L, 1L, 0L)), "suggested q-vector")

cdm <- .cdm_fit_summary(list(M2 = 10, M2.df = 4, M2.pvalue = 0.04, RMSEA2 = 0.02, SRMSR = 0.03))
.stop_if(!isTRUE(cdm$available), "cdm fit available")
.stop_if(abs(cdm$SRMSR - 0.03) > 1e-9, "SRMSR")
.stop_if(abs(cdm$RMSEA2 - 0.02) > 1e-9, "RMSEA2")
.stop_if(abs(cdm$M2 - 10) > 1e-9, "M2")

.expand_patterns <- function(table) {
  rows <- list()
  ids <- character()
  for (p in table$patterns) {
    freq <- as.integer(unlist(p$freq, use.names = FALSE)[[1]])
    resp <- as.numeric(unlist(p$responses, use.names = FALSE))
    if (is.na(freq) || freq < 1L) next
    rows <- c(rows, rep(list(resp), freq))
    ids <- c(ids, sprintf("p%04d", seq.int(length(ids) + 1L, length.out = freq)))
  }
  list(rows = rows, ids = as.list(ids))
}

.fit_body <- function(table, family, subtype = NULL) {
  expanded <- .expand_patterns(table)
  model <- list(family = family, itemIds = table$itemIds)
  if (!is.null(subtype)) model$subtype <- subtype
  body <- list(
    contractVersion = "1.0",
    jobId = paste0("tu4-", family),
    model = model,
    responseMatrix = list(
      personIds = expanded$ids,
      itemIds = table$itemIds,
      data = expanded$rows
    ),
    options = list(seed = 1L, maxIterations = 500L, convergenceTolerance = 1e-4)
  )
  if (!is.null(table$qMatrix)) {
    body$qMatrix <- list(
      attributeIds = table$attributeIds,
      itemIds = table$itemIds,
      data = table$qMatrix
    )
  }
  body
}

require_pkgs <- nzchar(Sys.getenv("ECD_REQUIRE_MODEL_CRITICISM_PACKAGES", unset = ""))
fix_dir <- file.path(app_dir, "tests", "fixtures")

if (require_pkgs && !requireNamespace("mirt", quietly = TRUE)) {
  stop("mirt is required for the LSAT7 criticism fixture", call. = FALSE)
}
if (require_pkgs && !requireNamespace("GDINA", quietly = TRUE)) {
  stop("GDINA is required for the sim10GDINA criticism fixture", call. = FALSE)
}

if (requireNamespace("mirt", quietly = TRUE)) {
  lsat7 <- jsonlite::fromJSON(file.path(fix_dir, "lsat7-frequency-table.json"), simplifyVector = FALSE)
  res <- new.env()
  out <- calibrate_irt(.fit_body(lsat7, "irt", "2PL"), res)
  .stop_if(!isTRUE(out$converged), paste("LSAT7 did not converge:", out$error$message))
  pf <- out$fitStatistics$personFit
  .stop_if(is.null(pf) || isTRUE(pf$available == FALSE), paste("LSAT7 person fit missing:", pf$note))
  .stop_if(pf$nPersons != 1000L, "LSAT7 personFit nPersons")
  .stop_if(pf$statistic != "Zh", "LSAT7 statistic")
  .stop_if(abs(pf$cutoff - (-2)) > 1e-9, "LSAT7 Zh cutoff")
  .stop_if(length(out$personFitRows) != 1000L, "LSAT7 sidecar length")
  .stop_if(!is.null(out$fitStatistics$personFitRows), "Zh rows must stay off fitStatistics")
  ld <- out$fitStatistics$localDependence
  .stop_if(is.null(ld) || isTRUE(ld$available == FALSE), paste("LSAT7 Q3 missing:", ld$note))
  .stop_if(abs(ld$threshold - 0.2) > 1e-9, "LSAT7 Q3 threshold")
  .stop_if(!is.finite(ld$maxAbsQ3), "LSAT7 maxAbsQ3")
  .stop_if(is.null(out$q3Matrix) || length(out$q3Matrix$itemIds) != 5L, "LSAT7 Q3 matrix")
  .stop_if(!is.null(out$fitStatistics$q3Matrix), "Q3 matrix must stay off fitStatistics")
  .stop_if(ld$nFlaggedPairs != length(ld$flaggedPairs), "LSAT7 flagged pair count")
  cat("LSAT7 fixture criticism ok\n")
} else {
  cat("mirt not installed; skipped LSAT7 fixture\n")
}

if (requireNamespace("GDINA", quietly = TRUE)) {
  sim10 <- jsonlite::fromJSON(file.path(fix_dir, "sim10gdina.json"), simplifyVector = FALSE)
  res <- new.env()
  out <- calibrate_diagnostic(.fit_body(sim10, "gdina"), res)
  .stop_if(!isTRUE(out$converged), paste("sim10GDINA did not converge:", out$error$message))
  cdm <- out$fitStatistics$cdmFit
  .stop_if(is.null(cdm) || isTRUE(cdm$available == FALSE), paste("cdmFit missing:", cdm$note))
  .stop_if(!is.finite(cdm$M2) || cdm$M2 < 0, "sim10 M2")
  .stop_if(!is.finite(cdm$RMSEA2) || cdm$RMSEA2 < 0, "sim10 RMSEA2")
  .stop_if(!is.finite(cdm$SRMSR) || cdm$SRMSR < 0, "sim10 SRMSR")
  qv <- out$fitStatistics$qValidation
  .stop_if(is.null(qv) || isTRUE(qv$available == FALSE), paste("qValidation missing:", qv$note))
  .stop_if(qv$nItems != 10L, "sim10 qValidation nItems")
  .stop_if(qv$nChanged != length(qv$suggestions), "sim10 suggestion count")
  .stop_if(!is.finite(out$fitStatistics$AIC), "AIC must remain")
  cat("sim10GDINA fixture criticism ok\n")
} else {
  cat("GDINA not installed; skipped sim10GDINA fixture\n")
}

cat("R model criticism tests passed\n")
