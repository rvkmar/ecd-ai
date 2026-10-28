// src/utils/__tests__/d151TaskSpecs.test.js
//
// D151 exit check: a spec without templateId and tmvAssignment fails;
// authored shape is not a draft entity; template change marks stale.

import { describe, it, expect } from "vitest";
import { schema, validateEntity } from "../schema.js";
import {
  taskSpecErrors,
  taskSpecReadiness,
  markTaskSpecsStaleForTemplate,
} from "../taskSpecReadiness.js";

function dbWithTemplate() {
  return {
    templates: [{ id: "tpl1", name: "Blueprint", status: "confirmed" }],
    taskSpecs: [],
  };
}

function spec(overrides = {}) {
  return {
    id: "tspec1",
    templateId: "tpl1",
    tmvAssignment: [{ taskModelVariableId: "tmv-bloom", value: "remember" }],
    stale: false,
    ...overrides,
  };
}

describe("D151 taskSpecs — schema surface", () => {
  it("declares taskSpecs in schema", () => {
    expect(schema.taskSpecs).toBeDefined();
    expect(schema.taskSpecs.templateId).toBe("string");
    expect(schema.taskSpecs.tmvAssignment).toBe("array");
    expect(schema.taskSpecs.status).toBeUndefined();
  });

  it("accepts a generated spec with templateId and tmvAssignment", () => {
    const { valid, errors } = validateEntity("taskSpecs", spec(), dbWithTemplate());
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("accepts an empty tmvAssignment array", () => {
    const { valid, errors } = validateEntity(
      "taskSpecs",
      spec({ tmvAssignment: [] }),
      dbWithTemplate()
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("refuses a spec without templateId", () => {
    const { valid, errors } = validateEntity(
      "taskSpecs",
      spec({ templateId: "" }),
      dbWithTemplate()
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /templateId is required/.test(e))).toBe(true);
  });

  it("refuses a spec without tmvAssignment", () => {
    const row = spec();
    delete row.tmvAssignment;
    const { valid, errors } = validateEntity("taskSpecs", row, dbWithTemplate());
    expect(valid).toBe(false);
    expect(errors.some((e) => /tmvAssignment is required/.test(e))).toBe(true);
  });

  it("refuses a dangling templateId", () => {
    const { valid, errors } = validateEntity(
      "taskSpecs",
      spec({ templateId: "missing" }),
      dbWithTemplate()
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /does not match a template/.test(e))).toBe(true);
  });

  it("readiness agrees with validateEntity on shape", () => {
    const ready = taskSpecReadiness(spec());
    const { errors } = validateEntity("taskSpecs", spec(), null);
    expect(ready.errors).toEqual(errors);
    expect(ready.ready).toBe(true);
  });

  it("markTaskSpecsStaleForTemplate flips only matching rows", () => {
    const db = dbWithTemplate();
    db.templates.push({ id: "tpl2", name: "Other", status: "draft" });
    db.taskSpecs = [
      spec({ id: "a", templateId: "tpl1", stale: false }),
      spec({ id: "b", templateId: "tpl2", stale: false }),
    ];
    const n = markTaskSpecsStaleForTemplate(db, "tpl1");
    expect(n).toBe(1);
    expect(db.taskSpecs[0].stale).toBe(true);
    expect(db.taskSpecs[1].stale).toBe(false);
  });

  it("taskSpecErrors is the same list validateEntity uses", () => {
    const row = spec({ templateId: "" });
    expect(taskSpecErrors(row, dbWithTemplate())).toEqual(
      validateEntity("taskSpecs", row, dbWithTemplate()).errors.filter(
        (e) => !/should be/.test(e)
      )
    );
  });
});
