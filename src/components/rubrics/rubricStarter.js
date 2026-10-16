// Starting points for a rubric. Subject and topic are chosen in the form
// and are not stored on the rubric. The result is the existing shape:
// dimensions, four levels, a sentence in each cell.

export const RUBRIC_LEVELS = [
  { value: 0, label: "Beginning" },
  { value: 1, label: "Developing" },
  { value: 2, label: "Accomplished" },
  { value: 3, label: "Exemplary" },
];

const ACCOMPLISHED = 2;

export const RUBRIC_SUBJECTS = [
  {
    id: "science",
    label: "Science",
    topics: [
      {
        id: "plant-diagrams",
        label: "Plant diagrams",
        criteria: [
          {
            name: "Naming parts",
            sentences: [
              "Names a part that is not shown, or names a part only when told the word.",
              "Names some of the indicated parts and misnames or skips others.",
              "Names each indicated plant part on the diagram.",
              "Names each indicated part and uses the diagram to tell those parts apart.",
            ],
          },
          {
            name: "Using the diagram",
            sentences: [
              "Points at the page without using the marks on the diagram.",
              "Uses some labels or arrows, and ignores others that the question needs.",
              "Uses the labels and arrows to answer what the question asks.",
              "Uses the labels and arrows, and says what the diagram does not show.",
            ],
          },
          {
            name: "Explaining the part",
            sentences: [
              "Names a part and does not say what it does.",
              "Gives a job for the part that does not match the diagram.",
              "Says what the indicated part does for the plant.",
              "Says what the part does and how that job shows up on the diagram.",
            ],
          },
        ],
      },
      {
        id: "scientific-explanation",
        label: "Scientific explanation",
        criteria: [
          {
            name: "Claim",
            sentences: [
              "States no claim, or states a claim the question did not ask.",
              "States a claim that only partly answers the question.",
              "States a claim that answers the question.",
              "States a claim that answers the question and can be checked against the evidence.",
            ],
          },
          {
            name: "Evidence",
            sentences: [
              "Gives no observation from the task.",
              "Gives an observation that does not support the claim.",
              "Gives an observation from the task that supports the claim.",
              "Gives the observations that support the claim and sets aside one that does not.",
            ],
          },
          {
            name: "Reasoning",
            sentences: [
              "Does not connect the evidence to the claim.",
              "Connects the evidence with a reason that does not fit the science.",
              "Connects the evidence to the claim with a fitting reason.",
              "Connects the evidence to the claim and says why another reason does not fit.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "mathematics",
    label: "Mathematics",
    topics: [
      {
        id: "problem-solving",
        label: "Problem solving",
        criteria: [
          {
            name: "Strategy",
            sentences: [
              "Starts work with no approach that fits the problem.",
              "Chooses an approach that fits only part of the problem.",
              "Chooses an approach that fits the problem.",
              "Chooses an approach that fits, and says why that approach fits.",
            ],
          },
          {
            name: "Work",
            sentences: [
              "Shows little of the calculation or representation.",
              "Shows work with an error that changes the result.",
              "Shows work that leads to the result.",
              "Shows work that leads to the result and checks it.",
            ],
          },
          {
            name: "Result",
            sentences: [
              "Gives no result, or gives a result in the wrong form.",
              "Gives a result that is partly correct.",
              "Gives a correct result in the form the problem asks for.",
              "Gives a correct result and says what the result means in the problem.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "writing",
    label: "Writing",
    topics: [
      {
        id: "paragraph",
        label: "A paragraph",
        criteria: [
          {
            name: "Focus",
            sentences: [
              "The paragraph has no controlling idea.",
              "The paragraph starts an idea and then leaves it.",
              "The paragraph stays with one controlling idea.",
              "The paragraph stays with one idea and the ending returns to it.",
            ],
          },
          {
            name: "Development",
            sentences: [
              "Gives no detail for the idea.",
              "Gives a detail that does not develop the idea.",
              "Gives details that develop the idea.",
              "Gives details that develop the idea, and the details are ordered.",
            ],
          },
          {
            name: "Sentences",
            sentences: [
              "Sentences are incomplete or cannot be followed.",
              "Sentences can be followed, with errors that slow the reader.",
              "Sentences can be followed, and errors do not hide the idea.",
              "Sentences can be followed, and the wording fits the audience.",
            ],
          },
        ],
      },
    ],
  },
];

function defaultDimensionId(name, index) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "criterion"}_${index}_${suffix}`;
}

export function findRubricTopic(subjectId, topicId) {
  const subject = RUBRIC_SUBJECTS.find((row) => row.id === subjectId);
  const topic = subject?.topics.find((row) => row.id === topicId);
  if (!subject || !topic) return null;
  return { subject, topic };
}

export function generateRubricDraft({ subjectId, topicId, idFor = defaultDimensionId } = {}) {
  const found = findRubricTopic(subjectId, topicId);
  if (!found) return null;
  const { topic } = found;
  return {
    name: topic.label,
    description: `Scores ${topic.label.toLowerCase()} on ${RUBRIC_LEVELS.map((level) => level.label).join(", ")}.`,
    dimensions: topic.criteria.map((criterion, index) => ({
      id: idFor(criterion.name, index),
      name: criterion.name,
      activatesAt: ACCOMPLISHED,
      exemplars: {},
      levels: RUBRIC_LEVELS.map((level, levelIndex) => {
        const sentence = criterion.sentences[levelIndex] || "";
        return {
          value: level.value,
          label: level.label,
          descriptor: sentence,
          exemplar: sentence,
        };
      }),
    })),
  };
}
