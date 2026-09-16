# api.R
# Programmatic plumber router for the private R calibration service.
# start.R sources this file and calls api$run(). This file must NOT call
# $run() itself -- that was the D61 boot bug (hooks /health 404).
#
# No browser CORS. This service is private to the compose network and is
# called only by the node backend (ADR 0001 / R architecture doc).
# ASCII comments only -- R parseUTF8 has failed on a UTF-8 BOM here.

app_dir <- Sys.getenv("R_BACKEND_APP_DIR", unset = "/home/app")
if (!file.exists(file.path(app_dir, "modules", "health.R"))) {
  app_dir <- getwd()
}
mod <- function(name) file.path(app_dir, "modules", name)

source(mod("health.R"), local = FALSE)
source(mod("contract.R"), local = FALSE)
source(mod("calibrate.R"), local = FALSE)

# scoring.R is deliberately NOT sourced. A live /score endpoint would put
# R on a scoring path. Neutralized in modules/scoring.R.

library(plumber)

# Optional shared-secret between node and R. /health stays open so compose
# healthchecks and operators can probe without the token.
.r_service_token <- Sys.getenv("R_SERVICE_TOKEN", unset = "")

# jsonlite's default toJSON boxes length-1 vectors. ADR 0002 and /health
# want scalars (status: "healthy", not ["healthy"]). CI on D64 saw the
# boxed form from the published image's plumber.
# jsonlite's default null="list" turns R NULL into JSON {}. ADR 0002 and
# D77 distractors: null need real JSON null.
.json_unboxed <- plumber::serializer_unboxed_json(null = "null", digits = 16)

api <- plumber::Plumber$new()
api$setSerializer(.json_unboxed)

api$filter("r_service_auth", function(req, res) {
  path <- req$PATH_INFO
  if (is.null(path) || identical(path, "/health") || identical(path, "/")) {
    return(plumber::forward())
  }
  if (!nzchar(.r_service_token)) {
    return(plumber::forward())
  }
  auth <- req$HTTP_AUTHORIZATION
  expected <- paste0("Bearer ", .r_service_token)
  if (is.null(auth) || !identical(auth, expected)) {
    res$status <- 401
    return(list(
      contractVersion = CALIBRATION_CONTRACT_VERSION,
      error = list(
        message = "Missing or invalid R_SERVICE_TOKEN",
        rClass = "Unauthorized",
        stderr = ""
      )
    ))
  }
  plumber::forward()
})

api$handle("GET", "/health", function(req, res) {
  health_payload()
}, serializer = .json_unboxed)

api$handle("POST", "/calibrate/irt", function(req, res) {
  calibrate_dispatch(req, res, family = "irt")
}, serializer = .json_unboxed)

api$handle("POST", "/calibrate/dina", function(req, res) {
  calibrate_dispatch(req, res, family = "dina")
}, serializer = .json_unboxed)

# Same worker as /calibrate/dina. The job kind dina-parameters posts
# here when model.family is gdina; both families share GDINA::GDINA.
api$handle("POST", "/calibrate/gdina", function(req, res) {
  calibrate_dispatch(req, res, family = "gdina")
}, serializer = .json_unboxed)

api$handle("POST", "/calibrate/ctt", function(req, res) {
  calibrate_dispatch(req, res, family = "ctt")
}, serializer = .json_unboxed)

api$handle("POST", "/calibrate/dif", function(req, res) {
  calibrate_dispatch(req, res, family = "dif")
}, serializer = .json_unboxed)

api$handle("POST", "/calibrate/equating", function(req, res) {
  calibrate_dispatch(req, res, family = "equating")
}, serializer = .json_unboxed)

# D77: primary path matches DIF/equating (/calibrate/<family>).
api$handle("POST", "/calibrate/item-analysis", function(req, res) {
  calibrate_dispatch(req, res, family = "item-analysis")
}, serializer = .json_unboxed)

# Calendar alias for the same handler (exit-check name /analyse/item).
api$handle("POST", "/analyse/item", function(req, res) {
  calibrate_dispatch(req, res, family = "item-analysis")
}, serializer = .json_unboxed)

# D78: test information curves → analysisArtefacts (never parameterSets).
api$handle("POST", "/calibrate/test-information", function(req, res) {
  calibrate_dispatch(req, res, family = "test-information")
}, serializer = .json_unboxed)

# Calendar alias for the same handler (exit-check name /analyse/test-information).
api$handle("POST", "/analyse/test-information", function(req, res) {
  calibrate_dispatch(req, res, family = "test-information")
}, serializer = .json_unboxed)

# Legacy path kept as an alias of /calibrate/irt so a leftover client that
# still posts here does not 404. Same contract; no session scoring.
api$handle("POST", "/irt/calibrate", function(req, res) {
  calibrate_dispatch(req, res, family = "irt")
}, serializer = .json_unboxed)

# Diagnostic only. Does not list futures() -- that call threw
# "no applicable method for 'futures' applied to an object of class logical".
api$handle("GET", "/irt/parallel-status", function(req, res) {
  list(
    plan = "sequential",
    workers = 1L,
    note = "Parallel backends are not used. Calibration is a queued job on node.",
    timestamp = format(Sys.time(), tz = "UTC", usetz = TRUE)
  )
})
