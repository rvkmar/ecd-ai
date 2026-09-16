// server/delivery/evidenceIdentification.js
//
// Day 27 (Week 6): "Evidence Identification — the break that makes
// everything upstream inert" (build reference Part 2, Step 25). Applies
// an item's evidence-activation map against the bound evidence rule to
// turn a raw work product into an OBSERVABLE VARIABLE VALUE. The output
// is deliberately NOT a score, NOT a correct/incorrect flag, and NOT a
// point value -- Evidence Accumulation (Week 7-8) is where a measurement
// model turns this into a posterior update. Conflating the two here is
// exactly the bug Day 26's map found: SessionPlayer.jsx computes
// "correctness" client-side today by comparing a `correctOptionId` field
// questionsRoutes.js never writes, so every MCQ submission silently
// scores 0 regardless of the answer. This module replaces that
// comparison outright, not ports it.
//
// D49c: structural facts come from the ACTIVE compositeLibrary package
// for the item's Task Model (ADR 0003 / 0003a), not from a live re-walk
// of db.evidenceModels + item.scoring.evidenceActivationMap. A missing,
// inactive, or stale package is a REFUSAL, not a warning on a recorded
// null identification -- recording that would look like "the work
// product matched no pattern" and quietly drop the response. Calibrated
// parameters are still Accumulation's concern and are still resolved
// live from parameterSets[] (ADR 0003: never bake them in).
//
// Pure computation (no persistence), matching the style already
// established for compositeLibrary/builder.js and
// classicalCalibration.js: takes data in, returns data out.

import { resolveIdentificationStructure } from "../compositeLibrary/activePackage.js";
import {
  applyEvaluationArtifact,
  matchesResponsePattern,
} from "./evaluationArtifacts.js";

/**
 * True if `pattern`'s keys all match the corresponding keys on
 * `workProduct`. Both the pattern's value and the work product's value are
 * normalized to arrays and compared for overlap ("any of these matches any
 * of those") -- so a single-value pattern against a single-value response
 * is an equality check (the common MCQ case, unchanged from the original
 * design), a multi-valued PATTERN against a single-value response is "any
 * of these" (`{ selected: ["opt_b","opt_c"] }` matches `selected: "opt_c"`
 * -- the literal shape samples/sample-items.json uses), and -- Day 30, an
 * adversarial-review finding -- a single-valued pattern against a
 * multi-select RESPONSE (`selected: ["opt_a","opt_c"]`) or a multi-valued
 * pattern against a multi-select response both now resolve by the same
 * overlap rule, rather than the multi-select response silently never
 * matching anything at all (arrays being compared by reference always
 * failed strict equality, and never appeared inside another array either).
 *
 * An empty pattern (`{}`, or no keys at all) NEVER matches, regardless of
 * work product. `Object.entries({}).every(...)` is vacuously true, which
 * would otherwise make an empty pattern match every possible response --
 * exactly the "matches everything and nothing" footgun this codebase
 * already flags for the authoring side (ecdVocabulary.js's
 * RESPONSE_PATTERN_FIELDS comments) but had not, before this check, guarded
 * against on the matching side too. Caught by an adversarial review of this
 * module (Day 27).
 *
 * Pattern matching lives in evaluationArtifacts.js (shared with key /
 * auto activatingPatterns); re-exported here only via the import above.
 */

function emptyIdentification(observationId, extras = {}) {
  return {
    observationId,
    observableId: null,
    activated: null,
    direction: null,
    strength: null,
    rationale: null,
    ...extras,
  };
}

/**
 * Identify the Observable Variable value a work product provides for one
 * Item, by matching it against the PACKAGE-BAKED evidenceActivationMap
 * and evidenceRule (ADR 0003a).
 *
 * Refuses (returns `{ refused: true, error }`, never throws) when there
 * is no active package, the package is stale, or the item is not in it.
 * The submit path turns that into a 409. Degrades gracefully (a result
 * carrying a `warning`, not a refusal) for data-quality problems inside
 * an otherwise usable package: a work product that matches none of the
 * baked response patterns, or a matched entry that forgot
 * `activatesObservable`. Only throws for programmer errors (missing
 * required arguments), matching compositeLibrary/builder.js's convention.
 *
 * @param {object} workProduct - the raw response, e.g. `{ selected: "opt_a" }`
 * @param {object} item - needs observationId and id; taskModelId is read
 *   from the item or from `options.taskModelId`
 * @param {object} db - the full db snapshot (needs .compositeLibrary,
 *   .taskModels, .evidenceModels for the staleness check)
 * @param {{ taskModelId?: string }} [options]
 * @returns {{
 *   observationId: string,
 *   observableId: string|null,
 *   activated: boolean|null,
 *   direction: string|null,
 *   strength: number|null,
 *   rationale: string|null,
 *   evaluationMethod?: string|null,
 *   evaluationProcedureId?: string|null,
 *   warning?: string,
 *   refused?: boolean,
 *   error?: string,
 * }}
 */
export function identifyEvidence(workProduct, item, db, options = {}) {
  if (!item || !item.observationId) {
    throw new Error("identifyEvidence requires an item with an observationId.");
  }
  if (!db) {
    throw new Error("identifyEvidence requires a db snapshot to resolve the composite library package.");
  }

  const resolved = resolveIdentificationStructure(item, db, options);

  if (!resolved.ok) {
    return emptyIdentification(item.observationId, {
      refused: true,
      error: resolved.error,
      warning: resolved.error,
    });
  }

  const entry = resolved.entry;
  const observationId = entry.observationId || item.observationId;
  // The package entry's observationId IS the observable id in this chain
  // (an Item's observationId must be declared on the Task Model and match
  // an Evidence Model observable). The builder does not store a separate
  // observableId field.
  const observableId = observationId;
  const evidenceRule = entry.evidenceRule || null;
  const evaluationProcedure = entry.evaluationProcedure || null;
  const activationMap = entry.scoring?.evidenceActivationMap || [];

  // Prefer item activation map. Only when the map is empty, fall back to
  // the baked evaluationProcedure artifact (EM-R1: key | rubric | auto |
  // process_log). A non-empty map that fails to match stays a "no pattern"
  // warning — do not reinterpret it as artifact-based non-activation.
  let matchedEntry = activationMap.find((entryRow) =>
    matchesResponsePattern(entryRow.responsePattern, workProduct)
  );

  if (!matchedEntry && activationMap.length === 0 && evaluationProcedure?.artifact) {
    const artifactResult = applyEvaluationArtifact(evaluationProcedure, workProduct);
    if (artifactResult?.matched) {
      if (typeof artifactResult.activatesObservable === "boolean") {
        matchedEntry = {
          responsePattern: artifactResult.responsePattern ?? null,
          activatesObservable: artifactResult.activatesObservable,
          rationale: artifactResult.rationale,
        };
      }
    } else if (artifactResult?.warning) {
      return {
        observationId,
        observableId,
        activated: null,
        direction: evidenceRule?.direction ?? null,
        strength: null,
        rationale: null,
        evaluationMethod: evaluationProcedure.method ?? null,
        evaluationProcedureId: evaluationProcedure.id ?? null,
        warning: artifactResult.warning,
      };
    }
  }

  if (!matchedEntry) {
    return {
      observationId,
      observableId,
      activated: null,
      direction: evidenceRule?.direction ?? null,
      strength: null,
      rationale: null,
      evaluationMethod: evaluationProcedure?.method ?? null,
      evaluationProcedureId: evaluationProcedure?.id ?? null,
      warning: `Work product did not match any declared responsePattern on item '${item.id}'.`,
    };
  }

  // A matched entry missing `activatesObservable` (an authoring mistake --
  // schema.js requires it be a strict boolean at confirm-time, but this
  // function accepts any item argument and shouldn't silently coerce
  // `undefined` to `false`, indistinguishable from a deliberate
  // non-activating rule). Caught by an adversarial review of this module.
  if (typeof matchedEntry.activatesObservable !== "boolean") {
    return {
      observationId,
      observableId,
      activated: null,
      direction: evidenceRule?.direction ?? null,
      strength: null,
      rationale: matchedEntry.rationale ?? null,
      evaluationMethod: evaluationProcedure?.method ?? null,
      evaluationProcedureId: evaluationProcedure?.id ?? null,
      warning: `Item '${item.id}''s matched activation rule does not declare activatesObservable as a boolean.`,
    };
  }

  return {
    observationId,
    observableId,
    activated: matchedEntry.activatesObservable,
    direction: evidenceRule?.direction ?? null,
    strength: matchedEntry.strengthOverride ?? evidenceRule?.strengthLevel ?? null,
    rationale:
      matchedEntry.rationale ??
      evidenceRule?.justification ??
      evaluationProcedure?.description ??
      null,
    evaluationMethod: evaluationProcedure?.method ?? null,
    evaluationProcedureId: evaluationProcedure?.id ?? null,
  };
}
