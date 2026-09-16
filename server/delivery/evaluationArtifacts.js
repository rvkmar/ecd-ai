// server/delivery/evaluationArtifacts.js
//
// EM-R1: turn a baked evaluationProcedure.artifact into an Identification
// match when the item's evidenceActivationMap is empty. Quiet-failure
// surface — wrong activated/strength looks like a valid OV — so each kind
// has explicit work-product contracts and refuses to invent activation
// rules that are not on the artifact.
//
// Activation-map precedence stays in evidenceIdentification.js: this
// module is only consulted when that map is empty.

/**
 * Shared pattern overlap used by key artifacts and auto activatingPatterns.
 * Mirrors evidenceIdentification.matchesResponsePattern semantics.
 */
export function matchesResponsePattern(pattern, workProduct) {
  if (!pattern || typeof pattern !== "object") return false;
  if (Object.keys(pattern).length === 0) return false;
  if (!workProduct || typeof workProduct !== "object") return false;

  return Object.entries(pattern).every(([key, expected]) => {
    const actual = workProduct[key];
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    const actualValues = Array.isArray(actual) ? actual : [actual];
    return actualValues.some((a) => expectedValues.includes(a));
  });
}

function baseResult(extras = {}) {
  return {
    matched: false,
    activatesObservable: null,
    rationale: null,
    ...extras,
  };
}

function defaultActivatesAt(levels) {
  if (!Array.isArray(levels) || levels.length === 0) return null;
  const numeric = levels.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (numeric.length === 0) return levels[0];
  const positives = numeric.filter((v) => v > 0);
  if (positives.length === 0) return Math.max(...numeric);
  return Math.min(...positives);
}

function readRubricRatings(workProduct, dimensions) {
  if (!workProduct || typeof workProduct !== "object") return null;

  if (workProduct.dimensions && typeof workProduct.dimensions === "object" && !Array.isArray(workProduct.dimensions)) {
    return workProduct.dimensions;
  }
  if (workProduct.rubricLevels && typeof workProduct.rubricLevels === "object" && !Array.isArray(workProduct.rubricLevels)) {
    return workProduct.rubricLevels;
  }
  // Single-level SessionPlayer shape → sole / first dimension.
  if (workProduct.rubricLevel != null && Array.isArray(dimensions) && dimensions.length >= 1) {
    const dimId = dimensions[0]?.id;
    if (!dimId) return null;
    return { [dimId]: workProduct.rubricLevel };
  }
  return null;
}

/**
 * Rubric artifact → OV activation.
 *
 * Work product: `{ dimensions: { [dimId]: level } }`, or `{ rubricLevels }`,
 * or `{ rubricLevel }` mapped onto the first dimension.
 *
 * Each dimension may declare `activatesAt` (inclusive). Default is the
 * lowest positive declared level (partial credit activates). Missing or
 * illegal ratings → warning, not silent false.
 */
function matchRubricArtifact(artifact, workProduct, procedure = {}) {
  const dimensions = artifact?.dimensions;
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    return baseResult({
      matched: false,
      warning: "Rubric artifact has no dimensions.",
    });
  }

  const ratings = readRubricRatings(workProduct, dimensions);
  if (!ratings) {
    return baseResult({
      matched: false,
      warning: "Work product has no rubric dimension ratings.",
    });
  }

  let activated = true;
  for (const dim of dimensions) {
    if (!dim?.id) {
      return baseResult({
        matched: false,
        warning: "Rubric artifact dimension is missing id.",
      });
    }
    if (!Object.prototype.hasOwnProperty.call(ratings, dim.id)) {
      return baseResult({
        matched: false,
        warning: `Work product missing rubric rating for dimension '${dim.id}'.`,
      });
    }
    const level = ratings[dim.id];
    const levels = Array.isArray(dim.levels) ? dim.levels : [];
    if (levels.length > 0 && !levels.includes(level)) {
      return baseResult({
        matched: false,
        warning: `Rubric rating '${level}' for '${dim.id}' is not in declared levels.`,
      });
    }
    const threshold =
      dim.activatesAt !== undefined && dim.activatesAt !== null
        ? dim.activatesAt
        : defaultActivatesAt(levels);
    if (threshold == null) {
      return baseResult({
        matched: false,
        warning: `Rubric dimension '${dim.id}' has no activatesAt / levels to compare.`,
      });
    }
    if (!(level >= threshold)) {
      activated = false;
    }
  }

  return {
    matched: true,
    activatesObservable: activated,
    rationale:
      procedure.description ||
      (activated
        ? "Rubric ratings meet dimension activate thresholds."
        : "Rubric ratings below dimension activate thresholds."),
  };
}

function eventType(ev) {
  if (ev == null) return null;
  if (typeof ev === "string") return ev;
  if (typeof ev !== "object") return null;
  return ev.type ?? ev.name ?? ev.event ?? null;
}

function deriveFirstMove(workProduct, config = {}) {
  if (workProduct?.firstMove != null) return workProduct.firstMove;
  if (workProduct?.firstSubstantiveMove != null) return workProduct.firstSubstantiveMove;

  const events = Array.isArray(workProduct?.events) ? workProduct.events : null;
  if (!events || events.length === 0) return null;

  const classByEvent =
    config.classByEvent && typeof config.classByEvent === "object"
      ? config.classByEvent
      : {};

  for (const ev of events) {
    const t = eventType(ev);
    if (!t) continue;
    if (Object.prototype.hasOwnProperty.call(classByEvent, t)) {
      return classByEvent[t];
    }
  }
  return null;
}

/**
 * Built-in process_log_v1 scorer.
 *
 * Config (required for activation — never invent from observableId):
 *   activateOnFirstMove: string, and/or
 *   activatingPatterns: responsePattern[] matched against
 *     `{ firstMove, events }` (and the raw work product).
 * Optional: classByEvent map to derive firstMove from events[];
 *           events[] as an allow-list (unknown types → warning).
 */
function scoreProcessLogV1(artifact, workProduct, procedure = {}) {
  const config = artifact?.config && typeof artifact.config === "object" ? artifact.config : {};
  const allowed = Array.isArray(config.events) ? config.events : null;
  const events = Array.isArray(workProduct?.events) ? workProduct.events : null;

  if (allowed && events) {
    for (const ev of events) {
      const t = eventType(ev);
      if (t && !allowed.includes(t)) {
        return baseResult({
          matched: false,
          warning: `Process log event '${t}' is not in artifact config.events.`,
        });
      }
    }
  }

  const firstMove = deriveFirstMove(workProduct, config);
  const features = {
    ...(workProduct && typeof workProduct === "object" ? workProduct : {}),
    firstMove,
    events: events || workProduct?.events,
  };

  const activateOn = config.activateOnFirstMove;
  const patterns = Array.isArray(config.activatingPatterns)
    ? config.activatingPatterns
    : Array.isArray(config.correctPatterns)
      ? config.correctPatterns
      : [];

  if (activateOn == null && patterns.length === 0) {
    return baseResult({
      matched: false,
      warning:
        "process_log_v1 artifact config needs activateOnFirstMove or activatingPatterns.",
    });
  }

  let hit = false;
  if (activateOn != null) {
    hit = firstMove === activateOn;
  }
  if (!hit && patterns.length > 0) {
    hit = patterns.some((p) => matchesResponsePattern(p, features));
  }

  if (hit) {
    return {
      matched: true,
      activatesObservable: true,
      rationale:
        procedure.description ||
        `process_log_v1 matched firstMove='${firstMove}'.`,
    };
  }

  // Declared activation rule present but not satisfied → explicit non-activation
  // (same shape as a key miss), not a "no pattern" warning.
  if (firstMove == null && !events?.length && workProduct?.firstMove == null) {
    return baseResult({
      matched: false,
      warning: "Work product has no process events or firstMove for process_log_v1.",
    });
  }

  return {
    matched: true,
    activatesObservable: false,
    rationale:
      procedure.description ||
      `process_log_v1 did not match (firstMove='${firstMove}').`,
  };
}

function matchKeyArtifact(artifact, workProduct, procedure = {}) {
  const patterns = artifact?.correctPatterns || [];
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return baseResult({
      matched: false,
      warning: "Key artifact has no correctPatterns.",
    });
  }
  const hit = patterns.find((p) => matchesResponsePattern(p, workProduct));
  if (hit) {
    return {
      matched: true,
      activatesObservable: true,
      rationale: procedure.description || "Matched evaluationProcedure key artifact.",
      responsePattern: hit,
    };
  }
  return {
    matched: true,
    activatesObservable: false,
    rationale: procedure.description || "Work product did not match evaluationProcedure key.",
  };
}

/**
 * Auto / process_log artifacts. Known scorers first; otherwise
 * activatingPatterns/correctPatterns on config against the raw WP.
 */
function matchAutoArtifact(artifact, workProduct, procedure = {}) {
  const scorerId = artifact?.scorerId || null;
  const kind = artifact?.kind;

  if (scorerId === "process_log_v1" || kind === "process_log") {
    return scoreProcessLogV1(
      kind === "process_log" && !artifact?.config && artifact?.eventSchema
        ? { ...artifact, config: artifact.eventSchema }
        : artifact,
      workProduct,
      procedure
    );
  }

  const config = artifact?.config && typeof artifact.config === "object" ? artifact.config : {};
  const patterns = Array.isArray(config.activatingPatterns)
    ? config.activatingPatterns
    : Array.isArray(config.correctPatterns)
      ? config.correctPatterns
      : Array.isArray(artifact?.correctPatterns)
        ? artifact.correctPatterns
        : [];

  if (patterns.length > 0) {
    const hit = patterns.find((p) => matchesResponsePattern(p, workProduct));
    if (hit) {
      return {
        matched: true,
        activatesObservable: true,
        rationale:
          procedure.description ||
          `Auto scorer '${scorerId || "config"}' matched activating pattern.`,
        responsePattern: hit,
      };
    }
    return {
      matched: true,
      activatesObservable: false,
      rationale:
        procedure.description ||
        `Auto scorer '${scorerId || "config"}' did not match activating patterns.`,
    };
  }

  if (scorerId) {
    return baseResult({
      matched: false,
      warning: `Unknown auto scorerId '${scorerId}' with no activatingPatterns.`,
    });
  }

  return baseResult({
    matched: false,
    warning: "Auto artifact has neither a known scorerId nor activatingPatterns.",
  });
}

/**
 * Apply a baked evaluationProcedure.artifact to a work product.
 * Returns null when there is no usable artifact (caller keeps prior behavior).
 */
export function applyEvaluationArtifact(evaluationProcedure, workProduct) {
  const artifact = evaluationProcedure?.artifact;
  if (!artifact || typeof artifact !== "object") return null;

  const kind = artifact.kind;
  const method = evaluationProcedure.method;

  if (kind === "key" || (!kind && method === "key")) {
    return matchKeyArtifact(artifact, workProduct, evaluationProcedure);
  }
  if (kind === "rubric" || (!kind && method === "rubric")) {
    return matchRubricArtifact(artifact, workProduct, evaluationProcedure);
  }
  if (
    kind === "auto" ||
    kind === "process_log" ||
    method === "auto" ||
    method === "process_log"
  ) {
    return matchAutoArtifact(artifact, workProduct, evaluationProcedure);
  }

  return baseResult({
    matched: false,
    warning: `Unsupported evaluationProcedure artifact.kind '${kind}'.`,
  });
}
