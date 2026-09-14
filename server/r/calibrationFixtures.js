// server/r/calibrationFixtures.js
// Named-fixture enqueue: `{ fixture: "lsat7" | "sim10gdina" | "lsat7-ctt" | "planted-dif" }`.
// Production caller is POST /api/calibrationJobs. Keep this list in
// lockstep with the fixture modules; unknown names 400.

import { lsat7CalibrationRequest } from "./lsat7Fixture.js";
import { sim10gdinaCalibrationRequest } from "./sim10gdinaFixture.js";
import { plantedDifCalibrationRequest } from "./plantedDifFixture.js";

export const CALIBRATION_NAMED_FIXTURES = ["lsat7", "sim10gdina", "lsat7-ctt", "planted-dif"];

function mergeFixtureRequest(body, fromFix) {
  const qMatrix = body.request?.qMatrix || fromFix.qMatrix;
  const groups = body.request?.groups || fromFix.groups;
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
  if (body.fixture === "planted-dif") {
    return mergeFixtureRequest(
      body,
      plantedDifCalibrationRequest({
        jobId: body.request?.jobId,
      })
    );
  }
  if (body.fixture === "lsat7" || body.fixture === "lsat7-ctt") {
    const ctt =
      body.fixture === "lsat7-ctt" ||
      body.kind === "ctt-statistics" ||
      body.request?.model?.family === "ctt";
    return mergeFixtureRequest(
      body,
      lsat7CalibrationRequest({
        jobId: body.request?.jobId,
        family: ctt ? "ctt" : "irt",
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
