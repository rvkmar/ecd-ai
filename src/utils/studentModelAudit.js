// CompetencyWizard/structuralAudit.js
// Shared Structural Audit — single source of truth for Step 8 display
// and CompetencyWizardContext stepValidity[8] / confirm readiness.
// Grounded on PADI TR9 §2.3.1 (Student Model = SMVs + claim distribution)
// and §2.3 CAF coherence before Implementation.

import {
  PSYCHOLOGICAL_PERSPECTIVE_VALUES,
  isSmVariablePriorComplete,
} from "./ecdVocabulary.js";
import { typeCoherenceAdvisories } from "./smVariableSync.js";

function buildPrerequisiteGraph(competencies) {
  const graph = {};
  competencies.forEach((c) => {
    graph[c.id] = (c.relationships || [])
      .filter((r) => r.type === "prerequisite")
      .map((r) => r.targetCompetencyId);
  });
  return graph;
}

function hasCycle(graph) {
  const visited = new Set();
  const stack = new Set();

  function dfs(node) {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const neighbor of graph[node] || []) {
      if (dfs(neighbor)) return true;
    }
    stack.delete(node);
    return false;
  }

  return Object.keys(graph).some((node) => dfs(node));
}

function isCompetencyStructurallyValid(c) {
  if (!c.name || c.name.trim().length < 3) return false;
  if (!c.description || c.description.trim().length < 8) return false;
  if (!c.variableType) return false;

  if (c.variableType === "binary") {
    return c.states?.length === 2;
  }
  if (c.variableType === "ordinal") {
    return (
      c.states?.length >= 2 &&
      c.states.every((s) => typeof s.order === "number")
    );
  }
  if (c.variableType === "categorical") {
    return c.states?.length >= 2;
  }
  if (c.variableType === "continuous") {
    return (
      typeof c.scale?.min === "number" &&
      typeof c.scale?.max === "number" &&
      c.scale.min < c.scale.max
    );
  }
  return false;
}

function isDomainComplete(c) {
  return Boolean(
    c.domain?.trim() && c.strand?.trim() && c.facet?.trim()
  );
}

function relationshipCount(competencies) {
  return competencies.reduce(
    (n, c) => n + (Array.isArray(c.relationships) ? c.relationships.length : 0),
    0
  );
}

function smvParityOk(model, competencies) {
  const smvs = Array.isArray(model?.smVariables) ? model.smVariables : [];
  if (competencies.length === 0) return false;
  if (smvs.length !== competencies.length) return false;
  const byId = new Map(smvs.map((s) => [s.id, s]));
  return competencies.every((c) => {
    const smv = byId.get(c.id);
    return smv && smv.type === c.variableType;
  });
}

function constructGroundingOk(model) {
  const fw = model?.constructFramework || {};
  if (fw.ungroundedWaiver === true) {
    return Boolean(fw.ungroundedReason && String(fw.ungroundedReason).trim().length >= 10);
  }
  return Boolean(
    fw.policyId &&
      Array.isArray(fw.curricularGoalCodes) &&
      fw.curricularGoalCodes.length > 0
  );
}

/**
 * Cross-type relationship advisories (soft). Hard failures stay in checks.
 */
export function relationshipAdvisories(competencies = []) {
  const byId = new Map(competencies.map((c) => [c.id, c]));
  const advisories = [];
  competencies.forEach((c) => {
    (c.relationships || []).forEach((r) => {
      const t = byId.get(r.targetCompetencyId);
      if (!t || !c.variableType || !t.variableType) return;
      if (
        r.type === "part-of" &&
        c.variableType !== t.variableType &&
        !(t.variableType === "continuous" || c.variableType === "continuous")
      ) {
        advisories.push(
          `"${c.name}" (${c.variableType}) part-of "${t.name}" (${t.variableType}): aggregation across discrete types needs an explicit Evidence Model warrant.`
        );
      }
      if (
        r.type === "prerequisite" &&
        c.variableType === "continuous" &&
        t.variableType === "binary"
      ) {
        advisories.push(
          `Continuous "${c.name}" prerequisite of binary "${t.name}" is unusual; prerequisites usually run discrete → higher-order claims.`
        );
      }
    });
  });
  return advisories;
}

/**
 * Computes the full Step 8 structural audit checklist.
 * Returns { checks, advisories, allPassed }.
 */
export function computeStructuralAudit({ model, competencies = [] }) {
  const checks = [];

  checks.push({
    label: "Model name defined (min 5 chars)",
    passed: !!model?.name && model.name.trim().length >= 5,
  });

  checks.push({
    label: "Model description defined (min 10 chars)",
    passed: !!model?.description && model.description.trim().length >= 10,
  });

  checks.push({
    label: "Measurement intent selected",
    passed: ["unidimensional", "multidimensional"].includes(
      model?.measurementIntent
    ),
  });

  checks.push({
    label: "Psychological perspective declared (TR9 claim stance)",
    passed: PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(
      model?.psychologicalPerspective
    ),
  });

  checks.push({
    label: "Construct grounded in curricular policy (or documented waiver)",
    passed: constructGroundingOk(model),
  });

  checks.push({
    label: "At least one competency defined",
    passed: competencies.length > 0,
  });

  const allCompetenciesValid = competencies.every(isCompetencyStructurallyValid);
  checks.push({
    label: "All competencies structurally valid (name, description, state/scale)",
    passed: allCompetenciesValid,
  });

  checks.push({
    label: "All competencies have domain / strand / facet",
    passed: competencies.length > 0 && competencies.every(isDomainComplete),
  });

  if (model?.measurementIntent === "unidimensional") {
    checks.push({
      label: "Unidimensional constraint satisfied (exactly 1 variable)",
      passed: competencies.length === 1,
    });
  }

  if (model?.measurementIntent === "multidimensional") {
    checks.push({
      label: "Multidimensional models declare ≥2 latent variables",
      passed: competencies.length >= 2,
    });
    checks.push({
      label: "Multidimensional models declare ≥3 structural relationships",
      passed: relationshipCount(competencies) >= 3,
    });
  }

  const noSelfRefs = competencies.every((c) =>
    (c.relationships || []).every((r) => r.targetCompetencyId !== c.id)
  );
  checks.push({
    label: "No self-referential relationships",
    passed: noSelfRefs,
  });

  checks.push({
    label: "No prerequisite cycles",
    passed: !hasCycle(buildPrerequisiteGraph(competencies)),
  });

  checks.push({
    label: "smVariables synchronized with competencies (id + type)",
    passed: smvParityOk(model, competencies),
  });

  const smvs = Array.isArray(model?.smVariables) ? model.smVariables : [];
  checks.push({
    label: "All SMV prior distributions complete (family + params)",
    passed:
      competencies.length > 0 &&
      smvParityOk(model, competencies) &&
      smvs.every((smv) => isSmVariablePriorComplete(smv)),
  });

  const advisories = [
    ...typeCoherenceAdvisories(competencies, model?.psychologicalPerspective),
    ...relationshipAdvisories(competencies),
  ];

  return {
    checks,
    advisories,
    allPassed: checks.every((c) => c.passed),
  };
}
