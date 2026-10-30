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

.report_layout_css <- function() {
  candidates <- c(
    file.path(.report_skins_dir(), "_layout.css"),
    file.path("reports", "_layout.css")
  )
  for (path in candidates) {
    if (file.exists(path)) {
      return(paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n"))
    }
  }
  paste(
    "body{margin:0;font-family:Georgia,serif;color:#1c1917;line-height:1.5;background:#ebe4d6}",
    ".report{max-width:52rem;margin:0 auto;padding:2.5rem;background:#fffcf7}",
    "table{border-collapse:collapse;width:100%;font-size:14px}",
    "th,td{border-bottom:1px solid #d4c6b0;padding:.45rem .6rem;text-align:left}",
    "td.n{text-align:right}",
    sep = "\n"
  )
}

.html_css <- function(skin = NULL) {
  tokens <- if (is.list(skin) && !is.null(skin$css) && nzchar(as.character(skin$css)[[1]])) {
    as.character(skin$css)[[1]]
  } else {
    ""
  }
  paste(.report_layout_css(), tokens, sep = "\n")
}

.html_document <- function(title, css, body, credits = NULL) {
  paste0(
    "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'/>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'/>",
    "<title>", .html_escape(title), "</title>",
    "<style>", css, "</style></head><body><main class='report'>",
    body,
    .credits_html(credits),
    "<footer class='colophon'>ECD Assessment Platform &middot; psychometric analysis bureau</footer>",
    "</main></body></html>"
  )
}

.cover_html <- function(title, lede, job_id, package_version, sample_size, calibrated_at, tpl_name = "") {
  fields <- list(
    Job = job_id,
    Engine = package_version,
    N = as.character(sample_size),
    Computed = calibrated_at
  )
  if (!is.null(tpl_name) && nzchar(as.character(tpl_name)[[1]])) {
    fields$Template <- as.character(tpl_name)[[1]]
  }
  items <- vapply(names(fields), function(nm) {
    sprintf("<div><dt>%s</dt><dd>%s</dd></div>", .html_escape(nm), .html_escape(fields[[nm]]))
  }, character(1), USE.NAMES = FALSE)
  paste0(
    "<header class='cover'>",
    "<h1>", .html_escape(title), "</h1>",
    if (!is.null(lede) && nzchar(lede)) paste0("<p class='lede'>", lede, "</p>") else "",
    "<dl class='meta stamp'>", paste(items, collapse = ""), "</dl>",
    "</header>"
  )
}

.tdn <- function(x, digits = 3) sprintf("<td class='n'>%s</td>", .fmt(x, digits))

.table_wrap <- function(..., caption = NULL, class = NULL) {
  cap <- if (!is.null(caption) && nzchar(caption)) sprintf("<caption>%s</caption>", .html_escape(caption)) else ""
  cls <- if (!is.null(class) && nzchar(class)) sprintf(" class='%s'", class) else ""
  paste0("<div class='table-wrap'><table", cls, ">", cap, paste0(..., collapse = ""), "</table></div>")
}

.inline_svg <- function(raw, caption = NULL) {
  txt <- paste(raw, collapse = "\n")
  txt <- sub("^\\s*<\\?xml[^>]*\\?>", "", txt, perl = TRUE)
  txt <- sub("<!DOCTYPE[^>]*>", "", txt, perl = TRUE)
  cap <- if (!is.null(caption) && nzchar(caption)) {
    paste0("<figcaption>", .html_escape(caption), "</figcaption>")
  } else {
    ""
  }
  paste0("<figure class='plot'>", txt, cap, "</figure>")
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
    ver <- tryCatch(as.character(utils::packageVersion(pkg)), error = function(e) "")
    cite <- tryCatch(paste(format(utils::citation(pkg), style = "text"), collapse = "\n"), error = function(e) pkg)
    if (nzchar(ver)) paste0(pkg, " ", ver, "\n", cite) else cite
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
  if (is.null(credits) || !is.list(credits)) {
    credits <- tryCatch(.report_credits(character()), error = function(e) {
      list(rVersion = R.version.string, r = R.version.string, packages = list(), packageNames = list())
    })
  }
  names <- unlist(credits$packageNames, use.names = FALSE)
  names <- as.character(names[!is.na(names) & nzchar(names)])
  used <- if (length(names)) {
    paste0("Packages used to generate this report: ", paste(names, collapse = ", "), ".")
  } else {
    "This report was produced by the ECD R bureau."
  }
  body <- paste(
    c(used, credits$rVersion, credits$r, unlist(credits$packages, use.names = FALSE)),
    collapse = "\n\n"
  )
  paste0(
    "<section class='credits-block' id='credits'>",
    "<h2>Software and packages</h2>",
    "<p class='note'>This report was produced by the ECD R bureau. It is not Iteman or Xcalibre software.</p>",
    "<pre class='credits'>", .html_escape(body), "</pre>",
    "</section>"
  )
}

.csem_table_html <- function(by_score) {
  if (!is.list(by_score) || !length(by_score)) return("")
  rows <- character(0)
  for (row in by_score) {
    rows <- c(rows, sprintf("<tr>%s%s</tr>", .tdn(row$score, 0), .tdn(row$csem)))
  }
  paste0(
    "<h2>CSEM by score</h2>",
    .table_wrap(
      "<thead><tr><th class='n'>Score</th><th class='n'>CSEM</th></tr></thead><tbody>",
      paste(rows, collapse = ""),
      "</tbody>",
      caption = "Conditional standard error of measurement by raw score",
      class = "compact"
    )
  )
}

.flag_list_html <- function(flags) {
  if (!is.list(flags) || !length(flags)) return("")
  items <- vapply(flags, function(f) {
    sprintf("<li><b>%s</b> %s</li>", .html_escape(f$code), .html_escape(f$message))
  }, character(1))
  paste0("<ul class='flags flag'>", paste(items, collapse = ""), "</ul>")
}

.CHART <- list(
  ink = "#1c1917",
  muted = "#57534e",
  grid = "#e8dfd0",
  panel = "#fffdf8",
  line = "#1e3a5f",
  font = "Source Sans 3, Segoe UI, sans-serif"
)

.chart_id <- local({
  n <- 0L
  function() {
    n <<- n + 1L
    sprintf("ax%04d", n)
  }
})

.finite_range <- function(x, fallback = c(0, 1), pad = 0.04) {
  x <- x[is.finite(x)]
  if (!length(x)) return(fallback)
  r <- range(x)
  if (!is.finite(diff(r)) || diff(r) == 0) {
    span <- max(abs(r[[1]]) * 0.1, 0.05)
    r <- r + c(-span, span)
  }
  if (pad > 0) r <- r + c(-1, 1) * diff(r) * pad
  r
}

.chart_axes <- function(w, h, pad, xr, yr, xlab, ylab, x_digits = 2, y_digits = 2,
                        xticks = NULL, yticks = NULL) {
  inner_w <- w - pad$l - pad$r
  inner_h <- h - pad$t - pad$b
  sx <- function(x) pad$l + (x - xr[1]) / diff(xr) * inner_w
  sy <- function(y) pad$t + (1 - (y - yr[1]) / diff(yr)) * inner_h
  if (is.null(xticks)) xticks <- pretty(xr, n = 5)
  if (is.null(yticks)) yticks <- pretty(yr, n = 5)
  xticks <- xticks[xticks >= xr[1] - 1e-8 * max(diff(xr), 1e-9) & xticks <= xr[2] + 1e-8 * max(diff(xr), 1e-9)]
  yticks <- yticks[yticks >= yr[1] - 1e-8 * max(diff(yr), 1e-9) & yticks <= yr[2] + 1e-8 * max(diff(yr), 1e-9)]
  if (!length(xticks)) xticks <- xr
  if (!length(yticks)) yticks <- yr
  id <- .chart_id()
  grid <- paste(c(
    vapply(xticks, function(v) {
      sprintf("<line class='grid' x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='%s' stroke-width='0.6'/>",
              sx(v), pad$t, sx(v), pad$t + inner_h, .CHART$grid)
    }, character(1)),
    vapply(yticks, function(v) {
      sprintf("<line class='grid' x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='%s' stroke-width='0.6'/>",
              pad$l, sy(v), pad$l + inner_w, sy(v), .CHART$grid)
    }, character(1))
  ), collapse = "")
  fill <- sprintf(
    "<rect class='panel-fill' x='%.1f' y='%.1f' width='%.1f' height='%.1f' fill='%s' stroke='none'/>",
    pad$l, pad$t, inner_w, inner_h, .CHART$panel
  )
  frame <- sprintf(
    "<rect class='panel-frame' x='%.1f' y='%.1f' width='%.1f' height='%.1f' fill='none' stroke='%s' stroke-width='1.2'/>",
    pad$l, pad$t, inner_w, inner_h, .CHART$ink
  )
  xt <- paste(vapply(xticks, function(v) {
    paste0(
      sprintf("<line class='tick' x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='%s' stroke-width='1'/>",
              sx(v), pad$t + inner_h, sx(v), pad$t + inner_h + 5.5, .CHART$ink),
      sprintf("<text class='tick-label' x='%.1f' y='%.1f' text-anchor='middle' font-size='10' fill='%s' font-family='%s'>%s</text>",
              sx(v), pad$t + inner_h + 17, .CHART$muted, .CHART$font, .fmt(v, x_digits))
    )
  }, character(1)), collapse = "")
  yt <- paste(vapply(yticks, function(v) {
    paste0(
      sprintf("<line class='tick' x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='%s' stroke-width='1'/>",
              pad$l - 5.5, sy(v), pad$l, sy(v), .CHART$ink),
      sprintf("<text class='tick-label' x='%.1f' y='%.1f' text-anchor='end' font-size='10' fill='%s' font-family='%s'>%s</text>",
              pad$l - 8, sy(v) + 3.5, .CHART$muted, .CHART$font, .fmt(v, y_digits))
    )
  }, character(1)), collapse = "")
  xlab_el <- sprintf(
    "<text class='axis-title' x='%.1f' y='%.1f' text-anchor='middle' font-size='11' fill='%s' font-family='%s'>%s</text>",
    pad$l + inner_w / 2, h - 7, .CHART$ink, .CHART$font, .html_escape(xlab)
  )
  ylab_el <- sprintf(
    "<text class='axis-title' x='13' y='%.1f' text-anchor='middle' font-size='11' fill='%s' font-family='%s' transform='rotate(-90 13 %.1f)'>%s</text>",
    pad$t + inner_h / 2, .CHART$ink, .CHART$font, pad$t + inner_h / 2, .html_escape(ylab)
  )
  clip <- sprintf(
    "<defs><clipPath id='%s'><rect x='%.1f' y='%.1f' width='%.1f' height='%.1f'/></clipPath></defs>",
    id, pad$l, pad$t, inner_w, inner_h
  )
  list(
    sx = sx, sy = sy, inner_w = inner_w, inner_h = inner_h, xr = xr, yr = yr,
    pad = pad, clip_id = id,
    under = paste0(clip, fill, grid),
    over = paste0(frame, xt, yt, xlab_el, ylab_el)
  )
}

.chart_svg <- function(w, h, title, axes, series, extra = "") {
  .inline_svg(paste0(
    "<svg xmlns='http://www.w3.org/2000/svg' width='", w, "' height='", h,
    "' viewBox='0 0 ", w, " ", h, "' role='img' aria-label='", .html_escape(title), "'>",
    axes$under,
    sprintf("<g clip-path='url(#%s)'>", axes$clip_id), series, "</g>",
    axes$over,
    extra,
    "</svg>"
  ), title)
}

.polyline_svg <- function(xs, ys, title, xlab, ylab, ylim = NULL) {
  w <- 520
  h <- 260
  pad <- list(l = 58, r = 16, t = 14, b = 48)
  finite <- is.finite(xs) & is.finite(ys)
  if (!any(finite)) {
    return(sprintf("<p class='note'>%s: no finite points.</p>", .html_escape(title)))
  }
  xr <- .finite_range(xs[finite], fallback = c(-3, 3), pad = 0.03)
  yr <- if (!is.null(ylim) && length(ylim) == 2 && all(is.finite(ylim))) {
    as.numeric(ylim)
  } else {
    r <- .finite_range(ys[finite], pad = 0.08)
    if (min(ys[finite], na.rm = TRUE) >= 0) r[1] <- 0
    r
  }
  ax <- .chart_axes(w, h, pad, xr, yr, xlab, ylab)
  pts <- paste(sprintf("%.1f,%.1f", ax$sx(xs[finite]), ax$sy(ys[finite])), collapse = " ")
  .chart_svg(w, h, title, ax, sprintf(
    "<polyline fill='none' stroke='%s' stroke-width='1.7' points='%s'/>",
    .CHART$line, pts
  ))
}

.quantile_svg <- function(item_id, distractors) {
  if (!is.list(distractors) || !length(distractors)) return("")
  first <- distractors[[1]]
  qs <- first$quantiles
  if (!is.list(qs) || !length(qs)) return("")
  n_q <- length(qs)
  colors <- c("#1d4ed8", "#b45309", "#15803d", "#be123c", "#6d28d9", "#0f766e")
  n_opt <- length(distractors)
  w <- 520
  h <- 280
  pad <- list(l = 58, r = 16, t = 14, b = 64)
  xr <- c(1, max(n_q, 2))
  yr <- c(0, 1)
  ax <- .chart_axes(w, h, pad, xr, yr, "Score quantile", "Proportion", x_digits = 0, y_digits = 2,
                    xticks = seq_len(n_q), yticks = seq(0, 1, by = 0.2))
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
      sprintf("%.1f,%.1f", ax$sx(q), ax$sy(max(0, min(1, p))))
    }, character(1))
    dash <- if (isTRUE(d$keyed)) "stroke-width='2'" else "stroke-width='1.25' stroke-dasharray='4 3'"
    lines <- c(lines, sprintf(
      "<polyline fill='none' stroke='%s' %s points='%s'/>",
      col, dash, paste(pts, collapse = " ")
    ))
    lx <- pad$l + ((i - 1L) %% min(n_opt, 6L)) * 78
    ly <- h - 12
    legend <- c(legend, sprintf(
      "<rect x='%.1f' y='%.1f' width='10' height='2.4' fill='%s'/>", lx, ly - 4, col
    ), sprintf(
      "<text x='%.1f' y='%.1f' font-size='10' fill='%s' font-family='%s'>%s%s</text>",
      lx + 14, ly, .CHART$ink, .CHART$font, .html_escape(nm),
      if (isTRUE(d$keyed)) " (key)" else ""
    ))
  }
  .chart_svg(w, h, paste("Quantile plot --", item_id), ax, paste(lines, collapse = ""), paste(legend, collapse = ""))
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
    ggplot2::geom_line(linewidth = 0.7) +
    ggplot2::geom_point(size = 1.8) +
    ggplot2::scale_x_continuous(breaks = sort(unique(df$quantile)), expand = c(0.02, 0)) +
    ggplot2::scale_y_continuous(limits = c(0, 1), breaks = seq(0, 1, 0.2), expand = c(0.02, 0)) +
    ggplot2::labs(x = "Score quantile", y = "Proportion", linetype = NULL, colour = "Option") +
    ggplot2::scale_linetype_manual(values = c("FALSE" = "dashed", "TRUE" = "solid"), labels = c("FALSE" = "distractor", "TRUE" = "key"), name = NULL) +
    ggplot2::theme_bw(base_size = 11) +
    ggplot2::theme(
      panel.border = ggplot2::element_rect(colour = "#1c1917", fill = NA, linewidth = 0.7),
      axis.ticks = ggplot2::element_line(colour = "#1c1917", linewidth = 0.45),
      axis.ticks.length = grid::unit(3.2, "pt"),
      axis.title = ggplot2::element_text(colour = "#1c1917", size = 11),
      axis.text = ggplot2::element_text(colour = "#57534e", size = 10),
      panel.grid.minor = ggplot2::element_blank(),
      panel.grid.major = ggplot2::element_line(colour = "#e8dfd0", linewidth = 0.35),
      panel.background = ggplot2::element_rect(fill = "#fffdf8", colour = NA),
      plot.background = ggplot2::element_rect(fill = "transparent", colour = NA),
      legend.position = "bottom",
      legend.background = ggplot2::element_blank(),
      text = ggplot2::element_text(colour = "#1c1917")
    )
  tmp <- tempfile(fileext = ".svg")
  ok <- try(ggplot2::ggsave(tmp, p, width = 5.5, height = 3.2, device = svglite::svglite), silent = TRUE)
  if (inherits(ok, "try-error") || !file.exists(tmp)) return(.quantile_svg(item_id, distractors))
  .inline_svg(paste(readLines(tmp, warn = FALSE), collapse = "\n"), paste("Quantile plot --", item_id))
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
  w <- 480
  h <- 280
  pad <- list(l = 58, r = 16, t = 14, b = 48)
  xr <- .finite_range(b, pad = 0.08)
  yr <- .finite_range(a, pad = 0.08)
  if (min(a) >= 0 && yr[1] > 0) yr[1] <- 0
  ax <- .chart_axes(w, h, pad, xr, yr, "Difficulty (b)", "Discrimination (a)")
  dots <- paste(sprintf("<circle cx='%.1f' cy='%.1f' r='3' fill='%s'/>", ax$sx(b), ax$sy(a), .CHART$line), collapse = "")
  .chart_svg(w, h, "Item discrimination (a) against difficulty (b)", ax, dots)
}

.hist_svg <- function(hist, title) {
  if (is.null(hist) || !is.list(hist)) return("")
  counts <- as.numeric(hist$counts)
  if (!length(counts)) return("")
  breaks <- as.numeric(hist$breaks)
  n <- length(counts)
  w <- 520
  h <- 260
  pad <- list(l = 58, r = 16, t = 14, b = 48)
  if (length(breaks) == n + 1L && all(is.finite(breaks))) {
    xr <- c(breaks[[1]], breaks[[n + 1L]])
  } else {
    xr <- c(0, n)
    breaks <- seq(0, n)
  }
  yr <- c(0, max(c(counts, 1)) * 1.08)
  ax <- .chart_axes(w, h, pad, xr, yr, "theta", "Count", y_digits = 0)
  bars <- character(0)
  for (i in seq_along(counts)) {
    x0 <- ax$sx(breaks[[i]])
    x1 <- ax$sx(breaks[[i + 1L]])
    y0 <- ax$sy(0)
    y1 <- ax$sy(counts[[i]])
    bars <- c(bars, sprintf(
      "<rect x='%.1f' y='%.1f' width='%.1f' height='%.1f' fill='%s'/>",
      x0 + 0.6, min(y0, y1), max(0.5, abs(x1 - x0) - 1.2), abs(y0 - y1), .CHART$line
    ))
  }
  .chart_svg(w, h, title, ax, paste(bars, collapse = ""))
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
  w <- 520
  h <- 260
  pad <- list(l = 58, r = 16, t = 14, b = 48)
  xr <- .finite_range(c(th, as.numeric(item$theta)), fallback = c(-3, 3), pad = 0)
  yr <- c(0, 1)
  ax <- .chart_axes(w, h, pad, xr, yr, "theta", "P(theta)", yticks = seq(0, 1, by = 0.2))
  model_th <- as.numeric(item$theta)
  model_p <- as.numeric(item$irf)
  ok <- is.finite(model_th) & is.finite(model_p)
  model_pts <- paste(sprintf("%.1f,%.1f", ax$sx(model_th[ok]), ax$sy(pmax(0, pmin(1, model_p[ok])))), collapse = " ")
  bands <- paste(sprintf(
    "<line x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='#94a3b8' stroke-width='2'/>",
    ax$sx(th), ax$sy(pmax(0, pmin(1, lo))), ax$sx(th), ax$sy(pmax(0, pmin(1, hi)))
  ), collapse = "")
  dots <- paste(sprintf("<circle cx='%.1f' cy='%.1f' r='3' fill='#b45309'/>", ax$sx(th), ax$sy(pmax(0, pmin(1, p)))), collapse = "")
  .chart_svg(w, h, "Empirical IRF with 2 SE", ax, paste0(
    "<polyline fill='none' stroke='", .CHART$line, "' stroke-width='1.7' points='", model_pts, "'/>",
    bands, dots
  ))
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
  w <- 540
  h <- 300
  pad <- list(l = 58, r = 16, t = 14, b = 78)
  yr <- c(0, max_c * 1.08)
  ax <- .chart_axes(w, h, pad, xr, yr, "theta / b", "Persons", y_digits = 0)
  bars <- character(0)
  for (i in seq_along(counts)) {
    if (counts[[i]] <= 0) next
    x0 <- ax$sx(breaks[[i]])
    x1 <- ax$sx(breaks[[i + 1L]])
    y0 <- ax$sy(0)
    y1 <- ax$sy(counts[[i]])
    bars <- c(bars, sprintf(
      "<rect x='%.1f' y='%.1f' width='%.1f' height='%.1f' fill='%s' fill-opacity='0.72'/>",
      x0 + 0.5, min(y0, y1), max(0.5, abs(x1 - x0) - 1), abs(y0 - y1), .CHART$line
    ))
  }
  ticks <- character(0)
  ids <- names(item_b)
  if (is.null(ids)) ids <- as.character(seq_along(item_b))
  y_base <- pad$t + ax$inner_h
  for (i in seq_along(item_b)) {
    x <- ax$sx(item_b[[i]])
    ticks <- c(ticks, sprintf(
      "<line x1='%.1f' y1='%.1f' x2='%.1f' y2='%.1f' stroke='#b45309' stroke-width='1.2'/>",
      x, y_base, x, y_base + 8
    ), sprintf(
      "<text x='%.1f' y='%.1f' text-anchor='start' font-size='9' fill='%s' font-family='%s' transform='rotate(-40 %.1f %.1f)'>%s</text>",
      x + 3, y_base + 44, .CHART$ink, .CHART$font, x + 3, y_base + 44, .html_escape(ids[[i]])
    ))
  }
  .chart_svg(w, h, "Wright map (persons above, items below)", ax, paste(bars, collapse = ""), paste(ticks, collapse = ""))
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
        .polyline_svg(as.numeric(it$theta), as.numeric(it$irf), paste("IRF", id), "theta", "P(theta)", ylim = c(0, 1)),
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
    flagged <- is.list(p$flags) && length(p$flags)
    flag_txt <- if (flagged) {
      paste(vapply(p$flags, function(f) f$code, character(1)), collapse = ", ")
    } else {
      ""
    }
    rows <- c(rows, sprintf(
      "<tr%s><td>%s</td>%s%s%s%s<td class='%s'>%s</td></tr>",
      if (flagged) " class='flagged'" else "",
      .html_escape(id),
      .tdn(p$pValue),
      .tdn(p$pointBiserial),
      .tdn(p$n, 0),
      .tdn(p$alphaWithout),
      if (flagged) "flag" else "muted",
      if (flagged) .html_escape(flag_txt) else "&mdash;"
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
        role <- if (!is.null(d$role)) d$role else if (isTRUE(d$keyed)) "key" else "distractor"
        drows <- c(drows, sprintf(
          "<tr class='role-%s'><td>%s</td><td class='role'>%s</td>%s%s%s%s%s</tr>",
          if (identical(role, "key") || isTRUE(d$keyed)) "key" else "option",
          .html_escape(oid),
          .html_escape(role),
          .tdn(d$n, 0),
          .tdn(d$proportion),
          .tdn(d$pointBiserial),
          .tdn(d$mean),
          .tdn(d$sd)
        ))
      }
      dist_html <- paste0(
        .table_wrap(
          "<thead><tr><th>Option</th><th>Role</th><th class='n'>n</th><th class='n'>Proportion</th><th class='n'>rpb</th><th class='n'>Mean</th><th class='n'>SD</th></tr></thead><tbody>",
          paste(drows, collapse = ""),
          "</tbody>",
          caption = paste("Option analysis --", id)
        ),
        .try_ggplot_quantile(id, p$distractors)
      )
    } else {
      dist_html <- "<p class='note'>No option-level distractors (dichotomous 0/1 matrix).</p>"
    }
    item_pages <- c(item_pages, paste0(
      "<article class='item-page'>",
      "<h3>", .html_escape(id), "</h3>",
      "<p class='item-stats'>p = ", .fmt(p$pValue), " &middot; rpb = ", .fmt(p$pointBiserial),
      " &middot; biserial = ", .fmt(p$biserial), " &middot; n = ", .fmt(p$n, 0),
      " &middot; alpha-without = ", .fmt(p$alphaWithout),
      if (is.list(p$domainPointBiserial) && length(p$domainPointBiserial)) {
        paste0(
          " &middot; domain rpb: ",
          paste(vapply(names(p$domainPointBiserial), function(did) {
            sprintf("%s=%s", did, .fmt(p$domainPointBiserial[[did]]$pointBiserial))
          }, character(1)), collapse = "; ")
        )
      } else {
        ""
      },
      "</p>",
      .flag_list_html(p$flags),
      dist_html,
      "</article>"
    ))
  }
  freq_rows <- character(0)
  if (is.list(test_level$scoreFrequency)) {
    for (row in test_level$scoreFrequency) {
      freq_rows <- c(freq_rows, sprintf("<tr>%s%s</tr>", .tdn(row$score, 0), .tdn(row$n, 0)))
    }
  }
  domain_html <- ""
  if (is.list(test_level$domains) && length(test_level$domains)) {
    drows <- character(0)
    for (did in names(test_level$domains)) {
      d <- test_level$domains[[did]]
      drows <- c(drows, sprintf(
        "<tr><td>%s</td>%s%s%s%s</tr>",
        .html_escape(did), .tdn(d$nItems, 0), .tdn(d$mean), .tdn(d$sd), .tdn(d$alpha)
      ))
    }
    domain_html <- paste0(
      "<h2>Domain / subscore analysis</h2>",
      .table_wrap(
        "<thead><tr><th>Domain</th><th class='n'>Items</th><th class='n'>Mean</th><th class='n'>SD</th><th class='n'>Alpha</th></tr></thead><tbody>",
        paste(drows, collapse = ""),
        "</tbody>",
        caption = "Domain means and internal consistency"
      )
    )
  }
  cut_html <- ""
  if (is.list(test_level$cutScore) && !is.null(test_level$cutScore$cutScore)) {
    cs <- test_level$cutScore
    cut_html <- paste0(
      "<h2>Mastery / cutscore</h2>",
      "<p class='note'>Cut score ", .fmt(cs$cutScore, 1), ": pass rate ", .fmt(cs$passRate),
      " (nPass = ", .fmt(cs$nPass, 0), " of ", .fmt(cs$n, 0), ").</p>"
    )
  }
  skin_obj <- if (is.null(skin)) .load_report_skin(if (!is.null(template)) template$skinId else "iteman-classic") else skin
  tpl_name <- if (!is.null(template) && !is.null(template$name)) template$name else ""
  title <- if (nzchar(skin_obj$title)) skin_obj$title else "Classical item analysis technical report"
  body <- paste0(
    if (.chapter_on(template, "cover")) .cover_html(
      title,
      "Statistics are TAM / classical formulas with provenance on this page. This is not an Iteman file; it reports the same statistic classes (reliability, score distribution, option analysis, quantile plots, flags).",
      job_id, package_version, sample_size, calibrated_at, tpl_name
    ) else "",
    if (.chapter_on(template, "test-summary")) paste0(
      "<h2>Test-level summary</h2>",
      .table_wrap(
        "<tbody>",
        "<tr><th>N persons</th>", .tdn(test_level$nPersons, 0), "</tr>",
        "<tr><th>k items</th>", .tdn(test_level$nItems, 0), "</tr>",
        "<tr><th>Mean</th>", .tdn(test_level$mean), "</tr>",
        "<tr><th>SD</th>", .tdn(test_level$sd), "</tr>",
        "<tr><th>Skew</th>", .tdn(test_level$skew), "</tr>",
        "<tr><th>Kurtosis (excess)</th>", .tdn(test_level$kurtosis), "</tr>",
        "</tbody>",
        caption = "Form length, central tendency, and shape",
        class = "kv"
      )
    ) else "",
    if (.chapter_on(template, "reliability")) paste0(
      "<h2>Reliability</h2>",
      .table_wrap(
        "<tbody>",
        "<tr><th>KR-20</th>", .tdn(rel$kr20), "</tr>",
        "<tr><th>KR-21</th>", .tdn(rel$kr21), "</tr>",
        "<tr><th>Cronbach alpha</th>", .tdn(rel$cronbachAlpha), "</tr>",
        "<tr><th>Guttman lambda-2</th>", .tdn(rel$guttmanLambda2), "</tr>",
        "<tr><th>Spearman-Brown split-half</th>", .tdn(rel$spearmanBrownSplitHalf), "</tr>",
        "<tr><th>SEM</th>", .tdn(rel$sem), "</tr>",
        "</tbody>",
        caption = "Internal consistency and standard error of measurement",
        class = "kv"
      )
    ) else "",
    if (.chapter_on(template, "distribution")) paste0(
      "<h2>Score distribution</h2>",
      .table_wrap(
        "<thead><tr><th class='n'>Score</th><th class='n'>n</th></tr></thead><tbody>",
        paste(freq_rows, collapse = ""),
        "</tbody>",
        caption = "Frequency of raw scores",
        class = "compact"
      )
    ) else "",
    if (.chapter_on(template, "csem")) .csem_table_html(test_level$csemByScore) else "",
    domain_html,
    cut_html,
    if (.chapter_on(template, "flags") || .chapter_on(template, "item-pages")) paste0(
      "<h2>Item summary</h2>",
      .table_wrap(
        "<thead><tr><th>Item</th><th class='n'>p</th><th class='n'>rpb</th><th class='n'>n</th><th class='n'>alpha w/o</th><th>Flags</th></tr></thead><tbody>",
        paste(rows, collapse = ""),
        "</tbody>",
        caption = "Classical item statistics and review flags"
      )
    ) else "",
    if (.chapter_on(template, "item-pages")) paste0("<h2>Item pages</h2>", paste(item_pages, collapse = "\n")) else "",
    if (.chapter_on(template, "irt-plots")) .irt_chapter_html(irt_plots) else ""
  )
  .html_document(paste("Item analysis", job_id), .html_css(skin_obj), body, credits)
}

.model_criticism_html <- function(fit_statistics) {
  if (!is.list(fit_statistics)) return("")
  pf <- fit_statistics$personFit
  ld <- fit_statistics$localDependence
  bits <- character(0)
  if (is.list(pf) && !isTRUE(pf$available == FALSE)) {
    bits <- c(bits, sprintf(
      "<tr><th>Person fit (Zh &lt; %s)</th><td>%s of %s (%s)</td></tr>",
      .html_escape(.fmt(pf$cutoff, 1)),
      .html_escape(.fmt(pf$nMisfit, 0)),
      .html_escape(.fmt(pf$nFinite, 0)),
      .html_escape(.fmt(pf$proportionMisfit, 3))
    ))
  }
  if (is.list(ld) && !isTRUE(ld$available == FALSE)) {
    bits <- c(bits, sprintf(
      "<tr><th>Q3 threshold</th><td>%s</td></tr><tr><th>max |Q3|</th><td>%s</td></tr><tr><th>Flagged pairs</th><td>%s</td></tr>",
      .html_escape(.fmt(ld$threshold, 2)),
      .html_escape(.fmt(ld$maxAbsQ3, 3)),
      .html_escape(.fmt(ld$nFlaggedPairs, 0))
    ))
  }
  if (!length(bits)) return("")
  paste0(
    "<h2>Model criticism</h2>",
    "<p>Counts only. Per-person Zh flags and the Q3 matrix stay on the calibration job.</p>",
    "<table class='kv'><tbody>",
    paste(bits, collapse = ""),
    "</tbody></table>"
  )
}

build_irt_html <- function(job_id, package_version, sample_size, calibrated_at,
                           parameters, standard_errors, fit_statistics, plots,
                           template = NULL, credits = NULL, skin = NULL) {
  rows <- character(0)
  for (id in names(parameters)) {
    p <- parameters[[id]]
    se <- if (!is.null(standard_errors[[id]])) standard_errors[[id]] else list()
    b_val <- if (length(unlist(p$b)) == 1) p$b else unlist(p$b)[[1]]
    rows <- c(rows, sprintf(
      "<tr><td>%s</td>%s%s%s%s%s%s%s</tr>",
      .html_escape(id),
      .tdn(p$a), .tdn(se$a),
      .tdn(b_val),
      .tdn(se$b),
      .tdn(p$c), .tdn(se$c),
      .tdn(p$thetaPointBiserial)
    ))
  }
  fit_html <- ""
  if (is.list(fit_statistics$itemFit) && length(fit_statistics$itemFit)) {
    fit_rows <- character(0)
    for (id in names(fit_statistics$itemFit)) {
      f <- fit_statistics$itemFit[[id]]
      fit_rows <- c(fit_rows, sprintf(
        "<tr><td>%s</td>%s%s%s</tr>",
        .html_escape(id),
        .tdn(f$S_X2),
        .tdn(f[["p.S_X2"]], 4),
        .tdn(f$outfit)
      ))
    }
    fit_html <- paste0(
      "<h2>Item fit</h2>",
      .table_wrap(
        "<thead><tr><th>Item</th><th class='n'>S-X2</th><th class='n'>p</th><th class='n'>outfit</th></tr></thead><tbody>",
        paste(fit_rows, collapse = ""),
        "</tbody>",
        caption = "Item-level S-X2 and outfit"
      )
    )
  }
  skin_obj <- if (is.null(skin)) .load_report_skin(if (!is.null(template)) template$skinId else "xcalibre-classic") else skin
  tpl_name <- if (!is.null(template) && !is.null(template$name)) template$name else ""
  title <- if (nzchar(skin_obj$title)) skin_obj$title else "IRT calibration technical report"
  body <- paste0(
    if (.chapter_on(template, "cover")) .cover_html(
      title,
      "Unidimensional mirt calibration. Standard errors, item fit, and person scores are reported when the fit produced them. Not an Xcalibre file; the statistic classes match (a/b/c or thresholds, SEs, IRF/IIF, TIF/CSEM).",
      job_id, package_version, sample_size, calibrated_at, tpl_name
    ) else "",
    if (.chapter_on(template, "item-pages") || .chapter_on(template, "test-summary")) paste0(
      "<h2>Item parameters</h2>",
      .table_wrap(
        "<thead><tr><th>Item</th><th class='n'>a</th><th class='n'>SE(a)</th><th class='n'>b</th><th class='n'>SE(b)</th><th class='n'>c</th><th class='n'>SE(c)</th><th class='n'>T-Rpbis</th></tr></thead><tbody>",
        paste(rows, collapse = ""),
        "</tbody>",
        caption = "Estimated item parameters and standard errors"
      )
    ) else "",
    fit_html,
    .model_criticism_html(fit_statistics),
    if (.chapter_on(template, "irt-plots")) .irt_chapter_html(plots) else ""
  )
  .html_document(paste("IRT calibration", job_id), .html_css(skin_obj), body, credits)
}

build_testinfo_html <- function(job_id, package_version, sample_size, calibrated_at, parameters,
                                template = NULL, credits = NULL, skin = NULL) {
  th <- as.numeric(parameters$theta)
  info <- as.numeric(parameters$information)
  sem <- suppressWarnings(as.numeric(parameters$conditionalSEM))
  skin_obj <- if (is.null(skin)) .load_report_skin(if (!is.null(template)) template$skinId else "xcalibre-classic") else skin
  tpl_name <- if (!is.null(template) && !is.null(template$name)) template$name else ""
  body <- paste0(
    if (.chapter_on(template, "cover")) .cover_html(
      "Test information technical report",
      "Test information function and conditional SEM across theta. Generated by the ECD R bureau.",
      job_id, package_version, sample_size, calibrated_at, tpl_name
    ) else "",
    if (.chapter_on(template, "irt-plots")) paste0(
      .polyline_svg(th, info, "Test information", "theta", "I(theta)"),
      .polyline_svg(th, sem, "Conditional SEM", "theta", "CSEM")
    ) else ""
  )
  .html_document(paste("Test information", job_id), .html_css(skin_obj), body, credits)
}
