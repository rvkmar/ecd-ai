// src/utils/__tests__/taskModelVariables.test.js
//
// D116 (W24 G13): taskModelVariables are typed reusable records.
// Exit gate: one variable id is referenced by at least two Task Models.
// No CAF status machine. D115b tasks binding stays a separate collection.

import { describe, it, expect } from "vitest";
import {
  schema,
  validateEntity,
  taskModelsConsumingVariable,
} from "../schema.js";
import { BLOOM_LEVEL_VALUES } from "../ecdVocabulary.js";

function variable(overrides = {}) {
  return {
    id: "tmv1",
    name: "Context familiarity",
    type: "categorical",
    possibleValues: [
      { value: "familiar", label: "Familiar" },
      { value: "novel", label: "Novel" },
    ],
    ...overrides,
  };
}

describe("taskModelVariables — well-formed record", () => {
  it("accepts a categorical variable with possible values", () => {
    const db = { taskModelVariables: [] };
    const { valid, errors } = validateEntity("taskModelVariables", variable(), db);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("accepts a Bloom-aligned variable without copying the levels", () => {
    const record = variable({
      id: "tmv-bloom",
      name: "Cognitive demand",
      type: "categorical",
      valueSet: "bloomLevel",
      possibleValues: undefined,
    });
    const { valid, errors } = validateEntity("taskModelVariables", record, {
      taskModelVariables: [],
    });
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
    expect(record.possibleValues).toBeUndefined();
    expect(BLOOM_LEVEL_VALUES).toContain("apply");
  });

  it("accepts a numeric variable with a range", () => {
    const { valid, errors } = validateEntity(
      "taskModelVariables",
      variable({
        type: "numeric",
        possibleValues: undefined,
        range: { min: 0, max: 5 },
      }),
      { taskModelVariables: [] }
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("rejects a copied Bloom list when valueSet is set", () => {
    const { valid, errors } = validateEntity(
      "taskModelVariables",
      variable({
        valueSet: "bloomLevel",
        possibleValues: [{ value: "remember" }, { value: "apply" }],
      }),
      { taskModelVariables: [] }
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /ecdVocabulary/.test(e))).toBe(true);
  });

  it("rejects an unknown type", () => {
    const { valid } = validateEntity(
      "taskModelVariables",
      variable({ type: "mastery" }),
      { taskModelVariables: [] }
    );
    expect(valid).toBe(false);
  });

  it("allows a name-only draft when strict is off", () => {
    const { valid, errors } = validateEntity(
      "taskModelVariables",
      { id: "tmv-draft", name: "Started" },
      { taskModelVariables: [] },
      { strict: false }
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("has no CAF status field", () => {
    expect(schema.taskModelVariables.status).toBeUndefined();
    expect(schema.tasks.status).toBeUndefined();
  });

  it("rejects a duplicate name", () => {
    const db = {
      taskModelVariables: [variable({ id: "tmv-existing", name: "Context familiarity" })],
    };
    const { valid, errors } = validateEntity(
      "taskModelVariables",
      variable({ id: "tmv-new" }),
      db
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /already used/.test(e))).toBe(true);
  });
});

describe("W24 gate — one Task Model Variable, two Task Models", () => {
  it("references the same variable id from at least two Task Models", () => {
    const tmv = variable({
      id: "tmv-shared",
      name: "Cognitive demand",
      type: "categorical",
      valueSet: "bloomLevel",
      possibleValues: undefined,
    });
    const settings = [
      {
        taskModelVariableId: "tmv-shared",
        allowedValues: ["apply", "analyze"],
        required: true,
      },
    ];
    const taskModel = (id) => ({
      id,
      name: id,
      status: "draft",
      locked: false,
      versionNumber: 1,
      taskModelVariableIds: ["tmv-shared"],
      taskModelVariableSettings: settings,
    });
    const first = taskModel("tm-one");
    const second = taskModel("tm-two");
    const db = {
      taskModelVariables: [tmv],
      taskModels: [first, second],
      evidenceModels: [],
    };

    expect(validateEntity("taskModelVariables", tmv, db).valid).toBe(true);
    expect(validateEntity("taskModels", first, db, { strict: false }).valid).toBe(true);
    expect(validateEntity("taskModels", second, db, { strict: false }).valid).toBe(true);

    const consumers = taskModelsConsumingVariable(db, "tmv-shared");
    expect(consumers.length).toBeGreaterThanOrEqual(2);
    expect(consumers.map((tm) => tm.id).sort()).toEqual(["tm-one", "tm-two"]);
    expect(new Set(consumers.flatMap((tm) => tm.taskModelVariableIds))).toEqual(
      new Set(["tmv-shared"])
    );
  });

  it("refuses a setting outside the shared variable's levels", () => {
    const tmv = variable({ id: "tmv-shared", valueSet: "bloomLevel", possibleValues: undefined });
    const taskModel = {
      id: "tm-one",
      status: "draft",
      locked: false,
      versionNumber: 1,
      taskModelVariableIds: ["tmv-shared"],
      taskModelVariableSettings: [
        { taskModelVariableId: "tmv-shared", allowedValues: ["not-a-bloom-level"] },
      ],
    };
    const { valid, errors } = validateEntity("taskModels", taskModel, {
      taskModelVariables: [tmv],
      taskModels: [],
    }, { strict: false });
    expect(valid).toBe(false);
    expect(errors.some((e) => /not a possible value/.test(e))).toBe(true);
  });

  it("refuses a dangling variable id", () => {
    const { valid, errors } = validateEntity(
      "taskModels",
      {
        id: "tm-one",
        status: "draft",
        locked: false,
        versionNumber: 1,
        taskModelVariableIds: ["missing"],
      },
      { taskModelVariables: [], taskModels: [] },
      { strict: false }
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /Invalid taskModelVariableId/.test(e))).toBe(true);
  });
});
