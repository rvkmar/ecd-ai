// src/utils/__tests__/taskModelVariableReadiness.test.js
//
// D116 artefact 6. Readiness and validateEntity must agree on whether a
// Task Model Variable record is complete. They do not share a function.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { taskModelVariableReadiness } from "../taskModelVariableReadiness.js";

const fixtures = [
  { name: "complete categorical", record: {
    id: "tmv1",
    name: "Context",
    type: "categorical",
    possibleValues: [{ value: "a", label: "A" }, { value: "b" }],
  }},
  { name: "bloom valueSet", record: {
    id: "tmv2",
    name: "Bloom",
    type: "categorical",
    valueSet: "bloomLevel",
  }},
  { name: "numeric range", record: {
    id: "tmv3",
    name: "Count",
    type: "numeric",
    range: { min: 1, max: 4 },
  }},
  { name: "boolean", record: { id: "tmv4", name: "Diagram", type: "boolean" } },
  { name: "missing name", record: { id: "tmv5", type: "boolean" } },
  { name: "bad type", record: { id: "tmv6", name: "X", type: "mastery" } },
  { name: "one level", record: {
    id: "tmv7",
    name: "X",
    type: "ordinal",
    possibleValues: [{ value: "only" }],
  }},
  { name: "copied levels on valueSet", record: {
    id: "tmv8",
    name: "X",
    type: "categorical",
    valueSet: "reasoningType",
    possibleValues: [{ value: "recall" }],
  }},
  { name: "unknown valueSet", record: {
    id: "tmv9",
    name: "X",
    type: "categorical",
    valueSet: "invented",
  }},
  { name: "inverted range", record: {
    id: "tmv10",
    name: "X",
    type: "numeric",
    range: { min: 3, max: 1 },
  }},
  { name: "boolean with levels", record: {
    id: "tmv11",
    name: "X",
    type: "boolean",
    possibleValues: [{ value: "true" }, { value: "false" }],
  }},
  { name: "valueSet on numeric", record: {
    id: "tmv12",
    name: "X",
    type: "numeric",
    valueSet: "bloomLevel",
    range: { min: 0, max: 1 },
  }},
];

function agree(record, options) {
  const schema = validateEntity("taskModelVariables", record, { taskModelVariables: [] }, options);
  const mirror = taskModelVariableReadiness(record, options);
  expect(mirror.ready).toBe(schema.valid);
}

describe("mirror: taskModelVariableReadiness <-> validateEntity", () => {
  it.each(fixtures)("agree on $name (strict)", ({ record }) => {
    agree(record, { strict: true });
  });

  it("agree that a name-only draft is legal when strict is off", () => {
    agree({ id: "draft", name: "Started" }, { strict: false });
  });

  it("agree that one authored level is legal while drafting", () => {
    agree(
      {
        id: "draft",
        name: "Started",
        type: "categorical",
        possibleValues: [{ value: "only" }],
      },
      { strict: false }
    );
  });
});
