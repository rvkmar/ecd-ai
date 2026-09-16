# modules/analytics.R
# Stub. Not sourced by api.R.
#
# D77 item-analysis lives on the calibrate path:
#   POST /calibrate/item-analysis  (primary; KIND_TO_R_PATH)
#   POST /analyse/item             (calendar alias)
# Both call calibrate_dispatch(family = "item-analysis") in calibrate.R
# and ingest into analysisArtefacts (D76). This file remains an unmounted
# stub for any future non-calibration analytics surface.

analytics_api_is_mounted <- FALSE
