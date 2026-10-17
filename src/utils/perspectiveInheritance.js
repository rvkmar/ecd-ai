// The psychological perspective is declared on a Domain Analysis.
// A Student Model cites that analysis and inherits the value.
// A perspective already stored on the model is an override until rebuild.
// Evidence and Task Models read that Student Model. A Design Pattern
// cites the analysis and does not store a perspective of its own.

import { PSYCHOLOGICAL_PERSPECTIVE_VALUES, psychologicalPerspectiveLabel } from "./ecdVocabulary.js";

function knownPerspective(value) {
  return PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(value) ? value : "";
}

export function readStudentPerspective(model, analyses = []) {
  const analysis = (analyses || []).find((row) => row.id === model?.domainAnalysisId);
  const declared = knownPerspective(analysis?.psychologicalPerspective);
  const stored = knownPerspective(model?.psychologicalPerspective);
  const override = Boolean(stored && declared && stored !== declared);
  return {
    declared,
    stored,
    effective: stored || declared,
    override,
    sourceName: analysis?.name || "",
  };
}

export function readEvidencePerspective(evidence, db = {}) {
  const competency = (db.competencies || []).find((row) => row.id === evidence?.competencyId);
  const model = (db.competencyModels || []).find((row) => row.id === competency?.modelId);
  return readStudentPerspective(model, db.domainAnalyses || []);
}

export function readTaskPerspective(task, db = {}) {
  const evidence = (db.evidenceModels || []).find((row) => row.id === task?.primaryEvidenceModelId);
  return readEvidencePerspective(evidence, db);
}

export function readDesignPatternPerspective(pattern, analyses = []) {
  const analysis = (analyses || []).find((row) => row.id === pattern?.domainAnalysisId);
  const declared = knownPerspective(analysis?.psychologicalPerspective);
  return {
    declared,
    stored: "",
    effective: declared,
    override: false,
    sourceName: analysis?.name || "",
  };
}

export function perspectiveReadout(reading) {
  if (!reading?.effective) return "";
  const label = psychologicalPerspectiveLabel(reading.effective);
  if (reading.override) {
    const source = reading.sourceName || "the Domain Analysis";
    return `${label}. Stored on the Student Model until it is rebuilt from ${source}.`;
  }
  if (reading.sourceName) return `${label}. Declared on ${reading.sourceName}.`;
  return label;
}

const DIAGNOSTIC_MODEL_TYPES = new Set(["dina", "gdina"]);

export function traitDiagnosticDeparture(evidence, db = {}) {
  const modelTypes = (evidence?.statisticalModels || [])
    .filter((model) => model && model.active !== false && DIAGNOSTIC_MODEL_TYPES.has(model.type))
    .map((model) => model.type)
    .sort();
  if (!modelTypes.length) return null;
  const reading = readEvidencePerspective(evidence, db);
  if (reading.effective !== "trait") return null;
  const source = reading.override || !reading.declared ? "student_model" : "domain_analysis";
  return {
    modelTypes,
    source,
    override: Boolean(reading.override),
    sourceName: reading.sourceName || "",
    declared: reading.declared || "",
    stored: reading.stored || "",
  };
}

export function traitDiagnosticAdvisory(reading) {
  if (reading?.effective !== "trait") return "";
  let sourceLine;
  if (reading.override) {
    const source = reading.sourceName || "the Domain Analysis";
    sourceLine = `Stored on the Student Model until it is rebuilt from ${source}.`;
  } else if (reading.declared) {
    sourceLine = reading.sourceName
      ? `Declared on ${reading.sourceName}.`
      : "Declared on the Domain Analysis.";
  } else {
    sourceLine = "Stored on the Student Model.";
  }
  return `${sourceLine} A trait perspective describes competence as a continuous latent trait, which a diagnostic model does not estimate. This is advisory, not blocking.`;
}

export function applyDomainAnalysisChoice({
  model,
  domainAnalysisId,
  analyses = [],
  baselinePerspective = "",
}) {
  const next = {
    ...(model || {}),
    domainAnalysisId: domainAnalysisId || undefined,
  };
  const analysis = analyses.find((row) => row.id === domainAnalysisId);
  const declared = analysis?.psychologicalPerspective;
  if (!baselinePerspective && declared) {
    next.psychologicalPerspective = declared;
  }
  return next;
}

export function rebuildPerspective(model, analyses = []) {
  const analysis = analyses.find((row) => row.id === model?.domainAnalysisId);
  const declared = analysis?.psychologicalPerspective;
  if (!declared) return model;
  return { ...(model || {}), psychologicalPerspective: declared };
}
