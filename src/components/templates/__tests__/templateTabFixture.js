export const competencyModels = [
  { id: "cm-plant", name: "Plant part naming", status: "confirmed" },
  { id: "cm-frac", name: "Fractions", status: "confirmed" },
];

export const competencies = [
  { id: "c-plant", name: "Names the part", modelId: "cm-plant" },
  { id: "c-frac", name: "Names the fraction", modelId: "cm-frac" },
];

export const evidenceModels = [
  {
    id: "em-plant",
    name: "Part naming evidence",
    status: "operational",
    competencyId: "c-plant",
  },
  {
    id: "em-frac",
    name: "Fraction evidence",
    status: "confirmed",
    competencyId: "c-frac",
  },
];

export const taskModelVariables = [
  {
    id: "tmv-diagram",
    name: "Plant diagram",
    type: "categorical",
    possibleValues: [{ value: "leaf" }, { value: "root" }],
  },
  {
    id: "tmv-bloom",
    name: "Bloom",
    type: "categorical",
    possibleValues: [{ value: "remember" }, { value: "apply" }, { value: "analyze" }],
  },
];

export const taskModels = [
  {
    id: "tm-plant",
    name: "Name the plant part",
    status: "confirmed",
    evidenceModelIds: ["em-plant"],
    taskModelVariableIds: ["tmv-diagram", "tmv-bloom"],
    taskModelVariableSettings: [
      { taskModelVariableId: "tmv-diagram", variation: "varying" },
      { taskModelVariableId: "tmv-bloom", variation: "varying" },
    ],
  },
  {
    id: "tm-frac",
    name: "Name the fraction",
    status: "draft",
    evidenceModelIds: ["em-frac"],
    taskModelVariableIds: [],
    taskModelVariableSettings: [],
  },
];

export const presentationModels = [
  {
    id: "pm-plant",
    name: "Plant part presentation",
    taskModelId: "tm-plant",
    status: "confirmed",
  },
  {
    id: "pm-frac",
    name: "Fraction presentation",
    taskModelId: "tm-frac",
    status: "draft",
  },
];

export const designPatterns = [
  { id: "dp-plant", name: "Explain a diagram", status: "confirmed" },
];

export const readyDraft = {
  id: "tpl-ready",
  name: "Name the part",
  description: "A family for naming the indicated plant part.",
  status: "draft",
  competencyModelId: "cm-plant",
  evidenceModelId: "em-plant",
  taskModelId: "tm-plant",
  presentationModelId: "pm-plant",
  designPatternId: "dp-plant",
  updatedAt: "2026-10-20T12:00:00.000Z",
};

export const thinDraft = {
  id: "tpl-thin",
  name: "Unfinished family",
  description: "",
  status: "draft",
  updatedAt: "2026-10-18T12:00:00.000Z",
};

export const confirmedTemplate = {
  id: "tpl-confirmed",
  name: "Fraction family",
  description: "Confirmed bindings for fractions.",
  status: "confirmed",
  competencyModelId: "cm-frac",
  evidenceModelId: "em-frac",
  taskModelId: "tm-frac",
  presentationModelId: "pm-frac",
  designPatternId: "",
  updatedAt: "2026-10-19T12:00:00.000Z",
};

export const templates = [readyDraft, thinDraft, confirmedTemplate];
