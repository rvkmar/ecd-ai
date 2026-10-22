// Shared fixture for the Domain Analysis dashboard and structure tests.
// The confirmed analysis passes strict readiness and must not be counted
// as Ready to confirm. The thin draft does not pass.
// A pattern or Q-matrix that cites a missing id stays out of every row.

const statement = (label) => [{ label }];

export const sections = {
  valuedWork: [
    { label: "Name a plant part from a diagram" },
    { label: "Explain what the part does" },
  ],
  taskFeatures: statement("A familiar plant diagram"),
  representationalForms: statement("Diagram with one part marked"),
  performanceOutcomes: statement("The printed name of the part"),
  valuedKnowledge: statement("The names of plant parts"),
  knowledgeStructure: statement("Parts of a whole plant"),
  knowledgeTaskRelationships: statement("The marked part is the one to name"),
};

export const confirmedSections = {
  valuedWork: statement("Compare two fractions"),
  taskFeatures: statement("A pair of fractions with the same denominator"),
  representationalForms: statement("Two numerals and a bar"),
  performanceOutcomes: statement("The larger fraction"),
  valuedKnowledge: statement("Which numerator is larger"),
  knowledgeStructure: statement("Same-denominator pairs"),
  knowledgeTaskRelationships: statement("The task asks which is larger"),
};

export const plantPolicy = {
  id: "cp-plants",
  name: "Plant diagram curriculum",
  curricularGoals: [
    {
      code: "CG-1",
      statement: "Name the parts of a plant",
      competencies: [
        {
          code: "C-1.1",
          statement: "Point to the indicated part",
          learningOutcomes: ["Selects the printed name"],
        },
      ],
    },
  ],
};

export const readyDraft = {
  id: "da-ready",
  name: "Plant structure",
  status: "draft",
  psychologicalPerspective: "trait",
  ...sections,
  contentStandards: plantPolicy,
  updatedAt: "2026-10-20T12:00:00.000Z",
};

export const thinDraft = {
  id: "da-thin",
  name: "Unfinished analysis",
  status: "draft",
  updatedAt: "2026-10-18T12:00:00.000Z",
};

export const confirmedAnalysis = {
  id: "da-confirmed",
  name: "Fractions",
  status: "confirmed",
  psychologicalPerspective: "information_processing",
  ...confirmedSections,
  updatedAt: "2026-10-19T12:00:00.000Z",
};

export const analyses = [readyDraft, thinDraft, confirmedAnalysis];

export const patterns = [
  { id: "dp-a", name: "Name a plant part", domainAnalysisId: "da-ready" },
  { id: "dp-b", name: "Label the diagram", domainAnalysisId: "da-ready" },
  { id: "dp-fractions", name: "Explain a fraction", domainAnalysisId: "da-confirmed" },
  { id: "dp-orphan", name: "Orphan pattern", domainAnalysisId: "da-missing" },
  { id: "dp-none", name: "Unlinked pattern", domainAnalysisId: "" },
];

export const qMatrices = [
  { id: "qm-ready", name: "Part naming Q-matrix", domainAnalysisId: "da-ready" },
  { id: "qm-orphan", name: "Orphan Q-matrix", domainAnalysisId: "da-missing" },
  { id: "qm-none", name: "Unlinked Q-matrix", domainAnalysisId: "" },
];
