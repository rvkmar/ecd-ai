// Shared fixture for the Design Pattern dashboard and structure tests.
// The confirmed pattern passes strict readiness and must not be counted
// as Ready to confirm. The thin draft does not pass.

export const domainAnalyses = [
  { id: "da-plant", name: "Plant structure" },
];

export const readyDraft = {
  id: "dp-ready",
  name: "Name a plant part",
  status: "draft",
  summary: "The student names a plant part marked on a diagram.",
  rationale: "Naming the part is the claim.",
  focalKsas: [{ label: "Names the indicated plant part" }],
  additionalKsas: [
    { label: "Reads a printed label", relationship: "required_but_not_measured" },
  ],
  potentialObservations: [
    { label: "The chosen name matches the indicated part", observationId: "obs-1" },
  ],
  potentialWorkProducts: [{ label: "Selected plant-part name", workProductId: "wp1" }],
  potentialRubrics: [{ label: "Plant-part naming", rubricId: "rb1" }],
  characteristicFeatures: [{ label: "The diagram shows a familiar plant" }],
  variableFeatures: [{ label: "Diagram familiarity", taskModelVariableId: "tmv1" }],
  relationships: [{ type: "kind-of", targetPatternId: "dp-confirmed" }],
  references: [{ label: "PADI design pattern", url: "https://example.test/padi" }],
  domainAnalysisId: "da-plant",
  updatedAt: "2026-10-20T12:00:00.000Z",
};

export const thinDraft = {
  id: "dp-thin",
  name: "Unfinished argument",
  status: "draft",
  summary: "",
  rationale: "",
  updatedAt: "2026-10-18T12:00:00.000Z",
};

export const confirmedPattern = {
  id: "dp-confirmed",
  name: "Explain a diagram",
  status: "confirmed",
  summary: "Students explain a diagram.",
  rationale: "Explanation is the claim.",
  domainAnalysisId: "",
  updatedAt: "2026-10-19T12:00:00.000Z",
};

export const patterns = [readyDraft, thinDraft, confirmedPattern];

export const templates = [
  { id: "tpl-ready", name: "Name the part", designPatternId: "dp-ready" },
  { id: "tpl-other", name: "Other template", designPatternId: "dp-other" },
];

export const evidenceModels = [
  {
    id: "em-ready",
    name: "Part naming evidence",
    seededFrom: { designPatternId: "dp-ready" },
  },
  {
    id: "em-orphan",
    name: "Orphan evidence",
    seededFrom: { designPatternId: "dp-deleted" },
  },
];

export const taskModels = [
  {
    id: "tm-ready",
    name: "Name the plant part",
    seededFrom: { designPatternId: "dp-ready" },
  },
];
