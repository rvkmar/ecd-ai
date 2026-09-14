// server/delivery/parameterSourceResolution.js
//
// D68: calibrated parameters supersede pilot for NEW scoring, but a
// session that already recorded evidence under one source must stay on
// that source. Mixing pilot and calibrated responses for one Evidence
// Model is refused by accumulateEvidence (a posterior mixing them is not
// interpretable). Before this module, a mid-session ingest flipped the
// NEXT submit to "calibrated" while earlier responses stayed "pilot",
// which silently killed the posterior. Same hole for two calibrated
// parameterSetIds in one session.
//
// Freeze is per Evidence Model, from session.responses already stored.
// The first tagged response for that EM is the opening source; later
// submits copy it. A session with no responses yet follows the live
// preference: an active calibrated set wins, else Step 7 / dinaParams
// pilot.

import {
  CONTINUOUS_MODEL_FAMILIES,
  RAW_SCORE_MODEL_FAMILIES,
  itemParametersAreUsable,
} from "./evidenceAccumulation.js";
import { dinaParametersAreUsable } from "./attributeAccumulation.js";

export function frozenScoringContext(session, evidenceModelId) {
  const relevant = (session?.responses || []).filter(
    (r) => r.evidenceModelId === evidenceModelId
  );
  const sources = [
    ...new Set(
      relevant
        .map((r) => r.parameterSource)
        .filter((s) => s && s !== "not-applicable")
    ),
  ];
  const setIds = [...new Set(relevant.map((r) => r.parameterSetId).filter(Boolean))];

  if (sources.length > 1) {
    return {
      error: `Session already mixed parameter sources (${sources.join(", ")}) for evidence model '${evidenceModelId}'; refusing further scoring rather than adding to an uninterpretable posterior.`,
    };
  }

  if (sources[0] === "pilot") {
    if (setIds.length > 0) {
      return {
        error: `Session tagged evidence model '${evidenceModelId}' as pilot but also cites a parameterSetId; refusing rather than guessing which is authoritative.`,
      };
    }
    return { frozenSource: "pilot", frozenParameterSetId: null };
  }

  if (sources[0] === "calibrated") {
    if (setIds.length === 0) {
      return {
        error: `Session tagged evidence model '${evidenceModelId}' as calibrated but recorded no parameterSetId.`,
      };
    }
    if (setIds.length > 1) {
      return {
        error: `Session already mixed parameter sets (${setIds.join(", ")}) for evidence model '${evidenceModelId}'; refusing further scoring rather than mixing calibrations.`,
      };
    }
    return { frozenSource: "calibrated", frozenParameterSetId: setIds[0] };
  }

  return { frozenSource: null, frozenParameterSetId: null };
}

function snapshotIrtPilot(item) {
  const current = item?.psychometrics?.irtParams;
  if (!itemParametersAreUsable(current)) return null;
  return {
    a: current.a,
    b: current.b,
    ...(Number.isFinite(current.c) ? { c: current.c } : {}),
  };
}

function snapshotDinaPilot(item) {
  const current = item?.psychometrics?.dinaParams;
  if (!dinaParametersAreUsable(current)) return null;
  return { slip: current.slip, guess: current.guess };
}

/**
 * Bind a submit (or the selection agreement oracle) to a parameter source.
 * `frozenSource` is the opening source for this EM on this session, or
 * null on the first tagged response.
 */
export function chooseSubmitParameterBinding({
  family,
  calibratedParameterSetId,
  item,
  freeze = { frozenSource: null, frozenParameterSetId: null },
}) {
  if (freeze?.error) return { error: freeze.error };

  if (RAW_SCORE_MODEL_FAMILIES.includes(family)) {
    return { parameterSource: "not-applicable", parameterSetId: null, pilotParams: null };
  }

  const frozen = freeze.frozenSource || null;
  const wantPilot = frozen === "pilot" || (frozen == null && !calibratedParameterSetId);
  const wantCalibrated =
    frozen === "calibrated" || (frozen == null && Boolean(calibratedParameterSetId));

  if (wantCalibrated) {
    const parameterSetId =
      freeze.frozenParameterSetId || calibratedParameterSetId || null;
    if (!parameterSetId) {
      return {
        error: `Evidence model already scored this session as calibrated, but no parameter set remains to pin the next response to.`,
      };
    }
    return { parameterSource: "calibrated", parameterSetId, pilotParams: null };
  }

  if (wantPilot && CONTINUOUS_MODEL_FAMILIES.includes(family)) {
    const pilotParams = snapshotIrtPilot(item);
    if (!pilotParams) {
      return {
        error: `Evidence model '${item?.evidenceModelId}' has no active calibrated parameter set, and item '${item?.id}' carries no usable pilot IRT parameters (psychometrics.irtParams needs at least a > 0 and a finite b) for a '${family}' model to fall back on.`,
      };
    }
    return { parameterSource: "pilot", parameterSetId: null, pilotParams };
  }

  if (wantPilot && family === "dina") {
    const pilotParams = snapshotDinaPilot(item);
    if (!pilotParams) {
      return {
        error: `Evidence model '${item?.evidenceModelId}' has no active calibrated parameter set, and item '${item?.id}' carries no usable pilot DINA parameters (psychometrics.dinaParams needs slip and guess each in [0,1), with guess < 1 - slip) for a '${family}' model to fall back on.`,
      };
    }
    return { parameterSource: "pilot", parameterSetId: null, pilotParams };
  }

  return {
    error: `Evidence model '${item?.evidenceModelId}' has no active calibrated parameter set yet; item '${item?.id}' cannot be scored through it. Pilot parameters are not yet supported for the '${family}' family.`,
  };
}
