# modules/bnCalibrate.R
# TU12. EM for conditional probability tables on the evidence model's
# latent tree. Base R only. Scoring stays in JS.
#
# The structure is given. Latent student-model variables are unobserved.
# Observables are binary (1 = activated). Missing cells are NA and do not
# count as 0. Each node has at most one parent. The joint of the latent
# states is enumerated, the same cap as exact scoring (64).
#
# A one-latent network is a naive-Bayes star. Its parameter object matches
# the star bayesian-cpt shape: a flat _prior and P(u = 1 | state) on each
# observable. A larger tree stores root priors under _prior, a child CPT
# as parent-state -> child-state, and the same observable rows.
#
# Higher state indexes are started with higher P(u = 1), so the last state
# stays the high-success state that scoring treats as the positive one.
# A Dirichlet pseudo-count (default 0.5) keeps every probability inside
# (0, 1).
#
# Fit on the parameter set is the observed-data log-likelihood, AIC, BIC
# (BIC uses the number of persons), and the mean and max absolute gap
# between each observable's sample proportion and the model marginal.
# Person posterior marginals are returned beside that summary. They are
# not part of the conditional probability table.

BN_MAX_STATES <- 8L
BN_MAX_JOINT <- 64L
BN_EM_TOL <- 1e-6
BN_PACKAGE_VERSION <- paste0("base-R ", R.version$major, ".", R.version$minor, " bn-em")

.bn_text <- function(x) {
  if (is.null(x) || length(x) == 0) return(NA_character_)
  val <- .as_char(x)
  if (is.na(val) || !nzchar(val) || val %in% c("NULL", "null", "NA")) return(NA_character_)
  val
}

.bn_states <- function(x) {
  if (is.null(x)) return(character(0))
  vals <- as.character(unlist(x, use.names = FALSE))
  vals[!is.na(vals) & nzchar(vals) & !vals %in% c("NULL", "null")]
}

.bn_as_nodes <- function(x) {
  if (is.null(x)) return(list())
  if (is.data.frame(x)) {
    return(lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = TRUE])))
  }
  if (is.list(x)) return(unname(x))
  list()
}

.bn_has_cycle <- function(ids, parent_of) {
  id_set <- ids
  for (start in ids) {
    seen <- character(0)
    current <- parent_of[[start]]
    while (!is.null(current) && !is.na(current) && current %in% id_set) {
      if (identical(current, start) || current %in% seen) return(TRUE)
      seen <- c(seen, current)
      current <- parent_of[[current]]
    }
  }
  FALSE
}

# Structural errors for a bn request. character(0) when the tree is usable.
bn_request_errors <- function(body) {
  errors <- character(0)
  model <- body$model
  network <- if (!is.null(model) && is.list(model)) model$network else NULL
  if (is.null(network) || !is.list(network)) {
    return("model.network is required for family bn")
  }

  raw_latents <- .bn_as_nodes(network$latents)
  raw_obs <- .bn_as_nodes(network$observables)
  if (length(raw_latents) < 1L) {
    return("model.network.latents must name at least one latent")
  }
  if (length(raw_obs) < 2L) {
    errors <- c(errors, "model.network.observables must name at least two observables")
  }

  latents <- list()
  seen <- character(0)
  for (i in seq_along(raw_latents)) {
    node <- raw_latents[[i]]
    if (!is.list(node)) {
      errors <- c(errors, paste0("model.network.latents[", i - 1L, "].id is required"))
      next
    }
    id <- .bn_text(node$id)
    if (is.na(id)) {
      errors <- c(errors, paste0("model.network.latents[", i - 1L, "].id is required"))
      next
    }
    if (id %in% seen) {
      errors <- c(errors, paste0("model.network id '", id, "' is not unique"))
      next
    }
    states <- .bn_states(node$states)
    if (length(states) < 2L) {
      errors <- c(errors, paste0("model.network.latents[", i - 1L, "] needs at least two states"))
    } else if (length(states) > BN_MAX_STATES) {
      errors <- c(errors, paste0(
        "model.network.latents[", i - 1L, "] has ", length(states),
        " states. Exact EM supports at most ", BN_MAX_STATES, "."
      ))
    } else if (anyDuplicated(states)) {
      errors <- c(errors, paste0("model.network.latents[", i - 1L, "] repeats a state"))
    }
    seen <- c(seen, id)
    latents[[length(latents) + 1L]] <- list(
      id = id,
      states = states,
      parent_id = .bn_text(node$parentId)
    )
  }

  latent_ids <- vapply(latents, function(node) node$id, character(1))
  observables <- list()
  for (i in seq_along(raw_obs)) {
    node <- raw_obs[[i]]
    if (!is.list(node)) {
      errors <- c(errors, paste0("model.network.observables[", i - 1L, "].id is required"))
      next
    }
    id <- .bn_text(node$id)
    if (is.na(id)) {
      errors <- c(errors, paste0("model.network.observables[", i - 1L, "].id is required"))
      next
    }
    if (id %in% seen) {
      errors <- c(errors, paste0("model.network id '", id, "' is not unique"))
      next
    }
    parent_id <- .bn_text(node$parentId)
    if (is.na(parent_id) || !parent_id %in% latent_ids) {
      errors <- c(errors, paste0("model.network.observables[", i - 1L, "] must name a latent parent"))
    }
    seen <- c(seen, id)
    observables[[length(observables) + 1L]] <- list(id = id, parent_id = parent_id)
  }

  parent_of <- list()
  roots <- 0L
  for (node in latents) {
    if (is.na(node$parent_id)) {
      roots <- roots + 1L
      next
    }
    if (!node$parent_id %in% latent_ids) {
      errors <- c(errors, paste0("model.network latent '", node$id, "' must name a latent parent"))
      next
    }
    if (identical(node$parent_id, node$id)) {
      errors <- c(errors, paste0("model.network latent '", node$id, "' cannot be its own parent"))
      next
    }
    parent_of[[node$id]] <- node$parent_id
  }
  if (length(latents) && roots < 1L) {
    errors <- c(errors, "model.network needs a latent with no parent")
  }
  if (.bn_has_cycle(latent_ids, parent_of)) {
    errors <- c(errors, "model.network latent edges form a cycle")
  }

  joint <- 1
  for (node in latents) {
    count <- length(node$states)
    if (count < 2L) next
    joint <- joint * count
    if (joint > BN_MAX_JOINT) {
      errors <- c(errors, paste0(
        "model.network joint has ", joint,
        " latent configurations. Exact EM supports at most ", BN_MAX_JOINT, "."
      ))
      break
    }
  }

  if (length(observables) >= 2L && !is.null(model$itemIds)) {
    obs_ids <- vapply(observables, function(node) node$id, character(1))
    item_ids <- as.character(unlist(model$itemIds, use.names = FALSE))
    if (!identical(item_ids, obs_ids)) {
      errors <- c(errors, "model.itemIds must match model.network.observables in order")
    }
  }

  errors
}

.bn_parse <- function(model) {
  errors <- bn_request_errors(list(model = model))
  if (length(errors)) return(list(errors = errors))

  network <- model$network
  raw_latents <- .bn_as_nodes(network$latents)
  raw_obs <- .bn_as_nodes(network$observables)
  latents <- lapply(raw_latents, function(node) {
    list(id = .bn_text(node$id), states = .bn_states(node$states), parent_id = .bn_text(node$parentId))
  })
  observables <- lapply(raw_obs, function(node) {
    list(id = .bn_text(node$id), parent_id = .bn_text(node$parentId))
  })
  by_id <- stats::setNames(seq_along(latents), vapply(latents, function(node) node$id, character(1)))
  for (i in seq_along(latents)) {
    parent <- latents[[i]]$parent_id
    latents[[i]]$parent_pos <- if (is.na(parent)) 0L else by_id[[parent]]
    latents[[i]]$n_states <- length(latents[[i]]$states)
  }
  for (i in seq_along(observables)) {
    observables[[i]]$parent_pos <- by_id[[observables[[i]]$parent_id]]
  }
  list(errors = character(0), latents = latents, observables = observables)
}

.bn_option_number <- function(opts, name, default) {
  if (is.null(opts) || is.null(opts[[name]])) return(default)
  val <- suppressWarnings(as.numeric(unlist(opts[[name]], use.names = FALSE)[[1]]))
  if (!is.finite(val)) default else val
}

.bn_configs <- function(latents) {
  grids <- lapply(latents, function(node) seq_len(node$n_states))
  configs <- do.call(expand.grid, c(grids, list(KEEP.OUT.ATTRS = FALSE, stringsAsFactors = FALSE)))
  names(configs) <- vapply(latents, function(node) node$id, character(1))
  configs
}

.bn_log_prior <- function(configs, latents, pi, child) {
  logp <- rep(0, nrow(configs))
  for (node in latents) {
    state_idx <- configs[[node$id]]
    if (node$parent_pos == 0L) {
      logp <- logp + log(pmax(pi[[node$id]][state_idx], 1e-300))
    } else {
      parent_id <- node$parent_id
      parent_idx <- configs[[parent_id]]
      probs <- child[[node$id]][cbind(parent_idx, state_idx)]
      logp <- logp + log(pmax(probs, 1e-300))
    }
  }
  logp
}

.bn_init <- function(latents, observables) {
  pi <- list()
  child <- list()
  lambda <- list()
  for (node in latents) {
    s <- node$n_states
    if (node$parent_pos == 0L) {
      raw <- rep(1, s) + (stats::runif(s) - 0.5) * 0.05
      pi[[node$id]] <- raw / sum(raw)
    } else {
      parent <- latents[[node$parent_pos]]
      p_n <- parent$n_states
      table <- matrix(0, p_n, s)
      for (p in seq_len(p_n)) {
        for (c in seq_len(s)) {
          dist <- abs((p - 1) / max(p_n - 1, 1) - (c - 1) / max(s - 1, 1))
          table[p, c] <- exp(-3 * dist)
        }
        table[p, ] <- pmax(table[p, ] + (stats::runif(s) - 0.5) * 0.02, 0.01)
        table[p, ] <- table[p, ] / sum(table[p, ])
      }
      child[[node$id]] <- table
    }
  }
  for (obs in observables) {
    parent <- latents[[obs$parent_pos]]
    s <- parent$n_states
    gap <- if (s <= 1L) 0.6 else 0.6 / (s - 1)
    noise_scale <- min(0.02, gap * 0.25)
    vals <- numeric(s)
    for (state in seq_len(s)) {
      base <- 0.2 + 0.6 * (state - 1) / max(s - 1, 1)
      vals[state] <- min(0.95, max(0.05, base + (stats::runif(1) - 0.5) * noise_scale))
    }
    lambda[[obs$id]] <- vals
  }
  list(pi = pi, child = child, lambda = lambda)
}

.bn_e_step <- function(X, configs, latents, observables, pi, child, lambda) {
  n <- nrow(X)
  n_config <- nrow(configs)
  log_joint <- matrix(0, n, n_config)
  log_prior <- .bn_log_prior(configs, latents, pi, child)
  for (c in seq_len(n_config)) {
    ll <- rep(0, n)
    for (j in seq_along(observables)) {
      obs <- observables[[j]]
      parent_state <- configs[[obs$parent_id]][[c]]
      p <- lambda[[obs$id]][[parent_state]]
      x <- X[, j]
      ones <- !is.na(x) & x == 1
      zeros <- !is.na(x) & x == 0
      if (any(ones)) ll[ones] <- ll[ones] + log(max(p, 1e-300))
      if (any(zeros)) ll[zeros] <- ll[zeros] + log(max(1 - p, 1e-300))
    }
    log_joint[, c] <- log_prior[[c]] + ll
  }

  m <- apply(log_joint, 1, max)
  shifted <- log_joint - m
  weights <- exp(shifted)
  weights[!is.finite(weights)] <- 0
  raw_totals <- rowSums(weights)
  bad <- !is.finite(m) | !is.finite(raw_totals) | raw_totals <= 0
  ok <- !bad
  loglik <- if (any(ok)) sum(m[ok] + log(raw_totals[ok])) else -Inf
  post <- matrix(1 / n_config, n, n_config)
  if (any(ok)) post[ok, ] <- weights[ok, , drop = FALSE] / raw_totals[ok]
  list(post = post, logLik = loglik, logPrior = log_prior)
}

.bn_m_step <- function(X, post, configs, latents, observables, pseudo) {
  pi <- list()
  child <- list()
  lambda <- list()
  for (node in latents) {
    s <- node$n_states
    if (node$parent_pos == 0L) {
      counts <- numeric(s)
      for (state in seq_len(s)) {
        mask <- configs[[node$id]] == state
        counts[state] <- sum(post[, mask, drop = FALSE])
      }
      pi[[node$id]] <- (pseudo + counts) / (pseudo * s + sum(counts))
    } else {
      parent <- latents[[node$parent_pos]]
      p_n <- parent$n_states
      counts <- matrix(0, p_n, s)
      for (p in seq_len(p_n)) {
        for (state in seq_len(s)) {
          mask <- configs[[parent$id]] == p & configs[[node$id]] == state
          counts[p, state] <- sum(post[, mask, drop = FALSE])
        }
        counts[p, ] <- (pseudo + counts[p, ]) / (pseudo * s + sum(counts[p, ]))
      }
      child[[node$id]] <- counts
    }
  }
  for (j in seq_along(observables)) {
    obs <- observables[[j]]
    parent <- latents[[obs$parent_pos]]
    s <- parent$n_states
    vals <- numeric(s)
    x <- X[, j]
    for (state in seq_len(s)) {
      mask <- configs[[parent$id]] == state
      w <- rowSums(post[, mask, drop = FALSE])
      ones <- !is.na(x) & x == 1
      zeros <- !is.na(x) & x == 0
      n1 <- sum(w[ones])
      n0 <- sum(w[zeros])
      vals[state] <- (pseudo + n1) / (2 * pseudo + n1 + n0)
    }
    lambda[[obs$id]] <- vals
  }
  list(pi = pi, child = child, lambda = lambda)
}

.bn_free_parameters <- function(latents, observables) {
  k <- 0
  for (node in latents) {
    if (node$parent_pos == 0L) {
      k <- k + node$n_states - 1L
    } else {
      parent <- latents[[node$parent_pos]]
      k <- k + parent$n_states * (node$n_states - 1L)
    }
  }
  for (obs in observables) {
    parent <- latents[[obs$parent_pos]]
    k <- k + parent$n_states
  }
  k
}

.bn_named <- function(states, values) {
  stats::setNames(as.numeric(values), states)
}

.bn_parameters <- function(latents, observables, pi, child, lambda) {
  parameters <- list(`_kind` = "bayesian-cpt")
  star <- length(latents) == 1L
  if (star) {
    node <- latents[[1]]
    parameters$`_smvId` <- node$id
    parameters$`_states` <- node$states
    parameters$`_prior` <- .bn_named(node$states, pi[[node$id]])
  } else {
    root_priors <- list()
    parent_of <- list()
    for (node in latents) {
      if (node$parent_pos == 0L) {
        root_priors[[node$id]] <- .bn_named(node$states, pi[[node$id]])
      } else {
        parent <- latents[[node$parent_pos]]
        table <- list()
        for (p in seq_len(parent$n_states)) {
          table[[parent$states[[p]]]] <- .bn_named(node$states, child[[node$id]][p, ])
        }
        parameters[[node$id]] <- table
        parent_of[[node$id]] <- node$parent_id
      }
    }
    for (obs in observables) parent_of[[obs$id]] <- obs$parent_id
    parameters$`_tree` <- TRUE
    parameters$`_prior` <- root_priors
    parameters$`_parentOf` <- parent_of
    parameters$`_latentIds` <- vapply(latents, function(node) node$id, character(1))
  }
  for (obs in observables) {
    parent <- latents[[obs$parent_pos]]
    parameters[[obs$id]] <- list(levels = .bn_named(parent$states, lambda[[obs$id]]))
  }
  parameters
}

.bn_residuals <- function(X, configs, latents, observables, pi, child, lambda) {
  log_prior <- .bn_log_prior(configs, latents, pi, child)
  prior <- exp(log_prior - max(log_prior))
  prior <- prior / sum(prior)
  rows <- list()
  abs_vals <- numeric(0)
  for (j in seq_along(observables)) {
    obs <- observables[[j]]
    parent <- latents[[obs$parent_pos]]
    expected <- 0
    for (state in seq_len(parent$n_states)) {
      mask <- configs[[parent$id]] == state
      expected <- expected + sum(prior[mask]) * lambda[[obs$id]][[state]]
    }
    observed_vals <- X[!is.na(X[, j]), j]
    observed <- if (length(observed_vals)) mean(observed_vals) else NA_real_
    abs_residual <- if (is.finite(observed)) abs(observed - expected) else NA_real_
    if (is.finite(abs_residual)) abs_vals <- c(abs_vals, abs_residual)
    rows[[j]] <- list(
      id = obs$id,
      observed = as.numeric(observed),
      expected = as.numeric(expected),
      absResidual = as.numeric(abs_residual)
    )
  }
  list(
    rows = rows,
    meanAbsResidual = if (length(abs_vals)) mean(abs_vals) else NA_real_,
    maxAbsResidual = if (length(abs_vals)) max(abs_vals) else NA_real_
  )
}

.bn_person_posteriors <- function(person_ids, post, configs, latents) {
  rows <- vector("list", length(person_ids))
  for (i in seq_along(person_ids)) {
    marginals <- list()
    for (node in latents) {
      probs <- numeric(node$n_states)
      for (state in seq_len(node$n_states)) {
        mask <- configs[[node$id]] == state
        probs[state] <- sum(post[i, mask])
      }
      marginals[[node$id]] <- .bn_named(node$states, probs)
    }
    rows[[i]] <- list(personId = as.character(person_ids[[i]]), marginals = marginals)
  }
  rows
}

.bn_em <- function(X, person_ids, latents, observables, seed, max_iter, pseudo) {
  set.seed(seed)
  configs <- .bn_configs(latents)
  theta <- .bn_init(latents, observables)
  prev <- -Inf
  loglik <- -Inf
  delta <- NA_real_
  iters <- 0L
  converged <- FALSE
  post <- NULL
  for (iter in seq_len(max_iter)) {
    step <- .bn_e_step(X, configs, latents, observables, theta$pi, theta$child, theta$lambda)
    theta <- .bn_m_step(X, step$post, configs, latents, observables, pseudo)
    # Recompute the likelihood at the updated parameters.
    step <- .bn_e_step(X, configs, latents, observables, theta$pi, theta$child, theta$lambda)
    loglik <- step$logLik
    post <- step$post
    delta <- loglik - prev
    prev <- loglik
    iters <- iter
    if (is.finite(delta) && iter > 1L && delta < BN_EM_TOL) {
      converged <- TRUE
      break
    }
  }
  k <- .bn_free_parameters(latents, observables)
  n_persons <- nrow(X)
  n_obs <- sum(!is.na(X))
  residuals <- .bn_residuals(X, configs, latents, observables, theta$pi, theta$child, theta$lambda)
  list(
    converged = converged,
    parameters = .bn_parameters(latents, observables, theta$pi, theta$child, theta$lambda),
    fit = list(
      available = TRUE,
      method = "em",
      logLik = as.numeric(loglik),
      aic = as.numeric(-2 * loglik + 2 * k),
      bic = as.numeric(-2 * loglik + k * log(max(n_persons, 1))),
      nParameters = as.numeric(k),
      nPersons = as.numeric(n_persons),
      nObservations = as.numeric(n_obs),
      iterations = as.numeric(iters),
      logLikDelta = as.numeric(delta),
      meanAbsResidual = as.numeric(residuals$meanAbsResidual),
      maxAbsResidual = as.numeric(residuals$maxAbsResidual),
      residuals = residuals$rows,
      pseudoCount = as.numeric(pseudo),
      bicSampleSize = "persons"
    ),
    posteriors = .bn_person_posteriors(person_ids, post, configs, latents)
  )
}

calibrate_bn <- function(body, res) {
  job_id <- if (!is.null(body$jobId)) .as_char(body$jobId) else "unknown"
  parsed <- .bn_parse(body$model)
  if (length(parsed$errors)) {
    res$status <- 400
    return(.failure(job_id, paste(parsed$errors, collapse = "; "), "ContractError"))
  }

  seed <- .require_seed(body$options)
  if (is.null(seed)) {
    res$status <- 400
    return(.failure(job_id, "options.seed is required (reproducibility is provenance)", "ContractError"))
  }

  mat <- tryCatch(
    response_matrix_to_df(body$responseMatrix),
    error = function(e) e
  )
  if (inherits(mat, "error")) {
    res$status <- 400
    return(.failure(job_id, conditionMessage(mat), "BnDataError"))
  }

  obs_ids <- vapply(parsed$observables, function(node) node$id, character(1))
  missing_col <- obs_ids[!obs_ids %in% colnames(mat)]
  if (length(missing_col)) {
    res$status <- 400
    return(.failure(
      job_id,
      paste0("response matrix is missing observable '", missing_col[[1]], "'"),
      "BnDataError"
    ))
  }
  X <- as.matrix(mat[, obs_ids, drop = FALSE])
  storage.mode(X) <- "numeric"
  observed <- X[!is.na(X)]
  if (length(observed) && any(observed != 0 & observed != 1)) {
    res$status <- 400
    return(.failure(
      job_id,
      "Bayesian network calibration expects binary responses (0, 1, or missing)",
      "BnDataError"
    ))
  }

  person_ids <- as.character(unlist(body$responseMatrix$personIds, use.names = FALSE))
  if (length(person_ids) != nrow(X)) {
    res$status <- 400
    return(.failure(job_id, "responseMatrix.personIds length must match the data", "BnDataError"))
  }

  pseudo <- .bn_option_number(body$options, "pseudoCount", 0.5)
  if (pseudo < 0) pseudo <- 0.5
  max_iter <- as.integer(.bn_option_number(body$options, "maxIterations", 200))
  if (is.na(max_iter) || max_iter < 1L) max_iter <- 200L
  max_iter <- min(max_iter, 1000L)

  fit <- tryCatch(
    .bn_em(X, person_ids, parsed$latents, parsed$observables, seed, max_iter, pseudo),
    error = function(e) e
  )
  if (inherits(fit, "error")) {
    res$status <- 500
    return(.failure(job_id, conditionMessage(fit), "BnEmError"))
  }

  list(
    contractVersion = CALIBRATION_CONTRACT_VERSION,
    jobId = job_id,
    converged = isTRUE(fit$converged),
    packageVersion = BN_PACKAGE_VERSION,
    sampleSize = nrow(X),
    calibratedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    parameters = fit$parameters,
    fitStatistics = list(bnFit = fit$fit),
    bnPersonPosteriors = fit$posteriors
  )
}

calibrate_bn_http <- function(req, res) {
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
  requested <- .as_char(body$model$family)
  if (!identical(requested, "bn")) {
    res$status <- 400
    return(.failure(
      body$jobId,
      paste0("This endpoint calibrates family 'bn', not '", requested, "'"),
      "FamilyMismatch"
    ))
  }
  calibrate_bn(body, res)
}
