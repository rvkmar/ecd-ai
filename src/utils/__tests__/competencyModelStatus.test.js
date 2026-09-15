// src/utils/__tests__/competencyModelStatus.test.js
//
// Regression cover for a bug that made the review pass unusable:
// schema.js's competencyModels branch hardcoded
//
//     if (!["draft", "confirmed"].includes(obj.status))
//         errors.push("status must be draft or confirmed.");
//
// while lifecycleMatrix.STATUS declares six. The Competency Wizard PUTs
// the draft silently on every Next, so the moment a reviewer walked a
// `reviewed` model past Step 2 (Measurement Intent) the auto-save came
// back 400 and the toast read "status must be draft or confirmed" — an
// error about a status the app itself had just assigned.
//
// The enum now comes from the matrix, so adding a status there can never
// leave this check behind again.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { STATUS } from "../../../server/utils/lifecycleMatrix.js";

function makeModel(overrides = {}) {
  return {
    id: "cm1",
    name: "Numerical Reasoning Framework",
    description: "Framework for numerical reasoning competencies.",
    measurementIntent: "unidimensional",
    versionNumber: 1,
    status: "draft",
    locked: false,
    ...overrides,
  };
}

/** Only the status-enum error — other rules are covered elsewhere. */
function statusErrors(model, db = {}) {
  const { errors } = validateEntity("competencyModels", model, db);
  return (errors || []).filter((e) => /status/i.test(e));
}

describe("competencyModels status validation", () => {

  it("accepts every status the lifecycle matrix declares", () => {
    for (const status of STATUS) {
      // confirmed/archived carry their own locked requirement; satisfy it
      // so we isolate the enum check itself.
      const model = makeModel({ status, locked: status !== "draft" && status !== "reviewed" });
      expect(statusErrors(model)).toEqual([]);
    }
  });

  it("accepts reviewed — the status the wizard's Save assigns", () => {
    expect(statusErrors(makeModel({ status: "reviewed" }))).toEqual([]);
  });

  it("still rejects a status the matrix does not declare", () => {
    const errors = statusErrors(makeModel({ status: "pending" }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toMatch(/Invalid competency model status 'pending'/);
  });

  it("still requires a status", () => {
    const model = makeModel();
    delete model.status;
    expect(statusErrors(model).join(" ")).toMatch(/status is required/);
  });

  it("still requires a confirmed model to be locked", () => {
    const errors = validateEntity(
      "competencyModels",
      makeModel({ status: "confirmed", locked: false }),
      {}
    ).errors;
    expect(errors.join(" ")).toMatch(/Confirmed models must be locked/);
  });

  it("still requires an archived model to be locked", () => {
    const errors = validateEntity(
      "competencyModels",
      makeModel({ status: "archived", locked: false }),
      {}
    ).errors;
    expect(errors.join(" ")).toMatch(/Archived models must be locked/);
  });
});
