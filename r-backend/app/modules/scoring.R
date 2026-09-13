# modules/scoring.R
# NEUTRALIZED (D61). This file is not sourced by api.R and exposes no
# plumber routes.
#
# A live POST /score on the R service would put R on a scoring path.
# Scoring applies already-calibrated parameters to one response and stays
# in JavaScript (ADR 0001, build reference Part 4.1). Batch rescoring, if
# it is ever needed, is a W16+ decision and must not be a session endpoint.
#
# Do not remount /score. The boundary guard on the node side asserts that
# no module under server/delivery imports the R client.

scoring_api_is_mounted <- FALSE
