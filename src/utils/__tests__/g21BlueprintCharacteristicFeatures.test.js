import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";

function taskModelErrors(blueprintConstraints) {
  const { errors } = validateEntity(
    "taskModels",
    { id: "tm1", blueprintConstraints },
    null,
    { strict: false }
  );
  return errors || [];
}

describe("blueprintConstraints.characteristicFeatures", () => {
  it("leaves an empty blueprint valid", () => {
    expect(taskModelErrors({}).join(" ")).not.toMatch(/characteristicFeatures/);
  });

  it("accepts a labelled characteristic feature", () => {
    const errors = taskModelErrors({
      characteristicFeatures: [{ label: "Uses a labelled diagram" }],
    });
    expect(errors.join(" ")).not.toMatch(/characteristicFeatures/);
  });

  it("rejects a non-array and a blank label", () => {
    expect(taskModelErrors({ characteristicFeatures: "Uses a labelled diagram" }).join(" ")).toMatch(
      /characteristicFeatures must be an array/
    );
    expect(taskModelErrors({ characteristicFeatures: [{ label: "  " }] }).join(" ")).toMatch(
      /characteristicFeatures\[0\]\.label is required/
    );
  });
});
