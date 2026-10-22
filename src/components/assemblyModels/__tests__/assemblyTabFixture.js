export const competencyModels = [
  {
    id: "cm-plant",
    name: "Plant part naming",
    versionNumber: 2,
    status: "operational",
    locked: true,
    smVariables: [
      { id: "smv-part", label: "Names the part", type: "binary" },
      { id: "smv-theta", label: "Naming proficiency", type: "continuous" },
    ],
  },
  {
    id: "cm-frac",
    name: "Fractions",
    versionNumber: 1,
    status: "confirmed",
    locked: true,
    smVariables: [{ id: "smv-frac", label: "Fraction equivalence", type: "binary" }],
  },
];

export const policies = [
  { id: "p-fixed", name: "Fixed form", type: "fixed" },
  { id: "p-irt", name: "Adaptive IRT", type: "IRT" },
];

export const readyDraft = {
  id: "am-ready",
  name: "Plant part naming assembly",
  description: "Stop once the part-naming target is met.",
  competencyModelId: "cm-plant",
  competencyModelVersion: 2,
  targetsBySMV: [{ smvId: "smv-part", requiredClassificationAccuracy: 0.8 }],
  stoppingRules: { minItems: 1, maxItems: 3, targetsMet: true },
  selectionAlgorithm: { policyId: "p-fixed" },
  status: "draft",
  locked: false,
  versionNumber: 1,
  updatedAt: "2026-10-17T12:00:00.000Z",
};

export const reviewedModel = {
  id: "am-reviewed",
  name: "Reviewed assembly",
  description: "Ready to lock.",
  competencyModelId: "cm-plant",
  competencyModelVersion: 2,
  targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0.35 }],
  stoppingRules: { maxItems: 10 },
  selectionAlgorithm: { policyId: "p-fixed" },
  status: "reviewed",
  locked: false,
  versionNumber: 1,
  updatedAt: "2026-10-17T18:00:00.000Z",
};

export const thinDraft = {
  id: "am-thin",
  name: "Unfinished assembly",
  description: "",
  status: "draft",
  locked: false,
  targetsBySMV: [],
  updatedAt: "2026-10-16T12:00:00.000Z",
};

export const confirmedModel = {
  id: "am-confirmed",
  name: "Fraction assembly",
  description: "A locked fraction specification.",
  competencyModelId: "cm-frac",
  competencyModelVersion: 1,
  targetsBySMV: [{ smvId: "smv-frac", requiredClassificationAccuracy: 0.75 }],
  stoppingRules: { maxItems: 20 },
  selectionAlgorithm: { policyId: "p-irt" },
  status: "confirmed",
  locked: true,
  versionNumber: 1,
  updatedAt: "2026-10-15T12:00:00.000Z",
};

export const operationalModel = {
  id: "am-live",
  name: "Live fraction assembly",
  description: "The operational specification.",
  competencyModelId: "cm-frac",
  competencyModelVersion: 1,
  targetsBySMV: [
    { smvId: "smv-frac", requiredClassificationAccuracy: 0.8 },
    { smvId: "smv-missing", requiredSEM: 0.3 },
  ],
  stoppingRules: { minItems: 5, targetsMet: true },
  selectionAlgorithm: { policyId: "p-irt" },
  status: "operational",
  locked: true,
  versionNumber: 2,
  parentModelId: "am-confirmed",
  updatedAt: "2026-10-18T12:00:00.000Z",
};

export const assemblyModels = [
  readyDraft,
  reviewedModel,
  thinDraft,
  confirmedModel,
  operationalModel,
];
