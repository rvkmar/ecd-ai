// Live-R checks for TU4. Missing criticism fields are not a failure of
// the older acceptance predicates. These checks run only on a response
// this unit's R code produced.

function problem(problems, message) {
  problems.push(message);
}

export function irtCriticismProblems(body, { sampleSize, nItems, stored = false } = {}) {
  const problems = [];
  const fit = body?.fitStatistics;
  const pf = fit?.personFit;
  if (!pf || pf.available === false) {
    problem(problems, "fitStatistics.personFit summary missing");
  } else {
    if (pf.statistic !== "Zh") problem(problems, "personFit.statistic must be Zh");
    if (pf.cutoff !== -2) problem(problems, "personFit.cutoff must be -2");
    if (pf.rule !== "Zh < cutoff") problem(problems, "personFit.rule must be Zh < cutoff");
    if (pf.nPersons !== sampleSize) problem(problems, `personFit.nPersons must be ${sampleSize}`);
    if (!(pf.nMisfit >= 0 && pf.nMisfit <= pf.nPersons)) {
      problem(problems, "personFit.nMisfit out of range");
    }
    if (!(pf.proportionMisfit >= 0 && pf.proportionMisfit <= 1)) {
      problem(problems, "personFit.proportionMisfit must be in [0,1]");
    }
    if (pf.rows || pf.persons || Array.isArray(pf.Zh)) {
      problem(problems, "personFit summary carries per-person rows");
    }
  }

  const ld = fit?.localDependence;
  if (!ld || ld.available === false) {
    problem(problems, "fitStatistics.localDependence summary missing");
  } else {
    if (ld.statistic !== "Q3") problem(problems, "localDependence.statistic must be Q3");
    if (ld.threshold !== 0.2) problem(problems, "localDependence.threshold must be 0.2");
    if (typeof ld.maxAbsQ3 !== "number") problem(problems, "maxAbsQ3 must be a number");
    if (ld.matrix || ld.values || ld.q3Matrix) {
      problem(problems, "localDependence carries the Q3 matrix");
    }
    if (!Array.isArray(ld.flaggedPairs) || ld.nFlaggedPairs !== ld.flaggedPairs.length) {
      problem(problems, "flaggedPairs must match nFlaggedPairs");
    } else if (ld.flaggedPairs.some((pair) => !(Math.abs(pair.q3) > ld.threshold))) {
      problem(problems, "a flagged pair is not above the Q3 threshold");
    }
  }

  if (stored) {
    if (body.personFitRows) problem(problems, "parameter set must not store personFitRows");
    if (body.q3Matrix) problem(problems, "parameter set must not store q3Matrix");
    if (fit?.personFitRows || fit?.q3Matrix) {
      problem(problems, "parameter set fitStatistics must not store sidecars");
    }
  } else {
    if (!Array.isArray(body.personFitRows) || body.personFitRows.length !== sampleSize) {
      problem(problems, "personFitRows must list every person");
    }
    const matrix = body.q3Matrix;
    if (!matrix || matrix.itemIds?.length !== nItems || matrix.values?.length !== nItems) {
      problem(problems, "q3Matrix must be item by item");
    } else if (matrix.values.some((row) => !Array.isArray(row) || row.length !== nItems)) {
      problem(problems, "q3Matrix rows must be square");
    }
  }
  return problems;
}

export function cdmCriticismProblems(body, { nItems, stored = false } = {}) {
  const problems = [];
  const fit = body?.fitStatistics;
  if (typeof fit?.AIC !== "number") problem(problems, "AIC must stay on the CDM fit");
  const cdm = fit?.cdmFit;
  if (!cdm || cdm.available === false) {
    problem(problems, `cdmFit missing${cdm?.note ? `: ${cdm.note}` : ""}`);
  } else {
    for (const key of ["M2", "RMSEA2", "SRMSR"]) {
      if (!(typeof cdm[key] === "number" && cdm[key] >= 0)) {
        problem(problems, `cdmFit.${key} must be a number >= 0`);
      }
    }
  }
  const qv = fit?.qValidation;
  if (!qv || qv.available === false) {
    problem(problems, `qValidation missing${qv?.note ? `: ${qv.note}` : ""}`);
  } else {
    if (qv.nItems !== nItems) problem(problems, `qValidation.nItems must be ${nItems}`);
    if (!Array.isArray(qv.suggestions) || qv.nChanged !== qv.suggestions.length) {
      problem(problems, "qValidation.nChanged must match suggestions");
    } else {
      for (const row of qv.suggestions) {
        if (typeof row.itemId !== "string") problem(problems, "suggestion needs itemId");
        if (!Array.isArray(row.original) || !Array.isArray(row.suggested)) {
          problem(problems, "suggestion needs original and suggested q-vectors");
        }
        if (row.pvaf != null && typeof row.pvaf !== "number") {
          problem(problems, "suggestion pvaf must be a number or null");
        }
      }
    }
  }
  if (stored && (body.personFitRows || body.q3Matrix)) {
    problem(problems, "CDM parameter set must not store IRT sidecars");
  }
  return problems;
}
