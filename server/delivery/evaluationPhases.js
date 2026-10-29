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

function parseOrdinalRating(rating = {}) {
  const raw = rating.value ?? rating.level ?? rating.category;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function attachOrdinal(target, source) {
  if (!source) return target;
  if (source.value != null) target.value = source.value;
  if (Number.isInteger(source.category) && source.category >= 0) {
    target.category = source.category;
  } else if (Number.isInteger(source.value) && source.value >= 0) {
    target.category = source.value;
  }
  return target;
}

function humanRatingFields(humanRating) {
  const ordinal = parseOrdinalRating(humanRating);
  const hasActivated = typeof humanRating.activated === "boolean";
  if (!hasActivated && ordinal == null) {
    throw new Error("Human rating requires activated: true | false, or a numeric value or level.");
  }
  const fields = {
    activated: hasActivated ? humanRating.activated : ordinal > 0,
    strength: humanRating.strength ?? null,
    rationale: humanRating.rationale ?? null,
  };
  if (ordinal != null) {
    fields.value = ordinal;
    if (Number.isInteger(ordinal) && ordinal >= 0) fields.category = ordinal;
  }
  return fields;
}

/**
 * Apply adjudication between an automated boolean result and a human one.
 * When both sides carry a numeric value, require_agreement compares those
 * levels; otherwise it compares the booleans.
 * @returns {{ activated: boolean|null, status: string, strength: number|null, rationale: string|null, adjudicationApplied: string|null, value?: number|null, category?: number|null }}
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
    return attachOrdinal(
      {
        activated: h,
        status: EVALUATION_STATUS.COMPLETE,
        strength: human.strength ?? null,
        rationale: human.rationale ?? "Human phase completed (no automated boolean).",
        adjudicationApplied: null,
      },
      human
    );
  }

  if (effectiveRule === "require_agreement") {
    const aVal = parseOrdinalRating(automated);
    const hVal = parseOrdinalRating(human);
    const agree =
      aVal != null && hVal != null ? aVal === hVal : a === h;
    if (agree) {
      return attachOrdinal(
        {
          activated: h,
          status: EVALUATION_STATUS.COMPLETE,
          strength: human.strength ?? automated.strength ?? null,
          rationale:
            human.rationale ||
            automated.rationale ||
            "Automated and human phases agree.",
          adjudicationApplied: "require_agreement",
        },
        human.value != null ? human : automated
      );
    }
    return {
      activated: null,
      status: EVALUATION_STATUS.PENDING_ADJUDICATION,
      strength: null,
      rationale:
        aVal != null && hVal != null
          ? `Automated (value ${aVal}) and human (value ${hVal}) disagree; require_agreement holds.`
          : `Automated (${a}) and human (${h}) disagree; require_agreement holds.`,
      adjudicationApplied: "require_agreement",
    };
  }

  if (effectiveRule === "automated_wins") {
    return attachOrdinal(
      {
        activated: a,
        status: EVALUATION_STATUS.COMPLETE,
        strength: automated.strength ?? human.strength ?? null,
        rationale:
          automated.rationale ||
          `Adjudication automated_wins (human was ${h}).`,
        adjudicationApplied: "automated_wins",
      },
      automated
    );
  }

  // human_wins (default)
  return attachOrdinal(
    {
      activated: h,
      status: EVALUATION_STATUS.COMPLETE,
      strength: human.strength ?? automated.strength ?? null,
      rationale:
        human.rationale ||
        `Adjudication human_wins (automated was ${a}).`,
      adjudicationApplied: "human_wins",
    },
    human
  );
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
    ...(identificationResult.value != null ? { value: identificationResult.value } : {}),
    ...(identificationResult.category != null ? { category: identificationResult.category } : {}),
  };

  return {
    ...identificationResult,
    // Honest: not final until human (and adjudication) complete.
    activated: null,
    value: null,
    category: null,
    strength: null,
    provisionalActivated: automatedPhaseResult.activated,
    provisionalStrength: automatedPhaseResult.strength,
    ...(automatedPhaseResult.value != null ? { provisionalValue: automatedPhaseResult.value } : {}),
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
 * Complete a pending_human (or pending_adjudication) response with a
 * human rating + adjudication.
 */
export function completeHumanEvaluation(pendingResponse, humanRating = {}) {
  const status = pendingResponse?.evaluationStatus;
  if (
    status !== EVALUATION_STATUS.PENDING_HUMAN &&
    status !== EVALUATION_STATUS.PENDING_ADJUDICATION
  ) {
    throw new Error(
      "completeHumanEvaluation requires a pending_human or pending_adjudication response."
    );
  }
  const rating = humanRatingFields(humanRating);

  // After require_agreement held, a second staff write is the adjudication.
  if (status === EVALUATION_STATUS.PENDING_ADJUDICATION) {
    return attachOrdinal(
      {
        ...pendingResponse,
        activated: rating.activated,
        strength: rating.strength ?? pendingResponse.strength ?? null,
        rationale: rating.rationale ?? pendingResponse.rationale ?? null,
        evaluationStatus: EVALUATION_STATUS.COMPLETE,
        adjudicationApplied: "manual_adjudication",
        pendingPhase: null,
        humanRatedAt: new Date().toISOString(),
        humanRatedBy: humanRating.ratedBy ?? pendingResponse.humanRatedBy ?? null,
      },
      rating
    );
  }

  const rule =
    pendingResponse.pendingPhase?.adjudicationRule ||
    humanRating.adjudicationRule ||
    "human_wins";

  const automated = pendingResponse.automatedPhaseResult || {
    activated: pendingResponse.provisionalActivated,
    strength: pendingResponse.provisionalStrength,
    ...(pendingResponse.provisionalValue != null
      ? { value: pendingResponse.provisionalValue }
      : {}),
  };

  const human = { ...rating };

  const decided = adjudicatePhaseResults(automated, human, rule);

  return attachOrdinal(
    {
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
    },
    decided.status === EVALUATION_STATUS.COMPLETE ? decided : null
  );
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
      pendingPhase: r.pendingPhase
        ? {
            order: r.pendingPhase.order,
            kind: r.pendingPhase.kind,
            rubricId: r.pendingPhase.rubricId ?? null,
            adjudicationRule: r.pendingPhase.adjudicationRule ?? null,
          }
        : null,
      // D124: never surface provisional/automated result on pending rows —
      // honesty is evaluationStatus + activated:null, not leaking the guess.
      activated: r.activated,
    }));
}
