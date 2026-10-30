// TU6. Opt-in bundle scoring and Q3 bundling suggestions.
//
// A bundle is a group of dichotomous items that share a work product or a
// passage. When the author sets enabled: true, the next IRT calibration
// replaces those columns with one sum score and fits it as a graded
// response (GRM) item. Delivery uses that sum only when the parameter set
// the response was scored against records the bundle. Absent scoringBundles
// means each item stays an independent 0/1 likelihood, which is today's
// behaviour.
//
// Yen's Q3 flag is |Q3| above 0.2 (Yen 1984). The summary on the job is
// the authority for which pairs are flagged. This module does not refit Q3.

export const Q3_ABS_THRESHOLD = 0.2;

export const SCORING_BUNDLE_BASES = ["workProduct", "passage"];

const DICHOTOMOUS_IRT_SUBTYPES = ["2PL", "3PL", "Rasch"];

const SLIM_BUNDLE_KEYS = new Set([
  "id",
  "enabled",
  "basis",
  "sourceId",
  "itemIds",
  "model",
  "maxScore",
  "label",
]);

function text(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    const id = text(entry);
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function passageHash(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function blockText(block) {
  if (!block || typeof block !== "object") return "";
  const content = block.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.passage === "string") return content.passage;
  }
  if (typeof block.text === "string") return block.text;
  return "";
}

export function workProductIdOf(item) {
  return text(item?.interaction?.workProductId) || null;
}

// Shared passage identity. An explicit stimulus.passageId or
// stimulus.sharedStimulusId wins. Otherwise a passage_based item is grouped
// with others whose text blocks carry the same passage (at least 24
// characters, whitespace collapsed).
export function passageKeyOf(item) {
  const stimulus = item?.stimulus;
  if (!stimulus || typeof stimulus !== "object" || Array.isArray(stimulus)) return null;
  const explicit = text(stimulus.passageId) || text(stimulus.sharedStimulusId);
  if (explicit) return explicit;
  if (stimulus.layout !== "passage_based") return null;
  const blocks = Array.isArray(stimulus.blocks) ? stimulus.blocks : [];
  const chunks = [];
  for (const block of blocks) {
    const normalized = blockText(block).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.length >= 24) chunks.push(normalized);
  }
  if (!chunks.length) return null;
  return `passage:${passageHash(chunks.join("\n"))}`;
}

function sameIdSet(left, right) {
  const a = uniqueStrings(left).slice().sort();
  const b = uniqueStrings(right).slice().sort();
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function bundleIdFor(basis, sourceId) {
  const slug = text(sourceId).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
  const basisSlug = text(basis).replace(/[^A-Za-z0-9]+/g, "") || "group";
  return `bundle_${basisSlug}_${slug || "items"}`;
}

export function bundleAlreadyEnabled(scoringBundles, candidate) {
  if (!candidate || !Array.isArray(scoringBundles)) return false;
  return scoringBundles.some(
    (row) => row?.enabled === true && sameIdSet(row.itemIds, candidate.itemIds)
  );
}

export function mergeEnabledBundle(existing, candidate) {
  const itemIds = uniqueStrings(candidate?.itemIds);
  const basis = text(candidate?.basis);
  const sourceId = text(candidate?.sourceId);
  const id = text(candidate?.id) || bundleIdFor(basis, sourceId);
  const nextRow = {
    id,
    enabled: true,
    basis,
    sourceId,
    itemIds,
  };
  const label = text(candidate?.label);
  if (label) nextRow.label = label;
  const member = new Set(itemIds);
  const kept = (Array.isArray(existing) ? existing : []).filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (text(row.id) === id) return false;
    return !uniqueStrings(row.itemIds).some((itemId) => member.has(itemId));
  });
  return [...kept, nextRow];
}

function groupsByKey(items, keyOf) {
  const groups = new Map();
  for (const item of items || []) {
    const itemId = text(item?.id);
    const key = itemId ? keyOf(item) : null;
    if (!itemId || !key) continue;
    if (!groups.has(key)) groups.set(key, []);
    const list = groups.get(key);
    if (!list.includes(itemId)) list.push(itemId);
  }
  return groups;
}

// Flagged Q3 pairs whose items share a work product or a passage.
// The candidate lists every known item on that shared key, not only the
// pair, once at least one flagged pair sits inside the group.
export function bundleCandidates(flaggedPairs, items) {
  const pairs = Array.isArray(flaggedPairs) ? flaggedPairs : [];
  const known = new Set((items || []).map((item) => text(item?.id)).filter(Boolean));
  const flaggedInside = (itemIds) =>
    pairs.filter((pair) => {
      const a = text(pair?.itemId1);
      const b = text(pair?.itemId2);
      return a && b && itemIds.includes(a) && itemIds.includes(b);
    });

  const candidates = [];
  const specs = [
    ["workProduct", (item) => workProductIdOf(item)],
    ["passage", (item) => passageKeyOf(item)],
  ];
  for (const [basis, keyOf] of specs) {
    for (const [sourceId, itemIds] of groupsByKey(items, keyOf)) {
      if (itemIds.length < 2) continue;
      const hits = flaggedInside(itemIds);
      if (!hits.length) continue;
      const present = itemIds.filter((id) => known.has(id));
      if (present.length < 2) continue;
      candidates.push({
        basis,
        sourceId,
        itemIds: present,
        id: bundleIdFor(basis, sourceId),
        pairs: hits.map((pair) => ({
          itemId1: text(pair.itemId1),
          itemId2: text(pair.itemId2),
          q3: typeof pair.q3 === "number" ? pair.q3 : null,
        })),
      });
    }
  }
  return candidates;
}

export function scoringBundleEntryIsSlim(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  return Object.keys(row).every((key) => SLIM_BUNDLE_KEYS.has(key));
}

export function scoringBundlesForParameterSet(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const rows = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const id = text(row.id);
    const itemIds = uniqueStrings(row.itemIds);
    if (!id || itemIds.length < 2) continue;
    const next = {
      id,
      itemIds,
      model: text(row.model) || "GRM",
    };
    const basis = text(row.basis);
    const sourceId = text(row.sourceId);
    const label = text(row.label);
    if (basis) next.basis = basis;
    if (sourceId) next.sourceId = sourceId;
    if (label) next.label = label;
    if (Number.isInteger(row.maxScore) && row.maxScore >= 1) next.maxScore = row.maxScore;
    rows.push(next);
  }
  return rows.length ? rows : undefined;
}

function rowErrors(row, index, db) {
  const errors = [];
  const where = `scoringBundles[${index}]`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    errors.push(`${where} should be an object`);
    return errors;
  }
  const id = text(row.id);
  if (!id) errors.push(`${where}.id is required`);
  if (row.enabled !== undefined && typeof row.enabled !== "boolean") {
    errors.push(`${where}.enabled should be a boolean`);
  }
  const basis = text(row.basis);
  if (!SCORING_BUNDLE_BASES.includes(basis)) {
    errors.push(`${where}.basis must be workProduct or passage`);
  }
  const sourceId = text(row.sourceId);
  if (!sourceId) errors.push(`${where}.sourceId is required`);
  const itemIds = uniqueStrings(row.itemIds);
  if (!Array.isArray(row.itemIds) || itemIds.length < 2) {
    errors.push(`${where}.itemIds must name at least two items`);
  }
  if (row.label !== undefined && row.label !== null && typeof row.label !== "string") {
    errors.push(`${where}.label should be a string`);
  } else if (text(row.label).length > 200) {
    errors.push(`${where}.label must be at most 200 characters`);
  }
  if (id && itemIds.includes(id)) {
    errors.push(`${where}.id must not be one of its itemIds`);
  }

  const items = Array.isArray(db?.items) ? db.items : null;
  if (items && itemIds.length) {
    for (const itemId of itemIds) {
      const item = items.find((entry) => entry?.id === itemId);
      if (!item) {
        errors.push(`${where}.itemIds '${itemId}' was not found`);
        continue;
      }
      if (basis === "workProduct" && sourceId && workProductIdOf(item) !== sourceId) {
        errors.push(`${where} item '${itemId}' does not use work product '${sourceId}'`);
      }
      if (basis === "passage" && sourceId && passageKeyOf(item) !== sourceId) {
        errors.push(`${where} item '${itemId}' does not share passage '${sourceId}'`);
      }
    }
  }
  return errors;
}

export function scoringBundleAuthoringErrors(value, db) {
  if (value == null) return [];
  if (!Array.isArray(value)) return ["scoringBundles should be an array"];
  const errors = [];
  const seenIds = new Set();
  const seenItems = new Set();
  value.forEach((row, index) => {
    errors.push(...rowErrors(row, index, db));
    const id = text(row?.id);
    if (id) {
      if (seenIds.has(id)) errors.push(`scoringBundles id '${id}' is duplicated`);
      seenIds.add(id);
    }
    for (const itemId of uniqueStrings(row?.itemIds)) {
      if (seenItems.has(itemId)) {
        errors.push(`item '${itemId}' is in more than one scoring bundle`);
      }
      seenItems.add(itemId);
    }
  });
  return errors;
}

export function normalizeScoringBundles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const next = {
      id: text(row?.id),
      enabled: row?.enabled === true,
      basis: text(row?.basis),
      sourceId: text(row?.sourceId),
      itemIds: uniqueStrings(row?.itemIds),
    };
    const label = text(row?.label);
    if (label) next.label = label;
    return next;
  });
}

// Enabled bundles whose members are all in this calibration's item list.
// A partial group is left as separate items rather than summed.
export function calibrationBundlesFromEvidenceModel(evidenceModel, itemIds) {
  const available = new Set(uniqueStrings(itemIds));
  const used = new Set();
  const out = [];
  const rows = Array.isArray(evidenceModel?.scoringBundles) ? evidenceModel.scoringBundles : [];
  for (const row of rows) {
    if (row?.enabled !== true) continue;
    const id = text(row.id);
    const members = uniqueStrings(row.itemIds);
    if (!id || members.length < 2) continue;
    if (available.has(id)) continue;
    if (members.some((itemId) => !available.has(itemId) || used.has(itemId))) continue;
    members.forEach((itemId) => used.add(itemId));
    const bundle = {
      id,
      itemIds: members,
    };
    const basis = text(row.basis);
    const sourceId = text(row.sourceId);
    if (basis) bundle.basis = basis;
    if (sourceId) bundle.sourceId = sourceId;
    out.push(bundle);
  }
  return out;
}

export function calibrationBundleRequestErrors(body) {
  if (body?.bundles == null) return [];
  const errors = [];
  if (body?.model?.family !== "irt") {
    errors.push("bundles are only supported for an IRT request");
    return errors;
  }
  const subtype = body.model?.subtype;
  if (subtype && !DICHOTOMOUS_IRT_SUBTYPES.includes(subtype)) {
    errors.push("bundles apply to a dichotomous IRT subtype (2PL, 3PL, or Rasch)");
  }
  if (!Array.isArray(body.bundles)) {
    errors.push("bundles should be an array");
    return errors;
  }
  const itemIds = Array.isArray(body.model?.itemIds) ? body.model.itemIds : [];
  const itemSet = new Set(itemIds.filter((id) => typeof id === "string"));
  const used = new Set();
  body.bundles.forEach((row, index) => {
    const where = `bundles[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${where} should be an object`);
      return;
    }
    const id = text(row.id);
    if (!id) errors.push(`${where}.id is required`);
    else if (itemSet.has(id)) errors.push(`${where}.id collides with an item column`);
    const members = uniqueStrings(row.itemIds);
    if (members.length < 2) errors.push(`${where}.itemIds must name at least two items`);
    for (const itemId of members) {
      if (!itemSet.has(itemId)) errors.push(`${where}.itemIds '${itemId}' is not in model.itemIds`);
      if (used.has(itemId)) errors.push(`${where} item '${itemId}' is already in another bundle`);
      used.add(itemId);
    }
  });
  return errors;
}

export function bundlesOnParameterSet(parameterSet) {
  const rows = scoringBundlesForParameterSet(parameterSet?.scoringBundles);
  if (!rows) return [];
  return rows.filter((row) => row.model === "GRM");
}

function emptyPlan() {
  return { observations: [], consumed: new Set(), warnings: [], excluded: 0 };
}

// Collapse administered bundle members into one graded observation.
// A parameter set with no scoringBundles returns an empty plan, so the
// caller scores each response on its own.
export function planBundleScoring(responses, parameterSet, scoreOne) {
  const bundles = bundlesOnParameterSet(parameterSet);
  if (!bundles.length || !Array.isArray(responses)) return emptyPlan();
  const consumed = new Set();
  const observations = [];
  const warnings = [];
  let excluded = 0;
  const paramsMap = parameterSet?.parameters || {};

  const consumeMembers = (itemIds) => {
    let count = 0;
    for (let i = 0; i < responses.length; i += 1) {
      if (!itemIds.includes(text(responses[i]?.itemId))) continue;
      if (consumed.has(i)) continue;
      consumed.add(i);
      count += 1;
    }
    return count;
  };

  for (const bundle of bundles) {
    const itemIds = bundle.itemIds;
    if (itemIds.some((itemId) => {
      for (let i = 0; i < responses.length; i += 1) {
        if (consumed.has(i)) continue;
        if (text(responses[i]?.itemId) === itemId) return false;
      }
      return true;
    })) {
      const any = itemIds.some((itemId) =>
        responses.some((row, index) => !consumed.has(index) && text(row?.itemId) === itemId)
      );
      if (!any) continue;
      const dropped = consumeMembers(itemIds);
      excluded += dropped;
      warnings.push(
        `Bundle '${bundle.id}' is missing a member response, so its items were not scored as separate items.`
      );
      continue;
    }

    const chosen = [];
    for (const itemId of itemIds) {
      let found = -1;
      for (let i = responses.length - 1; i >= 0; i -= 1) {
        if (consumed.has(i)) continue;
        if (text(responses[i]?.itemId) === itemId) {
          found = i;
          break;
        }
      }
      chosen.push(found);
    }

    let sum = 0;
    let badItemId = null;
    for (let k = 0; k < chosen.length; k += 1) {
      const scored = typeof scoreOne === "function" ? scoreOne(responses[chosen[k]]) : null;
      if (scored?.u !== 0 && scored?.u !== 1) {
        badItemId = itemIds[k];
        break;
      }
      sum += scored.u;
    }
    const dropped = consumeMembers(itemIds);
    if (badItemId) {
      excluded += dropped;
      warnings.push(
        `Bundle '${bundle.id}' has a response for '${badItemId}' with no usable direction, so the bundle was excluded.`
      );
      continue;
    }

    const params = paramsMap[bundle.id];
    const thresholds = Array.isArray(params?.thresholds) && params.thresholds.length
      ? params.thresholds
      : Array.isArray(params?.b) && params.b.length
        ? params.b
        : null;
    if (!params || !thresholds) {
      excluded += dropped;
      warnings.push(
        `Bundle '${bundle.id}' has no graded parameters on this parameter set, so the bundle was excluded.`
      );
      continue;
    }
    if (!Number.isInteger(sum) || sum < 0 || sum > thresholds.length) {
      excluded += dropped;
      warnings.push(
        `Bundle '${bundle.id}' sum ${sum} is outside 0..${thresholds.length}, so the bundle was excluded.`
      );
      continue;
    }
    observations.push({
      u: sum,
      params,
      itemId: bundle.id,
      observableId: bundle.id,
    });
  }

  return { observations, consumed, warnings, excluded };
}
