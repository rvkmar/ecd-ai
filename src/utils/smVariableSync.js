// CompetencyWizard/smVariableSync.js
// ------------------------------------------------------------
// TR9 §2.3.1 — Student Model Variables are "what we measure" plus a
// distribution over claims. Competencies in this wizard ARE those SMVs;
// this module keeps model.smVariables in lockstep with competencies so
// Q-matrix / DINA / accumulation paths that read smVariables never drift
// from the authored latent architecture.
// ------------------------------------------------------------

import {
  priorFamiliesForSmVariableType,
} from "./ecdVocabulary.js";

function defaultPrior(type) {
  switch (type) {
    case "binary":
      return { family: "bernoulli", params: { p: 0.5 } };
    case "ordinal":
    case "categorical":
      return { family: "dirichlet", params: { alpha: [1, 1] } };
    case "continuous":
      return { family: "normal", params: { mean: 0, sd: 1 } };
    default:
      return null;
  }
}

function scaleFromCompetency(comp) {
  const type = comp.variableType;
  if (type === "continuous") {
    return {
      min: typeof comp.scale?.min === "number" ? comp.scale.min : -3,
      max: typeof comp.scale?.max === "number" ? comp.scale.max : 3,
    };
  }
  if (type === "binary" || type === "ordinal" || type === "categorical") {
    const states = Array.isArray(comp.states)
      ? comp.states.map((s) => s.value).filter((v) => v !== undefined && v !== null && String(v).length > 0)
      : [];
    return { states };
  }
  return {};
}

function alignPriorToScale(type, prior, scale) {
  if (!prior?.family) return defaultPrior(type);
  const allowed = priorFamiliesForSmVariableType(type);
  if (!allowed.includes(prior.family)) return defaultPrior(type);

  if (
    (type === "ordinal" || type === "categorical") &&
    prior.family === "dirichlet" &&
    Array.isArray(scale?.states) &&
    scale.states.length >= 2
  ) {
    const n = scale.states.length;
    const alpha = Array.isArray(prior.params?.alpha) ? [...prior.params.alpha] : [];
    while (alpha.length < n) alpha.push(1);
    return { family: "dirichlet", params: { alpha: alpha.slice(0, n) } };
  }
  return prior;
}

/**
 * Build/merge smVariables from competencies. Existing SMV entries with the
 * same id keep their priorDistribution when still type-compatible.
 */
export function syncSmVariablesFromCompetencies(competencies = [], existingSmVariables = []) {
  const priorById = new Map(
    (existingSmVariables || [])
      .filter((s) => s?.id)
      .map((s) => [s.id, s.priorDistribution])
  );

  return (competencies || [])
    .filter((c) => c?.id && c.variableType)
    .map((comp) => {
      const scale = scaleFromCompetency(comp);
      const prior = alignPriorToScale(
        comp.variableType,
        priorById.get(comp.id),
        scale
      );
      return {
        id: comp.id,
        label: (comp.name && comp.name.trim()) || `SMV ${comp.id}`,
        type: comp.variableType,
        scale,
        priorDistribution: prior,
      };
    });
}

export function typeCoherenceAdvisories(competencies = [], psychologicalPerspective) {
  const types = [...new Set((competencies || []).map((c) => c.variableType).filter(Boolean))];
  const advisories = [];

  if (types.length > 1) {
    advisories.push(
      `Mixed SMV types (${types.join(", ")}). TR9 Evidence Models bind one measurement family per claim — plan separate Evidence Models (or a Bayesian network) rather than one hybrid IRT/DINA fit.`
    );
  }
  if (types.includes("binary") && psychologicalPerspective === "trait") {
    advisories.push(
      "Psychological perspective is trait-based, but binary attributes are present. Trait perspectives usually fit continuous SMVs (IRT); binary attributes fit information-processing / diagnostic claims."
    );
  }
  if (types.includes("continuous") && psychologicalPerspective === "information_processing" && !types.includes("binary")) {
    advisories.push(
      "Information-processing perspective with only continuous SMVs: consider whether discrete attributes (operations/mastery) better match the cognitive claim (TR9 Fig. 5)."
    );
  }
  if (types.length === 1 && types[0] === "binary") {
    advisories.push("All-binary Student Model: natural fit for DINA/G-DINA Evidence Models and a Diagnostic design (Q-matrix).");
  }
  if (types.length === 1 && types[0] === "continuous") {
    advisories.push("All-continuous Student Model: natural fit for unidimensional or multidimensional IRT Evidence Models.");
  }
  return advisories;
}

export function buildStudentModelSpecification({ model, competencies }) {
  const smVariables = syncSmVariablesFromCompetencies(
    competencies,
    model?.smVariables || []
  );
  const relationships = [];
  (competencies || []).forEach((c) => {
    (c.relationships || []).forEach((r) => {
      relationships.push({
        sourceId: c.id,
        sourceName: c.name,
        type: r.type,
        targetId: r.targetCompetencyId,
        targetName:
          (competencies || []).find((x) => x.id === r.targetCompetencyId)?.name ||
          r.targetCompetencyId,
      });
    });
  });

  return {
    specificationVersion: "1.0",
    generatedAt: new Date().toISOString(),
    padiReference:
      "Mislevy & Riconscente (2005), PADI TR9 §2.3.1 Student Model — What Are We Measuring?",
    model: {
      id: model?.id,
      name: model?.name,
      description: model?.description,
      measurementIntent: model?.measurementIntent,
      psychologicalPerspective: model?.psychologicalPerspective,
      status: model?.status,
      versionNumber: model?.versionNumber,
      constructFramework: model?.constructFramework || {},
      reviewMeta: model?.reviewMeta || null,
      confirmMeta: model?.confirmMeta || null,
    },
    smVariables,
    competencies: (competencies || []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      variableType: c.variableType,
      states: c.states || null,
      scale: c.scale || null,
      domain: c.domain || "",
      strand: c.strand || "",
      facet: c.facet || "",
      relationships: c.relationships || [],
    })),
    relationships,
    typeCoherenceAdvisories: typeCoherenceAdvisories(
      competencies,
      model?.psychologicalPerspective
    ),
  };
}

export default syncSmVariablesFromCompetencies;
