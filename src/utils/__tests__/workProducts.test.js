// src/utils/__tests__/workProducts.test.js
//
// D121 (W25 G12): workProducts are typed reusable records.
// Exit gate lives in d121WorkProductIdenticalScoring.test.js.
// No CAF status machine.

import { describe, it, expect } from "vitest";
import {
  schema,
  validateEntity,
  itemsConsumingWorkProduct,
} from "../schema.js";
import { WORK_PRODUCT_TYPE_VALUES } from "../ecdVocabulary.js";

function workProduct(overrides = {}) {
  return {
    id: "wp1",
    name: "Selected answer",
    type: "selected_response",
    ...overrides,
  };
}

describe("workProducts — well-formed record", () => {
  it("accepts a selected_response work product", () => {
    const { valid, errors } = validateEntity(
      "workProducts",
      workProduct(),
      { workProducts: [] }
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("rejects an unknown type", () => {
    const { valid } = validateEntity(
      "workProducts",
      workProduct({ type: "essay_blob" }),
      { workProducts: [] }
    );
    expect(valid).toBe(false);
  });

  it("allows a name-only draft when strict is off", () => {
    const { valid, errors } = validateEntity(
      "workProducts",
      { id: "wp-draft", name: "Started" },
      { workProducts: [] },
      { strict: false }
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("has no CAF status field", () => {
    expect(schema.workProducts.status).toBeUndefined();
  });

  it("rejects a duplicate name", () => {
    const db = {
      workProducts: [workProduct({ id: "wp-existing", name: "Selected answer" })],
    };
    const { valid, errors } = validateEntity(
      "workProducts",
      workProduct({ id: "wp-new" }),
      db
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /already used/.test(e))).toBe(true);
  });

  it("type vocabulary aliases observable response modes", () => {
    expect(WORK_PRODUCT_TYPE_VALUES).toContain("selected_response");
    expect(WORK_PRODUCT_TYPE_VALUES).toContain("process_trace");
  });
});

describe("item.interaction.workProductId binding", () => {
  it("accepts a compatible interaction for the bound Work Product", () => {
    const wp = workProduct({ id: "wp-sel" });
    const item = {
      id: "item-1",
      name: "MCQ",
      status: "draft",
      taskModelId: "tm1",
      observationId: "o1",
      interaction: { type: "mcq", workProductId: "wp-sel" },
      scoring: { method: "dichotomous", evidenceActivationMap: [] },
    };
    const db = {
      workProducts: [wp],
      taskModels: [
        {
          id: "tm1",
          status: "draft",
          locked: false,
          versionNumber: 1,
          expectedObservations: [{ observationId: "o1", evidenceModelId: "em1" }],
        },
      ],
      evidenceModels: [],
      items: [],
    };
    const { errors } = validateEntity("items", item, db, { strict: false });
    expect(errors.filter((e) => /workProduct|Interaction/.test(e))).toEqual([]);
  });

  it("rejects an incompatible interaction for the bound Work Product", () => {
    const wp = workProduct({ id: "wp-sel", type: "selected_response" });
    const item = {
      id: "item-1",
      name: "Wrong widget",
      status: "draft",
      taskModelId: "tm1",
      observationId: "o1",
      interaction: { type: "constructed", workProductId: "wp-sel" },
      scoring: { method: "dichotomous", evidenceActivationMap: [] },
    };
    const db = {
      workProducts: [wp],
      taskModels: [
        {
          id: "tm1",
          status: "draft",
          locked: false,
          versionNumber: 1,
          expectedObservations: [{ observationId: "o1", evidenceModelId: "em1" }],
        },
      ],
      evidenceModels: [],
      items: [],
    };
    const { valid, errors } = validateEntity("items", item, db, { strict: false });
    expect(valid).toBe(false);
    expect(errors.some((e) => /cannot elicit|Interaction/i.test(e))).toBe(true);
  });

  it("lists consuming items", () => {
    const db = {
      items: [
        { id: "a", interaction: { workProductId: "wp1" } },
        { id: "b", interaction: { workProductId: "wp2" } },
        { id: "c", interaction: { workProductId: "wp1" } },
      ],
    };
    expect(itemsConsumingWorkProduct(db, "wp1").map((i) => i.id)).toEqual([
      "a",
      "c",
    ]);
  });
});
