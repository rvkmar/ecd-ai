function levels(pairs) {
  return pairs.map(([value, label, exemplar]) => ({
    value,
    label,
    descriptor: exemplar,
    exemplar,
  }));
}

function grid(id, name, exemplarLow, exemplarHigh) {
  return [
    {
      id,
      name,
      levels: levels([
        [0, "Low", exemplarLow],
        [1, "High", exemplarHigh],
      ]),
      activatesAt: 1,
    },
  ];
}

export const plantFunction = {
  id: "rub-function",
  name: "Plant function judgement",
  description: "Scores whether the chosen job of a named plant part is the work that part does.",
  status: "confirmed",
  dimensions: grid(
    "function-match",
    "Function match",
    "The student says a leaf takes up water.",
    "The student says a leaf makes food for the plant."
  ),
  updatedAt: "2026-06-01T00:00:00.000Z",
};

export const fraction = {
  id: "rub-equiv",
  name: "Fraction equivalence judgement",
  description: "Scores whether the chosen fraction names the same amount as the stem.",
  status: "draft",
  dimensions: grid(
    "same-amount",
    "Same amount",
    "The student picks 2/3 for a stem of 2/4.",
    "The student picks 1/2 for a stem of 2/4."
  ),
  updatedAt: "2026-05-01T00:00:00.000Z",
};

export const phaseOnly = {
  id: "rub-phase",
  name: "Phase only judgement",
  description: "Cited only from a phase.",
  status: "draft",
  dimensions: grid("phase-dim", "Phase criterion", "A low phase sentence.", "A high phase sentence."),
  updatedAt: "2026-04-01T00:00:00.000Z",
};

export const patternOnly = {
  id: "rub-pattern",
  name: "Pattern only judgement",
  description: "Cited only from a design pattern.",
  status: "draft",
  dimensions: grid(
    "pattern-dim",
    "Pattern criterion",
    "A low pattern sentence.",
    "A high pattern sentence."
  ),
  updatedAt: "2026-03-15T00:00:00.000Z",
};

export const plantCopy = {
  id: "rub-function-copy",
  name: "Plant function judgement (copy)",
  description: "An unused draft copy.",
  status: "draft",
  dimensions: grid(
    "function-copy",
    "Function match",
    "Copy of the low sentence.",
    "Copy of the high sentence."
  ),
  updatedAt: "2026-03-01T00:00:00.000Z",
};

export const bare = {
  id: "rub-bare",
  name: "Levels only",
  description: "Criteria without exemplars.",
  status: "draft",
  dimensions: [
    {
      id: "bare-dim",
      name: "Bare criterion",
      levels: [
        { value: 0, label: "Low", descriptor: "", exemplar: "" },
        { value: 1, label: "High", descriptor: "", exemplar: "" },
      ],
      activatesAt: 1,
    },
  ],
  updatedAt: "2026-02-01T00:00:00.000Z",
};

export const thin = {
  id: "rub-thin",
  name: "Started only",
  description: "",
  status: "draft",
  dimensions: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const rubrics = [plantFunction, fraction, phaseOnly, patternOnly, plantCopy, bare, thin];

export const evidenceModels = [
  {
    id: "em-function",
    name: "Part function evidence",
    status: "draft",
    evaluationProcedures: [
      {
        id: "ep-plant-fn",
        method: "rubric",
        rubricId: "rub-function",
        phases: [{ order: 1, kind: "human", rubricId: "rub-function" }],
      },
    ],
  },
  {
    id: "em-frac",
    name: "Fraction evidence",
    status: "draft",
    evaluationProcedures: [
      {
        id: "ep-equiv",
        method: "rubric",
        rubricId: "rub-equiv",
        phases: [{ order: 1, kind: "automated" }],
      },
    ],
  },
  {
    id: "em-phase",
    name: "Phase scoring evidence",
    status: "draft",
    evaluationProcedures: [
      {
        id: "ep-phase",
        method: "rubric",
        phases: [{ order: 1, kind: "human", rubricId: "rub-phase" }],
      },
    ],
  },
];

export const designPatterns = [
  {
    id: "dp-diagram",
    name: "Explain a labelled diagram",
    potentialRubrics: [{ label: "Plant function judgement", rubricId: "rub-function" }],
  },
  {
    id: "dp-frac",
    name: "Explain a fraction",
    potentialRubrics: [{ label: "Fraction equivalence judgement", rubricId: "rub-equiv" }],
  },
  {
    id: "dp-only",
    name: "Pattern menu",
    potentialRubrics: [{ label: "Pattern only judgement", rubricId: "rub-pattern" }],
  },
];
