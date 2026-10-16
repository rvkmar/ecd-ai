import { describe, it, expect } from "vitest";
import { intendedDifficultyPlacement } from "../intendedDifficulty.js";
import { validateEntity } from "../schema.js";
import { itemCompatibilityNotes, itemReadiness, deriveItemContext } from "../../components/itemBank/itemConstants.js";

describe("intendedDifficultyPlacement", () => {
  const range = { min: -1, max: 1 };

  it("accepts a number inside the task range", () => {
    expect(intendedDifficultyPlacement("0.2", range).ok).toBe(true);
    expect(intendedDifficultyPlacement(-1, range).ok).toBe(true);
  });

  it("refuses a band and a number outside the range", () => {
    expect(intendedDifficultyPlacement("moderate", range).ok).toBe(false);
    expect(intendedDifficultyPlacement("2", range).message).toMatch(/outside the task range/);
  });

  it("does not apply when the task has no range", () => {
    expect(intendedDifficultyPlacement("moderate", {}).applicable).toBe(false);
  });
});

function confirmableItem(difficulty) {
  return {
    id: "it1",
    status: "reviewed",
    taskModelId: "tm1",
    taskModelVersion: 1,
    observationId: "o1",
    evidenceModelId: "em1",
    evidenceModelVersion: 1,
    stimulus: { layout: "single", blocks: [{ id: "b1", type: "text", text: "A diagram." }] },
    interaction: {
      type: "mcq",
      responseComponents: [{ id: "r1", label: "Cell membrane", value: "membrane", isCorrect: true }],
      config: {},
    },
    scoring: {
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        {
          responsePattern: { equalsCorrect: true },
          score: 1,
          activatesObservable: true,
          rationale: "The labelled part is the observable.",
        },
      ],
    },
    learningDomain: "cognitive",
    metadata: { difficulty, difficultyJustification: "Labels sit mid-range for this class." },
    psychometrics: { statisticalModelType: "ctt", irtParams: {} },
    equivalenceGroupId: "grp",
    exposureControl: { maxUsageBeforeRetire: 20 },
  };
}

const db = {
  taskModels: [
    {
      id: "tm1",
      status: "confirmed",
      locked: true,
      versionNumber: 1,
      evidenceModelIds: ["em1"],
      primaryEvidenceModelId: "em1",
      expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true }],
      blueprintConstraints: { difficultyRange: { min: 0, max: 1 } },
    },
  ],
  evidenceModels: [
    {
      id: "em1",
      status: "confirmed",
      locked: true,
      versionNumber: 1,
      observables: [{ id: "o1", type: "selected_response", statement: "Labels the part." }],
      statisticalModels: [{ id: "sm", type: "ctt", active: true }],
    },
  ],
  items: [],
};

describe("confirm-time intended difficulty", () => {
  it("refuses a waiver-style band once the task range exists", () => {
    const item = confirmableItem("moderate");
    const { errors } = validateEntity("items", item, db, { strict: true });
    expect(errors.some((e) => /inside the task range/.test(e))).toBe(true);

    const ctx = deriveItemContext(item, {
      taskModel: db.taskModels[0],
      evidenceModel: db.evidenceModels[0],
    });
    expect(itemReadiness(item, ctx).find((c) => c.id === "intendedDifficulty").ok).toBe(false);
    expect(
      itemCompatibilityNotes(item, ctx).some((n) => n.severity === "blocking" && /task range/.test(n.message))
    ).toBe(true);
  });

  it("accepts a number inside the range", () => {
    const item = confirmableItem("0.4");
    const { errors } = validateEntity("items", item, db, { strict: true });
    expect(errors.some((e) => /task range/.test(e))).toBe(false);
  });
});
