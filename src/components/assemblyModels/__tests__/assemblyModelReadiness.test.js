// src/components/assemblyModels/__tests__/assemblyModelReadiness.test.js
// D54 discharge (D90 / W18 close): client readiness mirror agrees with
// validateAssemblyModelLifecycle (+ schema's stoppingRules shape rule).

import { describe, it, expect } from "vitest";
import { validateAssemblyModelLifecycle } from "../../../../server/utils/lifecycleValidation.js";
import { validateEntity } from "../../../utils/schema.js";
import {
  meetsAssemblyReviewedGates,
  meetsAssemblyConfirmedGates,
  hasAssemblyStoppingRule,
} from "../assemblyModelReadiness.js";

const competencyModel = {
  id: "cm1",
  name: "CM",
  measurementIntent: "unidimensional",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
  smVariables: [{ id: "smv1", label: "A", type: "continuous" }],
};

const policy = { id: "p1", name: "P", type: "IRT" };

function makeDb() {
  return { competencyModels: [competencyModel], policies: [policy], assemblyModels: [] };
}

function makeAm(overrides = {}) {
  return {
    id: "am1",
    name: "Assembly",
    competencyModelId: "cm1",
    competencyModelVersion: 1,
    targetsBySMV: [{ smvId: "smv1", requiredSEM: 0.3 }],
    selectionAlgorithm: { policyId: "p1" },
    stoppingRules: { maxItems: 10 },
    status: "draft",
    ...overrides,
  };
}

function lifecycleOk(model) {
  return validateAssemblyModelLifecycle(model, makeDb()).length === 0;
}

function schemaOk(model) {
  return validateEntity("assemblyModels", model, makeDb()).valid === true;
}

describe("D54 assembly readiness mirror ↔ lifecycleValidation", () => {
  it("agrees on reviewed: complete draft is ready; each missing field blocks", () => {
    const good = makeAm({ status: "reviewed", stoppingRules: undefined });
    expect(meetsAssemblyReviewedGates(good)).toBe(true);
    expect(lifecycleOk(good)).toBe(true);

    const cases = [
      { ...good, name: "" },
      { ...good, competencyModelId: "" },
      { ...good, targetsBySMV: [] },
      { ...good, selectionAlgorithm: {} },
    ];
    for (const bad of cases) {
      expect(meetsAssemblyReviewedGates(bad), JSON.stringify(bad)).toBe(false);
      expect(lifecycleOk({ ...bad, status: "reviewed" }), JSON.stringify(bad)).toBe(false);
    }
  });

  it("agrees on confirmed: needs a real stopping rule, not an empty object", () => {
    const ready = makeAm({ status: "confirmed", locked: true });
    expect(meetsAssemblyConfirmedGates(ready)).toBe(true);
    expect(lifecycleOk(ready)).toBe(true);
    expect(schemaOk(ready)).toBe(true);

    const noRules = makeAm({ status: "confirmed", locked: true, stoppingRules: undefined });
    expect(meetsAssemblyConfirmedGates(noRules)).toBe(false);
    expect(lifecycleOk(noRules)).toBe(false);

    // Empty object: schema and lifecycle both refuse; client Confirm stays off.
    const emptyRules = makeAm({ status: "confirmed", locked: true, stoppingRules: {} });
    expect(hasAssemblyStoppingRule(emptyRules)).toBe(false);
    expect(meetsAssemblyConfirmedGates(emptyRules)).toBe(false);
    expect(schemaOk(emptyRules)).toBe(false);
    expect(lifecycleOk(emptyRules)).toBe(false);
  });

  it("reviewed does not require stopping rules (matches server)", () => {
    const reviewed = makeAm({ status: "reviewed", stoppingRules: undefined });
    expect(meetsAssemblyReviewedGates(reviewed)).toBe(true);
    expect(meetsAssemblyConfirmedGates(reviewed)).toBe(false);
    expect(lifecycleOk(reviewed)).toBe(true);
  });
});
