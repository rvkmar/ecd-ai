// server/delivery/evaluationPhases.js
//
// D123 / W25 G11. Multi-phase evaluation procedures (PADI Fig. 7):
//   { order, kind: automated | human | hybrid, rubricId?, adjudicationRule? }
//
// When phases are absent, Identification stays a single synchronous pass
// (pre-D123 behaviour). When a human (or hybrid) phase follows, the
// automated phase may run and the response MUST pause with
// evaluationStatus: "pending_human" and activated: null — never present a
// provisional OV as final. Accumulation already skips activated: null.
//
// Adjudication (when automated + human both produced a boolean):
//   human_wins | automated_wins | require_agreement

const ADJUDICATION_RULES = Object.freeze([
  "human_wins",
  "automated_wins",
  "require_agreement",
]);

export const EVALUATION_STATUS = Object.freeze({
  COMPLETE: "complete",
  PENDING_HUMAN: "pending_human",
  PENDING_ADJUDICATION: "pending_adjudication",
});

/**
 * Normalize phases for a procedure. Missing/empty → one synthetic
 * automated phase (compat with pre-D123 procedures).
 */
function normalizePhases(procedure) {
  const raw = procedure?.phases;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ order: 1, kind: "automated" }];
  }
  return [...raw]
    .filter((p) => p && typeof p === "object")
    .map((p, i) => ({
      order: typeof p.order === "number" ? p.order : i + 1,
      kind: p.kind,
      rubricId: p.rubricId ?? null,
      adjudicationRule: p.adjudicationRule ?? null,
    }))
    .sort((a, b) => a.order - b.order);
}

function phasesNeedHuman(phases) {
  return (phases || []).some((p) => p.kind === "human" || p.kind === "hybrid");
}

function firstPendingHumanPhase(phases) {
  return (phases || []).find((p) => p.kind === "human" || p.kind === "hybrid") || null;
}

/**
 * Apply adjudication between an automated boolean result and a human one.
 * @returns {{ activated: boolean|null, status: string, strength: number|null, rationale: string|null, adjudicationApplied: string|null }}
 */
function adjudicatePhaseResults(automated, human, rule) {
  const a = automated?.activated;
  const h = human?.activated;
  const effectiveRule = ADJUDICATION_RULES.includes(rule) ? rule : "human_wins";

  if (typeof h !== "boolean") {
    return {
      activated: null,
      status: EVALUATION_STATUS.PENDING_HUMAN,
      strength: null,
      rationale: "Human rating incomplete.",
      adjudicationApplied: null,
    };
  }

  if (typeof a !== "boolean") {
    return {
      activated: h,
      status: EVALUATION_STATUS.COMPLETE,
      strength: human.strength ?? null,
      rationale: human.rationale ?? "Human phase completed (no automated boolean).",
      adjudicationApplied: null,
    };
  }

  if (effectiveRule === "require_agreement") {
    if (a === h) {
      return {
        activated: h,
        status: EVALUATION_STATUS.COMPLETE,
        strength: human.strength ?? automated.strength ?? null,
        rationale:
          human.rationale ||
          automated.rationale ||
          "Automated and human phases agree.",
        adjudicationApplied: "require_agreement",
      };
    }
    return {
      activated: null,
      status: EVALUATION_STATUS.PENDING_ADJUDICATION,
      strength: null,
      rationale: `Automated (${a}) and human (${h}) disagree; require_agreement holds.`,
      adjudicationApplied: "require_agreement",
    };
  }

  if (effectiveRule === "automated_wins") {
    return {
      activated: a,
      status: EVALUATION_STATUS.COMPLETE,
      strength: automated.strength ?? human.strength ?? null,
      rationale:
        automated.rationale ||
        `Adjudication automated_wins (human was ${h}).`,
      adjudicationApplied: "automated_wins",
    };
  }

  // human_wins (default)
  return {
    activated: h,
    status: EVALUATION_STATUS.COMPLETE,
    strength: human.strength ?? automated.strength ?? null,
    rationale:
      human.rationale ||
      `Adjudication human_wins (automated was ${a}).`,
    adjudicationApplied: "human_wins",
  };
}

/**
 * After a synchronous Identification result, decide whether to pause for
 * a human phase. Never leaves a provisional activated value as final.
 *
 * @param {object} identificationResult - output of identifyEvidence
 * @param {object|null} evaluationProcedure - baked procedure (may have phases)
 * @returns {object} identification result, possibly pending_human
 */
export function applyPhaseGate(identificationResult, evaluationProcedure) {
  if (!identificationResult || identificationResult.refused) {
    return identificationResult;
  }

  const phases = normalizePhases(evaluationProcedure);
  if (!phasesNeedHuman(phases)) {
    return {
      ...identificationResult,
      evaluationStatus: EVALUATION_STATUS.COMPLETE,
    };
  }

  const pendingPhase = firstPendingHumanPhase(phases);
  const automatedPhaseResult = {
    activated: identificationResult.activated,
    direction: identificationResult.direction,
    strength: identificationResult.strength,
    rationale: identificationResult.rationale,
  };

  return {
    ...identificationResult,
    // Honest: not final until human (and adjudication) complete.
    activated: null,
    strength: null,
    provisionalActivated: automatedPhaseResult.activated,
    provisionalStrength: automatedPhaseResult.strength,
    evaluationStatus: EVALUATION_STATUS.PENDING_HUMAN,
    pendingPhase: pendingPhase
      ? {
          order: pendingPhase.order,
          kind: pendingPhase.kind,
          rubricId: pendingPhase.rubricId,
          adjudicationRule: pendingPhase.adjudicationRule || "human_wins",
        }
      : null,
    automatedPhaseResult,
    rationale:
      identificationResult.rationale ||
      "Automated phase recorded; waiting for human evaluation.",
  };
}

/**
 * Complete a pending_human response with a human rating + adjudication.
 */
export function completeHumanEvaluation(pendingResponse, humanRating = {}) {
  if (!pendingResponse || pendingResponse.evaluationStatus !== EVALUATION_STATUS.PENDING_HUMAN) {
    throw new Error("completeHumanEvaluation requires a pending_human response.");
  }
  if (typeof humanRating.activated !== "boolean") {
    throw new Error("Human rating requires activated: true | false.");
  }

  const rule =
    pendingResponse.pendingPhase?.adjudicationRule ||
    humanRating.adjudicationRule ||
    "human_wins";

  const automated = pendingResponse.automatedPhaseResult || {
    activated: pendingResponse.provisionalActivated,
    strength: pendingResponse.provisionalStrength,
  };

  const human = {
    activated: humanRating.activated,
    strength: humanRating.strength ?? null,
    rationale: humanRating.rationale ?? null,
  };

  const decided = adjudicatePhaseResults(automated, human, rule);

  return {
    ...pendingResponse,
    activated: decided.activated,
    strength: decided.strength,
    rationale: decided.rationale,
    evaluationStatus: decided.status,
    adjudicationApplied: decided.adjudicationApplied,
    humanPhaseResult: human,
    pendingPhase:
      decided.status === EVALUATION_STATUS.COMPLETE
        ? null
        : pendingResponse.pendingPhase,
    humanRatedAt: new Date().toISOString(),
    humanRatedBy: humanRating.ratedBy ?? null,
  };
}

/**
 * Pending human (or adjudication) rows on a session — honest reporting.
 */
export function pendingHumanRatingsFromSession(session) {
  return (session?.responses || [])
    .map((r, index) => ({ response: r, index }))
    .filter(
      ({ response: r }) =>
        r &&
        (r.evaluationStatus === EVALUATION_STATUS.PENDING_HUMAN ||
          r.evaluationStatus === EVALUATION_STATUS.PENDING_ADJUDICATION)
    )
    .map(({ response: r, index }) => ({
      responseIndex: index,
      taskId: r.taskId,
      itemId: r.itemId,
      observationId: r.observationId,
      evaluationStatus: r.evaluationStatus,
      pendingPhase: r.pendingPhase || null,
      provisionalActivated: r.provisionalActivated ?? null,
      // Deliberately do NOT expose provisional as activated.
      activated: r.activated,
    }));
}
