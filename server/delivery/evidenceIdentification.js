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
import { applyPhaseGate } from "./evaluationPhases.js";

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

function componentSets(item) {
  const components = item?.interaction?.responseComponents;
  if (!Array.isArray(components) || components.length === 0) return null;
  const correct = [];
  const incorrect = [];
  for (const component of components) {
    if (!component || component.id == null || component.id === "") continue;
    if (component.isCorrect === true) correct.push(component.id);
    else incorrect.push(component.id);
  }
  if (correct.length === 0) return null;
  return { correct, incorrect };
}

function selectedIds(workProduct) {
  if (!workProduct || typeof workProduct !== "object" || Array.isArray(workProduct)) return [];
  const selected = workProduct.selected;
  if (selected == null || selected === "") return [];
  return Array.isArray(selected) ? selected : [selected];
}

/**
 * The item wizard stores a dichotomous rule as `{ equalsCorrect: true }`.
 * A delivered work product is `{ selected: optionId }` and never carries
 * `equalsCorrect`. Resolve the abstract flag against the item's own
 * option keys before matching, so the client is not asked to assert
 * correctness.
 */
function patternResolvingEqualsCorrect(pattern, sets) {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) return pattern;
  if (typeof pattern.equalsCorrect !== "boolean" || !sets) return pattern;
  const ids = pattern.equalsCorrect ? sets.correct : sets.incorrect;
  if (ids.length === 0) return pattern;
  const rest = { ...pattern };
  delete rest.equalsCorrect;
  return { ...rest, selected: ids.length === 1 ? ids[0] : ids };
}

function isSkippedWorkProduct(workProduct) {
  if (workProduct == null || typeof workProduct !== "object" || Array.isArray(workProduct)) {
    return true;
  }
  return workProduct.skipped === true;
}

/**
 * A keyed dichotomous item has a defined correct selection: options marked
 * isCorrect, an equalsCorrect rule, or an activating pattern that names
 * selected option ids. A response that chooses something else is the
 * observable's 0, an observation, not a missing cell. An empty selection
 * or an explicit skip stays missing. A selection outside the declared
 * option list, when that list exists, stays missing too: it is not one of
 * this item's options.
 */
function observedKeyedMiss(item, activationMap, resolvedMap, optionSets, workProduct) {
  if (isSkippedWorkProduct(workProduct)) return false;
  const chosen = selectedIds(workProduct);
  if (chosen.length === 0) return false;

  const method = item?.scoring?.method || null;
  const dichotomous =
    method === "dichotomous" ||
    (activationMap || []).some((row) => typeof row?.responsePattern?.equalsCorrect === "boolean");
  if (!dichotomous) return false;

  const key = new Set(optionSets?.correct || []);
  for (const row of resolvedMap || []) {
    if (row?.activatesObservable !== true) continue;
    const selected = row?.responsePattern?.selected;
    if (selected == null || selected === "") continue;
    const ids = Array.isArray(selected) ? selected : [selected];
    for (const id of ids) {
      if (id != null && id !== "") key.add(id);
    }
  }
  if (key.size === 0) return false;

  if (optionSets) {
    const known = new Set([...(optionSets.correct || []), ...(optionSets.incorrect || [])]);
    if (!chosen.every((id) => known.has(id))) return false;
  }

  return chosen.every((id) => !key.has(id));
}

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

function workProductMeta(item, evaluationProcedure, db) {
  const wpId = item?.interaction?.workProductId ?? evaluationProcedure?.workProductId ?? null;
  if (!wpId) return { workProductId: evaluationProcedure?.workProductId ?? null, workProductType: evaluationProcedure?.workProductType ?? null };
  const wp = (db.workProducts || []).find((row) => row?.id === wpId);
  return {
    workProductId: wpId,
    workProductType: wp?.type ?? evaluationProcedure?.workProductType ?? null,
  };
}

/**
 * Identify one observable from a baked observation slot. The item's
 * evidenceActivationMap is only for the item's own observationId;
 * sibling observables use an empty map and their own procedure artifact.
 */
function identifyObservable({
  workProduct,
  item,
  db,
  observationId,
  evidenceRule,
  evaluationProcedure,
  activationMap,
  scoringSource,
  allowKeyedMiss = true,
}) {
  const observableId = observationId;
  const optionSets = componentSets(scoringSource);
  const resolvedMap = (activationMap || []).map((row) => ({
    ...row,
    responsePattern: patternResolvingEqualsCorrect(row.responsePattern, optionSets),
  }));

  let matchedEntry = resolvedMap.find((entryRow) =>
    matchesResponsePattern(entryRow.responsePattern, workProduct)
  );

  if (
    allowKeyedMiss &&
    !matchedEntry &&
    observedKeyedMiss(scoringSource, activationMap, resolvedMap, optionSets, workProduct)
  ) {
    matchedEntry = {
      activatesObservable: false,
      rationale: "The selected response is not the keyed option.",
    };
  }

  if (!matchedEntry && (activationMap || []).length === 0 && evaluationProcedure?.artifact) {
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
      return applyPhaseGate(
        {
          observationId,
          observableId,
          activated: null,
          direction: evidenceRule?.direction ?? null,
          strength: null,
          rationale: null,
          evaluationMethod: evaluationProcedure.method ?? null,
          evaluationProcedureId: evaluationProcedure.id ?? null,
          warning: artifactResult.warning,
          ...workProductMeta(item, evaluationProcedure, db),
        },
        evaluationProcedure
      );
    }
  }

  if (!matchedEntry) {
    return applyPhaseGate(
      {
        observationId,
        observableId,
        activated: null,
        direction: evidenceRule?.direction ?? null,
        strength: null,
        rationale: null,
        evaluationMethod: evaluationProcedure?.method ?? null,
        evaluationProcedureId: evaluationProcedure?.id ?? null,
        warning: `Work product did not match any declared responsePattern on item '${item.id}'.`,
        ...workProductMeta(item, evaluationProcedure, db),
      },
      evaluationProcedure
    );
  }

  if (typeof matchedEntry.activatesObservable !== "boolean") {
    return applyPhaseGate(
      {
        observationId,
        observableId,
        activated: null,
        direction: evidenceRule?.direction ?? null,
        strength: null,
        rationale: matchedEntry.rationale ?? null,
        evaluationMethod: evaluationProcedure?.method ?? null,
        evaluationProcedureId: evaluationProcedure?.id ?? null,
        warning: `Item '${item.id}''s matched activation rule does not declare activatesObservable as a boolean.`,
        ...workProductMeta(item, evaluationProcedure, db),
      },
      evaluationProcedure
    );
  }

  return applyPhaseGate(
    {
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
      ...workProductMeta(item, evaluationProcedure, db),
    },
    evaluationProcedure
  );
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
 *   identifications?: object[],
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
  const evidenceRule = entry.evidenceRule || null;
  const evaluationProcedure = entry.evaluationProcedure || null;
  const activationMap = entry.scoring?.evidenceActivationMap || [];
  const scoringSource = {
    interaction: entry.interactionParams || null,
    scoring: { method: entry.scoring?.method ?? null },
  };

  const primary = identifyObservable({
    workProduct,
    item,
    db,
    observationId,
    evidenceRule,
    evaluationProcedure,
    activationMap,
    scoringSource,
  });

  const extras = [];
  for (const extra of entry.additionalObservations || []) {
    if (!extra?.observationId || extra.observationId === observationId) continue;
    extras.push(
      identifyObservable({
        workProduct,
        item,
        db,
        observationId: extra.observationId,
        evidenceRule: extra.evidenceRule || null,
        evaluationProcedure: extra.evaluationProcedure || null,
        activationMap: [],
        scoringSource,
        allowKeyedMiss: false,
      })
    );
  }

  if (extras.length > 0) {
    primary.identifications = [{ ...primary }, ...extras];
  }
  return primary;
}

export function identificationsFrom(evidence) {
  if (!evidence) return [];
  if (Array.isArray(evidence.identifications) && evidence.identifications.length > 0) {
    return evidence.identifications;
  }
  return [evidence];
}

/**
 * Re-identify stored item responses whose activated flag is still null.
 * Completed sessions keep the raw option id; this applies the current
 * identification rules without asking the examinee to submit again.
 * Responses that still do not resolve are left unchanged.
 *
 * @returns {number} responses updated
 */
export function rescoreStoredItemResponses(db) {
  if (!db || !Array.isArray(db.sessions)) return 0;
  let updated = 0;
  for (const session of db.sessions) {
    for (const response of session?.responses || []) {
      if (!response?.itemId) continue;
      if (response.activated === true || response.activated === false) continue;
      const item = (db.items || []).find((row) => row.id === response.itemId);
      if (!item) continue;
      const raw = response.rawAnswer;
      const workProduct =
        raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { selected: raw };
      let evidence;
      try {
        evidence = identifyEvidence(workProduct, item, db, {
          taskModelId: item.taskModelId,
        });
      } catch {
        continue;
      }
      const match =
        identificationsFrom(evidence).find((row) => row.observationId === response.observationId) ||
        (response.observationId == null ? evidence : null);
      if (!match || match.refused || typeof match.activated !== "boolean") continue;
      response.activated = match.activated;
      response.direction = match.direction ?? response.direction ?? null;
      response.strength = match.strength ?? null;
      response.rationale = match.rationale ?? null;
      if (match.warning) response.warning = match.warning;
      else delete response.warning;
      updated += 1;
    }
  }
  return updated;
}
