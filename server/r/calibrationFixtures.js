// server/r/calibrationFixtures.js
// Named-fixture enqueue: `{ fixture: "lsat7" | "sim10gdina" | "lsat7-ctt" |
// "lsat7-item-analysis" | "known-2pl-testinfo" | "lsat7-test-information" |
// "planted-dif" | "known-equating" }`.
// Production caller is POST /api/calibrationJobs. Keep this list in
// lockstep with the fixture modules; unknown names 400.

import { lsat7CalibrationRequest } from "./lsat7Fixture.js";
import { sim10gdinaCalibrationRequest } from "./sim10gdinaFixture.js";
import { plantedDifCalibrationRequest } from "./plantedDifFixture.js";
import { knownEquatingCalibrationRequest } from "./knownEquatingFixture.js";
import { known2plTestinfoCalibrationRequest } from "./known2plTestinfoFixture.js";
import { knownAttributeProfileCohortRequest } from "./knownAttributeProfileCohortFixture.js";

export const CALIBRATION_NAMED_FIXTURES = [
  "lsat7",
  "sim10gdina",
  "lsat7-ctt",
  "lsat7-item-analysis",
  "known-2pl-testinfo",
  "lsat7-test-information",
  "planted-dif",
  "known-equating",
  "known-attribute-profile-cohort",
];

function mergeFixtureRequest(body, fromFix) {
  const qMatrix = body.request?.qMatrix || fromFix.qMatrix;
  const groups = body.request?.groups || fromFix.groups;
  const forms = body.request?.forms || fromFix.forms;
  return {
    ...body,
    request: {
      ...fromFix,
      ...(body.request || {}),
      model: { ...fromFix.model, ...(body.request?.model || {}) },
      responseMatrix: body.request?.responseMatrix || fromFix.responseMatrix,
      options: { ...fromFix.options, ...(body.request?.options || {}) },
      ...(qMatrix ? { qMatrix } : {}),
      ...(groups ? { groups } : {}),
      ...(forms ? { forms } : {}),
    },
  };
}

function statisticalModelType(db, evidenceModelId, statisticalModelId) {
  if (!db || !evidenceModelId || !statisticalModelId) return null;
  const em = db.evidenceModels?.find((m) => m.id === evidenceModelId);
  const sm = (em?.statisticalModels || []).find((m) => m.id === statisticalModelId);
  return sm?.type || null;
}

function bindSim10Family(body, db) {
  const evidenceModelId = body.evidenceModelId;
  const statisticalModelId = body.statisticalModelId;
  const smType = statisticalModelType(db, evidenceModelId, statisticalModelId);
  if (smType === "dina" || smType === "gdina") {
    return {
      ...body,
      request: {
        ...body.request,
        model: { ...body.request.model, family: smType },
      },
    };
  }
  return body;
}

export function applyNamedCalibrationFixture(body, db = null) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (body.fixture === undefined || body.fixture === null || body.fixture === "") {
    return body;
  }
  if (!CALIBRATION_NAMED_FIXTURES.includes(body.fixture)) {
    const err = new Error(
      `Unknown calibration fixture '${body.fixture}'. Declared: ${CALIBRATION_NAMED_FIXTURES.join(", ")}`
    );
    err.code = "UNKNOWN_CALIBRATION_FIXTURE";
    throw err;
  }
  if (body.fixture === "known-equating") {
    return mergeFixtureRequest(
      body,
      knownEquatingCalibrationRequest({
        jobId: body.request?.jobId,
      })
    );
  }
  if (body.fixture === "known-2pl-testinfo") {
    return mergeFixtureRequest(
      body,
      known2plTestinfoCalibrationRequest({
        jobId: body.request?.jobId,
      })
    );
  }
  if (body.fixture === "known-attribute-profile-cohort") {
    const fromFix = knownAttributeProfileCohortRequest({
      jobId: body.request?.jobId,
    });
    return {
      ...body,
      kind: body.kind || "attribute-profile-summary",
      request: {
        ...fromFix,
        ...(body.request || {}),
        model: { ...fromFix.model, ...(body.request?.model || {}) },
        cohort: body.request?.cohort || fromFix.cohort,
        scope: { ...fromFix.scope, ...(body.request?.scope || {}) },
        options: { ...fromFix.options, ...(body.request?.options || {}) },
      },
    };
  }
  if (body.fixture === "planted-dif") {
    return mergeFixtureRequest(
      body,
      plantedDifCalibrationRequest({
        jobId: body.request?.jobId,
      })
    );
  }
  if (
    body.fixture === "lsat7" ||
    body.fixture === "lsat7-ctt" ||
    body.fixture === "lsat7-item-analysis" ||
    body.fixture === "lsat7-test-information"
  ) {
    let family = "irt";
    if (
      body.fixture === "lsat7-test-information" ||
      body.kind === "test-information" ||
      body.request?.model?.family === "test-information"
    ) {
      family = "test-information";
    } else if (
      body.fixture === "lsat7-item-analysis" ||
      body.kind === "item-analysis" ||
      body.request?.model?.family === "item-analysis"
    ) {
      family = "item-analysis";
    } else if (
      body.fixture === "lsat7-ctt" ||
      body.kind === "ctt-statistics" ||
      body.request?.model?.family === "ctt"
    ) {
      family = "ctt";
    }
    return mergeFixtureRequest(
      body,
      lsat7CalibrationRequest({
        jobId: body.request?.jobId,
        family,
      })
    );
  }
  const familyHint = body.request?.model?.family;
  const expanded = mergeFixtureRequest(
    body,
    sim10gdinaCalibrationRequest({
      jobId: body.request?.jobId,
      family: familyHint === "dina" ? "dina" : "gdina",
    })
  );
  return bindSim10Family(expanded, db);
}
