// src/utils/__tests__/workProductReadiness.test.js

import { describe, it, expect } from "vitest";
import {
  workProductReadiness,
  WORK_PRODUCT_TYPE_MIRROR,
} from "../workProductReadiness.js";
import { validateEntity } from "../schema.js";

describe("workProductReadiness agrees with validateEntity", () => {
  it("flags missing type under strict", () => {
    const record = { id: "wp1", name: "X" };
    const mirror = workProductReadiness(record, { strict: true });
    const auth = validateEntity("workProducts", record, { workProducts: [] });
    expect(mirror.ready).toBe(false);
    expect(auth.valid).toBe(false);
    expect(WORK_PRODUCT_TYPE_MIRROR.length).toBeGreaterThan(0);
  });

  it("accepts a complete record", () => {
    const record = {
      id: "wp1",
      name: "Selected",
      type: "selected_response",
    };
    expect(workProductReadiness(record).ready).toBe(true);
    expect(validateEntity("workProducts", record, { workProducts: [] }).valid).toBe(
      true
    );
  });
});
