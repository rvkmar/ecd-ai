# test-contract.R
# R-side ADR 0002 contract tests. Run with:
#   Rscript -e "source('r-backend/app/modules/contract.R'); source('r-backend/app/tests/test-contract.R')"
# CI runs the Node twin (server/r/__tests__/calibrationContract.test.js)
# against the same fixtures.

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
fix_dir <- file.path(app_dir, "tests", "fixtures")

valid_req <- jsonlite::fromJSON(file.path(fix_dir, "valid-request.json"), simplifyVector = FALSE)
valid_res <- jsonlite::fromJSON(file.path(fix_dir, "valid-response.json"), simplifyVector = FALSE)
nonconv <- jsonlite::fromJSON(file.path(fix_dir, "non-converged-response.json"), simplifyVector = FALSE)

.stop_if <- function(cond, msg) {
  if (cond) stop(msg, call. = FALSE)
}

.stop_if(!is.null(validate_calibration_request(valid_req)), "valid request was refused")
.stop_if(!is.null(validate_calibration_response(valid_res)), "valid response was refused")

# Non-converged is a legal RESPONSE (inspectable on the job). Ingestion
# refusal is a node-side rule and is asserted there.
.stop_if(!is.null(validate_calibration_response(nonconv)), "non-converged response failed response validation")
.stop_if(!isFALSE(nonconv$converged), "non-converged fixture is not converged: false")

bad <- valid_req
bad$options$seed <- NULL
.stop_if(is.null(validate_calibration_request(bad)), "missing seed was accepted")

mismatch <- valid_req
mismatch$model$itemIds <- list("item_a", "item_z", "item_c")
.stop_if(is.null(validate_calibration_request(mismatch)), "itemId order mismatch was accepted")

cat("R contract tests passed\n")
