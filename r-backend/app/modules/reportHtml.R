# modules/reportHtml.R
# Self-contained HTML technical reports. ggplot2/svglite are optional;
# quantile / IRF / TIF figures fall back to inline SVG so the Hub image
# without those packages still produces a reviewer-ready report.

.html_escape <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  x <- gsub(">", "&gt;", x, fixed = TRUE)
  x <- gsub("\"", "&quot;", x, fixed = TRUE)
  x
}

.fmt <- function(x, digits = 3) {
  if (is.null(x) || length(x) == 0) return("--")
  v <- suppressWarnings(as.numeric(unlist(x, use.names = FALSE)[[1]]))
  if (!is.finite(v)) return("--")
  formatC(v, digits = digits, format = "f")
}

.html_css <- function(skin = NULL) {
  if (is.list(skin) && !is.null(skin$css) && nzchar(as.character(skin$css)[[1]])) return(skin$css)
  paste(
    "body{font-family:Georgia,serif;margin:24px;color:#1a1a1a;line-height:1.45}",
    "h1,h2,h3{font-family:system-ui,sans-serif}",
    "table{border-collapse:collapse;margin:12px 0 24px;font-size:14px}",
    "th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}",
    "th{background:#f4f4f4}",
    ".stamp{font-size:12px;color:#444;margin-bottom:16px}",
    ".flag{color:#8a4b08}",
    ".note{font-size:13px;color:#444;max-width:72ch;white-space:pre-wrap}",
    "svg{display:block;margin:8px 0 16px}",
    "pre.credits{font-size:12px;background:#f8f8f8;padding:12px;overflow:auto}",
    sep = "\n"
  )
}

.report_skins_dir <- function() {
  app_dir <- Sys.getenv("R_BACKEND_APP_DIR", unset = "/home/app")
  file.path(app_dir, "reports")
}

.load_report_skin <- function(skin_id) {
  stem <- if (is.null(skin_id) || !nzchar(as.character(skin_id)[[1]])) "iteman-classic" else as.character(skin_id)[[1]]
  path <- file.path(.report_skins_dir(), paste0(stem, ".R"))
  if (!file.exists(path)) path <- file.path("reports", paste0(stem, ".R"))
  env <- new.env(parent = baseenv())
  env$SKIN_CSS <- ""
  env$SKIN_TITLE <- stem
  if (file.exists(path)) sys.source(path, envir = env)
  list(id = stem, css = env$SKIN_CSS, title = env$SKIN_TITLE)
}

.chapter_on <- function(template, name) {
  if (is.null(template) || !is.list(template) || is.null(template$chapters)) return(TRUE)
  ch <- as.character(unlist(template$chapters, use.names = FALSE))
  if (!length(ch)) return(TRUE)
  name %in% ch
}

.report_credits <- function(packages) {
  pkgs <- unique(as.character(unlist(packages, use.names = FALSE)))
  pkgs <- pkgs[nzchar(pkgs)]
  r_txt <- tryCatch(paste(format(utils::citation(), style = "text"), collapse = "\n"), error = function(e) R.version.string)
  pkg_txt <- lapply(pkgs, function(pkg) {
    if (!requireNamespace(pkg, quietly = TRUE)) return(NULL)
    tryCatch(paste(format(utils::citation(pkg), style = "text"), collapse = "\n"), error = function(e) pkg)
  })
  pkg_txt <- Filter(Negate(is.null), pkg_txt)
  list(
    rVersion = R.version.string,
    r = r_txt,
    packages = unname(pkg_txt),
    packageNames = as.list(pkgs)
  )
}

.credits_html <- function(credits) {
  if (is.null(credits) || !is.list(credits)) return("")
  body <- paste(c(credits$rVersion, credits$r, unlist(credits$packages, use.names = FALSE)), collapse = "\n\n")
  paste0(
    "<h2>Software and packages</h2>",
    "<p class='note'>This report was produced by the ECD R bureau. It is not Iteman or Xcalibre software.</p>",
    "<pre class='credits'>", .html_escape(body), "</pre>"
  )
}

.csem_table_html <- function(by_score) {
  if (!is.list(by_score) || !length(by_score)) return("")
  rows <- character(0)
  for (row in by_score) {
    rows <- c(rows, sprintf("<tr><td>%s</td><td>%s</td></tr>", .fmt(row$score, 0), .fmt(row$csem)))
  }
  paste0(
    "<h2>CSEM by score</h2>",
    "<table><thead><tr><th>Score</th><th>CSEM</th></tr></thead><tbody>",
    paste(rows, collapse = ""),
    "</tbody></table>"
  )
}

.polyline_svg <- function(xs, ys, title, xlab, ylab, series = NULL) {
  w <- 420
  h <- 220
  pad_l <- 42
  pad_b <- 32
  pad_t <- 22
  pad_r <- 12
  inner_w <- w - pad_l - pad_r
  inner_h <- h - pad_t - pad_b
  finite <- is.finite(xs) & is.finite(ys)
  if (!any(finite)) {
    return(sprintf("<p class='note'>%s: no finite points.</p>", .html_escape(title)))
  }
  xr <- range(xs[finite])
  yr <- range(ys[finite])
  if (diff(xr) == 0) xr <- xr + c(-1, 1)
  if (diff(yr) == 0) yr <- yr + c(-0.05, 0.05)
  sx <- function(x) pad_l + (x - xr[1]) / diff(xr) * inner_w
  sy <- function(y) pad_t + (1 - (y - yr[1]) / diff(yr)) * inner_h
  pts <- paste(sprintf("%.1f,%.1f", sx(xs[finite]), sy(ys[finite])), collapse = " ")
  paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h, "' role='img' aria-label='",
    .html_escape(title), "'>",
    "<rect x='0' y='0' width='", w, "' height='", h, "' fill='#fff' stroke='#ddd'/>",
    "<text x='", w / 2, "' y='16' text-anchor='middle' font-size='12'>", .html_escape(title), "</text>",
    "<text x='", w / 2, "' y='", h - 6, "' text-anchor='middle' font-size='10'>", .html_escape(xlab), "</text>",
    "<text x='12' y='", h / 2, "' text-anchor='middle' font-size='10' transform='rotate(-90 12,", h / 2, ")'>",
    .html_escape(ylab), "</text>",
    "<polyline fill='none' stroke='#1d4ed8' stroke-width='1.5' points='", pts, "'/>",
    "</svg>"
  )
}

.quantile_svg <- function(item_id, distractors) {
  if (!is.list(distractors) || !length(distractors)) return("")
  first <- distractors[[1]]
  qs <- first$quantiles
  if (!is.list(qs) || !length(qs)) return("")
  n_q <- length(qs)
  colors <- c("#1d4ed8", "#b45309", "#15803d", "#be123c", "#6d28d9", "#0f766e")
  w <- 420
  h <- 220
  pad_l <- 42
  pad_b <- 32
  pad_t <- 22
  pad_r <- 12
  inner_w <- w - pad_l - pad_r
  inner_h <- h - pad_t - pad_b
  sx <- function(q) pad_l + (q - 1) / max(1, n_q - 1) * inner_w
  sy <- function(p) pad_t + (1 - p) * inner_h
  lines <- character(0)
  legend <- character(0)
  i <- 0L
  for (nm in names(distractors)) {
    i <- i + 1L
    d <- distractors[[nm]]
    col <- colors[((i - 1L) %% length(colors)) + 1L]
    pts <- vapply(d$quantiles, function(row) {
      q <- as.integer(row$quantile)
      p <- as.numeric(row$proportion)
      if (!is.finite(p)) p <- 0
      sprintf("%.1f,%.1f", sx(q), sy(max(0, min(1, p))))
    }, character(1))
    dash <- if (isTRUE(d$keyed)) "stroke-width='2'" else "stroke-width='1.2' stroke-dasharray='4 3'"
    lines <- c(lines, sprintf(
      "<polyline fill='none' stroke='%s' %s points='%s'/>",
      col, dash, paste(pts, collapse = " ")
    ))
    legend <- c(legend, sprintf(
      "<text x='%d' y='%d' font-size='10' fill='%s'>%s%s</text>",
      pad_l + (i - 1L) * 48, h - 8, col, .html_escape(nm),
      if (isTRUE(d$keyed)) "*" else ""
    ))
  }
  paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h, "' role='img' aria-label='Quantile plot ",
    .html_escape(item_id), "'>",
    "<rect x='0' y='0' width='", w, "' height='", h, "' fill='#fff' stroke='#ddd'/>",
    "<text x='", w / 2, "' y='16' text-anchor='middle' font-size='12'>Quantile plot -- ",
    .html_escape(item_id), "</text>",
    lines,
    legend,
    "</svg>"
  )
}

.try_ggplot_quantile <- function(item_id, distractors) {
  if (!requireNamespace("ggplot2", quietly = TRUE) || !requireNamespace("svglite", quietly = TRUE)) {
    return(.quantile_svg(item_id, distractors))
  }
  rows <- list()
  for (nm in names(distractors)) {
    d <- distractors[[nm]]
    for (q in d$quantiles) {
      rows[[length(rows) + 1L]] <- data.frame(
        quantile = as.integer(q$quantile),
        proportion = as.numeric(q$proportion),
        option = nm,
        keyed = isTRUE(d$keyed),
        stringsAsFactors = FALSE
      )
    }
  }
  if (!length(rows)) return("")
  df <- do.call(rbind, rows)
  p <- ggplot2::ggplot(df, ggplot2::aes(quantile, proportion, colour = option, linetype = keyed)) +
    ggplot2::geom_line() +
    ggplot2::geom_point() +
    ggplot2::ylim(0, 1) +
    ggplot2::labs(title = paste("Quantile plot --", item_id), x = "Score quantile", y = "Proportion") +
    ggplot2::theme_minimal(base_size = 11)
  tmp <- tempfile(fileext = ".svg")
  ok <- try(ggplot2::ggsave(tmp, p, width = 5.5, height = 3.2, device = svglite::svglite), silent = TRUE)
  if (inherits(ok, "try-error") || !file.exists(tmp)) return(.quantile_svg(item_id, distractors))
  paste(readLines(tmp, warn = FALSE), collapse = "\n")
}

irt_curve_payload <- function(params, theta = seq(-3, 3, by = 0.1), person_theta = NULL) {
  if (is.null(params) || !length(params)) return(NULL)
  items <- list()
  trf <- rep(0, length(theta))
  tif <- rep(0, length(theta))
  for (id in names(params)) {
    p <- params[[id]]
    a <- if (is.null(p$a)) 1 else as.numeric(p$a)[[1]]
    b <- if (is.null(p$b)) 0 else as.numeric(unlist(p$b, use.names = FALSE)[[1]])
    c <- if (is.null(p$c)) 0 else as.numeric(p$c)[[1]]
    irf <- vapply(theta, function(th) {
      expo <- a * (th - b)
      L <- 1 / (1 + exp(-expo))
      as.numeric(c + (1 - c) * L)
    }, numeric(1))
    iif <- vapply(theta, function(th) {
      if (exists(".item_information_fisher", mode = "function", inherits = TRUE)) {
        .item_information_fisher(th, a, b, c)
      } else {
        expo <- a * (th - b)
        L <- 1 / (1 + exp(-expo))
        p <- c + (1 - c) * L
        p <- min(max(p, 1e-12), 1 - 1e-12)
        Lstar <- (p - c) / max(1e-12, 1 - c)
        as.numeric((a * a) * ((1 - p) / p) * (Lstar * Lstar))
      }
    }, numeric(1))
    trf <- trf + irf
    tif <- tif + iif
    items[[id]] <- list(
      theta = as.numeric(theta),
      irf = as.numeric(irf),
      iif = as.numeric(iif),
      a = a, b = b, c = c
    )
  }
  csem <- lapply(tif, function(ii) {
    if (!is.finite(ii) || ii < 1e-12) return(NA_real_)
    as.numeric(1 / sqrt(ii))
  })
  wright <- NULL
  if (!is.null(person_theta) && length(person_theta)) {
    bs <- vapply(params, function(p) as.numeric(unlist(p$b, use.names = FALSE)[[1]]), numeric(1))
    wright <- list(
      itemB = as.list(bs),
      personTheta = as.numeric(person_theta)
    )
  }
  a_vals <- vapply(params, function(p) as.numeric(p$a)[[1]], numeric(1))
  b_vals <- vapply(params, function(p) as.numeric(unlist(p$b, use.names = FALSE)[[1]]), numeric(1))
  scatter <- list(a = as.numeric(a_vals), b = as.numeric(b_vals), itemIds = as.list(names(params)))
  theta_hist <- NULL
  if (!is.null(person_theta) && length(person_theta)) {
    thp <- as.numeric(person_theta)
    thp <- thp[is.finite(thp)]
    if (length(thp)) {
      br <- seq(-3, 3, by = 0.5)
      if (min(thp) < -3) br <- c(min(thp) - 0.01, br)
      if (max(thp) > 3) br <- c(br, max(thp) + 0.01)
      counts <- as.numeric(table(cut(thp, breaks = br, include.lowest = TRUE)))
      theta_hist <- list(breaks = as.numeric(br), counts = counts)
    }
  }
  list(
    theta = as.numeric(theta),
    trf = as.numeric(trf),
    tif = as.numeric(tif),
    csem = as.numeric(unlist(csem)),
    items = items,
    wright = wright,
    scatter = scatter,
    thetaHistogram = theta_hist
  )
}

.scatter_svg <- function(scatter) {
  if (is.null(scatter) || !is.list(scatter)) return("")
  a <- as.numeric(scatter$a)
  b <- as.numeric(scatter$b)
  ok <- is.finite(a) & is.finite(b)
  if (!any(ok)) return("")
  a <- a[ok]; b <- b[ok]
  w <- 360; h <- 240; pad_l <- 40; pad_b <- 32; pad_t <- 22; pad_r <- 12
  inner_w <- w - pad_l - pad_r
  inner_h <- h - pad_t - pad_b
  xr <- range(b); yr <- range(a)
  if (diff(xr) == 0) xr <- xr + c(-1, 1)
  if (diff(yr) == 0) yr <- yr + c(-0.2, 0.2)
  sx <- function(x) pad_l + (x - xr[1]) / diff(xr) * inner_w
  sy <- function(y) pad_t + (1 - (y - yr[1]) / diff(yr)) * inner_h
  dots <- paste(sprintf("<circle cx='%.1f' cy='%.1f' r='3' fill='#1d4ed8'/>", sx(b), sy(a)), collapse = "")
  paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h,
    "' role='img' aria-label='a versus b'><rect x='0' y='0' width='", w, "' height='", h,
    "' fill='#fff' stroke='#ddd'/>",
    "<text x='", w / 2, "' y='16' text-anchor='middle' font-size='12'>a vs b</text>",
    dots,
    "<text x='", w / 2, "' y='", h - 6, "' text-anchor='middle' font-size='10'>b</text></svg>"
  )
}

.hist_svg <- function(hist, title) {
  if (is.null(hist) || !is.list(hist)) return("")
  counts <- as.numeric(hist$counts)
  if (!length(counts)) return("")
  w <- 420; h <- 200; pad_l <- 36; pad_b <- 28; pad_t <- 22; pad_r <- 12
  inner_w <- w - pad_l - pad_r
  inner_h <- h - pad_t - pad_b
  max_c <- max(c(counts, 1))
  bw <- inner_w / length(counts)
  bars <- character(0)
  for (i in seq_along(counts)) {
    bh <- counts[[i]] / max_c * inner_h
    x <- pad_l + (i - 1) * bw
    y <- pad_t + inner_h - bh
    bars <- c(bars, sprintf("<rect x='%.1f' y='%.1f' width='%.1f' height='%.1f' fill='#1d4ed8'/>", x, y, bw - 1, bh))
  }
  paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h,
    "' role='img' aria-label='", .html_escape(title), "'>",
    "<rect x='0' y='0' width='", w, "' height='", h, "' fill='#fff' stroke='#ddd'/>",
    "<text x='", w / 2, "' y='16' text-anchor='middle' font-size='12'>", .html_escape(title), "</text>",
    paste(bars, collapse = ""),
    "</svg>"
  )
}

.empirical_irf_svg <- function(item) {
  emp <- item$empirical
  if (is.null(emp) || !is.list(emp) || !length(emp$theta)) return("")
  th <- as.numeric(emp$theta)
  p <- as.numeric(emp$proportion)
  se <- as.numeric(emp$se)
  if (!length(th) || !length(p)) return("")
  lo <- p - 2 * se
  hi <- p + 2 * se
  w <- 420; h <- 220; pad_l <- 42; pad_b <- 32; pad_t <- 22; pad_r <- 12
  inner_w <- w - pad_l - pad_r
  inner_h <- h - pad_t - pad_b
  xr <- range(c(th, as.numeric(item$theta)), na.rm = TRUE)
  if (!all(is.finite(xr)) || diff(xr) == 0) xr <- c(-3, 3)
  sx <- function(x) pad_l + (x - xr[1]) / diff(xr) * inner_w
  sy <- function(y) pad_t + (1 - max(0, min(1, y))) * inner_h
  model_pts <- paste(sprintf("%.1f,%.1f", sx(as.numeric(item$theta)), sy(as.numeric(item$irf))), collapse = " ")
  bands <- paste(sprintf(
    "<line x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='#94a3b8' stroke-width='2'/>",
    sx(th), sy(lo), sx(th), sy(hi)
  ), collapse = "")
  dots <- paste(sprintf("<circle cx='%.1f' cy='%.1f' r='3' fill='#b45309'/>", sx(th), sy(p)), collapse = "")
  paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h,
    "' role='img' aria-label='empirical IRF'><rect x='0' y='0' width='", w, "' height='", h,
    "' fill='#fff' stroke='#ddd'/>",
    "<text x='", w / 2, "' y='16' text-anchor='middle' font-size='12'>Empirical IRF with 2 SE</text>",
    "<polyline fill='none' stroke='#1d4ed8' stroke-width='1.5' points='", model_pts, "'/>",
    bands, dots, "</svg>"
  )
}

.tif_csv <- function(plots) {
  if (is.null(plots) || !length(plots$theta)) return(NULL)
  th <- as.numeric(plots$theta)
  tif <- as.numeric(plots$tif)
  csem <- as.numeric(plots$csem)
  lines <- c("theta,information,csem")
  for (i in seq_along(th)) {
    lines <- c(lines, sprintf("%s,%s,%s", th[[i]], tif[[i]], csem[[i]]))
  }
  paste(lines, collapse = "\n")
}

.iif_csv <- function(plots) {
  if (is.null(plots) || !is.list(plots$items) || !length(plots$items)) return(NULL)
  ids <- names(plots$items)
  th <- as.numeric(plots$items[[1]]$theta)
  header <- paste(c("theta", ids), collapse = ",")
  lines <- header
  for (i in seq_along(th)) {
    vals <- vapply(ids, function(id) as.numeric(plots$items[[id]]$iif)[[i]], numeric(1))
    lines <- c(lines, paste(c(th[[i]], vals), collapse = ","))
  }
  paste(lines, collapse = "\n")
}

.wright_svg <- function(wright) {
  if (is.null(wright) || !is.list(wright)) return("")
  person <- as.numeric(wright$personTheta)
  person <- person[is.finite(person)]
  item_b <- unlist(wright$itemB, use.names = TRUE)
  item_b <- item_b[is.finite(item_b)]
  if (!length(person) && !length(item_b)) return("")
  xr <- range(c(person, item_b, -3, 3), na.rm = TRUE)
  if (!all(is.finite(xr)) || diff(xr) == 0) xr <- c(-3, 3)
  breaks <- seq(xr[1], xr[2], length.out = 13L)
  counts <- if (length(person)) as.numeric(table(cut(person, breaks = breaks, include.lowest = TRUE))) else rep(0, 12L)
  max_c <- max(c(counts, 1))
  w <- 520
  h <- 280
  pad_l <- 48
  pad_r <- 16
  pad_t <- 24
  mid <- 140
  inner_w <- w - pad_l - pad_r
  sx <- function(x) pad_l + (x - xr[1]) / diff(xr) * inner_w
  bars <- character(0)
  for (i in seq_along(counts)) {
    if (counts[[i]] <= 0) next
    x0 <- sx(breaks[[i]])
    x1 <- sx(breaks[[i + 1L]])
    bh <- (counts[[i]] / max_c) * 90
    bars <- c(bars, sprintf(
      "<rect x='%.1f' y='%.1f' width='%.1f' height='%.1f' fill='#1d4ed8' fill-opacity='0.55'/>",
      x0, mid - 8 - bh, max(1, x1 - x0 - 1), bh
    ))
  }
  ticks <- character(0)
  ids <- names(item_b)
  if (is.null(ids)) ids <- as.character(seq_along(item_b))
  for (i in seq_along(item_b)) {
    x <- sx(item_b[[i]])
    ticks <- c(ticks, sprintf(
      "<line x1='%.1f' y1='%d' x2='%.1f' y2='%d' stroke='#b45309'/>",
      x, mid + 8, x, mid + 28
    ), sprintf(
      "<text x='%.1f' y='%d' text-anchor='middle' font-size='9' transform='rotate(-40 %.1f %d)'>%s</text>",
      x, mid + 42, x, mid + 42, .html_escape(ids[[i]])
    ))
  }
  paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h,
    "' role='img' aria-label='Wright map'>",
    "<rect x='0' y='0' width='", w, "' height='", h, "' fill='#fff' stroke='#ddd'/>",
    "<text x='", w / 2, "' y='16' text-anchor='middle' font-size='12'>Wright map (persons above, items below)</text>",
    "<line x1='", pad_l, "' y1='", mid, "' x2='", w - pad_r, "' y2='", mid, "' stroke='#444'/>",
    bars,
    ticks,
    "<text x='", w / 2, "' y='", h - 8, "' text-anchor='middle' font-size='10'>theta / b</text>",
    "</svg>"
  )
}

.irt_chapter_html <- function(plots) {
  if (is.null(plots) || !is.list(plots)) return("")
  chunks <- c("<h2>IRT graphics</h2>")
  th <- as.numeric(plots$theta)
  if (length(th) && length(plots$tif)) {
    chunks <- c(chunks, .polyline_svg(th, as.numeric(plots$tif), "Test information", "theta", "I(theta)"))
  }
  if (length(th) && length(plots$csem)) {
    chunks <- c(chunks, .polyline_svg(th, as.numeric(plots$csem), "Conditional SEM", "theta", "CSEM"))
  }
  if (length(th) && length(plots$trf)) {
    chunks <- c(chunks, .polyline_svg(th, as.numeric(plots$trf), "Test response function", "theta", "Expected score"))
  }
  if (is.list(plots$domainTif)) {
    for (did in names(plots$domainTif)) {
      chunks <- c(chunks, .polyline_svg(th, as.numeric(plots$domainTif[[did]]), paste("Domain TIF", did), "theta", "I(theta)"))
    }
  }
  if (!is.null(plots$wright)) {
    chunks <- c(chunks, .wright_svg(plots$wright))
  }
  if (!is.null(plots$scatter)) {
    chunks <- c(chunks, .scatter_svg(plots$scatter))
  }
  if (!is.null(plots$thetaHistogram)) {
    chunks <- c(chunks, .hist_svg(plots$thetaHistogram, "Theta histogram"))
  }
  if (is.list(plots$items)) {
    n_show <- min(length(plots$items), 12L)
    ids <- names(plots$items)[seq_len(n_show)]
    for (id in ids) {
      it <- plots$items[[id]]
      chunks <- c(
        chunks,
        sprintf("<h3>%s</h3>", .html_escape(id)),
        .polyline_svg(as.numeric(it$theta), as.numeric(it$irf), paste("IRF", id), "theta", "P(theta)"),
        .empirical_irf_svg(it),
        .polyline_svg(as.numeric(it$theta), as.numeric(it$iif), paste("IIF", id), "theta", "I(theta)")
      )
    }
  }
  paste(chunks, collapse = "\n")
}

build_item_analysis_html <- function(job_id, package_version, sample_size, calibrated_at,
                                     test_level, parameters, diagnostics = NULL, irt_plots = NULL,
                                     template = NULL, credits = NULL, skin = NULL) {
  rel <- test_level$reliability
  rows <- character(0)
  for (id in names(parameters)) {
    p <- parameters[[id]]
    flag_txt <- if (is.list(p$flags) && length(p$flags)) {
      paste(vapply(p$flags, function(f) f$code, character(1)), collapse = ", ")
    } else {
      "none"
    }
    rows <- c(rows, sprintf(
      "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
      .html_escape(id),
      .fmt(p$pValue),
      .fmt(p$pointBiserial),
      .fmt(p$n, 0),
      .fmt(p$alphaWithout),
      .html_escape(flag_txt)
    ))
  }
  item_pages <- character(0)
  for (id in names(parameters)) {
    p <- parameters[[id]]
    dist_html <- ""
    if (is.list(p$distractors) && length(p$distractors)) {
      drows <- character(0)
      for (oid in names(p$distractors)) {
        d <- p$distractors[[oid]]
        drows <- c(drows, sprintf(
          "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
          .html_escape(oid),
          .html_escape(if (!is.null(d$role)) d$role else if (isTRUE(d$keyed)) "key" else "distractor"),
          .fmt(d$n, 0),
          .fmt(d$proportion),
          .fmt(d$pointBiserial),
          .fmt(d$mean),
          .fmt(d$sd)
        ))
      }
      dist_html <- paste0(
        "<table><thead><tr><th>Option</th><th>Role</th><th>n</th><th>Proportion</th><th>rpb</th><th>Mean</th><th>SD</th></tr></thead><tbody>",
        paste(drows, collapse = ""),
        "</tbody></table>",
        .try_ggplot_quantile(id, p$distractors)
      )
    } else {
      dist_html <- "<p class='note'>No option-level distractors (dichotomous 0/1 matrix).</p>"
    }
    flag_html <- ""
    if (is.list(p$flags) && length(p$flags)) {
      flag_html <- paste0(
        "<ul class='flag'>",
        paste(vapply(p$flags, function(f) {
          sprintf("<li>[%s] %s</li>", .html_escape(f$code), .html_escape(f$message))
        }, character(1)), collapse = ""),
        "</ul>"
      )
    }
    item_pages <- c(item_pages, paste0(
      "<h3>", .html_escape(id), "</h3>",
      "<p>p = ", .fmt(p$pValue), ", rpb = ", .fmt(p$pointBiserial),
      ", biserial = ", .fmt(p$biserial), ", n = ", .fmt(p$n, 0),
      ", alpha-without = ", .fmt(p$alphaWithout),
      if (is.list(p$domainPointBiserial) && length(p$domainPointBiserial)) {
        paste0(
          ", domain rpb: ",
          paste(vapply(names(p$domainPointBiserial), function(did) {
            sprintf("%s=%s", did, .fmt(p$domainPointBiserial[[did]]$pointBiserial))
          }, character(1)), collapse = "; ")
        )
      } else {
        ""
      },
      "</p>",
      flag_html,
      dist_html
    ))
  }
  freq_rows <- character(0)
  if (is.list(test_level$scoreFrequency)) {
    for (row in test_level$scoreFrequency) {
      freq_rows <- c(freq_rows, sprintf(
        "<tr><td>%s</td><td>%s</td></tr>",
        .fmt(row$score, 0), .fmt(row$n, 0)
      ))
    }
  }
  domain_html <- ""
  if (is.list(test_level$domains) && length(test_level$domains)) {
    drows <- character(0)
    for (did in names(test_level$domains)) {
      d <- test_level$domains[[did]]
      drows <- c(drows, sprintf(
        "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
        .html_escape(did), .fmt(d$nItems, 0), .fmt(d$mean), .fmt(d$sd), .fmt(d$alpha)
      ))
    }
    domain_html <- paste0(
      "<h2>Domain / subscore analysis</h2>",
      "<table><thead><tr><th>Domain</th><th>Items</th><th>Mean</th><th>SD</th><th>Alpha</th></tr></thead><tbody>",
      paste(drows, collapse = ""),
      "</tbody></table>"
    )
  }
  cut_html <- ""
  if (is.list(test_level$cutScore) && !is.null(test_level$cutScore$cutScore)) {
    cs <- test_level$cutScore
    cut_html <- paste0(
      "<h2>Mastery / cutscore</h2>",
      "<p>Cut score ", .fmt(cs$cutScore, 1), ": pass rate ", .fmt(cs$passRate),
      " (nPass = ", .fmt(cs$nPass, 0), " of ", .fmt(cs$n, 0), ").</p>"
    )
  }
  skin_obj <- if (is.null(skin)) .load_report_skin(if (!is.null(template)) template$skinId else "iteman-classic") else skin
  tpl_name <- if (!is.null(template) && !is.null(template$name)) template$name else ""
  paste0(
    "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'/>",
    "<title>Item analysis ", .html_escape(job_id), "</title>",
    "<style>", .html_css(skin_obj), "</style></head><body>",
    if (.chapter_on(template, "cover")) paste0(
      "<h1>", .html_escape(if (nzchar(skin_obj$title)) skin_obj$title else "Classical item analysis technical report"), "</h1>",
      "<div class='stamp'>jobId ", .html_escape(job_id),
      " | ", .html_escape(package_version),
      " | n = ", .html_escape(as.character(sample_size)),
      " | ", .html_escape(calibrated_at),
      if (nzchar(tpl_name)) paste0(" | template ", .html_escape(tpl_name)) else "",
      "</div>",
      "<p class='note'>Statistics are TAM / classical formulas with provenance on this page. ",
      "This is not an Iteman file; it reports the same statistic classes (reliability, ",
      "score distribution, option analysis, quantile plots, flags).</p>"
    ) else "",
    if (.chapter_on(template, "test-summary")) paste0(
      "<h2>Test-level summary</h2>",
      "<table><tbody>",
      "<tr><th>N persons</th><td>", .fmt(test_level$nPersons, 0), "</td></tr>",
      "<tr><th>k items</th><td>", .fmt(test_level$nItems, 0), "</td></tr>",
      "<tr><th>Mean</th><td>", .fmt(test_level$mean), "</td></tr>",
      "<tr><th>SD</th><td>", .fmt(test_level$sd), "</td></tr>",
      "<tr><th>Skew</th><td>", .fmt(test_level$skew), "</td></tr>",
      "<tr><th>Kurtosis (excess)</th><td>", .fmt(test_level$kurtosis), "</td></tr>",
      "</tbody></table>"
    ) else "",
    if (.chapter_on(template, "reliability")) paste0(
      "<h2>Reliability</h2>",
      "<table><tbody>",
      "<tr><th>KR-20</th><td>", .fmt(rel$kr20), "</td></tr>",
      "<tr><th>KR-21</th><td>", .fmt(rel$kr21), "</td></tr>",
      "<tr><th>Cronbach alpha</th><td>", .fmt(rel$cronbachAlpha), "</td></tr>",
      "<tr><th>Guttman lambda-2</th><td>", .fmt(rel$guttmanLambda2), "</td></tr>",
      "<tr><th>Spearman-Brown split-half</th><td>", .fmt(rel$spearmanBrownSplitHalf), "</td></tr>",
      "<tr><th>SEM</th><td>", .fmt(rel$sem), "</td></tr>",
      "</tbody></table>"
    ) else "",
    if (.chapter_on(template, "distribution")) paste0(
      "<h2>Score distribution</h2>",
      "<table><thead><tr><th>Score</th><th>n</th></tr></thead><tbody>",
      paste(freq_rows, collapse = ""),
      "</tbody></table>"
    ) else "",
    if (.chapter_on(template, "csem")) .csem_table_html(test_level$csemByScore) else "",
    domain_html,
    cut_html,
    if (.chapter_on(template, "flags") || .chapter_on(template, "item-pages")) paste0(
      "<h2>Item summary</h2>",
      "<table><thead><tr><th>Item</th><th>p</th><th>rpb</th><th>n</th><th>alpha-without</th><th>Flags</th></tr></thead><tbody>",
      paste(rows, collapse = ""),
      "</tbody></table>"
    ) else "",
    if (.chapter_on(template, "item-pages")) paste0("<h2>Item pages</h2>", paste(item_pages, collapse = "\n")) else "",
    if (.chapter_on(template, "irt-plots")) .irt_chapter_html(irt_plots) else "",
    if (.chapter_on(template, "credits")) .credits_html(credits) else "",
    "</body></html>"
  )
}

build_irt_html <- function(job_id, package_version, sample_size, calibrated_at,
                           parameters, standard_errors, fit_statistics, plots,
                           template = NULL, credits = NULL, skin = NULL) {
  rows <- character(0)
  for (id in names(parameters)) {
    p <- parameters[[id]]
    se <- if (!is.null(standard_errors[[id]])) standard_errors[[id]] else list()
    rows <- c(rows, sprintf(
      "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
      .html_escape(id),
      .fmt(p$a), .fmt(se$a),
      .fmt(if (length(unlist(p$b)) == 1) p$b else unlist(p$b)[[1]]),
      .fmt(se$b),
      .fmt(p$c), .fmt(se$c),
      .fmt(p$thetaPointBiserial)
    ))
  }
  skin_obj <- if (is.null(skin)) .load_report_skin(if (!is.null(template)) template$skinId else "xcalibre-classic") else skin
  tpl_name <- if (!is.null(template) && !is.null(template$name)) template$name else ""
  paste0(
    "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'/>",
    "<title>IRT calibration ", .html_escape(job_id), "</title>",
    "<style>", .html_css(skin_obj), "</style></head><body>",
    if (.chapter_on(template, "cover")) paste0(
      "<h1>", .html_escape(if (nzchar(skin_obj$title)) skin_obj$title else "IRT calibration technical report"), "</h1>",
      "<div class='stamp'>jobId ", .html_escape(job_id),
      " | ", .html_escape(package_version),
      " | n = ", .html_escape(as.character(sample_size)),
      " | ", .html_escape(calibrated_at),
      if (nzchar(tpl_name)) paste0(" | template ", .html_escape(tpl_name)) else "",
      "</div>",
      "<p class='note'>Unidimensional mirt calibration. Standard errors, item fit, and ",
      "person scores are reported when the fit produced them. Not an Xcalibre file; ",
      "the statistic classes match (a/b/c or thresholds, SEs, IRF/IIF, TIF/CSEM).</p>"
    ) else "",
    if (.chapter_on(template, "item-pages") || .chapter_on(template, "test-summary")) paste0(
    "<h2>Item parameters</h2>",
    "<table><thead><tr><th>Item</th><th>a</th><th>SE(a)</th><th>b</th><th>SE(b)</th><th>c</th><th>SE(c)</th><th>T-Rpbis</th></tr></thead><tbody>",
    paste(rows, collapse = ""),
    "</tbody></table>") else "",
    if (is.list(fit_statistics$itemFit) && length(fit_statistics$itemFit)) {
      fit_rows <- character(0)
      for (id in names(fit_statistics$itemFit)) {
        f <- fit_statistics$itemFit[[id]]
        fit_rows <- c(fit_rows, sprintf(
          "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>",
          .html_escape(id),
          .fmt(f$S_X2),
          .fmt(f[["p.S_X2"]], 4),
          .fmt(f$outfit)
        ))
      }
      paste0(
        "<h2>Item fit</h2>",
        "<table><thead><tr><th>Item</th><th>S-X2</th><th>p</th><th>outfit</th></tr></thead><tbody>",
        paste(fit_rows, collapse = ""),
        "</tbody></table>"
      )
    } else {
      ""
    },
    if (.chapter_on(template, "irt-plots")) .irt_chapter_html(plots) else "",
    if (.chapter_on(template, "credits")) .credits_html(credits) else "",
    "</body></html>"
  )
}

build_testinfo_html <- function(job_id, package_version, sample_size, calibrated_at, parameters,
                                template = NULL, credits = NULL, skin = NULL) {
  th <- as.numeric(parameters$theta)
  info <- as.numeric(parameters$information)
  sem <- suppressWarnings(as.numeric(parameters$conditionalSEM))
  skin_obj <- if (is.null(skin)) .load_report_skin(if (!is.null(template)) template$skinId else "xcalibre-classic") else skin
  paste0(
    "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'/>",
    "<title>Test information ", .html_escape(job_id), "</title>",
    "<style>", .html_css(skin_obj), "</style></head><body>",
    if (.chapter_on(template, "cover")) paste0(
      "<h1>Test information technical report</h1>",
      "<div class='stamp'>jobId ", .html_escape(job_id),
      " | ", .html_escape(package_version),
      " | n = ", .html_escape(as.character(sample_size)),
      " | ", .html_escape(calibrated_at), "</div>"
    ) else "",
    if (.chapter_on(template, "irt-plots")) paste0(
      .polyline_svg(th, info, "Test information", "theta", "I(theta)"),
      .polyline_svg(th, sem, "Conditional SEM", "theta", "CSEM")
    ) else "",
    if (.chapter_on(template, "credits")) .credits_html(credits) else "",
    "</body></html>"
  )
}
