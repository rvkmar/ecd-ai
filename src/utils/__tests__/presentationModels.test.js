// src/utils/__tests__/presentationModels.test.js
//
// D113 (W23 G8): the new `presentationModels` collection.
// Structural + referential-integrity validation. Exit check: validation
// passes a fixture and fails deliberate mutations; a dangling taskModelId
// is refused.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";

const taskModel = {
  id: "tm1",
  name: "Equivalent Fractions Task Model",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
};

function makeDb(overrides = {}) {
  return {
    taskModels: [taskModel],
    presentationModels: [],
    ...overrides,
  };
}

function makePresentationModel(overrides = {}) {
  return {
    id: "pm1",
    name: "Fractions linear presentation",
    taskModelId: "tm1",
    taskModelVersion: 1,
    layout: { itemOrder: "authored", grouping: "single_item", navigation: "linear" },
    conditionalDisplay: {
      showFeedback: "none",
      allowSkip: false,
      allowReview: false,
      showProgress: true,
    },
    accessibility: { profile: "default", fontScale: 1, timeMultiplier: 1 },
    status: "draft",
    locked: false,
    versionNumber: 1,
    ...overrides,
  };
}

function pmErrors(model, db = makeDb()) {
  const { errors } = validateEntity("presentationModels", model, db);
  return errors || [];
}

describe("presentationModels — passing fixture", () => {
  it("accepts a well-formed presentation model bound to a Task Model", () => {
    expect(pmErrors(makePresentationModel())).toEqual([]);
  });

  it("accepts a draft with layout/conditionalDisplay/accessibility omitted", () => {
    expect(
      pmErrors(
        makePresentationModel({
          layout: undefined,
          conditionalDisplay: undefined,
          accessibility: undefined,
        })
      )
    ).toEqual([]);
  });
});

describe("presentationModels — deliberate mutations", () => {
  it("rejects a dangling taskModelId", () => {
    const errors = pmErrors(makePresentationModel({ taskModelId: "tm-does-not-exist" }));
    expect(errors.join(" ")).toMatch(/Invalid taskModelId/);
  });

  it("rejects an unknown layout.itemOrder", () => {
    const errors = pmErrors(
      makePresentationModel({ layout: { itemOrder: "adaptive", navigation: "linear" } })
    );
    expect(errors.join(" ")).toMatch(/Invalid layout\.itemOrder/);
  });

  it("rejects an unknown layout.navigation", () => {
    const errors = pmErrors(
      makePresentationModel({ layout: { itemOrder: "authored", navigation: "branching" } })
    );
    expect(errors.join(" ")).toMatch(/Invalid layout\.navigation/);
  });

  it("rejects an unknown accessibility.profile", () => {
    const errors = pmErrors(
      makePresentationModel({ accessibility: { profile: "xxxlarge" } })
    );
    expect(errors.join(" ")).toMatch(/Invalid accessibility\.profile/);
  });

  it("rejects fontScale outside [1, 2]", () => {
    const errors = pmErrors(
      makePresentationModel({ accessibility: { profile: "default", fontScale: 3 } })
    );
    expect(errors.join(" ")).toMatch(/fontScale must be a number in \[1, 2\]/);
  });

  it("rejects a non-boolean allowSkip", () => {
    const errors = pmErrors(
      makePresentationModel({
        conditionalDisplay: { showFeedback: "none", allowSkip: "yes" },
      })
    );
    expect(errors.join(" ")).toMatch(/allowSkip should be boolean/);
  });

  it("rejects confirmed without locked", () => {
    const errors = pmErrors(makePresentationModel({ status: "confirmed", locked: false }));
    expect(errors.join(" ")).toMatch(/Confirmed presentation models must be locked/);
  });

  it("rejects a missing name", () => {
    const errors = pmErrors(makePresentationModel({ name: "" }));
    expect(errors.join(" ")).toMatch(/name is required/);
  });
});
