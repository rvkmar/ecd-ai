// src/components/presentationModels/__tests__/presentationModelReadiness.test.js
// D113: client readiness mirror agrees with validatePresentationModelLifecycle.

import { describe, it, expect } from "vitest";
import { validatePresentationModelLifecycle } from "../../../../server/utils/lifecycleValidation.js";
import { validateEntity } from "../../../utils/schema.js";
import {
  meetsPresentationReviewedGates,
  meetsPresentationConfirmedGates,
} from "../presentationModelReadiness.js";

const taskModel = {
  id: "tm1",
  name: "TM",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
};

function makeDb() {
  return { taskModels: [taskModel], presentationModels: [] };
}

function makePm(overrides = {}) {
  return {
    id: "pm1",
    name: "Presentation",
    taskModelId: "tm1",
    taskModelVersion: 1,
    layout: { itemOrder: "authored", navigation: "linear" },
    conditionalDisplay: { showFeedback: "none" },
    accessibility: { profile: "default" },
    status: "draft",
    ...overrides,
  };
}

function lifecycleOk(model) {
  return validatePresentationModelLifecycle(model, makeDb()).length === 0;
}

function schemaOk(model) {
  return validateEntity("presentationModels", model, makeDb()).valid === true;
}

describe("D113 presentation readiness mirror ↔ lifecycleValidation", () => {
  it("agrees on reviewed: complete draft is ready; each missing field blocks", () => {
    const good = makePm({
      status: "reviewed",
      conditionalDisplay: undefined,
      accessibility: undefined,
    });
    expect(meetsPresentationReviewedGates(good)).toBe(true);
    expect(lifecycleOk(good)).toBe(true);
    expect(schemaOk(good)).toBe(true);

    const cases = [
      { ...good, name: "" },
      { ...good, taskModelId: "" },
      { ...good, layout: { navigation: "linear" } },
      { ...good, layout: { itemOrder: "authored" } },
    ];
    for (const bad of cases) {
      expect(meetsPresentationReviewedGates(bad), JSON.stringify(bad)).toBe(false);
      expect(lifecycleOk({ ...bad, status: "reviewed" }), JSON.stringify(bad)).toBe(false);
    }
  });

  it("agrees on confirmed: needs feedback timing and accessibility profile", () => {
    const ready = makePm({ status: "confirmed", locked: true });
    expect(meetsPresentationConfirmedGates(ready)).toBe(true);
    expect(lifecycleOk(ready)).toBe(true);
    expect(schemaOk(ready)).toBe(true);

    const noFeedback = makePm({
      status: "confirmed",
      locked: true,
      conditionalDisplay: {},
    });
    expect(meetsPresentationConfirmedGates(noFeedback)).toBe(false);
    expect(lifecycleOk(noFeedback)).toBe(false);

    const noProfile = makePm({
      status: "confirmed",
      locked: true,
      accessibility: {},
    });
    expect(meetsPresentationConfirmedGates(noProfile)).toBe(false);
    expect(lifecycleOk(noProfile)).toBe(false);
  });

  it("reviewed does not require accessibility (matches server)", () => {
    const reviewed = makePm({
      status: "reviewed",
      conditionalDisplay: undefined,
      accessibility: undefined,
    });
    expect(meetsPresentationReviewedGates(reviewed)).toBe(true);
    expect(meetsPresentationConfirmedGates(reviewed)).toBe(false);
    expect(lifecycleOk(reviewed)).toBe(true);
  });
});
