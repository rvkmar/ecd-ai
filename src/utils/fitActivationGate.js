// TU5 activation gate (textbook gap T3, gate half).
//
// Activating a parameter set checks the fit summaries TU4 stored on
// fitStatistics. Thresholds come from the Evidence Model calibrationPlan
// when they are finite numbers. Otherwise the defaults below apply.
//
// A check whose statistic is absent is skipped. If every check for the
// family is skipped, activation proceeds and the result is
// "not_evaluated". That is today's behaviour for sets calibrated before
// these summaries existed. A failing check refuses activation unless the
// request carries fitOverride with a non-empty reason.
//
// An already-active set is grandfathered: calling activate on it again
// does not re-check fit and does not turn it off. There is no migration.
//
// Defaults (house cuts, overridable per plan):
//
//   itemFitPValueMin     0.05   S-X2 p below this flags an IRT item
//                               (Orlando and Thissen 2000). The flag is
//                               not itself a failure. See the share.
//   misfitItemShareMax   0.1    IRT: share of flagged items.
//                               CDM: share of items with a Qval suggestion.
//                               Fail when the share is greater than this.
//   rmseaMax             0.05   IRT M2 RMSEA, or CDM RMSEA2. Close fit
//                               in the limited-information sense
//                               (Maydeu-Olivares; Browne and Cudeck).
//   srmsrMax             0.05   IRT M2 SRMSR, or CDM SRMSR.
//   personMisfitShareMax 0.05   IRT only. Share of persons with Zh below
//                               the stored cutoff (default -2; Drasgow,
//                               Levine and Williams 1985). About 2.3% are
//                               expected in the tail, so 0.05 leaves room.
//   maxAbsQ3             0.2    IRT only. Yen's |Q3| flag, the same cut
//                               TU4 uses when it counts flagged pairs.
//   bnMeanAbsResidualMax 0.05  BN only. Mean |observed proportion minus
//                               model marginal| across observables. The
//                               same 0.05 scale as SRMSR: a typical item
//                               is off by at most five points.
//   bnMaxAbsResidualMax  0.10  BN only. No single observable's marginal
//                               is off by more than ten points.
//
// AIC and BIC are stored on a BN fit for comparison across candidate
// sets. They have no absolute pass line, so the gate does not apply them.
// A BN set with no residual summary is not_evaluated.
//
// Optional, off unless the plan sets it:
//
//   m2PValueMin                 CDM only. M2 p-value must be at least this.
//                               Left off by default because the chi-square
//                               p-value rejects good large samples.

export const DEFAULT_FIT_THRESHOLDS = Object.freeze({
  itemFitPValueMin: 0.05,
  rmseaMax: 0.05,
  srmsrMax: 0.05,
  misfitItemShareMax: 0.1,
  personMisfitShareMax: 0.05,
  maxAbsQ3: 0.2,
  bnMeanAbsResidualMax: 0.05,
  bnMaxAbsResidualMax: 0.1,
});

export const FIT_THRESHOLD_KEYS = Object.freeze([
  "itemFitPValueMin",
  "rmseaMax",
  "srmsrMax",
  "misfitItemShareMax",
  "personMisfitShareMax",
  "maxAbsQ3",
  "m2PValueMin",
  "bnMeanAbsResidualMax",
  "bnMaxAbsResidualMax",
]);

const FIT_GATE_STATUSES = new Set(["pass", "override", "not_evaluated"]);
const ITEM_FIT_P_KEYS = ["p.S_X2", "p_S_X2", "p.SX2", "pSX2"];

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatStat(value) {
  if (value == null) return "missing";
  return String(Math.round(value * 10000) / 10000);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveFitThresholds(calibrationPlan) {
  const out = { ...DEFAULT_FIT_THRESHOLDS };
  const authored = calibrationPlan?.fitThresholds;
  if (!isPlainObject(authored)) return out;
  for (const key of FIT_THRESHOLD_KEYS) {
    const value = finite(authored[key]);
    if (value == null) continue;
    out[key] = value;
  }
  return out;
}

export function fitFamily(statisticalModel, parameterSet) {
  const type = String(statisticalModel?.type || "").toLowerCase();
  if (type === "dina" || type === "gdina") return "cdm";
  if (type === "irt") return "irt";
  if (type === "bayesian_network" || type === "bn") return "bn";
  const fit = parameterSet?.fitStatistics;
  if (isPlainObject(fit)) {
    if (fit.bnFit) return "bn";
    if (fit.cdmFit || fit.qValidation) return "cdm";
    if (fit.itemFit || fit.personFit || fit.localDependence || fit.global) return "irt";
  }
  return "other";
}

function unavailable(block) {
  return isPlainObject(block) && block.available === false;
}

function readNumber(block, keys) {
  if (!isPlainObject(block) || unavailable(block)) return null;
  for (const key of keys) {
    const value = finite(block[key]);
    if (value != null) return value;
  }
  return null;
}

function itemFitP(stats) {
  return readNumber(stats, ITEM_FIT_P_KEYS);
}

function maxCheck({ id, label, statistic, threshold, missingMessage, noun }) {
  if (statistic == null) {
    return {
      id,
      label,
      status: "missing",
      statistic: null,
      threshold,
      comparison: "max",
      message: missingMessage,
    };
  }
  const fail = statistic > threshold;
  return {
    id,
    label,
    status: fail ? "fail" : "pass",
    statistic,
    threshold,
    comparison: "max",
    message: fail
      ? `${noun} is ${formatStat(statistic)}, above the maximum ${formatStat(threshold)}.`
      : `${noun} is ${formatStat(statistic)}, within the maximum ${formatStat(threshold)}.`,
  };
}

function minCheck({ id, label, statistic, threshold, missingMessage, noun }) {
  if (statistic == null) {
    return {
      id,
      label,
      status: "missing",
      statistic: null,
      threshold,
      comparison: "min",
      message: missingMessage,
    };
  }
  const fail = statistic < threshold;
  return {
    id,
    label,
    status: fail ? "fail" : "pass",
    statistic,
    threshold,
    comparison: "min",
    message: fail
      ? `${noun} is ${formatStat(statistic)}, below the minimum ${formatStat(threshold)}.`
      : `${noun} is ${formatStat(statistic)}, at or above the minimum ${formatStat(threshold)}.`,
  };
}

function irtItemFitCheck(fit, thresholds) {
  const itemFit = fit?.itemFit;
  const rows = isPlainObject(itemFit) ? Object.values(itemFit) : [];
  const pValues = rows.map(itemFitP).filter((value) => value != null);
  if (!pValues.length) {
    return {
      id: "irt.itemFit",
      label: "Item fit (S-X2)",
      status: "missing",
      statistic: null,
      threshold: thresholds.misfitItemShareMax,
      comparison: "max",
      message:
        "S-X2 item fit is not on this parameter set, so the misfitting-item share was not applied.",
    };
  }
  const nFlagged = pValues.filter((p) => p < thresholds.itemFitPValueMin).length;
  const share = nFlagged / pValues.length;
  const fail = share > thresholds.misfitItemShareMax;
  const detail = `${nFlagged} of ${pValues.length} items have an S-X2 p-value below ${formatStat(thresholds.itemFitPValueMin)} (share ${formatStat(share)}, maximum ${formatStat(thresholds.misfitItemShareMax)}).`;
  return {
    id: "irt.itemFit",
    label: "Item fit (S-X2)",
    status: fail ? "fail" : "pass",
    statistic: share,
    threshold: thresholds.misfitItemShareMax,
    comparison: "max",
    itemFitPValueMin: thresholds.itemFitPValueMin,
    nFlagged,
    nItems: pValues.length,
    message: detail,
  };
}

function irtPersonCheck(fit, thresholds) {
  const person = fit?.personFit;
  if (!isPlainObject(person) || unavailable(person)) {
    return maxCheck({
      id: "irt.personFit",
      label: "Person fit (Zh)",
      statistic: null,
      threshold: thresholds.personMisfitShareMax,
      noun: "Person-fit misfit share",
      missingMessage:
        "Person-fit misfit share is not on this parameter set, so this check was not applied.",
    });
  }
  const denom = finite(person.nFinite) ?? finite(person.nPersons);
  const share =
    finite(person.proportionMisfit) ??
    (finite(person.nMisfit) != null && denom > 0 ? person.nMisfit / denom : null);
  const cutoff = finite(person.cutoff);
  const base = maxCheck({
    id: "irt.personFit",
    label: "Person fit (Zh)",
    statistic: share,
    threshold: thresholds.personMisfitShareMax,
    noun: "Person-fit misfit share",
    missingMessage:
      "Person-fit misfit share is not on this parameter set, so this check was not applied.",
  });
  if (base.status !== "missing" && cutoff != null) {
    base.message = `${base.message.slice(0, -1)} (Zh below ${formatStat(cutoff)}).`;
  }
  return base;
}

function irtLocalCheck(fit, thresholds) {
  const local = fit?.localDependence;
  if (!isPlainObject(local) || unavailable(local)) {
    return maxCheck({
      id: "irt.localDependence",
      label: "Local dependence (Q3)",
      statistic: null,
      threshold: thresholds.maxAbsQ3,
      noun: "Largest absolute Q3",
      missingMessage:
        "Largest absolute Q3 is not on this parameter set, so this check was not applied.",
    });
  }
  const maxAbs = finite(local.maxAbsQ3);
  if (maxAbs == null && finite(local.nFlaggedPairs) === 0) {
    return {
      id: "irt.localDependence",
      label: "Local dependence (Q3)",
      status: "pass",
      statistic: 0,
      threshold: thresholds.maxAbsQ3,
      comparison: "max",
      message: `No Q3 pair is above the maximum ${formatStat(thresholds.maxAbsQ3)}.`,
    };
  }
  return maxCheck({
    id: "irt.localDependence",
    label: "Local dependence (Q3)",
    statistic: maxAbs,
    threshold: thresholds.maxAbsQ3,
    noun: "Largest absolute Q3",
    missingMessage:
      "Largest absolute Q3 is not on this parameter set, so this check was not applied.",
  });
}

function irtChecks(fit, thresholds) {
  const global = isPlainObject(fit?.global) && !unavailable(fit.global) ? fit.global : null;
  return [
    irtItemFitCheck(fit, thresholds),
    maxCheck({
      id: "irt.rmsea",
      label: "M2 RMSEA",
      statistic: readNumber(global, ["RMSEA", "RMSEA2"]),
      threshold: thresholds.rmseaMax,
      noun: "M2 RMSEA",
      missingMessage: "M2 RMSEA is not on this parameter set, so this check was not applied.",
    }),
    maxCheck({
      id: "irt.srmsr",
      label: "M2 SRMSR",
      statistic: readNumber(global, ["SRMSR", "SRMR"]),
      threshold: thresholds.srmsrMax,
      noun: "M2 SRMSR",
      missingMessage: "M2 SRMSR is not on this parameter set, so this check was not applied.",
    }),
    irtPersonCheck(fit, thresholds),
    irtLocalCheck(fit, thresholds),
  ];
}

function cdmQCheck(fit, thresholds) {
  const qv = fit?.qValidation;
  if (!isPlainObject(qv) || unavailable(qv)) {
    return {
      id: "cdm.qMatrix",
      label: "Q-matrix validation",
      status: "missing",
      statistic: null,
      threshold: thresholds.misfitItemShareMax,
      comparison: "max",
      message:
        "Q-matrix validation is not on this parameter set, so the misfitting-item share was not applied.",
    };
  }
  const nChanged = finite(qv.nChanged) ?? (Array.isArray(qv.suggestions) ? qv.suggestions.length : null);
  let nItems = finite(qv.nItems);
  if (nChanged === 0) {
    return {
      id: "cdm.qMatrix",
      label: "Q-matrix validation",
      status: "pass",
      statistic: 0,
      threshold: thresholds.misfitItemShareMax,
      comparison: "max",
      nChanged: 0,
      nItems,
      message: `Q-matrix validation suggests no item changes (share 0, maximum ${formatStat(thresholds.misfitItemShareMax)}).`,
    };
  }
  if (nChanged == null) {
    return {
      id: "cdm.qMatrix",
      label: "Q-matrix validation",
      status: "missing",
      statistic: null,
      threshold: thresholds.misfitItemShareMax,
      comparison: "max",
      message:
        "Q-matrix validation is not on this parameter set, so the misfitting-item share was not applied.",
    };
  }
  if (nItems == null || nItems <= 0) nItems = nChanged;
  const share = nChanged / nItems;
  const fail = share > thresholds.misfitItemShareMax;
  return {
    id: "cdm.qMatrix",
    label: "Q-matrix validation",
    status: fail ? "fail" : "pass",
    statistic: share,
    threshold: thresholds.misfitItemShareMax,
    comparison: "max",
    nChanged,
    nItems,
    message: `Q-matrix validation suggests changes for ${nChanged} of ${nItems} items (share ${formatStat(share)}, maximum ${formatStat(thresholds.misfitItemShareMax)}).`,
  };
}

function cdmChecks(fit, thresholds) {
  const cdm = isPlainObject(fit?.cdmFit) && !unavailable(fit.cdmFit) ? fit.cdmFit : null;
  const checks = [
    maxCheck({
      id: "cdm.rmsea",
      label: "RMSEA2",
      statistic: readNumber(cdm, ["RMSEA2", "RMSEA"]),
      threshold: thresholds.rmseaMax,
      noun: "RMSEA2",
      missingMessage: "RMSEA2 is not on this parameter set, so this check was not applied.",
    }),
    maxCheck({
      id: "cdm.srmsr",
      label: "SRMSR",
      statistic: readNumber(cdm, ["SRMSR", "SRMR"]),
      threshold: thresholds.srmsrMax,
      noun: "SRMSR",
      missingMessage: "SRMSR is not on this parameter set, so this check was not applied.",
    }),
    cdmQCheck(fit, thresholds),
  ];
  if (finite(thresholds.m2PValueMin) != null) {
    checks.push(
      minCheck({
        id: "cdm.m2p",
        label: "M2 p-value",
        statistic: readNumber(cdm, ["p"]),
        threshold: thresholds.m2PValueMin,
        noun: "M2 p-value",
        missingMessage: "M2 p-value is not on this parameter set, so this check was not applied.",
      })
    );
  }
  return checks;
}

function bnChecks(fit, thresholds) {
  const bn = isPlainObject(fit?.bnFit) && !unavailable(fit.bnFit) ? fit.bnFit : null;
  return [
    maxCheck({
      id: "bn.meanAbsResidual",
      label: "Mean absolute marginal residual",
      statistic: finite(bn?.meanAbsResidual),
      threshold: thresholds.bnMeanAbsResidualMax,
      noun: "Mean absolute marginal residual",
      missingMessage:
        "The mean absolute marginal residual is not on this parameter set, so this check was not applied. AIC and BIC are recorded for comparison and are not activation thresholds.",
    }),
    maxCheck({
      id: "bn.maxAbsResidual",
      label: "Maximum absolute marginal residual",
      statistic: finite(bn?.maxAbsResidual),
      threshold: thresholds.bnMaxAbsResidualMax,
      noun: "Maximum absolute marginal residual",
      missingMessage:
        "The maximum absolute marginal residual is not on this parameter set, so this check was not applied.",
    }),
  ];
}

function checksFor(family, parameterSet, thresholds) {
  if (family === "irt") return irtChecks(parameterSet?.fitStatistics, thresholds);
  if (family === "cdm") return cdmChecks(parameterSet?.fitStatistics, thresholds);
  if (family === "bn") return bnChecks(parameterSet?.fitStatistics, thresholds);
  return [];
}

/**
 * Explicit fitOverride on the request. Null and a missing key are not an
 * attempt. Anything else is an attempt, and the reason must be non-empty
 * text when checks fail.
 */
export function readFitOverride(body) {
  if (!isPlainObject(body) || !Object.prototype.hasOwnProperty.call(body, "fitOverride")) {
    return { explicit: false, reason: "" };
  }
  const raw = body.fitOverride;
  if (raw == null) return { explicit: false, reason: "" };
  if (!isPlainObject(raw)) return { explicit: true, reason: "" };
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  return { explicit: true, reason };
}

function outcomeStatus(checks) {
  const failed = checks.filter((check) => check.status === "fail");
  const evaluated = checks.filter((check) => check.status !== "missing");
  if (!evaluated.length) return { status: "not_evaluated", failed };
  if (failed.length) return { status: "fail", failed };
  return { status: "pass", failed: [] };
}

/**
 * Decide whether a parameter set may become the active set.
 *
 * `alreadyActive` grandfathers the set named by activeParameterSetId.
 * `override` is the result of readFitOverride. `by` and `at` are stamped
 * only when a failing gate is overridden.
 */
export function evaluateFitActivation({
  alreadyActive = false,
  statisticalModel,
  parameterSet,
  calibrationPlan,
  override = { explicit: false, reason: "" },
  by = null,
  at = new Date().toISOString(),
} = {}) {
  const family = fitFamily(statisticalModel, parameterSet);
  if (alreadyActive) {
    return {
      ok: true,
      grandfathered: true,
      overrideRejected: false,
      failedChecks: [],
      fitGate: {
        status: "grandfathered",
        family,
        note: "This parameter set is already active. The fit gate does not re-check it.",
      },
    };
  }

  const thresholds = resolveFitThresholds(calibrationPlan);
  const checks = checksFor(family, parameterSet, thresholds);
  const { status, failed } = outcomeStatus(checks);
  const note =
    family === "other"
      ? "This statistical model family has no activation fit checks."
      : status === "not_evaluated"
        ? family === "bn"
          ? "No BN residual summary was available, so the gate was not applied. AIC and BIC are not activation thresholds."
          : "No fit statistics were available for this family, so the gate was not applied."
        : null;

  const explicit = Boolean(override?.explicit);
  const reason = typeof override?.reason === "string" ? override.reason.trim() : "";

  if (status === "fail" && explicit && !reason) {
    return {
      ok: false,
      grandfathered: false,
      overrideRejected: true,
      failedChecks: failed,
      fitGate: {
        status: "fail",
        family,
        evaluatedAt: at,
        thresholds,
        checks,
        failedChecks: failed,
        override: null,
        note: null,
      },
    };
  }

  if (status === "fail" && !(explicit && reason)) {
    return {
      ok: false,
      grandfathered: false,
      overrideRejected: false,
      failedChecks: failed,
      fitGate: {
        status: "fail",
        family,
        evaluatedAt: at,
        thresholds,
        checks,
        failedChecks: failed,
        override: null,
        note: null,
      },
    };
  }

  const recordedStatus = status === "fail" ? "override" : status;
  return {
    ok: true,
    grandfathered: false,
    overrideRejected: false,
    failedChecks: recordedStatus === "override" ? failed : [],
    fitGate: {
      status: recordedStatus,
      family,
      evaluatedAt: at,
      thresholds,
      checks,
      failedChecks: recordedStatus === "override" ? failed : [],
      override:
        recordedStatus === "override"
          ? {
              reason,
              by: by || null,
              at,
              failedChecks: failed,
            }
          : null,
      note,
    },
  };
}

export function fitGateStorageErrors(fitGate, label = "Parameter set") {
  if (fitGate == null) return [];
  if (!isPlainObject(fitGate)) return [`${label} fitGate should be object`];
  const errors = [];
  if (fitGate.status != null && !FIT_GATE_STATUSES.has(fitGate.status)) {
    errors.push(`${label} fitGate.status is not a known gate result.`);
  }
  if (fitGate.status === "override") {
    const reason = fitGate.override?.reason;
    if (typeof reason !== "string" || !reason.trim()) {
      errors.push(`${label} fitGate override requires a non-empty reason.`);
    }
    if (fitGate.override?.by != null && typeof fitGate.override.by !== "string") {
      errors.push(`${label} fitGate override by should be a string.`);
    }
  }
  return errors;
}
