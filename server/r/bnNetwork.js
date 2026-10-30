// Request-side checks for a Bayesian network calibration.
//
// The network is a tree: each latent and each observable has at most one
// parent, parents are latents, and the joint of the latent states stays
// inside the same cap exact scoring uses (64). Observables are binary.
// model.itemIds are the observable ids, in the same order as the
// response matrix columns and as network.observables.

const BN_MAX_STATES = 8;
const BN_MAX_JOINT = 64;

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parentIdOf(node) {
  if (!node || node.parentId == null || node.parentId === "") return "";
  return text(node.parentId);
}

function hasCycle(ids, parentOf) {
  const idSet = new Set(ids);
  for (const start of ids) {
    const seen = new Set();
    let current = parentOf[start];
    while (current && idSet.has(current)) {
      if (current === start || seen.has(current)) return true;
      seen.add(current);
      current = parentOf[current];
    }
  }
  return false;
}

/**
 * Errors for model.network on a family "bn" request. Empty means the
 * tree can be estimated. Does not look at the response matrix.
 */
export function bnNetworkErrors(model) {
  const errors = [];
  const network = model?.network;
  if (!network || typeof network !== "object" || Array.isArray(network)) {
    return ["model.network is required for family bn"];
  }

  const rawLatents = network.latents;
  const rawObservables = network.observables;
  if (!Array.isArray(rawLatents) || rawLatents.length < 1) {
    return ["model.network.latents must name at least one latent"];
  }
  if (!Array.isArray(rawObservables) || rawObservables.length < 2) {
    errors.push("model.network.observables must name at least two observables");
  }

  const latents = [];
  const seen = new Set();
  for (let i = 0; i < rawLatents.length; i += 1) {
    const node = rawLatents[i];
    const id = text(node?.id);
    if (!id) {
      errors.push(`model.network.latents[${i}].id is required`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`model.network id '${id}' is not unique`);
      continue;
    }
    seen.add(id);
    const states = Array.isArray(node?.states)
      ? node.states.map((state) => text(state)).filter(Boolean)
      : [];
    if (states.length < 2) {
      errors.push(`model.network.latents[${i}] needs at least two states`);
    } else if (states.length > BN_MAX_STATES) {
      errors.push(
        `model.network.latents[${i}] has ${states.length} states. Exact EM supports at most ${BN_MAX_STATES}.`
      );
    } else if (new Set(states).size !== states.length) {
      errors.push(`model.network.latents[${i}] repeats a state`);
    }
    latents.push({ id, states, parentId: parentIdOf(node) });
  }

  const latentIds = new Set(latents.map((node) => node.id));
  const observables = [];
  if (Array.isArray(rawObservables)) {
    for (let i = 0; i < rawObservables.length; i += 1) {
      const node = rawObservables[i];
      const id = text(node?.id);
      if (!id) {
        errors.push(`model.network.observables[${i}].id is required`);
        continue;
      }
      if (seen.has(id)) {
        errors.push(`model.network id '${id}' is not unique`);
        continue;
      }
      seen.add(id);
      const parentId = parentIdOf(node);
      if (!parentId || !latentIds.has(parentId)) {
        errors.push(`model.network.observables[${i}] must name a latent parent`);
      }
      observables.push({ id, parentId });
    }
  }

  const parentOf = {};
  let roots = 0;
  for (const node of latents) {
    if (!node.parentId) {
      roots += 1;
      continue;
    }
    if (!latentIds.has(node.parentId)) {
      errors.push(`model.network latent '${node.id}' must name a latent parent`);
      continue;
    }
    if (node.parentId === node.id) {
      errors.push(`model.network latent '${node.id}' cannot be its own parent`);
      continue;
    }
    parentOf[node.id] = node.parentId;
  }
  if (latents.length && roots < 1) {
    errors.push("model.network needs a latent with no parent");
  }
  if (hasCycle(latents.map((node) => node.id), parentOf)) {
    errors.push("model.network latent edges form a cycle");
  }

  let joint = 1;
  for (const node of latents) {
    const count = node.states.length >= 2 ? node.states.length : 0;
    if (!count) continue;
    joint *= count;
    if (joint > BN_MAX_JOINT) {
      errors.push(
        `model.network joint has ${joint} latent configurations. Exact EM supports at most ${BN_MAX_JOINT}.`
      );
      break;
    }
  }

  const observableIds = observables.map((node) => node.id);
  const itemIds = Array.isArray(model?.itemIds) ? model.itemIds.map((id) => (id == null ? "" : String(id))) : [];
  if (
    observableIds.length >= 2 &&
    (itemIds.length !== observableIds.length || itemIds.some((id, i) => id !== observableIds[i]))
  ) {
    errors.push("model.itemIds must match model.network.observables in order");
  }

  return errors;
}
