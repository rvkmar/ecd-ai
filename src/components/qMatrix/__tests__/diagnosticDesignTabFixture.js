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
    smVariables: [
      { id: "smv-equiv", label: "Fraction equivalence", type: "binary" },
      { id: "smv-add", label: "Fraction addition", type: "binary" },
    ],
  },
];

export const domainAnalyses = [
  { id: "da-plant", name: "Plant parts", status: "confirmed" },
  { id: "da-force", name: "Force", status: "draft" },
];

export const readyDraft = {
  id: "qm-ready",
  name: "Plant part naming design",
  description: "One attribute, one item.",
  competencyModelId: "cm-plant",
  competencyModelVersion: 2,
  attributeIds: ["smv-part"],
  entries: [{ itemId: "item-part", attributeId: "smv-part" }],
  domainAnalysisId: "da-plant",
  status: "draft",
  locked: false,
  versionNumber: 1,
  updatedAt: "2026-10-18T12:00:00.000Z",
};

export const reviewedDesign = {
  id: "qm-reviewed",
  name: "Reviewed fraction design",
  description: "Two attributes, ready to lock.",
  competencyModelId: "cm-frac",
  competencyModelVersion: 1,
  attributeIds: ["smv-equiv", "smv-add"],
  entries: [
    { itemId: "item-equiv", attributeId: "smv-equiv" },
    { itemId: "item-add", attributeId: "smv-add" },
  ],
  status: "reviewed",
  locked: false,
  versionNumber: 1,
  updatedAt: "2026-10-19T12:00:00.000Z",
};

export const thinDraft = {
  id: "qm-thin",
  name: "Unfinished design",
  description: "",
  competencyModelId: "",
  attributeIds: [],
  entries: [],
  status: "draft",
  locked: false,
  updatedAt: "2026-10-16T12:00:00.000Z",
};

export const confirmedDesign = {
  id: "qm-confirmed",
  name: "Fraction design",
  description: "Locked specification.",
  competencyModelId: "cm-frac",
  competencyModelVersion: 1,
  attributeIds: ["smv-equiv"],
  entries: [{ itemId: "item-equiv", attributeId: "smv-equiv" }],
  domainAnalysisId: "da-force",
  status: "confirmed",
  locked: true,
  versionNumber: 2,
  parentModelId: "qm-reviewed",
  updatedAt: "2026-10-20T12:00:00.000Z",
};

export const operationalDesign = {
  id: "qm-live",
  name: "Live fraction design",
  description: "In delivery.",
  competencyModelId: "cm-frac",
  competencyModelVersion: 1,
  attributeIds: ["smv-equiv", "smv-add"],
  entries: [
    { itemId: "item-equiv", attributeId: "smv-equiv" },
    { itemId: "item-add", attributeId: "smv-equiv" },
    { itemId: "item-add", attributeId: "smv-add" },
  ],
  status: "operational",
  locked: true,
  versionNumber: 3,
  updatedAt: "2026-10-21T12:00:00.000Z",
};

export const designs = [
  readyDraft,
  reviewedDesign,
  thinDraft,
  confirmedDesign,
  operationalDesign,
];
