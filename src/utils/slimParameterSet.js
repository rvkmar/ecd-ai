import { scoringBundleEntryIsSlim, scoringBundlesForParameterSet } from "./scoringBundles.js";

// Parameter sets on an evidence model keep item parameters, standard
// errors, and scalar fit indices. HTML reports, person-score arrays,
// and the other sidecar blobs stay on the calibration job or an
// analysis artefact. Every writer that stores a parameter set calls
// slimParameterSet so student ids never land in authored content.

const SIDECAR_KEYS = [
  "reportHtml",
  "scores",
  "scoresCsv",
  "tifCsv",
  "iifCsv",
  "tifGrid",
  "iifGrid",
];

// TU4. Person-fit rows and the Q3 matrix are sidecars. The summaries
// (personFit, localDependence, cdmFit, qValidation) are not in this list.
// TU5. fitGate (the activation decision, failed checks, and any override
// reason) is a record on the parameter set, not a sidecar. It stays.
const CRITICISM_SIDECAR_KEYS = ["personFitRows", "q3Matrix"];

const TOP_LEVEL_KEYS = [
  ...SIDECAR_KEYS,
  ...CRITICISM_SIDECAR_KEYS,
  "personScores",
  "responseMatrix",
  "optionMatrix",
];

const DIAGNOSTIC_KEYS = new Set([
  ...SIDECAR_KEYS,
  ...CRITICISM_SIDECAR_KEYS,
  "personScores",
  "responseMatrix",
  "optionMatrix",
  "plots",
]);

const NESTED_SUMMARY_DROPS = {
  personFit: ["rows", "persons", "personIds"],
  localDependence: ["matrix", "values", "q3Matrix"],
};

function present(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function isPersonLevel(value) {
  if (Array.isArray(value)) {
    return value.some((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      return Object.prototype.hasOwnProperty.call(row, "personId")
        || Object.prototype.hasOwnProperty.call(row, "studentId");
    });
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value.personIds) && value.personIds.length > 0) return true;
  if (Array.isArray(value.studentIds) && value.studentIds.length > 0) return true;
  return false;
}

function takeKeys(source, keys, { personLevel = false } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { kept: source, stripped: null };
  }
  const kept = { ...source };
  const stripped = {};
  const force = keys instanceof Set ? keys : new Set(keys);
  for (const key of Object.keys(kept)) {
    const value = kept[key];
    if (!present(value)) continue;
    if (force.has(key) || (personLevel && isPersonLevel(value))) {
      stripped[key] = value;
      delete kept[key];
    }
  }
  return {
    kept: Object.keys(kept).length ? kept : undefined,
    stripped: Object.keys(stripped).length ? stripped : null,
  };
}

function peelSummarySidecars(fit) {
  if (!fit || typeof fit !== "object" || Array.isArray(fit)) {
    return { kept: fit, stripped: null };
  }
  const kept = { ...fit };
  const stripped = {};
  for (const [childKey, dropKeys] of Object.entries(NESTED_SUMMARY_DROPS)) {
    const child = kept[childKey];
    if (!child || typeof child !== "object" || Array.isArray(child)) continue;
    const nextChild = { ...child };
    const dropped = {};
    for (const key of dropKeys) {
      if (!present(nextChild[key])) continue;
      dropped[key] = nextChild[key];
      delete nextChild[key];
    }
    if (childKey === "personFit" && Array.isArray(nextChild.Zh)) {
      dropped.Zh = nextChild.Zh;
      delete nextChild.Zh;
    }
    if (!Object.keys(dropped).length) continue;
    kept[childKey] = nextChild;
    stripped[childKey] = dropped;
  }
  return {
    kept,
    stripped: Object.keys(stripped).length ? stripped : null,
  };
}

function knownId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Copy a parameter set without report HTML, person scores, or other
 * sidecar payloads. Item parameters, standard errors, and scalar fit
 * indices stay. `refs` fills calibrationJobId or analysisArtefactId
 * when the caller knows one and the set does not already cite it.
 *
 * @returns {{ parameterSet: object, stripped: object|null, changed: boolean }}
 */
export function slimParameterSet(parameterSet, refs = {}) {
  if (!parameterSet || typeof parameterSet !== "object" || Array.isArray(parameterSet)) {
    return { parameterSet, stripped: null, changed: false };
  }

  const next = { ...parameterSet };
  const stripped = {};

  for (const key of TOP_LEVEL_KEYS) {
    if (!present(next[key])) continue;
    stripped[key] = next[key];
    delete next[key];
  }

  if (present(next.fitStatistics) && typeof next.fitStatistics === "object" && !Array.isArray(next.fitStatistics)) {
    const fit = takeKeys(next.fitStatistics, DIAGNOSTIC_KEYS, { personLevel: true });
    const peeled = peelSummarySidecars(fit.stripped ? (fit.kept || {}) : next.fitStatistics);
    if (fit.stripped || peeled.stripped) {
      stripped.fitStatistics = { ...(fit.stripped || {}), ...(peeled.stripped || {}) };
      if (peeled.kept && Object.keys(peeled.kept).length) next.fitStatistics = peeled.kept;
      else delete next.fitStatistics;
    }
  }

  if (present(next.diagnostics) && typeof next.diagnostics === "object" && !Array.isArray(next.diagnostics)) {
    const diag = takeKeys(next.diagnostics, DIAGNOSTIC_KEYS, { personLevel: true });
    if (diag.stripped) {
      stripped.diagnostics = diag.stripped;
      if (diag.kept) next.diagnostics = diag.kept;
      else delete next.diagnostics;
    }
  }

  // TU6. A bundle summary is a few ids. A matrix or response column on
  // the same object is a sidecar and does not stay on the parameter set.
  if (Array.isArray(next.scoringBundles)) {
    const heavy = next.scoringBundles.some((row) => !scoringBundleEntryIsSlim(row));
    if (heavy) {
      stripped.scoringBundles = next.scoringBundles;
      const kept = scoringBundlesForParameterSet(next.scoringBundles);
      if (kept) next.scoringBundles = kept;
      else delete next.scoringBundles;
    }
  }

  const jobId = knownId(refs.calibrationJobId);
  const artefactId = knownId(refs.analysisArtefactId);
  let refAdded = false;
  if (jobId && !knownId(next.calibrationJobId)) {
    next.calibrationJobId = jobId;
    refAdded = true;
  }
  if (artefactId && !knownId(next.analysisArtefactId)) {
    next.analysisArtefactId = artefactId;
    refAdded = true;
  }

  const hasStripped = Object.keys(stripped).length > 0;
  if (!hasStripped && !refAdded) {
    return { parameterSet, stripped: null, changed: false };
  }
  return {
    parameterSet: next,
    stripped: hasStripped ? stripped : null,
    changed: true,
  };
}

export function slimStatisticalModels(statisticalModels) {
  if (!Array.isArray(statisticalModels)) return statisticalModels;
  let any = false;
  const next = statisticalModels.map((sm) => {
    if (!sm || !Array.isArray(sm.parameterSets)) return sm;
    let setChanged = false;
    const parameterSets = sm.parameterSets.map((ps) => {
      const result = slimParameterSet(ps);
      if (!result.changed) return ps;
      setChanged = true;
      return result.parameterSet;
    });
    if (!setChanged) return sm;
    any = true;
    return { ...sm, parameterSets };
  });
  return any ? next : statisticalModels;
}
