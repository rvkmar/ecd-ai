export const diagram = {
  id: "tmv-diagram",
  name: "Plant diagram",
  description: "Which labelled plant diagram the task shows.",
  type: "categorical",
  possibleValues: [
    { value: "leaf", label: "Leaf called out" },
    { value: "root", label: "Root called out" },
  ],
  updatedAt: "2026-04-02T00:00:00.000Z",
};

export const bloom = {
  id: "tmv-bloom",
  name: "Bloom demand",
  description: "Cognitive demand the plant task is written to.",
  type: "categorical",
  valueSet: "bloomLevel",
  updatedAt: "2026-04-03T00:00:00.000Z",
};

export const bloomCopy = {
  id: "tmv-bloom-copy",
  name: "Bloom demand (copy)",
  description: "A copy already stored.",
  type: "categorical",
  valueSet: "bloomLevel",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

export const denominator = {
  id: "tmv-denominator",
  name: "Fraction denominator",
  description: "Largest denominator appearing in a fractions item.",
  type: "numeric",
  range: { min: 2, max: 12 },
  updatedAt: "2026-03-20T00:00:00.000Z",
};

export const familiar = {
  id: "tmv-familiar",
  name: "Diagram familiarity",
  description: "Whether the plant is one the student has already studied.",
  type: "boolean",
  updatedAt: "2026-03-15T00:00:00.000Z",
};

export const thin = {
  id: "tmv-thin",
  name: "Started only",
  updatedAt: "2026-03-01T00:00:00.000Z",
};

export const variables = [diagram, bloom, bloomCopy, denominator, familiar, thin];

export const taskModels = [
  {
    id: "tm-plant",
    name: "Plant part naming",
    status: "draft",
    taskModelVariableIds: ["tmv-diagram", "tmv-bloom"],
  },
  {
    id: "tm-plant-b",
    name: "Plant part naming form B",
    status: "confirmed",
    taskModelVariableIds: ["tmv-diagram"],
  },
];

export const designPatterns = [
  {
    id: "dp-diagram",
    name: "Explain a labelled diagram",
    variableFeatures: [
      { label: "Which diagram is shown", taskModelVariableId: "tmv-diagram" },
    ],
  },
  {
    id: "dp-plant",
    name: "Name a plant part",
    variableFeatures: [{ label: "Bloom demand", taskModelVariableId: "tmv-bloom" }],
  },
  {
    id: "dp-fraction",
    name: "Compare fractions",
    variableFeatures: [{ label: "Denominator size", taskModelVariableId: "tmv-denominator" }],
  },
];
