// src/utils/__tests__/tasksSchema.test.js
//
// D115b: instantiated `tasks` are a real collection. Structural +
// binding-lifecycle validation (itemId XOR questionId, instantiable
// Task Model, coherent item). Not a CAF status machine.

import { describe, it, expect } from "vitest";
import { schema, validateEntity, isDeliverableItem } from "../schema.js";

const taskModel = {
  id: "tm1",
  name: "Fractions",
  status: "operational",
  locked: true,
  versionNumber: 1,
};

const item = {
  id: "item1",
  taskModelId: "tm1",
  status: "confirmed",
};

function makeDb(overrides = {}) {
  return {
    taskModels: [taskModel],
    items: [item],
    tasks: [],
    ...overrides,
  };
}

function makeTask(overrides = {}) {
  return {
    id: "t1",
    taskModelId: "tm1",
    itemId: "item1",
    questionId: null,
    generatedEvidenceIds: [],
    generatedObservationIds: [],
    createdAt: "2026-09-21T12:00:00.000Z",
    updatedAt: "2026-09-21T12:00:00.000Z",
    ...overrides,
  };
}

function taskErrors(obj, db = makeDb()) {
  const { errors } = validateEntity("tasks", obj, db);
  return errors || [];
}

describe("schema.tasks is a declared collection (D115b)", () => {
  it("is no longer an unknown collection", () => {
    const { valid, errors } = validateEntity("tasks", makeTask(), makeDb());
    expect(errors).not.toContain("Unknown collection");
    expect(valid).toBe(true);
  });

  it("declares the instance shape and has no CAF status field", () => {
    expect(schema.tasks.taskModelId).toBe("string");
    expect(schema.tasks.itemId).toBe("string");
    expect(schema.tasks.questionId).toBe("string");
    expect(schema.tasks.districtId).toBe("string");
    expect(schema.tasks.status).toBeUndefined();
  });
});

describe("tasks — binding lifecycle, not CAF status", () => {
  it("accepts an instantiable Task Model bound to a coherent itemId", () => {
    expect(taskErrors(makeTask())).toEqual([]);
  });

  it("accepts a legacy questionId-only task", () => {
    expect(taskErrors(makeTask({ itemId: null, questionId: "q1" }))).toEqual([]);
  });

  it("refuses a task naming both itemId and questionId", () => {
    expect(taskErrors(makeTask({ questionId: "q1" })).join(" ")).toMatch(/not both/i);
  });

  it("refuses a task with neither itemId nor questionId", () => {
    expect(taskErrors(makeTask({ itemId: null, questionId: null })).join(" ")).toMatch(
      /either itemId or questionId/
    );
  });

  it("refuses a dangling taskModelId", () => {
    expect(taskErrors(makeTask({ taskModelId: "tm-missing" })).join(" ")).toMatch(
      /Invalid taskModelId/
    );
  });

  it("refuses a Task Model that is not instantiable", () => {
    const db = makeDb({
      taskModels: [{ ...taskModel, status: "draft", locked: false }],
    });
    expect(taskErrors(makeTask(), db).join(" ")).toMatch(/only instantiate/i);
  });

  it("refuses an item belonging to a different Task Model", () => {
    const db = makeDb({
      items: [{ ...item, taskModelId: "tm-other" }],
    });
    expect(taskErrors(makeTask(), db).join(" ")).toMatch(/belongs to Task Model/);
  });

  it("refuses a suspended item", () => {
    const db = makeDb({ items: [{ ...item, status: "suspended" }] });
    expect(taskErrors(makeTask(), db).join(" ")).toMatch(/cannot be delivered/);
  });

  it("still allows a draft item (D29 preview/test delivery)", () => {
    const db = makeDb({ items: [{ ...item, status: "draft" }] });
    expect(taskErrors(makeTask(), db)).toEqual([]);
  });

  it("does not require a CAF status on the task row", () => {
    expect(taskErrors(makeTask({ status: undefined }))).toEqual([]);
  });
});

describe("isDeliverableItem", () => {
  it("treats missing status as bindable and blocks suspended/archived", () => {
    expect(isDeliverableItem({ id: "i1" })).toBe(true);
    expect(isDeliverableItem({ id: "i1", status: "draft" })).toBe(true);
    expect(isDeliverableItem({ id: "i1", status: "suspended" })).toBe(false);
    expect(isDeliverableItem({ id: "i1", status: "archived" })).toBe(false);
    expect(isDeliverableItem(null)).toBe(false);
  });
});
