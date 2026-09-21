// server/compositeLibrary/__tests__/compileSeededTaskModels.test.js
//
// Day 25 (Week 5, closing): "compile every seeded Task Model." This
// environment has no live running database (DB_MODE defaults to "mongo",
// no .env/mongo container is present in this sandbox, and there is no
// server/utils/seed*.js that populates ECD content -- only user accounts
// are auto-seeded, per server/utils/initMongo.js). The closest thing this
// repo has to "seeded" ECD content is samples/*.json -- the canonical
// worked example samples/README.md documents ("Grade 6 Fractions —
// Equivalent Fractions and Fraction Comparison"), uploaded through
// Settings > Bulk Upload.
//
// This test resolves that worked example's placeholders EXACTLY as
// samples/README.md's walkthrough instructs (`<EVIDENCE_MODEL_ID>` -> a
// real id, `<OBSERVABLE_ID_1..3>` -> o1/o2/o3 from that evidence model,
// `<SUB_TASK_MODEL_ID>` -> row 1's id) and runs buildCompositeLibrary
// against all four Task Models from samples/sample-task-models.json,
// exactly as authored there (same names, weights, blueprint constraints).

import { describe, it, expect } from "vitest";
import { buildCompositeLibrary } from "../builder.js";
import { validateEntity } from "../../../src/utils/schema.js";

const evidenceModel = {
  id: "em-numerical-reasoning",
  name: "Numerical Reasoning Evidence Model",
  competencyId: "c1787410836277_0_4",
  status: "operational",
  locked: true,
  versionNumber: 1,
  observables: [
    { id: "o1", statement: "Computes the correct final numeric answer.", type: "numeric_response", warrantId: "w1",
      evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "Final answer matches within tolerance.", justification: "Direct evidence." } },
    { id: "o2", statement: "Shows correct sequential working steps.", type: "constructed_response", warrantId: "w1",
      evidenceRule: { direction: "supports", strengthLevel: 3, activationCondition: "Steps in correct order.", justification: "Converging process evidence." } },
    { id: "o3", statement: "Selects the correct proportional relationship.", type: "selected_response", warrantId: "w2",
      evidenceRule: { direction: "supports", strengthLevel: 3, activationCondition: "Correct option selected.", justification: "Ratio recognition." } },
  ],
  statisticalModels: [{ id: "sm1", type: "irt", active: true, structureConfig: { observableIds: ["o1", "o2", "o3"], dimensions: 1 }, parameterSets: [], activeParameterSetId: null }],
};

// samples/sample-task-models.json, `<EVIDENCE_MODEL_ID>` resolved to
// "em-numerical-reasoning" and `<OBSERVABLE_ID_1..3>` resolved to o1/o2/o3
// per the README's placeholder table ("ids from that model's observables[],
// in any order"). Names, weights and blueprintConstraints are copied
// verbatim from the sample file.
function makeTaskModels() {
  const tm1 = {
    id: "tm-equivalent-fractions",
    name: "Equivalent Fractions — Bar Model Selection",
    status: "operational", // per README: "row 1 also has everything needed to reach operational"
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em-numerical-reasoning"],
    primaryEvidenceModelId: "em-numerical-reasoning",
    expectedObservations: [{ observationId: "o1", evidenceModelId: "em-numerical-reasoning", required: true, weight: 1 }],
    equivalenceGroupId: "equivalent-fractions-bar-v1",
  };

  const tm2 = {
    id: "tm-fraction-comparison",
    name: "Fraction Comparison — Justified Choice",
    status: "confirmed",
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em-numerical-reasoning"],
    primaryEvidenceModelId: "em-numerical-reasoning",
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.5 },
      { observationId: "o2", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.3 },
      { observationId: "o3", evidenceModelId: "em-numerical-reasoning", required: false, weight: 0.2 },
    ],
    equivalenceGroupId: "fraction-comparison-justified-v1",
  };

  const tm3 = {
    id: "tm-mixed-number-conversion",
    name: "Mixed Number Conversion — Three-Part",
    status: "confirmed",
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em-numerical-reasoning"],
    primaryEvidenceModelId: "em-numerical-reasoning",
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.3333 },
      { observationId: "o2", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.3333 },
      { observationId: "o3", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.3334 },
    ],
    equivalenceGroupId: "mixed-number-conversion-v1",
  };

  const tm4 = {
    id: "tm-fractions-progress-check",
    name: "Fractions Progress Check — Composite",
    status: "confirmed",
    locked: true,
    versionNumber: 1,
    evidenceModelIds: ["em-numerical-reasoning"],
    primaryEvidenceModelId: "em-numerical-reasoning",
    taskCompositionType: "composite",
    subTaskIds: ["tm-equivalent-fractions"], // <SUB_TASK_MODEL_ID> -> row 1's id, per the README's two-pass upload
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.6 },
      { observationId: "o2", evidenceModelId: "em-numerical-reasoning", required: true, weight: 0.4 },
    ],
    equivalenceGroupId: "fractions-progress-check-v1",
  };

  return [tm1, tm2, tm3, tm4];
}

// samples/sample-items.json, `<REPLACE_WITH_REAL_CONFIRMED_TASK_MODEL_ID>`
// resolved to tm1's id, and `observationId` corrected from the sample's
// illustrative slug to a real observable id on the bound evidence model
// (samples/README.md: "observationId values must be ids from the bound
// evidence model's observables[]").
const seededItem = {
  id: "item-equivalent-fractions-1",
  taskModelId: "tm-equivalent-fractions",
  taskModelVersion: 1,
  observationId: "o1",
  evidenceModelId: "em-numerical-reasoning",
  evidenceModelVersion: 1,
  status: "confirmed",
  stimulus: { layout: "single", blocks: [{ type: "text", content: "Which fraction is equivalent to 2/4?" }] },
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "opt_a", label: "1/2" },
      { id: "opt_b", label: "3/8" },
      { id: "opt_c", label: "2/3" },
      { id: "opt_d", label: "5/6" },
    ],
  },
  scoring: {
    method: "binary",
    maxScore: 1,
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Correct." },
      { responsePattern: { selected: ["opt_b", "opt_c", "opt_d"] }, activatesObservable: false, rationale: "Distractor." },
    ],
  },
};

function makeDb() {
  return { evidenceModels: [evidenceModel], taskModels: makeTaskModels(), items: [seededItem], compositeLibrary: [] };
}

describe("compile every seeded Task Model (the samples/ worked example)", () => {
  it("compiles all four Task Models from sample-task-models.json without throwing", () => {
    const db = makeDb();
    for (const taskModel of db.taskModels) {
      expect(() => buildCompositeLibrary(taskModel, db)).not.toThrow();
    }
  });

  it("row 1 (Equivalent Fractions, operational, has a real confirmed item) compiles with its item's evidence fully resolved", () => {
    const db = makeDb();
    const tm1 = db.taskModels.find((t) => t.id === "tm-equivalent-fractions");
    const { record, warnings } = buildCompositeLibrary(tm1, db);

    expect(warnings.filter((w) => !/No linkable Presentation Model/.test(w))).toEqual([]);
    expect(record.items).toHaveLength(1);
    expect(record.items[0]).toMatchObject({
      itemId: "item-equivalent-fractions-1",
      observationId: "o1",
      weight: 1,
      required: true,
      evidenceRule: { direction: "supports", strengthLevel: 4 },
    });
  });

  it("rows 2-4 (confirmed but not yet activated, no items authored against them yet) compile to an empty package with an informative warning", () => {
    const db = makeDb();
    for (const id of ["tm-fraction-comparison", "tm-mixed-number-conversion", "tm-fractions-progress-check"]) {
      const taskModel = db.taskModels.find((t) => t.id === id);
      const { record, warnings } = buildCompositeLibrary(taskModel, db);
      expect(record.items).toEqual([]);
      expect(warnings.join(" ")).toMatch(/No confirmed\/operational\/suspended items found/);
    }
  });

  it("every compiled record, once given an id, passes validateEntity(\"compositeLibrary\", ...) cleanly", () => {
    const db = makeDb();
    for (const taskModel of db.taskModels) {
      const { record } = buildCompositeLibrary(taskModel, db);
      const withId = { id: `cl-${taskModel.id}`, ...record };
      const { errors } = validateEntity("compositeLibrary", withId, db);
      expect(errors).toEqual([]);
    }
  });
});
