// server/r/knownAttributeProfileCohortFixture.js
// D79: seeded cohort with known mastery posteriors. Hand-verified rates
// are the exit check — not a published external table.

import { CALIBRATION_CONTRACT_VERSION } from "./calibrationContract.js";

/** Hand-computed at threshold 0.5 (symmetric Bayes / ADR 0004). */
const KNOWN_ATTRIBUTE_PROFILE_COHORT_EXPECTED = {
  masteryThreshold: 0.5,
  nPersons: 4,
  attributes: {
    attrA: {
      probabilityAveragedMasteryRate: 0.6,
      classificationCountedMasteryRate: 2 / 3,
      nMaster: 2,
      nNonmaster: 1,
      nIndeterminate: 1,
      nAssigned: 3,
      meanExpectedClassificationAccuracy: 0.9,
    },
    attrB: {
      probabilityAveragedMasteryRate: 0.475,
      classificationCountedMasteryRate: 0.5,
      nMaster: 2,
      nNonmaster: 2,
      nIndeterminate: 0,
      nAssigned: 4,
      meanExpectedClassificationAccuracy: 0.775,
    },
  },
  profileDistribution: [
    { profileKey: "attrA=indeterminate|attrB=master", count: 1, rate: 0.25 },
    { profileKey: "attrA=master|attrB=master", count: 1, rate: 0.25 },
    { profileKey: "attrA=master|attrB=nonmaster", count: 1, rate: 0.25 },
    { profileKey: "attrA=nonmaster|attrB=nonmaster", count: 1, rate: 0.25 },
  ],
};

function masteryPosterior(smvId, estimate) {
  return {
    smvId,
    smvType: "binary",
    method: "attribute-mastery-posterior",
    modelFamily: "dina",
    estimate,
    precision: Math.sqrt(estimate * (1 - estimate)),
    supported: true,
    responsesUsed: 2,
  };
}

/**
 * Four-person cohort:
 *   p1 A=0.9 B=0.8 → master|master
 *   p2 A=0.9 B=0.2 → master|nonmaster
 *   p3 A=0.1 B=0.2 → nonmaster|nonmaster
 *   p4 A=0.5 B=0.7 → indeterminate|master
 */
function knownAttributeProfileCohortMembers() {
  return [
    {
      personId: "p1",
      posteriors: {
        attrA: masteryPosterior("attrA", 0.9),
        attrB: masteryPosterior("attrB", 0.8),
      },
    },
    {
      personId: "p2",
      posteriors: {
        attrA: masteryPosterior("attrA", 0.9),
        attrB: masteryPosterior("attrB", 0.2),
      },
    },
    {
      personId: "p3",
      posteriors: {
        attrA: masteryPosterior("attrA", 0.1),
        attrB: masteryPosterior("attrB", 0.2),
      },
    },
    {
      personId: "p4",
      posteriors: {
        attrA: masteryPosterior("attrA", 0.5),
        attrB: masteryPosterior("attrB", 0.7),
      },
    },
  ];
}

export function knownAttributeProfileCohortRequest({ jobId } = {}) {
  return {
    contractVersion: CALIBRATION_CONTRACT_VERSION,
    jobId: jobId || "job-pending",
    model: {
      family: "attribute-profile",
      attributeIds: ["attrA", "attrB"],
    },
    cohort: {
      id: "cohort-known-d79",
      members: knownAttributeProfileCohortMembers(),
    },
    scope: {
      tenantId: "tenant-demo",
      districtId: "district-demo",
      schoolId: "school-demo",
      cohortId: "cohort-known-d79",
    },
    options: {
      seed: 20261215,
      threshold: 0.5,
    },
  };
}

/** Test-only access — same pattern as attributeClassification.__testing__. */
export const __testing__ = {
  KNOWN_ATTRIBUTE_PROFILE_COHORT_EXPECTED,
  knownAttributeProfileCohortMembers,
};
