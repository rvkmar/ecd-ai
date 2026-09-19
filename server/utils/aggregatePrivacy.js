/**
 * D99 — Aggregate tenancy / small-cell privacy.
 *
 * Aggregates name their scope on every response. Counts below MIN_CELL_SIZE
 * are suppressed (null + suppressed flag) so a tiny cohort cannot identify
 * individuals — especially important for data about children.
 *
 * Item bank exposure (`usageCount`) is global (ADR 0006). Non-admin callers
 * must not see bank-wide exposure metrics that reveal other tenants' activity.
 */
import { getTenancyContext } from "./tenancyContext.js";

/** Minimum cell size before a count may be returned. */
export const MIN_CELL_SIZE = 5;

/**
 * @param {import("express").Request} req
 * @param {Record<string, unknown>} [extras]
 */
export function namedAggregateScope(req, extras = {}) {
  const ctx = getTenancyContext();
  const user = req.user || {};
  return {
    role: user.role || ctx?.role || "",
    viewScope: req.viewScope ?? ctx?.viewScope ?? null,
    districtId: user.districtId || ctx?.districtId || null,
    schoolId: user.schoolId || ctx?.schoolId || null,
    unscoped: user.role === "admin" || ctx?.unscoped === true,
    ...extras,
  };
}

/**
 * @param {number} n
 * @param {number} [min]
 * @returns {{ value: number | null, suppressed: boolean }}
 */
export function suppressCount(n, min = MIN_CELL_SIZE) {
  const c = Number(n);
  if (!Number.isFinite(c) || c < 0) {
    return { value: null, suppressed: true };
  }
  if (c > 0 && c < min) {
    return { value: null, suppressed: true };
  }
  return { value: c, suppressed: false };
}

/**
 * IRT class/district summary: suppress whole block when n < min.
 * @param {object | null} irt
 * @param {number} [min]
 */
export function suppressIrtSummary(irt, min = MIN_CELL_SIZE) {
  if (!irt) return null;
  const { suppressed } = suppressCount(irt.count, min);
  if (suppressed) {
    return {
      suppressed: true,
      reason: `n < ${min}`,
      count: null,
      mean: null,
      stddev: null,
      distribution: null,
    };
  }
  const dist = irt.distribution || {};
  return {
    ...irt,
    suppressed: false,
    distribution: {
      below0: suppressCount(dist.below0, min).value,
      between0and1: suppressCount(dist.between0and1, min).value,
      above1: suppressCount(dist.above1, min).value,
    },
  };
}

/**
 * BN node summaries: suppress nodes with count < min.
 * @param {Record<string, object>} bnSummary
 * @param {number} [min]
 */
export function suppressBnSummary(bnSummary, min = MIN_CELL_SIZE) {
  const out = {};
  for (const [node, summary] of Object.entries(bnSummary || {})) {
    const { suppressed } = suppressCount(summary.count, min);
    if (suppressed) {
      out[node] = {
        suppressed: true,
        reason: `n < ${min}`,
        count: null,
        mean: null,
        meanEntropy: null,
        level: null,
      };
    } else {
      out[node] = { ...summary, suppressed: false };
    }
  }
  return out;
}

/**
 * Coverage maps (competencyId → count): drop keys under min.
 * @param {Record<string, number>} map
 * @param {number} [min]
 */
export function suppressCoverageMap(map, min = MIN_CELL_SIZE) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const { value, suppressed } = suppressCount(v, min);
    if (!suppressed) out[k] = value;
  }
  return out;
}

/** True when the caller may see global bank exposure counters. */
export function maySeeGlobalExposure(req) {
  return req.user?.role === "admin";
}

/**
 * Strip usageCount from an item for non-admin (ADR 0006 global bank).
 * @param {object} item
 * @param {boolean} allowExposure
 */
export function redactItemExposure(item, allowExposure) {
  if (!item || allowExposure) return item;
  if (!item.exposureControl) return item;
  const { usageCount, ...rest } = item.exposureControl;
  return {
    ...item,
    exposureControl: {
      ...rest,
      usageCount: null,
      usageCountRedacted: true,
    },
  };
}

/**
 * Redact person-level cohort / response matrices on calibration jobs for
 * non-admin readers. Admin keeps full audit payloads.
 * @param {object} job
 * @param {boolean} isAdmin
 */
export function redactCalibrationJobForViewer(job, isAdmin) {
  if (!job || isAdmin) return job;
  const request = job.request ? { ...job.request } : undefined;
  if (request?.cohort?.members) {
    request.cohort = {
      ...request.cohort,
      members: undefined,
      memberCount: Array.isArray(job.request.cohort.members)
        ? job.request.cohort.members.length
        : null,
      membersRedacted: true,
    };
  }
  if (request?.groups) {
    request.groups = {
      ...request.groups,
      labels: undefined,
      labelsRedacted: true,
    };
  }
  if (request?.responses) {
    request.responses = undefined;
    request.responsesRedacted = true;
  }
  const response = job.response ? { ...job.response } : undefined;
  // Keep high-level metrics; drop raw matrices if present.
  if (response?.responseMatrix) {
    response.responseMatrix = undefined;
    response.responseMatrixRedacted = true;
  }
  return { ...job, request, response };
}

/**
 * Walk artefact payload counts (nMaster, profileDistribution[].count, sampleSize).
 * @param {object} artefact
 * @param {number} [min]
 */
export function suppressArtefactSmallCells(artefact, min = MIN_CELL_SIZE) {
  if (!artefact) return artefact;
  const out = { ...artefact };
  if (out.sampleSize != null) {
    const { value, suppressed } = suppressCount(out.sampleSize, min);
    if (suppressed) {
      out.sampleSize = null;
      out.sampleSizeSuppressed = true;
    } else {
      out.sampleSize = value;
    }
  }
  const payload = out.payload || out.parameters || out.result;
  if (payload && typeof payload === "object") {
    out.payload = suppressPayloadCounts({ ...payload }, min);
    if (out.parameters === payload) out.parameters = out.payload;
    if (out.result === payload) out.result = out.payload;
  }
  if (out.parameters && out.parameters !== out.payload) {
    out.parameters = suppressPayloadCounts({ ...out.parameters }, min);
  }
  return out;
}

function suppressPayloadCounts(obj, min) {
  for (const key of ["nMaster", "nNonmaster", "nIndeterminate", "nPersons", "nReference", "nFocal"]) {
    if (obj[key] != null) {
      const { value, suppressed } = suppressCount(obj[key], min);
      obj[key] = value;
      if (suppressed) obj[`${key}Suppressed`] = true;
    }
  }
  if (Array.isArray(obj.profileDistribution)) {
    obj.profileDistribution = obj.profileDistribution.map((row) => {
      const { value, suppressed } = suppressCount(row.count, min);
      return suppressed
        ? { ...row, count: null, suppressed: true }
        : { ...row, count: value, suppressed: false };
    });
  }
  if (Array.isArray(obj.attributes)) {
    obj.attributes = obj.attributes.map((row) => {
      const next = { ...row };
      for (const key of ["nMaster", "nNonmaster", "nIndeterminate"]) {
        if (next[key] != null) {
          const { value, suppressed } = suppressCount(next[key], min);
          next[key] = value;
          if (suppressed) next[`${key}Suppressed`] = true;
        }
      }
      return next;
    });
  }
  return obj;
}
