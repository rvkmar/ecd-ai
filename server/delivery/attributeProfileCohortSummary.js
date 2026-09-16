// server/delivery/attributeProfileCohortSummary.js
//
// D79 (W16): cohort-level attribute-profile aggregates. Recomputes every
// classification through classifyAttributeProfile (ADR 0004) — never reads
// a stored mastery label. Writes analysisArtefacts only (informs; does not
// authorise). Not an R path and not GDINA::CA / Wang population CA.

import { classifyAttributeProfile } from "./attributeClassification.js";
import { CALIBRATION_CONTRACT_VERSION } from "../r/calibrationContract.js";

export const ATTRIBUTE_PROFILE_SUMMARY_KIND = "attribute-profile-summary";
const ATTRIBUTE_PROFILE_PACKAGE_VERSION = "ecd-node attribute-profile-summary 1.0";

const DEFAULT_THRESHOLD = 0.5;

const ESTIMAND_NOTES = {
  probabilityAveragedMasteryRate:
    "Mean of each examinee's mastery probability (posterior.estimate) for this attribute. Not a classification rate.",
  classificationCountedMasteryRate:
    "Count of master classifications / count of assigned (non-indeterminate) classifications at the stated threshold. Not a mean probability.",
  meanExpectedClassificationAccuracy:
    "Mean of individual expectedClassificationAccuracy among assigned classifications. This is NOT the population classification-accuracy index (Wang et al. 2015 / GDINA::CA); averaging conditional confidences does not recover that estimand (ADR 0004).",
  profileDistribution:
    "Counts of joint classification vectors across the cohort. Indeterminate attributes appear as classification=indeterminate in the key.",
};

/**
 * Aggregate a cohort of mastery posteriors into labelled mastery-rate
 * figures and a profile distribution.
 *
 * @param {Array<{personId?: string, posteriors: object|object[]}>} members
 * @param {{threshold?: number}} [options]
 */
function summarizeAttributeProfileCohort(members, options = {}) {
  const threshold =
    Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 1
      ? options.threshold
      : DEFAULT_THRESHOLD;

  const list = Array.isArray(members) ? members : [];
  const perAttr = new Map();
  const profileCounts = new Map();

  for (const member of list) {
    const profile = classifyAttributeProfile(member?.posteriors, threshold);
    const bySmv = new Map(profile.map((row) => [row.smvId, row]));

    for (const row of profile) {
      if (!perAttr.has(row.smvId)) {
        perAttr.set(row.smvId, {
          smvId: row.smvId,
          probabilitySum: 0,
          nPersonsWithEstimate: 0,
          nMaster: 0,
          nNonmaster: 0,
          nIndeterminate: 0,
          expectedAccuracySum: 0,
          nAssigned: 0,
        });
      }
      const bucket = perAttr.get(row.smvId);
      if (Number.isFinite(row.estimate)) {
        bucket.probabilitySum += row.estimate;
        bucket.nPersonsWithEstimate += 1;
      }
      if (row.classification === "master") {
        bucket.nMaster += 1;
        bucket.nAssigned += 1;
        if (Number.isFinite(row.expectedClassificationAccuracy)) {
          bucket.expectedAccuracySum += row.expectedClassificationAccuracy;
        }
      } else if (row.classification === "nonmaster") {
        bucket.nNonmaster += 1;
        bucket.nAssigned += 1;
        if (Number.isFinite(row.expectedClassificationAccuracy)) {
          bucket.expectedAccuracySum += row.expectedClassificationAccuracy;
        }
      } else if (row.classification === "indeterminate") {
        bucket.nIndeterminate += 1;
      }
    }

    const keyParts = [...bySmv.keys()]
      .sort()
      .map((smvId) => `${smvId}=${bySmv.get(smvId).classification}`);
    const key = keyParts.join("|") || "(empty)";
    profileCounts.set(key, (profileCounts.get(key) || 0) + 1);
  }

  const nPersons = list.length;
  const attributes = {};
  for (const [smvId, bucket] of [...perAttr.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    attributes[smvId] = {
      smvId,
      probabilityAveragedMasteryRate:
        bucket.nPersonsWithEstimate > 0
          ? bucket.probabilitySum / bucket.nPersonsWithEstimate
          : null,
      classificationCountedMasteryRate:
        bucket.nAssigned > 0 ? bucket.nMaster / bucket.nAssigned : null,
      nMaster: bucket.nMaster,
      nNonmaster: bucket.nNonmaster,
      nIndeterminate: bucket.nIndeterminate,
      nAssigned: bucket.nAssigned,
      nPersonsWithEstimate: bucket.nPersonsWithEstimate,
      meanExpectedClassificationAccuracy:
        bucket.nAssigned > 0 ? bucket.expectedAccuracySum / bucket.nAssigned : null,
    };
  }

  const profileDistribution = [...profileCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      profileKey: key,
      count,
      rate: nPersons > 0 ? count / nPersons : null,
    }));

  return {
    masteryThreshold: threshold,
    nPersons,
    attributes,
    profileDistribution,
    estimandNotes: { ...ESTIMAND_NOTES },
  };
}

/**
 * Run the Node-side job: same { ok, json, error } shape as postCalibration.
 */
export function runAttributeProfileSummaryJob(request) {
  const jobId = request?.jobId;
  if (!jobId || typeof jobId !== "string") {
    return {
      ok: false,
      status: 0,
      json: null,
      text: "",
      error: {
        message: "attribute-profile-summary requires request.jobId",
        rClass: "ContractError",
        stderr: "",
      },
    };
  }

  const members = request?.cohort?.members;
  if (!Array.isArray(members) || members.length < 2) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: "",
      error: {
        message: "attribute-profile-summary requires cohort.members with at least two persons",
        rClass: "ContractError",
        stderr: "",
      },
    };
  }

  const threshold = request?.options?.threshold;
  const summary = summarizeAttributeProfileCohort(members, { threshold });
  const calibratedAt = new Date().toISOString();

  return {
    ok: true,
    status: 200,
    json: {
      contractVersion: CALIBRATION_CONTRACT_VERSION,
      jobId,
      converged: true,
      packageVersion: ATTRIBUTE_PROFILE_PACKAGE_VERSION,
      sampleSize: summary.nPersons,
      calibratedAt,
      parameters: {
        masteryThreshold: summary.masteryThreshold,
        attributes: summary.attributes,
        profileDistribution: summary.profileDistribution,
      },
      fitStatistics: {
        nPersons: summary.nPersons,
        nAttributes: Object.keys(summary.attributes).length,
        nDistinctProfiles: summary.profileDistribution.length,
      },
      diagnostics: {
        method: "classifyAttributeProfile + cohort aggregate (D79)",
        engine: ATTRIBUTE_PROFILE_PACKAGE_VERSION,
        authority:
          "attribute-profile-summary writes analysisArtefacts and informs only. It never sets activeParameterSetId and never claims population classification accuracy (GDINA::CA / Wang et al. 2015).",
        estimandNotes: summary.estimandNotes,
        scopeShaping:
          "Artefact scope may carry tenantId / districtId / schoolId / cohort for W20 tenancy review; this unit shapes the fields, it does not enforce cross-tenant isolation.",
      },
    },
    text: "",
    error: null,
  };
}
