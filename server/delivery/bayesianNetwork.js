// Exact Bayesian network accumulation for the networks this app authors.
//
// A one-latent model is a naive Bayes star: one discrete student model
// variable, binary observables independent given that variable. That path
// is unchanged. A small tree of latents is also scored: latent-to-latent
// edges, each node at most one parent, exact enumeration of the joint
// (at most MAX_BN_JOINT_CONFIGS configurations), then a marginal for each
// student model variable. A cycle, two parents, an observable-observable
// edge, a continuous variable, or a joint larger than that cap is refused
// with a reason. It is not scored.
//
// structureConfig.latentNodes names the latents. observableIds and edges
// name the evidence and the directed parents. The conditional probability
// table is structureConfig.cpt or a bayesian-cpt parameter set. For a
// star, structureConfig.smvId (or a latent node id that is itself an SMV
// id) binds the one variable. For a tree, each latent node id is an SMV
// id.
//
// Inference is exact, in process, in log space. There is no external
// service and no new dependency.
//
// D129 jointPrior is a continuous multivariate normal. It is not a
// discrete network prior, and this module does not read it.
//
// bnPosteriors[smvId] is the probability of the last state. For a binary
// variable whose states are [not_mastered, mastered], that is P(mastered).
// The full distribution is stored on smvPosteriors[smvId].distribution.

const MAX_BN_STATES = 8;
const MAX_BN_OBSERVABLES = 64;
const MAX_BN_JOINT_CONFIGS = 64;
export const BAYESIAN_NETWORK_FAMILY = "bayesian_network";

const DISCRETE_SMV_TYPES = ["binary", "ordinal", "categorical"];

function modelId(statisticalModel) {
  return statisticalModel?.id || "(missing id)";
}

function stateToken(entry) {
  if (typeof entry === "string" && entry.trim()) return entry.trim();
  if (entry && typeof entry === "object") {
    const token = entry.value || entry.id;
    if (typeof token === "string" && token.trim()) return token.trim();
  }
  return null;
}

function statesOfStudentModelVariable(smv) {
  const authored = Array.isArray(smv?.scale?.states)
    ? smv.scale.states.map(stateToken).filter(Boolean)
    : [];
  if (authored.length >= 2) return authored;
  if (smv?.type === "binary") return ["not_mastered", "mastered"];
  return null;
}

function cptRow(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const levels = entry.levels && typeof entry.levels === "object" && !Array.isArray(entry.levels)
    ? entry.levels
    : entry;
  const row = {};
  for (const [state, probability] of Object.entries(levels)) {
    if (state.startsWith("_")) continue;
    if (typeof probability === "number" && Number.isFinite(probability)) row[state] = probability;
  }
  return row;
}

function conditionalProbabilityTable(parameters) {
  const table = {};
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return table;
  for (const [key, entry] of Object.entries(parameters)) {
    if (key.startsWith("_")) continue;
    const row = cptRow(entry);
    if (row && Object.keys(row).length > 0) table[key] = row;
  }
  return table;
}

function rowProblems(row, states, label) {
  if (!row) return [`${label} is missing.`];
  const problems = [];
  for (const state of states) {
    const probability = row[state];
    if (typeof probability !== "number" || !Number.isFinite(probability)) {
      problems.push(`${label} is missing a probability for state '${state}'.`);
    } else if (probability < 0 || probability > 1) {
      problems.push(`${label} has a probability outside 0 to 1 for state '${state}'.`);
    }
  }
  return problems;
}

function priorFromMap(map, states, label) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { error: `${label} is missing.` };
  }
  const prior = {};
  let total = 0;
  for (const state of states) {
    const probability = map[state];
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      return { error: `${label} must give a probability between 0 and 1 for state '${state}'.` };
    }
    prior[state] = probability;
    total += probability;
  }
  if (Math.abs(total - 1) > 0.01) {
    return { error: `${label} must sum to 1 across states (currently ${total.toFixed(3)}).` };
  }
  if (total !== 1) {
    for (const state of states) prior[state] /= total;
  }
  return { prior };
}

function priorFromStudentModelVariable(smv, states) {
  const family = smv?.priorDistribution?.family;
  const params = smv?.priorDistribution?.params || {};
  const label = `Student Model Variable '${smv?.id}' prior`;

  if (states.length === 2 && family === "bernoulli" && typeof params.p === "number") {
    if (params.p < 0 || params.p > 1) {
      return { error: `${label} has a bernoulli probability outside 0 to 1.` };
    }
    return { prior: { [states[0]]: 1 - params.p, [states[1]]: params.p } };
  }

  if (states.length === 2 && family === "beta" && typeof params.alpha === "number" && typeof params.beta === "number") {
    const total = params.alpha + params.beta;
    if (!(params.alpha > 0) || !(params.beta > 0) || !(total > 0)) {
      return { error: `${label} needs a beta prior with alpha > 0 and beta > 0.` };
    }
    const mastered = params.alpha / total;
    return { prior: { [states[0]]: 1 - mastered, [states[1]]: mastered } };
  }

  if (family === "dirichlet" && Array.isArray(params.alpha)) {
    if (params.alpha.length !== states.length || params.alpha.some((value) => typeof value !== "number" || !(value > 0))) {
      return {
        error: `${label} needs a dirichlet concentration for each of its ${states.length} states.`,
      };
    }
    const total = params.alpha.reduce((sum, value) => sum + value, 0);
    const prior = {};
    states.forEach((state, index) => {
      prior[state] = params.alpha[index] / total;
    });
    return { prior };
  }

  return {
    error: `${label} is not a usable ${smv?.type || "discrete"} prior. Set a bernoulli or beta prior on a binary variable, a dirichlet prior on an ordinal or categorical variable, or a prior on the Bayesian network parameter set.`,
  };
}

function uniqueIds(list) {
  const seen = new Set();
  const ids = [];
  for (const entry of list || []) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const id = entry.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function latentCycle(latentIds, parentOf) {
  const latents = new Set(latentIds);
  for (const start of latentIds) {
    const seen = new Set();
    let current = parentOf[start];
    while (current && latents.has(current)) {
      if (current === start || seen.has(current)) return true;
      seen.add(current);
      current = parentOf[current];
    }
  }
  return false;
}

function describeStructure(statisticalModel) {
  const id = modelId(statisticalModel);
  const config = statisticalModel?.structureConfig || {};
  const latentNodeIds = uniqueIds(config.latentNodes);
  if (latentNodeIds.length === 0) {
    return { error: `Bayesian model '${id}' must contain at least one latent node.` };
  }
  const observableIds = uniqueIds(config.observableIds);
  if (observableIds.length === 0) {
    return { error: `Bayesian model '${id}' lists no observable evidence nodes.` };
  }
  if (observableIds.length > MAX_BN_OBSERVABLES) {
    return {
      error: `Bayesian model '${id}' lists ${observableIds.length} observables. Exact inference here supports at most ${MAX_BN_OBSERVABLES} observables.`,
    };
  }
  for (const latentId of latentNodeIds) {
    if (observableIds.includes(latentId)) {
      return { error: `Bayesian model '${id}' uses '${latentId}' as both a latent node and an observable.` };
    }
  }

  const edges = Array.isArray(config.edges) ? config.edges : [];
  const star = latentNodeIds.length === 1;
  const latentNodeId = latentNodeIds[0];
  const parentOf = {};

  if (star) {
    for (const edge of edges) {
      if (!edge || edge.from !== latentNodeId || !observableIds.includes(edge.to)) {
        return {
          error: `Bayesian model '${id}' has an edge that is not from latent node '${latentNodeId}' to one of its observables. Only that star is scored.`,
        };
      }
    }
    for (const observableId of observableIds) parentOf[observableId] = latentNodeId;
    return { star: true, latentNodeId, latentNodeIds, observableIds, parentOf };
  }

  for (const edge of edges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      return { error: `Bayesian model '${id}' has an edge that is not a from/to pair.` };
    }
    const from = edge.from;
    const to = edge.to;
    if (!latentNodeIds.includes(from)) {
      return {
        error: `Bayesian model '${id}' has an edge from '${from}', which is not a latent node.`,
      };
    }
    const toLatent = latentNodeIds.includes(to);
    const toObservable = observableIds.includes(to);
    if (!toLatent && !toObservable) {
      return {
        error: `Bayesian model '${id}' has an edge to '${to}', which is not a latent node or an observable.`,
      };
    }
    if (parentOf[to]) {
      return {
        error: `Bayesian model '${id}' gives '${to}' more than one parent. Exact inference here scores a tree.`,
      };
    }
    parentOf[to] = from;
  }

  for (const observableId of observableIds) {
    if (!parentOf[observableId]) {
      return {
        error: `Bayesian model '${id}' observable '${observableId}' has no parent latent.`,
      };
    }
  }
  if (latentCycle(latentNodeIds, parentOf)) {
    return { error: `Bayesian model '${id}' latent edges form a cycle, so the network is not scored.` };
  }

  return { star: false, latentNodeId, latentNodeIds, observableIds, parentOf };
}

function resolveDiscreteStudentModelVariable(evidenceModel, statisticalModel, db) {
  const id = modelId(statisticalModel);
  const competency = (db?.competencies || []).find((row) => row && row.id === evidenceModel?.competencyId);
  if (!competency) {
    return {
      error: `Evidence model '${evidenceModel?.id}' references competency '${evidenceModel?.competencyId}', which was not found.`,
    };
  }
  const competencyModel = (db?.competencyModels || []).find((row) => row && row.id === competency.modelId);
  if (!competencyModel) {
    return {
      error: `Competency '${competency.id}' references competency model '${competency.modelId}', which was not found.`,
    };
  }
  const variables = competencyModel.smVariables || [];
  const discrete = variables.filter((variable) => DISCRETE_SMV_TYPES.includes(variable?.type));
  const declared = statisticalModel?.structureConfig?.smvId;
  const latent = Array.isArray(statisticalModel?.structureConfig?.latentNodes)
    ? statisticalModel.structureConfig.latentNodes[0]
    : null;

  let smv = null;
  if (declared) {
    smv = variables.find((variable) => variable && variable.id === declared) || null;
    if (!smv) {
      return {
        error: `Bayesian model '${id}' declares smvId '${declared}', which competency model '${competencyModel.id}' does not define.`,
      };
    }
  } else if (latent && variables.some((variable) => variable && variable.id === latent)) {
    smv = variables.find((variable) => variable && variable.id === latent) || null;
  } else if (discrete.length === 1) {
    smv = discrete[0];
  } else if (discrete.length === 0) {
    return {
      error: `Competency model '${competencyModel.id}' has no binary, ordinal, or categorical Student Model Variable for Bayesian model '${id}' to update.`,
    };
  } else {
    return {
      error: `Competency model '${competencyModel.id}' has ${discrete.length} discrete Student Model Variables and Bayesian model '${id}' does not say which it updates (structureConfig.smvId).`,
    };
  }

  if (!DISCRETE_SMV_TYPES.includes(smv.type)) {
    return {
      error: `Bayesian model '${id}' is bound to '${smv.id}', a ${smv.type} Student Model Variable. A categorical Bayesian network cannot update a continuous variable.`,
    };
  }

  const states = statesOfStudentModelVariable(smv);
  if (!states || states.length < 2) {
    return { error: `Student Model Variable '${smv.id}' needs at least two states before a Bayesian network can update it.` };
  }
  if (states.length > MAX_BN_STATES) {
    return {
      error: `Student Model Variable '${smv.id}' has ${states.length} states. Exact inference here supports at most ${MAX_BN_STATES} states on one variable.`,
    };
  }
  return { smv, states, competencyModelId: competencyModel.id };
}

function competencyModelFor(evidenceModel, db) {
  const competency = (db?.competencies || []).find((row) => row && row.id === evidenceModel?.competencyId);
  if (!competency) {
    return {
      error: `Evidence model '${evidenceModel?.id}' references competency '${evidenceModel?.competencyId}', which was not found.`,
    };
  }
  const competencyModel = (db?.competencyModels || []).find((row) => row && row.id === competency.modelId);
  if (!competencyModel) {
    return {
      error: `Competency '${competency.id}' references competency model '${competency.modelId}', which was not found.`,
    };
  }
  return { competencyModel };
}

function resolveLatentVariables(evidenceModel, statisticalModel, db, structure) {
  if (structure.star) {
    const one = resolveDiscreteStudentModelVariable(evidenceModel, statisticalModel, db);
    if (one.error) return one;
    return {
      star: true,
      smv: one.smv,
      states: one.states,
      competencyModelId: one.competencyModelId,
      latents: [{ id: one.smv.id, smv: one.smv, states: one.states }],
    };
  }

  const found = competencyModelFor(evidenceModel, db);
  if (found.error) return found;
  const variables = found.competencyModel.smVariables || [];
  const latents = [];
  let joint = 1;
  for (const latentId of structure.latentNodeIds) {
    const smv = variables.find((variable) => variable && variable.id === latentId) || null;
    if (!smv) {
      return {
        error: `Bayesian model '${modelId(statisticalModel)}' latent node '${latentId}' is not a Student Model Variable on competency model '${found.competencyModel.id}'.`,
      };
    }
    if (!DISCRETE_SMV_TYPES.includes(smv.type)) {
      return {
        error: `Bayesian model '${modelId(statisticalModel)}' is bound to '${smv.id}', a ${smv.type} Student Model Variable. A categorical Bayesian network cannot update a continuous variable.`,
      };
    }
    const states = statesOfStudentModelVariable(smv);
    if (!states || states.length < 2) {
      return { error: `Student Model Variable '${smv.id}' needs at least two states before a Bayesian network can update it.` };
    }
    if (states.length > MAX_BN_STATES) {
      return {
        error: `Student Model Variable '${smv.id}' has ${states.length} states. Exact inference here supports at most ${MAX_BN_STATES} states on one variable.`,
      };
    }
    joint *= states.length;
    latents.push({ id: latentId, smv, states });
  }
  if (joint > MAX_BN_JOINT_CONFIGS) {
    return {
      error: `Bayesian model '${modelId(statisticalModel)}' joint has ${joint} latent configurations. Exact inference here supports at most ${MAX_BN_JOINT_CONFIGS}.`,
    };
  }
  return { star: false, latents, competencyModelId: found.competencyModel.id };
}

function nestedStateTable(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const table = {};
  for (const [parentState, nested] of Object.entries(entry)) {
    if (parentState.startsWith("_")) continue;
    const row = cptRow(nested);
    if (row && Object.keys(row).length > 0) table[parentState] = row;
  }
  return Object.keys(table).length > 0 ? table : null;
}

function jointConfigs(latents) {
  let configs = [{}];
  for (const latent of latents) {
    const next = [];
    for (const config of configs) {
      for (const state of latent.states) {
        next.push({ ...config, [latent.id]: state });
      }
    }
    configs = next;
  }
  return configs;
}

function childCptProblems(table, parentStates, childStates, label) {
  const problems = [];
  if (!table) return [`${label} is missing.`];
  for (const parent of parentStates) {
    problems.push(...rowProblems(table[parent], childStates, `${label} given '${parent}'`));
  }
  return problems;
}

/**
 * Exact joint update over a tree of latents. Returns a map of latent id
 * to its marginal, or null when every configuration is impossible.
 */
function updateJointPosterior({ latents, parentOf, rootPriors, childCpts, observations, observableCpt }) {
  const configs = jointConfigs(latents);
  const logByConfig = [];
  for (const config of configs) {
    let logPosterior = 0;
    for (const latent of latents) {
      const parent = parentOf[latent.id];
      const state = config[latent.id];
      let probability;
      if (!parent) {
        probability = rootPriors[latent.id]?.[state];
      } else {
        probability = childCpts[latent.id]?.[config[parent]]?.[state];
      }
      if (!(probability > 0)) {
        logPosterior = -Infinity;
        break;
      }
      logPosterior += Math.log(probability);
    }
    if (Number.isFinite(logPosterior)) {
      for (const observation of observations) {
        const parent = parentOf[observation.observableId];
        const probability = observableCpt[observation.observableId]?.[config[parent]];
        const likelihood = observation.u === 1 ? probability : 1 - probability;
        if (!(likelihood > 0)) {
          logPosterior = -Infinity;
          break;
        }
        logPosterior += Math.log(likelihood);
      }
    }
    logByConfig.push(logPosterior);
  }

  const finite = logByConfig.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const maxLog = Math.max(...finite);
  let total = 0;
  const weights = logByConfig.map((value) => {
    const weight = Number.isFinite(value) ? Math.exp(value - maxLog) : 0;
    total += weight;
    return weight;
  });
  if (!(total > 0) || !Number.isFinite(total)) return null;

  const marginals = {};
  for (const latent of latents) {
    const mass = {};
    for (const state of latent.states) mass[state] = 0;
    configs.forEach((config, index) => {
      mass[config[latent.id]] += weights[index] / total;
    });
    marginals[latent.id] = mass;
  }
  return marginals;
}

function modelPrior(statisticalModel, resolved, { parameterSet = null, allowStructurePrior = false } = {}) {
  const fromSet = parameterSet?.parameters?._prior;
  if (fromSet) return priorFromMap(fromSet, resolved.states, `Parameter set '${parameterSet.parameterSetId}' prior`);
  if (allowStructurePrior && statisticalModel?.structureConfig?.prior) {
    return priorFromMap(
      statisticalModel.structureConfig.prior,
      resolved.states,
      `Bayesian model '${modelId(statisticalModel)}' prior`
    );
  }
  return priorFromStudentModelVariable(resolved.smv, resolved.states);
}

function tablesAgree(left, right, states) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.join("\0") !== rightKeys.join("\0")) return false;
  for (const key of leftKeys) {
    for (const state of states) {
      if (left[key]?.[state] !== right[key]?.[state]) return false;
    }
  }
  return true;
}

function normalizeLog(logByState) {
  const states = Object.keys(logByState);
  const finite = states.filter((state) => Number.isFinite(logByState[state]));
  if (finite.length === 0) return null;
  const maxLog = Math.max(...finite.map((state) => logByState[state]));
  let total = 0;
  const weights = {};
  for (const state of states) {
    const weight = Number.isFinite(logByState[state]) ? Math.exp(logByState[state] - maxLog) : 0;
    weights[state] = weight;
    total += weight;
  }
  if (!(total > 0) || !Number.isFinite(total)) return null;
  const posterior = {};
  for (const state of states) posterior[state] = weights[state] / total;
  return posterior;
}

/**
 * Exact Bayes update. `observations` are { observableId, u } with u in {0, 1}.
 * `cpt[observableId][state]` is P(u = 1 | state). A likelihood of 0 rules
 * that state out. If every state is ruled out, the result is null.
 */
function updateDiscretePosterior(prior, observations, cpt) {
  const states = Object.keys(prior);
  const logByState = {};
  for (const state of states) {
    if (!(prior[state] > 0)) {
      logByState[state] = -Infinity;
      continue;
    }
    let logPosterior = Math.log(prior[state]);
    for (const observation of observations) {
      const probability = cpt[observation.observableId]?.[state];
      const likelihood = observation.u === 1 ? probability : 1 - probability;
      if (!(likelihood > 0)) {
        logPosterior = -Infinity;
        break;
      }
      logPosterior += Math.log(likelihood);
    }
    logByState[state] = logPosterior;
  }
  return normalizeLog(logByState);
}

function discreteEntropy(distribution) {
  let entropy = 0;
  for (const probability of Object.values(distribution || {})) {
    if (probability > 0 && probability < 1) entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/**
 * Expected information gain, in bits, of one binary observable under the
 * current distribution. Outcomes are weighted by P(u), not by 1/2.
 */
export function expectedInformationGain(prior, cptRow) {
  const states = Object.keys(prior);
  let probabilityOfOne = 0;
  for (const state of states) probabilityOfOne += prior[state] * cptRow[state];
  const probabilityOfZero = 1 - probabilityOfOne;
  if (!(probabilityOfOne > 0) || !(probabilityOfZero > 0)) return 0;

  const ifOne = {};
  const ifZero = {};
  for (const state of states) {
    ifOne[state] = (prior[state] * cptRow[state]) / probabilityOfOne;
    ifZero[state] = (prior[state] * (1 - cptRow[state])) / probabilityOfZero;
  }
  const gain = discreteEntropy(prior) - (
    probabilityOfOne * discreteEntropy(ifOne) + probabilityOfZero * discreteEntropy(ifZero)
  );
  return gain > 0 ? gain : 0;
}

function indexStandardDeviation(distribution, states) {
  let mean = 0;
  states.forEach((state, index) => {
    mean += index * distribution[state];
  });
  let variance = 0;
  states.forEach((state, index) => {
    variance += distribution[state] * (index - mean) ** 2;
  });
  return Math.sqrt(Math.max(variance, 0));
}

function unsupported(evidenceModelId, parameterSetId, parameterSource, reason) {
  return {
    evidenceModelId,
    parameterSetId: parameterSetId || null,
    parameterSource: parameterSource || null,
    modelFamily: BAYESIAN_NETWORK_FAMILY,
    supported: false,
    reason,
  };
}

export function bayesianNetworkAuthoringErrors(statisticalModel, evidenceModel, db, { strict = false } = {}) {
  const errors = [];
  const id = modelId(statisticalModel);
  const config = statisticalModel?.structureConfig || {};
  const latent = uniqueIds(config.latentNodes);
  const gate = strict || ["confirmed", "operational", "suspended"].includes(evidenceModel?.status);

  if (gate && latent.length === 0) {
    errors.push(`Bayesian model ${id} must contain at least one latent node.`);
  }

  const structure = describeStructure(statisticalModel);
  let structureBlocked = Boolean(structure.error);
  if (structure.error) {
    errors.push(structure.error.replace(`Bayesian model '${id}'`, `Bayesian model ${id}`));
  }

  if (config.cpt && typeof config.cpt === "object") {
    for (const [key, entry] of Object.entries(config.cpt)) {
      const nested = nestedStateTable(entry);
      if (nested) {
        for (const [parentState, row] of Object.entries(nested)) {
          for (const [state, probability] of Object.entries(row)) {
            if (probability < 0 || probability > 1) {
              errors.push(
                `Conditional probability table for '${key}' given '${parentState}' has a probability outside 0 to 1 for state '${state}'.`
              );
            }
          }
        }
        continue;
      }
      const row = cptRow(entry);
      if (!row) continue;
      for (const [state, probability] of Object.entries(row)) {
        if (probability < 0 || probability > 1) {
          errors.push(
            `Conditional probability table for observable '${key}' has a probability outside 0 to 1 for state '${state}'.`
          );
        }
      }
    }
  }

  if (!gate || !db || structureBlocked) return errors;

  const resolved = resolveLatentVariables(evidenceModel, statisticalModel, db, structure);
  if (resolved.error) {
    errors.push(resolved.error);
    return errors;
  }

  if (config.cpt) {
    const byId = Object.fromEntries(resolved.latents.map((latent) => [latent.id, latent]));
    for (const observableId of structure.observableIds) {
      const parent = byId[structure.parentOf[observableId]];
      errors.push(
        ...rowProblems(
          cptRow(config.cpt[observableId]),
          parent.states,
          `Conditional probability table for observable '${observableId}'`
        )
      );
    }
    if (!resolved.star) {
      for (const latent of resolved.latents) {
        const parentId = structure.parentOf[latent.id];
        if (!parentId) continue;
        errors.push(
          ...childCptProblems(
            nestedStateTable(config.cpt[latent.id]),
            byId[parentId].states,
            latent.states,
            `Conditional probability table for latent '${latent.id}'`
          )
        );
      }
    }
  }

  if (["confirmed", "operational", "suspended"].includes(evidenceModel?.status)) {
    const parameterSet = (statisticalModel.parameterSets || []).find(
      (set) => set && set.parameterSetId === statisticalModel.activeParameterSetId
    );
    if (parameterSet) {
      const table = conditionalProbabilityTable(parameterSet.parameters);
      const byId = Object.fromEntries(resolved.latents.map((latent) => [latent.id, latent]));
      if (resolved.star) {
        if (parameterSet.parameters?._prior) {
          const parsed = priorFromMap(
            parameterSet.parameters._prior,
            resolved.states,
            `Parameter set '${parameterSet.parameterSetId}' prior`
          );
          if (parsed.error) errors.push(parsed.error);
        } else {
          const fallback = priorFromStudentModelVariable(resolved.smv, resolved.states);
          if (fallback.error) errors.push(fallback.error);
        }
      }
      for (const observableId of structure.observableIds) {
        const parent = byId[structure.parentOf[observableId]];
        errors.push(
          ...rowProblems(
            table[observableId],
            parent.states,
            `Parameter set '${parameterSet.parameterSetId}' conditional probability for observable '${observableId}'`
          )
        );
      }
      if (!resolved.star) {
        for (const latent of resolved.latents) {
          const parentId = structure.parentOf[latent.id];
          if (!parentId) continue;
          errors.push(
            ...childCptProblems(
              nestedStateTable(parameterSet.parameters?.[latent.id]),
              byId[parentId].states,
              latent.states,
              `Parameter set '${parameterSet.parameterSetId}' conditional probability for latent '${latent.id}'`
            )
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Pin the authored table onto a pilot response so a later edit of
 * structureConfig cannot rewrite this session's posterior.
 */
export function snapshotBayesianPilot(statisticalModel, evidenceModel, db) {
  const structure = describeStructure(statisticalModel);
  if (structure.error) return { error: structure.error };
  if (structure.star) {
    const resolved = resolveDiscreteStudentModelVariable(evidenceModel, statisticalModel, db);
    if (resolved.error) return { error: resolved.error };
    const table = conditionalProbabilityTable(statisticalModel?.structureConfig?.cpt);
    const problems = [];
    for (const observableId of structure.observableIds) {
      problems.push(
        ...rowProblems(table[observableId], resolved.states, `Conditional probability table for observable '${observableId}'`)
      );
    }
    if (problems.length) return { error: problems[0] };
    const prior = modelPrior(statisticalModel, resolved, { allowStructurePrior: true });
    if (prior.error) return { error: prior.error };

    const pilotParams = {
      _kind: "bayesian-cpt",
      _prior: prior.prior,
      _smvId: resolved.smv.id,
      _states: resolved.states,
    };
    for (const observableId of structure.observableIds) {
      const levels = {};
      for (const state of resolved.states) levels[state] = table[observableId][state];
      pilotParams[observableId] = { levels };
    }
    return { pilotParams };
  }

  const resolved = resolveLatentVariables(evidenceModel, statisticalModel, db, structure);
  if (resolved.error) return { error: resolved.error };
  const cpt = statisticalModel?.structureConfig?.cpt || {};
  const byId = Object.fromEntries(resolved.latents.map((latent) => [latent.id, latent]));
  const problems = [];
  for (const observableId of structure.observableIds) {
    const parent = byId[structure.parentOf[observableId]];
    problems.push(
      ...rowProblems(
        cptRow(cpt[observableId]),
        parent.states,
        `Conditional probability table for observable '${observableId}'`
      )
    );
  }
  const rootPriors = {};
  for (const latent of resolved.latents) {
    const parentId = structure.parentOf[latent.id];
    if (parentId) {
      problems.push(
        ...childCptProblems(
          nestedStateTable(cpt[latent.id]),
          byId[parentId].states,
          latent.states,
          `Conditional probability table for latent '${latent.id}'`
        )
      );
      continue;
    }
    const parsed = priorFromStudentModelVariable(latent.smv, latent.states);
    if (parsed.error) return { error: parsed.error };
    rootPriors[latent.id] = parsed.prior;
  }
  if (problems.length) return { error: problems[0] };

  const pilotParams = {
    _kind: "bayesian-cpt",
    _tree: true,
    _prior: rootPriors,
    _parentOf: structure.parentOf,
    _latentIds: structure.latentNodeIds,
  };
  for (const observableId of structure.observableIds) {
    const parent = byId[structure.parentOf[observableId]];
    const row = cptRow(cpt[observableId]);
    const levels = {};
    for (const state of parent.states) levels[state] = row[state];
    pilotParams[observableId] = { levels };
  }
  for (const latent of resolved.latents) {
    const parentId = structure.parentOf[latent.id];
    if (!parentId) continue;
    pilotParams[latent.id] = nestedStateTable(cpt[latent.id]);
  }
  return { pilotParams };
}

export function bayesianObservableError({ statisticalModel, observableId, parameterSource, parameterSetId, pilotParams }) {
  if (!observableId) return "This response has no observable id, so the Bayesian network cannot be updated.";
  let row = null;
  if (parameterSource === "pilot") {
    row = cptRow(pilotParams?.[observableId]);
  } else if (parameterSource === "calibrated") {
    const parameterSet = (statisticalModel?.parameterSets || []).find((set) => set && set.parameterSetId === parameterSetId);
    row = cptRow(parameterSet?.parameters?.[observableId]);
  }
  if (!row || Object.keys(row).length === 0) {
    return `Bayesian model '${modelId(statisticalModel)}' has no conditional probability for observable '${observableId}', so this response is not scored.`;
  }
  for (const [state, probability] of Object.entries(row)) {
    if (probability < 0 || probability > 1) {
      return `Conditional probability table for observable '${observableId}' has a probability outside 0 to 1 for state '${state}'.`;
    }
  }
  return null;
}

function networkTables({ parameterSource, group, states }) {
  if (parameterSource !== "pilot") {
    return { error: "Bayesian network evidence has no parameter source to score against." };
  }
  const snapshots = group.map((response) => response?.pilotParams).filter(Boolean);
  if (snapshots.length !== group.length) {
    return { error: "A pilot Bayesian network response is missing its pinned conditional probability table." };
  }
  const first = conditionalProbabilityTable(snapshots[0]);
  const firstPrior = snapshots[0]._prior;
  for (const snapshot of snapshots.slice(1)) {
    const table = conditionalProbabilityTable(snapshot);
    if (!tablesAgree(first, table, states) || JSON.stringify(snapshot._prior) !== JSON.stringify(firstPrior)) {
      return {
        error: "Responses were scored under different Bayesian network tables. A single posterior over mixed tables is not reported.",
      };
    }
  }
  const prior = priorFromMap(firstPrior, states, "Pinned Bayesian network prior");
  if (prior.error) return { error: prior.error };
  return { cpt: first, prior: prior.prior, priorSource: "pilot" };
}

function posteriorRecord({
  latent,
  evidenceModelId,
  parameterSetId,
  parameterSource,
  competencyModelId,
  distribution,
  observations,
  excluded,
  priorSource,
}) {
  const positiveState = latent.states[latent.states.length - 1];
  const precision = indexStandardDeviation(distribution, latent.states);
  return {
    smvId: latent.id,
    smvType: latent.smv.type,
    evidenceModelId,
    parameterSetId: parameterSource === "calibrated" ? parameterSetId : null,
    parameterSource: parameterSource || "calibrated",
    modelFamily: BAYESIAN_NETWORK_FAMILY,
    competencyModelId,
    method: "exact-bayes",
    supported: true,
    estimate: distribution[positiveState],
    precision,
    sem: precision,
    distribution,
    states: latent.states,
    responsesUsed: observations.length,
    responsesExcluded: excluded,
    priorSource,
    positiveState,
  };
}

function accumulateTreeNetwork({
  structure,
  evidenceModelId,
  parameterSetId,
  parameterSource,
  evidenceModel,
  statisticalModel,
  group,
  db,
  session,
  warnings,
  scoreResponse,
}) {
  const resolved = resolveLatentVariables(evidenceModel, statisticalModel, db, structure);
  if (resolved.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, resolved.error);
  const byId = Object.fromEntries(resolved.latents.map((latent) => [latent.id, latent]));

  let source;
  if (parameterSource === "pilot") {
    const snapshots = group.map((response) => response?.pilotParams).filter(Boolean);
    if (snapshots.length !== group.length) {
      return unsupported(
        evidenceModelId,
        parameterSetId,
        parameterSource,
        "A pilot Bayesian network response is missing its pinned conditional probability table."
      );
    }
    source = snapshots[0];
    for (const snapshot of snapshots.slice(1)) {
      if (JSON.stringify(snapshot) !== JSON.stringify(source)) {
        return unsupported(
          evidenceModelId,
          parameterSetId,
          parameterSource,
          "Responses were scored under different Bayesian network tables. A single posterior over mixed tables is not reported."
        );
      }
    }
  } else if (parameterSource === "calibrated") {
    const parameterSet = (statisticalModel.parameterSets || []).find((set) => set && set.parameterSetId === parameterSetId);
    if (!parameterSet) {
      return unsupported(
        evidenceModelId,
        parameterSetId,
        parameterSource,
        `No parameter set '${parameterSetId}' is on Bayesian model '${modelId(statisticalModel)}'.`
      );
    }
    source = parameterSet.parameters;
  } else {
    return unsupported(
      evidenceModelId,
      parameterSetId,
      parameterSource,
      `Bayesian network evidence for '${evidenceModelId}' has no parameter source to score against.`
    );
  }

  const observableCpt = conditionalProbabilityTable(source);
  const childCpts = {};
  const rootPriors = {};
  const storedPriors = source._prior && typeof source._prior === "object" && !Array.isArray(source._prior)
    ? source._prior
    : {};

  for (const latent of resolved.latents) {
    const parentId = structure.parentOf[latent.id];
    if (parentId) {
      const table = nestedStateTable(source[latent.id]);
      const problems = childCptProblems(
        table,
        byId[parentId].states,
        latent.states,
        `Conditional probability table for latent '${latent.id}'`
      );
      if (problems.length) {
        return unsupported(evidenceModelId, parameterSetId, parameterSource, problems[0]);
      }
      childCpts[latent.id] = table;
      continue;
    }
    let parsed;
    if (storedPriors[latent.id] && typeof storedPriors[latent.id] === "object") {
      parsed = priorFromMap(storedPriors[latent.id], latent.states, `Prior for '${latent.id}'`);
    } else {
      parsed = priorFromStudentModelVariable(latent.smv, latent.states);
    }
    if (parsed.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, parsed.error);
    if (session?.carryForward === true) {
      const carried = session.studentModel?.carriedForward?.priors?.[latent.id];
      if (carried) {
        parsed = priorFromMap(carried, latent.states, `Carried forward posterior for '${latent.id}'`);
        if (parsed.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, parsed.error);
      }
    }
    rootPriors[latent.id] = parsed.prior;
  }

  let priorSource = parameterSource === "pilot" ? "pilot" : "model";
  if (session?.carryForward === true && resolved.latents.some((latent) => !structure.parentOf[latent.id] && session?.studentModel?.carriedForward?.priors?.[latent.id])) {
    priorSource = "carried-forward";
  }

  const observations = [];
  let excluded = 0;
  for (const response of group) {
    const scored = scoreResponse(response);
    if (scored.u === null) {
      excluded += 1;
      continue;
    }
    const parent = byId[structure.parentOf[response.observableId]];
    const problems = rowProblems(
      observableCpt[response.observableId],
      parent.states,
      `Conditional probability table for observable '${response.observableId}'`
    );
    if (problems.length) {
      excluded += 1;
      warnings.push(`${problems[0]} That response was excluded.`);
      continue;
    }
    observations.push({ observableId: response.observableId, u: scored.u });
  }

  if (observations.length === 0) {
    return unsupported(
      evidenceModelId,
      parameterSetId,
      parameterSource,
      `No response for evidence model '${evidenceModelId}' carried usable Bayesian network evidence, so no posterior is reported.`
    );
  }

  const marginals = updateJointPosterior({
    latents: resolved.latents,
    parentOf: structure.parentOf,
    rootPriors,
    childCpts,
    observations,
    observableCpt,
  });
  if (!marginals) {
    return unsupported(
      evidenceModelId,
      parameterSetId,
      parameterSource,
      "The responses are impossible under this conditional probability table, so no posterior is reported."
    );
  }

  return resolved.latents.map((latent) =>
    posteriorRecord({
      latent,
      evidenceModelId,
      parameterSetId,
      parameterSource,
      competencyModelId: resolved.competencyModelId,
      distribution: marginals[latent.id],
      observations,
      excluded,
      priorSource,
    })
  );
}

export function accumulateBayesianNetwork({
  evidenceModelId,
  parameterSetId,
  parameterSource,
  evidenceModel,
  statisticalModel,
  group,
  db,
  session,
  warnings,
  scoreResponse,
}) {
  const structure = describeStructure(statisticalModel);
  if (structure.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, structure.error);

  if (!structure.star) {
    return accumulateTreeNetwork({
      structure,
      evidenceModelId,
      parameterSetId,
      parameterSource,
      evidenceModel,
      statisticalModel,
      group,
      db,
      session,
      warnings,
      scoreResponse,
    });
  }

  const resolved = resolveDiscreteStudentModelVariable(evidenceModel, statisticalModel, db);
  if (resolved.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, resolved.error);

  let cpt;
  let prior;
  if (parameterSource === "pilot") {
    const pinned = networkTables({ parameterSource, group, states: resolved.states });
    if (pinned.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, pinned.error);
    cpt = pinned.cpt;
    prior = pinned.prior;
  } else if (parameterSource === "calibrated") {
    const parameterSet = (statisticalModel.parameterSets || []).find((set) => set && set.parameterSetId === parameterSetId);
    if (!parameterSet) {
      return unsupported(
        evidenceModelId,
        parameterSetId,
        parameterSource,
        `No parameter set '${parameterSetId}' is on Bayesian model '${modelId(statisticalModel)}'.`
      );
    }
    cpt = conditionalProbabilityTable(parameterSet.parameters);
    const parsed = modelPrior(statisticalModel, resolved, { parameterSet });
    if (parsed.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, parsed.error);
    prior = parsed.prior;
  } else {
    return unsupported(
      evidenceModelId,
      parameterSetId,
      parameterSource,
      `Bayesian network evidence for '${evidenceModelId}' has no parameter source to score against.`
    );
  }

  let priorSource = parameterSource === "pilot" ? "pilot" : "model";
  const carried = session?.carryForward === true
    ? session?.studentModel?.carriedForward?.priors?.[resolved.smv.id]
    : null;
  if (carried) {
    const parsed = priorFromMap(carried, resolved.states, `Carried forward posterior for '${resolved.smv.id}'`);
    if (parsed.error) return unsupported(evidenceModelId, parameterSetId, parameterSource, parsed.error);
    prior = parsed.prior;
    priorSource = "carried-forward";
  }

  const observations = [];
  let excluded = 0;
  for (const response of group) {
    const scored = scoreResponse(response);
    if (scored.u === null) {
      excluded += 1;
      if (scored.reason === "unknown-direction") {
        warnings.push(
          `Response for item '${response.itemId}' has no usable evidence-rule direction ('${response.direction}') and was excluded.`
        );
      }
      continue;
    }
    const problems = rowProblems(
      cpt[response.observableId],
      resolved.states,
      `Conditional probability table for observable '${response.observableId}'`
    );
    if (problems.length) {
      excluded += 1;
      warnings.push(`${problems[0]} That response was excluded.`);
      continue;
    }
    observations.push({ observableId: response.observableId, u: scored.u });
  }

  if (observations.length === 0) {
    return unsupported(
      evidenceModelId,
      parameterSetId,
      parameterSource,
      `No response for evidence model '${evidenceModelId}' carried usable Bayesian network evidence, so no posterior is reported.`
    );
  }

  const distribution = updateDiscretePosterior(prior, observations, cpt);
  if (!distribution) {
    return unsupported(
      evidenceModelId,
      parameterSetId,
      parameterSource,
      "The responses are impossible under this conditional probability table, so no posterior is reported."
    );
  }

  const positiveState = resolved.states[resolved.states.length - 1];
  const precision = indexStandardDeviation(distribution, resolved.states);

  return {
    smvId: resolved.smv.id,
    smvType: resolved.smv.type,
    evidenceModelId,
    parameterSetId: parameterSource === "calibrated" ? parameterSetId : null,
    parameterSource: parameterSource || "calibrated",
    modelFamily: BAYESIAN_NETWORK_FAMILY,
    competencyModelId: resolved.competencyModelId,
    method: "exact-bayes",
    supported: true,
    estimate: distribution[positiveState],
    precision,
    sem: precision,
    distribution,
    states: resolved.states,
    responsesUsed: observations.length,
    responsesExcluded: excluded,
    priorSource,
    positiveState,
  };
}

/**
 * Load the network a selection candidate would be scored against.
 * The returned prior is the model prior, not the session posterior.
 */
export function loadBayesianNetworkForSelection({
  evidenceModel,
  statisticalModel,
  db,
  parameterSource,
  parameterSetId,
}) {
  const structure = describeStructure(statisticalModel);
  if (structure.error) return { ok: false, error: structure.error };

  if (!structure.star) {
    const resolved = resolveLatentVariables(evidenceModel, statisticalModel, db, structure);
    if (resolved.error) return { ok: false, error: resolved.error };
    const byId = Object.fromEntries(resolved.latents.map((latent) => [latent.id, latent]));
    let source;
    if (parameterSource === "calibrated") {
      const parameterSet = (statisticalModel.parameterSets || []).find((set) => set && set.parameterSetId === parameterSetId);
      if (!parameterSet) {
        return { ok: false, error: `Parameter set '${parameterSetId}' is not on Bayesian model '${modelId(statisticalModel)}'.` };
      }
      source = parameterSet.parameters;
    } else {
      source = statisticalModel?.structureConfig?.cpt || {};
    }
    const observableCpt = conditionalProbabilityTable(source);
    const childCpts = {};
    const rootPriors = {};
    const storedPriors = source._prior && typeof source._prior === "object" && !Array.isArray(source._prior)
      ? source._prior
      : {};
    for (const latent of resolved.latents) {
      const parentId = structure.parentOf[latent.id];
      if (parentId) {
        const table = nestedStateTable(source[latent.id]);
        const problems = childCptProblems(
          table,
          byId[parentId].states,
          latent.states,
          `Conditional probability table for latent '${latent.id}'`
        );
        if (problems.length) return { ok: false, error: problems[0] };
        childCpts[latent.id] = table;
        continue;
      }
      let parsed;
      if (storedPriors[latent.id] && typeof storedPriors[latent.id] === "object") {
        parsed = priorFromMap(storedPriors[latent.id], latent.states, `Prior for '${latent.id}'`);
      } else {
        parsed = priorFromStudentModelVariable(latent.smv, latent.states);
      }
      if (parsed.error) return { ok: false, error: parsed.error };
      rootPriors[latent.id] = parsed.prior;
    }
    for (const observableId of structure.observableIds) {
      const parent = byId[structure.parentOf[observableId]];
      const problems = rowProblems(
        observableCpt[observableId],
        parent.states,
        `Conditional probability table for observable '${observableId}'`
      );
      if (problems.length) return { ok: false, error: problems[0] };
    }
    const priorMarginals = updateJointPosterior({
      latents: resolved.latents,
      parentOf: structure.parentOf,
      rootPriors,
      childCpts,
      observations: [],
      observableCpt,
    });
    if (!priorMarginals) {
      return { ok: false, error: `Bayesian model '${modelId(statisticalModel)}' has no usable prior joint.` };
    }
    const statesById = Object.fromEntries(resolved.latents.map((latent) => [latent.id, latent.states]));
    const first = resolved.latents[0];
    return {
      ok: true,
      network: {
        smvId: first.id,
        states: first.states,
        cpt: observableCpt,
        prior: priorMarginals[first.id],
        parentOf: structure.parentOf,
        statesById,
        priorsById: priorMarginals,
        observableIds: structure.observableIds,
        latentNodeId: structure.latentNodeId,
      },
    };
  }

  const resolved = resolveDiscreteStudentModelVariable(evidenceModel, statisticalModel, db);
  if (resolved.error) return { ok: false, error: resolved.error };

  let cpt;
  let prior;
  if (parameterSource === "calibrated") {
    const parameterSet = (statisticalModel.parameterSets || []).find((set) => set && set.parameterSetId === parameterSetId);
    if (!parameterSet) {
      return { ok: false, error: `Parameter set '${parameterSetId}' is not on Bayesian model '${modelId(statisticalModel)}'.` };
    }
    cpt = conditionalProbabilityTable(parameterSet.parameters);
    const parsed = modelPrior(statisticalModel, resolved, { parameterSet });
    if (parsed.error) return { ok: false, error: parsed.error };
    prior = parsed.prior;
  } else {
    cpt = conditionalProbabilityTable(statisticalModel?.structureConfig?.cpt);
    const parsed = modelPrior(statisticalModel, resolved, { allowStructurePrior: true });
    if (parsed.error) return { ok: false, error: parsed.error };
    prior = parsed.prior;
  }

  for (const observableId of structure.observableIds) {
    const problems = rowProblems(
      cpt[observableId],
      resolved.states,
      `Conditional probability table for observable '${observableId}'`
    );
    if (problems.length) return { ok: false, error: problems[0] };
  }

  return {
    ok: true,
    network: {
      smvId: resolved.smv.id,
      states: resolved.states,
      cpt,
      prior,
      observableIds: structure.observableIds,
      latentNodeId: structure.latentNodeId,
    },
  };
}

export function beliefForBayesianSelection(session, network) {
  const live = session?.studentModel?.smvPosteriors?.[network.smvId];
  if (live?.modelFamily === BAYESIAN_NETWORK_FAMILY && live.distribution) {
    const parsed = priorFromMap(live.distribution, network.states, `Stored posterior for '${network.smvId}'`);
    if (parsed.error) return { error: parsed.error };
    return { belief: parsed.prior, source: "posterior" };
  }
  const carried = session?.studentModel?.carriedForward?.priors?.[network.smvId];
  if (carried) {
    const parsed = priorFromMap(carried, network.states, `Carried forward posterior for '${network.smvId}'`);
    if (parsed.error) return { error: parsed.error };
    return { belief: parsed.prior, source: "carried-forward" };
  }
  return { belief: network.prior, source: "model" };
}

export const __testing__ = {
  MAX_BN_STATES,
  MAX_BN_OBSERVABLES,
  MAX_BN_JOINT_CONFIGS,
  updateDiscretePosterior,
  updateJointPosterior,
  discreteEntropy,
  statesOfStudentModelVariable,
  conditionalProbabilityTable,
};
