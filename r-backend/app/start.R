# start.R
# Boot the programmatic plumber router built in api.R.
# Do NOT use plumber::plumb() on api.R -- that file is not annotation-based
# and calling $run() from inside api.R left /health unattached (404).
# Verified pattern: source the factory, then api$run(...).

options(plumber.methodNotAllowed = TRUE)
# LSAT7's ADR 0002 envelope is ~100 kB. Some httpuv/plumber builds default
# to a small body cap; refuse that rather than silently truncating.
options(plumber.maxRequestSize = 50 * 1024 * 1024)
options(httpuv.maxBodySize = 50 * 1024 * 1024)

app_dir <- Sys.getenv("R_BACKEND_APP_DIR", unset = "/home/app")
if (!file.exists(file.path(app_dir, "api.R"))) {
  app_dir <- getwd()
}

source(file.path(app_dir, "api.R"), local = FALSE)

host <- Sys.getenv("R_BACKEND_HOST", unset = "0.0.0.0")
port <- as.integer(Sys.getenv("R_BACKEND_PORT", unset = "4000"))

api$run(host = host, port = port)
