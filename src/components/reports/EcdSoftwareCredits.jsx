import React from "react";

const PLATFORM =
  "This report was produced by the ECD Assessment Platform. It is not Iteman or Xcalibre software.";

const R_CORE =
  "R Core Team. R: A language and environment for statistical computing. R Foundation for Statistical Computing, Vienna, Austria. https://www.R-project.org/.";

const STATS_QUANTILE = `Percentile ranks and P10–P90 use the midrank formula and R type-7 sample quantiles (Hyndman, R. J. and Fan, Y. (1996). Sample Quantiles in Statistical Packages. American Statistician 50, 361–365), matching stats::quantile(..., type = 7) in the R stats package.

${R_CORE}

R package stats (base R).`;

const SESSION_ENGINE = `Session scoring and this document run in the ECD delivery engine, not in TAM or mirt. Classical item analysis and IRT technical reports from the Psychometrics bureau credit R and the packages that produced them.

${R_CORE}`;

export default function EcdSoftwareCredits({ variant = "cumulative" }) {
  const body = variant === "session" ? SESSION_ENGINE : STATS_QUANTILE;
  return (
    <section className="ecd-credits" data-testid="ecd-software-credits">
      <h3>Software and packages</h3>
      <p className="ecd-note">{PLATFORM}</p>
      <pre className="ecd-credits-body">{body}</pre>
    </section>
  );
}
