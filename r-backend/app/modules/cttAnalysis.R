# modules/cttAnalysis.R
# Iteman-class classical statistics in base R + TAM p/rpb already computed
# by calibrate.R. No psych dependency. ASCII comments only.

.finite_num <- function(x) {
  v <- suppressWarnings(as.numeric(x)[[1]])
  if (length(v) == 0 || is.na(v)) NA_real_ else v
}

.moments <- function(x) {
  x <- x[is.finite(x)]
  n <- length(x)
  if (n < 2L) {
    return(list(n = n, mean = NA_real_, sd = NA_real_, min = NA_real_,
                max = NA_real_, skew = NA_real_, kurtosis = NA_real_))
  }
  m <- mean(x)
  s <- stats::sd(x)
  z <- if (is.finite(s) && s > 0) (x - m) / s else rep(0, n)
  list(
    n = n,
    mean = as.numeric(m),
    sd = as.numeric(s),
    min = as.numeric(min(x)),
    max = as.numeric(max(x)),
    skew = as.numeric(mean(z^3)),
    kurtosis = as.numeric(mean(z^4) - 3)
  )
}

# Cronbach's alpha on a numeric matrix (pairwise complete per column var).
.cronbach_alpha <- function(mat) {
  k <- ncol(mat)
  if (is.null(k) || k < 2L) return(NA_real_)
  item_var <- apply(mat, 2, stats::var, na.rm = TRUE)
  totals <- rowSums(mat, na.rm = TRUE)
  var_t <- stats::var(totals)
  if (!is.finite(var_t) || var_t <= 0) return(NA_real_)
  sum_v <- sum(item_var, na.rm = TRUE)
  as.numeric((k / (k - 1)) * (1 - sum_v / var_t))
}

.kr21 <- function(mat) {
  k <- ncol(mat)
  if (is.null(k) || k < 2L) return(NA_real_)
  totals <- rowSums(mat, na.rm = TRUE)
  mu <- mean(totals)
  var_t <- stats::var(totals)
  if (!is.finite(var_t) || var_t <= 0) return(NA_real_)
  as.numeric((k / (k - 1)) * (1 - (mu * (k - mu)) / (k * var_t)))
}

.guttman_lambda2 <- function(mat) {
  k <- ncol(mat)
  if (is.null(k) || k < 2L) return(NA_real_)
  complete <- stats::na.omit(mat)
  if (nrow(complete) < 3L) complete <- mat
  item_var <- apply(complete, 2, stats::var, na.rm = TRUE)
  totals <- rowSums(complete, na.rm = TRUE)
  var_t <- stats::var(totals)
  if (!is.finite(var_t) || var_t <= 0) return(NA_real_)
  cv <- stats::cov(complete, use = "pairwise.complete.obs")
  off <- cv[lower.tri(cv) | upper.tri(cv)]
  off <- off[is.finite(off)]
  if (!length(off)) return(NA_real_)
  sum_sq_cov <- sum(off^2)
  as.numeric(
    1 - (sum(item_var, na.rm = TRUE) / var_t) +
      sqrt((k / (k - 1)) * sum_sq_cov) / var_t
  )
}

.spearman_brown_split_half <- function(mat) {
  k <- ncol(mat)
  if (is.null(k) || k < 2L) return(NA_real_)
  odd <- seq(1L, k, by = 2L)
  even <- seq(2L, k, by = 2L)
  if (!length(even)) return(NA_real_)
  x <- rowSums(mat[, odd, drop = FALSE], na.rm = TRUE)
  y <- rowSums(mat[, even, drop = FALSE], na.rm = TRUE)
  r <- suppressWarnings(stats::cor(x, y))
  if (!is.finite(r) || r <= -1) return(NA_real_)
  as.numeric((2 * r) / (1 + r))
}

.alpha_if_deleted <- function(mat) {
  k <- ncol(mat)
  ids <- colnames(mat)
  out <- setNames(rep(NA_real_, k), ids)
  if (is.null(k) || k < 3L) return(out)
  for (j in seq_len(k)) {
    out[[j]] <- .cronbach_alpha(mat[, -j, drop = FALSE])
  }
  out
}

.biserial_from_rpb <- function(rpb, p) {
  if (!is.finite(rpb) || !is.finite(p) || p <= 0 || p >= 1) return(NA_real_)
  z <- stats::qnorm(1 - p)
  dens <- stats::dnorm(z)
  if (!is.finite(dens) || dens <= 0) return(NA_real_)
  as.numeric(rpb * sqrt(p * (1 - p)) / dens)
}

.point_biserial <- function(binary, score) {
  if (length(binary) < 3L) return(NA_real_)
  ok <- is.finite(binary) & is.finite(score)
  if (sum(ok) < 3L) return(NA_real_)
  b <- binary[ok]
  s <- score[ok]
  if (length(unique(b)) < 2L) return(NA_real_)
  r <- suppressWarnings(stats::cor(b, s))
  if (!is.finite(r)) NA_real_ else as.numeric(r)
}

.score_frequency <- function(score, k) {
  max_s <- if (is.finite(k)) as.integer(k) else as.integer(max(score, na.rm = TRUE))
  if (!is.finite(max_s) || max_s < 0L) max_s <- 0L
  tab <- integer(max_s + 1L)
  names(tab) <- as.character(0:max_s)
  for (s in score[is.finite(score)]) {
    i <- as.integer(round(s))
    if (i >= 0L && i <= max_s) tab[[i + 1L]] <- tab[[i + 1L]] + 1L
  }
  lapply(seq_along(tab), function(i) {
    list(score = as.integer(i - 1L), n = as.integer(tab[[i]]))
  })
}

.csem_by_score <- function(k, kr20, sd_score) {
  # Overall SEM uses KR-20. Per-score CSEM is the binomial form
  # sqrt(k p (1-p)) with p = x/k (Lord-style classical approximation).
  overall <- if (is.finite(kr20) && is.finite(sd_score) && kr20 < 1) {
    as.numeric(sd_score * sqrt(max(0, 1 - kr20)))
  } else {
    NA_real_
  }
  rows <- lapply(0:k, function(x) {
    p <- if (k > 0) x / k else NA_real_
    csem <- if (is.finite(p) && p >= 0 && p <= 1) sqrt(k * p * (1 - p)) else NA_real_
    list(score = as.integer(x), csem = as.numeric(csem))
  })
  list(sem = overall, byScore = rows)
}

.parse_flag_bounds <- function(opts) {
  .num <- function(x, default) {
    if (is.null(x)) return(default)
    v <- suppressWarnings(as.numeric(unlist(x, use.names = FALSE)[[1]]))
    if (!is.finite(v)) default else v
  }
  flags <- if (!is.null(opts) && !is.null(opts$flags)) opts$flags else list()
  list(
    tooHard = .num(flags$tooHard, 0.20),
    tooEasy = .num(flags$tooEasy, 0.90),
    lowDiscrimination = .num(flags$lowDiscrimination, 0.20),
    attractiveRpb = .num(flags$attractiveRpb, 0.05),
    unusedProportion = .num(flags$unusedProportion, 0.02)
  )
}

.item_flags <- function(item_id, p, rpb, distractors, bounds) {
  flags <- list()
  push <- function(code, threshold, message) {
    flags[[length(flags) + 1L]] <<- list(
      code = code,
      threshold = as.numeric(threshold),
      message = message
    )
  }
  if (is.finite(p) && p < bounds$tooHard) {
    push(
      "tooHard",
      bounds$tooHard,
      sprintf(
        "p-value %.2f is below the %.2f floor; most examinees miss this item -- simplify the stem or check for a keying error.",
        p, bounds$tooHard
      )
    )
  }
  if (is.finite(p) && p > bounds$tooEasy) {
    push(
      "tooEasy",
      bounds$tooEasy,
      sprintf(
        "p-value %.2f exceeds the %.2f ceiling; most examinees get this right -- revise stem/options or retire it if it adds little information.",
        p, bounds$tooEasy
      )
    )
  }
  if (is.finite(rpb) && rpb < 0) {
    push(
      "negativeDiscrimination",
      0,
      sprintf(
        "Point-biserial %.2f is negative (below 0.00); high scorers miss this item more often -- check the key and distractors before keeping it.",
        rpb
      )
    )
  } else if (is.finite(rpb) && rpb < bounds$lowDiscrimination) {
    push(
      "lowDiscrimination",
      bounds$lowDiscrimination,
      sprintf(
        "Point-biserial %.2f is below the %.2f threshold; review the distractors or retire the item.",
        rpb, bounds$lowDiscrimination
      )
    )
  }
  if (is.list(distractors) && length(distractors) > 0) {
    keyed_rpb <- NA_real_
    for (nm in names(distractors)) {
      d <- distractors[[nm]]
      if (isTRUE(d$keyed)) keyed_rpb <- .finite_num(d$pointBiserial)
    }
    for (nm in names(distractors)) {
      d <- distractors[[nm]]
      role <- if (!is.null(d$role)) as.character(d$role)[[1]] else ""
      if (role %in% c("omit", "not-administered")) next
      prop <- .finite_num(d$proportion)
      drpb <- .finite_num(d$pointBiserial)
      if (!isTRUE(d$keyed) && is.finite(prop) && prop < bounds$unusedProportion) {
        push(
          "unusedOption",
          bounds$unusedProportion,
          sprintf(
            "Option %s was chosen by %.1f%% of examinees (below %.0f%%); consider rewriting or dropping it.",
            nm, 100 * prop, 100 * bounds$unusedProportion
          )
        )
      }
      if (!isTRUE(d$keyed) && is.finite(drpb) && drpb > bounds$attractiveRpb) {
        push(
          "attractiveDistractor",
          bounds$attractiveRpb,
          sprintf(
            "Unkeyed option %s has point-biserial %.2f (above %.2f); high scorers are attracted to this distractor -- review the key or the option wording.",
            nm, drpb, bounds$attractiveRpb
          )
        )
      }
    }
  }
  flags
}

.parse_item_keys <- function(item_keys, item_ids) {
  if (is.null(item_keys) || !is.list(item_keys)) return(NULL)
  out <- list()
  for (id in item_ids) {
    key <- item_keys[[id]]
    if (is.null(key) || !is.list(key)) next
    keyed <- .as_char(key$keyedOptionId)
    opts <- list()
    raw_opts <- key$options
    if (is.data.frame(raw_opts)) {
      for (i in seq_len(nrow(raw_opts))) {
        oid <- .as_char(raw_opts$id[[i]])
        if (!nzchar(oid) || is.na(oid)) next
        opts[[oid]] <- list(
          id = oid,
          label = .as_char(raw_opts$label[[i]]),
          text = .as_char(raw_opts$text[[i]])
        )
      }
    } else if (is.list(raw_opts)) {
      nms <- names(raw_opts)
      for (i in seq_along(raw_opts)) {
        row <- raw_opts[[i]]
        oid <- if (is.list(row)) .as_char(row$id) else .as_char(nms[[i]])
        if (!nzchar(oid) || is.na(oid)) next
        opts[[oid]] <- list(
          id = oid,
          label = if (is.list(row)) .as_char(row$label) else oid,
          text = if (is.list(row)) .as_char(row$text) else ""
        )
      }
    }
    out[[id]] <- list(keyedOptionId = keyed, options = opts)
  }
  if (!length(out)) NULL else out
}

.quantile_groups <- function(score, n_q) {
  n_q <- as.integer(n_q)
  if (!is.finite(n_q) || n_q < 2L) n_q <- 5L
  ok <- is.finite(score)
  groups <- rep(NA_integer_, length(score))
  if (sum(ok) < n_q) {
    groups[ok] <- 1L
    return(list(groups = groups, nQuantiles = 1L))
  }
  # Equal-count groups by rank of total score (ties broken by order).
  rnk <- rank(score[ok], ties.method = "first")
  n <- length(rnk)
  g <- floor((rnk - 1) * n_q / n) + 1L
  g[g > n_q] <- n_q
  groups[ok] <- g
  list(groups = groups, nQuantiles = n_q)
}

.is_omit_code <- function(x) {
  v <- tolower(trimws(as.character(x)))
  !is.na(x) & v %in% c("", "omit", ".", "*")
}

.distractors_for_item <- function(choices, keyed, option_ids, score, n_q_groups) {
  if (is.null(choices) || all(is.na(choices))) return(NULL)
  omit_mask <- .is_omit_code(choices)
  n_omit <- sum(omit_mask)
  n_na <- sum(is.na(choices))
  n_admin <- sum(!is.na(choices) & !omit_mask)
  ids <- unique(c(option_ids, as.character(choices[!is.na(choices) & !omit_mask]), keyed))
  ids <- ids[!is.na(ids) & nzchar(ids)]
  ids <- ids[!.is_omit_code(ids)]
  if (!length(ids) && n_omit == 0L && n_na == 0L) return(NULL)
  corrected <- score
  out <- list()
  for (oid in ids) {
    dummy <- as.numeric(!is.na(choices) & !omit_mask & as.character(choices) == oid)
    dummy[is.na(choices) | omit_mask] <- NA_real_
    n_ch <- sum(dummy == 1, na.rm = TRUE)
    prop <- if (n_admin > 0) n_ch / n_admin else NA_real_
    rpb <- .point_biserial(dummy, corrected)
    choosers <- which(!is.na(choices) & !omit_mask & as.character(choices) == oid)
    opt_mean <- if (length(choosers)) mean(score[choosers], na.rm = TRUE) else NA_real_
    opt_sd <- if (length(choosers) > 1L) stats::sd(score[choosers], na.rm = TRUE) else NA_real_
    qprops <- lapply(seq_len(n_q_groups$nQuantiles), function(q) {
      idx <- which(n_q_groups$groups == q)
      if (!length(idx)) return(list(quantile = as.integer(q), proportion = NA_real_, n = 0L))
      ch <- choices[idx]
      om <- omit_mask[idx]
      admin <- sum(!is.na(ch) & !om)
      list(
        quantile = as.integer(q),
        proportion = if (admin > 0) sum(ch == oid, na.rm = TRUE) / admin else NA_real_,
        n = as.integer(admin)
      )
    })
    out[[oid]] <- list(
      id = oid,
      n = as.integer(n_ch),
      proportion = as.numeric(prop),
      pointBiserial = as.numeric(rpb),
      mean = as.numeric(opt_mean),
      sd = as.numeric(opt_sd),
      keyed = identical(oid, keyed),
      role = if (identical(oid, keyed)) "key" else "distractor",
      quantiles = qprops
    )
  }
  n_total <- length(choices)
  out[["omit"]] <- list(
    id = "omit",
    n = as.integer(n_omit),
    proportion = if (n_total > 0) as.numeric(n_omit / n_total) else NA_real_,
    pointBiserial = NA_real_,
    mean = NA_real_,
    sd = NA_real_,
    keyed = FALSE,
    role = "omit",
    quantiles = list()
  )
  out[["notAdministered"]] <- list(
    id = "notAdministered",
    n = as.integer(n_na),
    proportion = if (n_total > 0) as.numeric(n_na / n_total) else NA_real_,
    pointBiserial = NA_real_,
    mean = NA_real_,
    sd = NA_real_,
    keyed = FALSE,
    role = "not-administered",
    quantiles = list()
  )
  out
}

.domain_summaries <- function(mat, score, domains) {
  if (is.null(domains)) return(NULL)
  rows <- if (is.data.frame(domains)) {
    lapply(seq_len(nrow(domains)), function(i) as.list(domains[i, , drop = FALSE]))
  } else if (is.list(domains)) {
    if (!is.null(names(domains)) && !is.null(domains$id) && !is.list(domains[[1]])) {
      list(domains)
    } else {
      as.list(domains)
    }
  } else {
    return(NULL)
  }
  out <- list()
  for (row in rows) {
    if (!is.list(row)) next
    did <- .as_char(row$id)
    ids <- unique(as.character(unlist(row$itemIds, use.names = FALSE)))
    ids <- ids[!is.na(ids) & nzchar(ids)]
    ids <- ids[ids %in% colnames(mat)]
    if (!nzchar(did) || !length(ids)) next
    sub <- mat[, ids, drop = FALSE]
    sub_score <- rowSums(sub, na.rm = TRUE)
    mom <- .moments(sub_score)
    out[[did]] <- list(
      id = did,
      itemIds = as.list(ids),
      nItems = length(ids),
      mean = mom$mean,
      sd = mom$sd,
      alpha = .cronbach_alpha(sub)
    )
  }
  if (!length(out)) NULL else out
}

.cutscore_summary <- function(score, cut_score) {
  if (is.null(cut_score)) return(NULL)
  cs <- suppressWarnings(as.numeric(unlist(cut_score, use.names = FALSE)[[1]]))
  if (!is.finite(cs)) return(NULL)
  ok <- is.finite(score)
  n <- sum(ok)
  n_pass <- sum(score[ok] >= cs)
  list(
    cutScore = as.numeric(cs),
    n = as.integer(n),
    nPass = as.integer(n_pass),
    passRate = if (n > 0) as.numeric(n_pass / n) else NA_real_,
    meanPass = if (n_pass > 0) as.numeric(mean(score[ok][score[ok] >= cs])) else NA_real_,
    meanFail = if ((n - n_pass) > 0) as.numeric(mean(score[ok][score[ok] < cs])) else NA_real_
  )
}

classical_test_level <- function(mat, score, kr20, opts, domains, cut_score) {
  k <- ncol(mat)
  mom <- .moments(score)
  alpha <- .cronbach_alpha(mat)
  kr21 <- .kr21(mat)
  lam2 <- .guttman_lambda2(mat)
  split <- .spearman_brown_split_half(mat)
  alpha_del <- .alpha_if_deleted(mat)
  csem <- .csem_by_score(k, kr20, mom$sd)
  n_q <- if (!is.null(opts$nQuantiles)) as.integer(unlist(opts$nQuantiles)[[1]]) else 5L
  list(
    nPersons = nrow(mat),
    nItems = k,
    mean = mom$mean,
    sd = mom$sd,
    min = mom$min,
    max = mom$max,
    skew = mom$skew,
    kurtosis = mom$kurtosis,
    scoreFrequency = .score_frequency(score, k),
    reliability = list(
      kr20 = as.numeric(kr20),
      kr21 = as.numeric(kr21),
      cronbachAlpha = as.numeric(alpha),
      guttmanLambda2 = as.numeric(lam2),
      spearmanBrownSplitHalf = as.numeric(split),
      sem = csem$sem
    ),
    alphaIfDeleted = as.list(alpha_del),
    csemByScore = csem$byScore,
    domains = tryCatch(.domain_summaries(mat, score, domains), error = function(e) NULL),
    cutScore = tryCatch(.cutscore_summary(score, cut_score), error = function(e) NULL),
    nQuantiles = as.integer(if (is.finite(n_q) && n_q >= 2L) n_q else 5L)
  )
}

# Overlay TAM p/rpb with Iteman extras. distractors stays NULL when no
# option matrix (LSAT7 path).
classical_item_overlay <- function(resp_mat, tam_parameters, option_mat, item_keys,
                                   score, test_level, opts) {
  item_ids <- colnames(resp_mat)
  keys <- .parse_item_keys(item_keys, item_ids)
  bounds <- .parse_flag_bounds(opts)
  n_q <- .quantile_groups(score, test_level$nQuantiles)
  alpha_del <- unlist(test_level$alphaIfDeleted)
  parameters <- list()
  for (id in item_ids) {
    tam <- tam_parameters[[id]]
    p <- if (!is.null(tam$pValue)) as.numeric(tam$pValue) else as.numeric(tam$difficulty)
    rpb <- if (!is.null(tam$pointBiserial)) as.numeric(tam$pointBiserial) else as.numeric(tam$discrimination)
    n <- if (!is.null(tam$n)) as.integer(tam$n) else as.integer(sum(is.finite(resp_mat[, id])))
    keyed <- if (!is.null(keys[[id]])) keys[[id]]$keyedOptionId else NA_character_
    option_ids <- if (!is.null(keys[[id]])) names(keys[[id]]$options) else character(0)
    distractors <- NULL
    if (!is.null(option_mat) && id %in% colnames(option_mat)) {
      distractors <- .distractors_for_item(
        option_mat[, id],
        keyed,
        option_ids,
        score,
        n_q
      )
    }
    flags <- .item_flags(id, p, rpb, distractors, bounds)
    quantile_key <- NULL
    if (is.list(distractors) && nzchar(keyed) && !is.null(distractors[[keyed]])) {
      quantile_key <- distractors[[keyed]]$quantiles
    }
    domain_rpb <- NULL
    domains <- test_level$domains
    if (is.list(domains) && length(domains) >= 2L) {
      domain_rpb <- list()
      item_col <- resp_mat[, id]
      for (did in names(domains)) {
        d <- domains[[did]]
        ids <- unique(as.character(unlist(d$itemIds, use.names = FALSE)))
        if (!(id %in% ids)) next
        other <- setdiff(ids, id)
        other <- other[other %in% colnames(resp_mat)]
        if (!length(other)) next
        dscore <- rowSums(resp_mat[, other, drop = FALSE], na.rm = TRUE)
        drpb <- .point_biserial(item_col, dscore)
        domain_rpb[[did]] <- list(
          pointBiserial = as.numeric(drpb),
          biserial = .biserial_from_rpb(drpb, p)
        )
      }
      if (!length(domain_rpb)) domain_rpb <- NULL
    }
    parameters[[id]] <- list(
      pValue = as.numeric(p),
      pointBiserial = as.numeric(rpb),
      biserial = .biserial_from_rpb(rpb, p),
      n = n,
      alphaWithout = if (!is.null(alpha_del[[id]])) as.numeric(alpha_del[[id]]) else NA_real_,
      distractors = distractors,
      keyQuantiles = quantile_key,
      domainPointBiserial = domain_rpb,
      flags = flags
    )
  }
  parameters
}

classical_person_scores <- function(person_ids, score, n_q_groups, domains, mat) {
  n <- length(score)
  ids <- vapply(as.list(person_ids), function(x) {
    if (exists(".as_char", mode = "function", inherits = TRUE)) .as_char(x) else as.character(x)[[1]]
  }, character(1))
  if (length(ids) != n) ids <- as.character(seq_len(n))
  ok <- is.finite(score)
  rnk <- rep(NA_real_, n)
  pct <- rep(NA_real_, n)
  if (sum(ok) > 0L) {
    rnk[ok] <- rank(-score[ok], ties.method = "min")
    pct[ok] <- rank(score[ok], ties.method = "average") / sum(ok) * 100
  }
  domain_cols <- list()
  if (is.list(domains) && length(domains) && !is.null(mat)) {
    for (did in names(domains)) {
      d <- domains[[did]]
      item_ids <- unique(as.character(unlist(d$itemIds, use.names = FALSE)))
      item_ids <- item_ids[item_ids %in% colnames(mat)]
      if (!length(item_ids)) next
      domain_cols[[did]] <- rowSums(mat[, item_ids, drop = FALSE], na.rm = TRUE)
    }
  }
  lapply(seq_len(n), function(i) {
    row <- list(
      personId = ids[[i]],
      raw = as.numeric(score[[i]]),
      rank = as.numeric(rnk[[i]]),
      percentile = as.numeric(pct[[i]]),
      quantileGroup = as.integer(n_q_groups$groups[[i]])
    )
    for (did in names(domain_cols)) {
      row[[paste0("domain.", did)]] <- as.numeric(domain_cols[[did]][[i]])
    }
    row
  })
}
