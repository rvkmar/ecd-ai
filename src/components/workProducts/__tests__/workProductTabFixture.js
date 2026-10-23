export const partName = {
  id: "wp-part-name",
  name: "Selected plant-part name",
  description: "The name the student chooses for the indicated part.",
  type: "selected_response",
  updatedAt: "2026-04-02T00:00:00.000Z",
};

export const solveSteps = {
  id: "wp-trace",
  name: "Solve steps",
  description: "The sequence of actions the student takes.",
  type: "process_trace",
  updatedAt: "2026-04-03T00:00:00.000Z",
};

export const solveStepsCopy = {
  id: "wp-trace-copy",
  name: "Solve steps (copy)",
  description: "A copy already stored.",
  type: "process_trace",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

export const thin = {
  id: "wp-thin",
  name: "Started only",
  updatedAt: "2026-03-01T00:00:00.000Z",
};

export const workProducts = [partName, solveSteps, solveStepsCopy, thin];

export const items = [
  {
    id: "it-leaf",
    name: "Leaf on the diagram",
    interaction: { type: "mcq", workProductId: "wp-part-name" },
  },
  {
    id: "it-root",
    name: "Root on the diagram",
    interaction: { type: "mcq", workProductId: "wp-part-name" },
  },
];

export const evidenceModels = [
  {
    id: "em-plant",
    name: "Part naming evidence",
    evaluationProcedures: [
      { id: "ep-plant-name", workProductId: "wp-part-name", workProductType: "selected_response" },
    ],
  },
];

export const designPatterns = [
  {
    id: "dp-plant",
    name: "Name a plant part",
    potentialWorkProducts: [
      { label: "Selected plant-part name", workProductId: "wp-part-name" },
    ],
  },
];
