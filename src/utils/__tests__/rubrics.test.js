// src/utils/__tests__/rubrics.test.js
//
// D122: rubrics are reusable records with exemplars.

import { describe, it, expect } from "vitest";
import {
  schema,
  validateEntity,
  evidenceModelsConsumingRubric,
} from "../schema.js";
import { artifactFromRubric, exemplarCount } from "../rubricDelivery.js";
import { rubricReadiness } from "../rubricReadiness.js";

function rubric(overrides = {}) {
  return {
    id: "rub1",
    name: "Accuracy rubric",
    status: "draft",
    dimensions: [
      {
        id: "accuracy",
        name: "Accuracy",
        levels: [
          { value: 0, label: "Incorrect", exemplar: "Student writes 2+2=5" },
          { value: 1, label: "Correct", exemplar: "Student writes 2+2=4" },
        ],
        activatesAt: 1,
      },
    ],
    ...overrides,
  };
}

describe("rubrics — well-formed record", () => {
  it("accepts a draft with dimensions", () => {
    const { valid, errors } = validateEntity("rubrics", rubric(), { rubrics: [] });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("refuses confirm without exemplars", () => {
    const { valid, errors } = validateEntity(
      "rubrics",
      rubric({
        status: "confirmed",
        dimensions: [
          {
            id: "accuracy",
            levels: [{ value: 0, label: "Low" }, { value: 1, label: "High" }],
            activatesAt: 1,
          },
        ],
      }),
      { rubrics: [] }
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /exemplar/i.test(e))).toBe(true);
  });

  it("accepts a confirmed rubric with exemplars", () => {
    const { valid, errors } = validateEntity(
      "rubrics",
      rubric({ status: "confirmed" }),
      { rubrics: [] }
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
    expect(exemplarCount(rubric({ status: "confirmed" }))).toBeGreaterThan(0);
  });

  it("has no CAF operational field required", () => {
    expect(schema.rubrics.status).toBe("string");
    expect(schema.rubrics.locked).toBeUndefined();
  });

  it("accepts four or more levels and does not cap the count", () => {
    const levels = Array.from({ length: 11 }, (_, value) => ({
      value,
      label: `L${value}`,
      descriptor: value === 10 ? "Top band." : "",
      exemplar: value === 10 ? "Top band." : "",
    }));
    const record = rubric({
      status: "confirmed",
      dimensions: [
        { id: "accuracy", name: "Accuracy", levels, activatesAt: 10 },
      ],
    });
    const { valid, errors } = validateEntity("rubrics", record, { rubrics: [] });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
    expect(rubricReadiness(record)).toEqual({ ready: true, errors: [] });
    expect(artifactFromRubric(record).dimensions[0].levels).toHaveLength(11);
    expect(exemplarCount(record)).toBe(1);
  });

  it("projects to a delivery artifact", () => {
    const art = artifactFromRubric(rubric());
    expect(art).toEqual({
      kind: "rubric",
      dimensions: [
        { id: "accuracy", name: "Accuracy", levels: [0, 1], activatesAt: 1 },
      ],
    });
  });
});

describe("D122 exit check — one rubric, two Evidence Models", () => {
  it("references the same confirmed rubricId from two EMs", () => {
    const shared = rubric({ id: "rub-shared", status: "confirmed" });
    const em = (id) => ({
      id,
      name: id,
      status: "draft",
      locked: false,
      versionNumber: 1,
      observables: [
        {
          id: "o1",
          type: "selected_response",
          evidenceRule: {
            direction: "supports",
            strengthLevel: 3,
            activationCondition: "any",
            justification: "Rated work.",
          },
        },
      ],
      evaluationProcedures: [
        {
          id: "ep1",
          observableId: "o1",
          workProductType: "selected_response",
          method: "rubric",
          description: "Score with shared rubric definition.",
          rubricId: "rub-shared",
        },
      ],
    });
    const first = em("em-a");
    const second = em("em-b");
    const db = {
      rubrics: [shared],
      evidenceModels: [first, second],
      workProducts: [],
    };

    const a = validateEntity("evidenceModels", first, db, { strict: false });
    const b = validateEntity("evidenceModels", second, db, { strict: false });
    expect(a.errors.filter((e) => /rubric/i.test(e))).toEqual([]);
    expect(b.errors.filter((e) => /rubric/i.test(e))).toEqual([]);
    expect(evidenceModelsConsumingRubric(db, "rub-shared").map((e) => e.id)).toEqual([
      "em-a",
      "em-b",
    ]);
  });
});
