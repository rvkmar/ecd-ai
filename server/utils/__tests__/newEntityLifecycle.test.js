// server/utils/__tests__/newEntityLifecycle.test.js
//
// Day 21 (Week 5): lifecycle wiring for the three collections added in
// Week 4 (assemblyModels, qMatrixModels, compositeLibrary). Exit check:
// every new entity has legal transitions and a promotion validator; no
// second guard anywhere compares status indices.
//
// assemblyModels/qMatrixModels have no route yet (still "not mounted, no
// UI"), so validateAssemblyModelLifecycle/validateQMatrixModelLifecycle
// are self-contained: they do their own canTransition() check against a
// `db` self-lookup rather than relying on a route to compute
// prevStatus/nextStatus, unlike validateTaskModelLifecycle/
// validateItemLifecycle which lean on their routes for that.
//
// compositeLibrary deliberately has NO status field at all (ADR 0003: a
// build artifact, not an authored entity) -- there is intentionally no
// validateCompositeLibraryLifecycle here. That absence is the Day 21
// decision for that collection, not an oversight.

import { describe, it, expect } from "vitest";
import {
  validateAssemblyModelLifecycle,
  validateQMatrixModelLifecycle,
} from "../lifecycleValidation.js";

const operationalCompetencyModel = {
  id: "cm1",
  status: "operational",
  locked: true,
  versionNumber: 2,
  smVariables: [
    { id: "smv-theta", type: "continuous" },
    { id: "attr-a", type: "binary" },
  ],
};

const confirmedCompetencyModel = {
  id: "cm-confirmed",
  status: "confirmed",
  locked: true,
  versionNumber: 2,
  smVariables: operationalCompetencyModel.smVariables,
};

const draftCompetencyModel = { id: "cm2", status: "draft", locked: false, versionNumber: 1 };

const db = {
  competencyModels: [operationalCompetencyModel, confirmedCompetencyModel, draftCompetencyModel],
  assemblyModels: [],
  qMatrixModels: [],
};

function makeAssemblyModel(overrides = {}) {
  return {
    id: "am1",
    name: "Numerical Reasoning Assembly",
    competencyModelId: "cm1",
    competencyModelVersion: 2,
    targetsBySMV: [{ smvId: "smv-theta", requiredSEM: 0.3 }],
    stoppingRules: { maxItems: 20 },
    selectionAlgorithm: { policyId: "p1" },
    status: "draft",
    ...overrides,
  };
}

function makeQMatrix(overrides = {}) {
  return {
    id: "qm1",
    name: "Diagnostics Q-matrix",
    competencyModelId: "cm1",
    competencyModelVersion: 2,
    attributeIds: ["attr-a"],
    entries: [{ itemId: "i1", attributeId: "attr-a" }],
    status: "draft",
    ...overrides,
  };
}

describe("validateAssemblyModelLifecycle", () => {
  it("accepts a draft with nothing filled in yet", () => {
    expect(validateAssemblyModelLifecycle({ id: "am-new", status: "draft" }, db)).toEqual([]);
  });

  it("requires name/competencyModelId/targets/selectionAlgorithm before review", () => {
    const errors = validateAssemblyModelLifecycle({ id: "am-new", status: "reviewed" }, db);
    expect(errors.join(" ")).toMatch(/must have a name before review/);
    expect(errors.join(" ")).toMatch(/must reference a competencyModelId before review/);
    expect(errors.join(" ")).toMatch(/at least one SMV accuracy target before review/);
    expect(errors.join(" ")).toMatch(/must bind a selectionAlgorithm\.policyId before review/);
  });

  it("accepts a fully-specified reviewed model", () => {
    expect(validateAssemblyModelLifecycle(makeAssemblyModel({ status: "reviewed" }), db)).toEqual([]);
  });

  it("requires stoppingRules before confirmation", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "confirmed", locked: true, stoppingRules: undefined }),
      db
    );
    expect(errors.join(" ")).toMatch(
      /must declare stoppingRules.*before confirmation/
    );
  });

  it("activates cleanly when the bound competency model is operational at the matching version", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "operational", locked: true }),
      db
    );
    expect(errors).toEqual([]);
  });

  it("activates cleanly when the bound competency model is confirmed and locked at the matching version", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({
        status: "operational",
        locked: true,
        competencyModelId: "cm-confirmed",
        competencyModelVersion: 2,
      }),
      db
    );
    expect(errors).toEqual([]);
  });

  it("refuses activation when the bound competency model is not a frozen parent", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "operational", locked: true, competencyModelId: "cm2", competencyModelVersion: 1 }),
      db
    );
    expect(errors.join(" ")).toMatch(/locked, non-archived parent/);
  });

  it("refuses activation on a competencyModelVersion mismatch", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "operational", locked: true, competencyModelVersion: 1 }),
      db
    );
    expect(errors.join(" ")).toMatch(/does not match the competency model's current version/);
  });

  it("refuses activation when competencyModelId points at no competency model at all (not merely a non-operational one)", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "operational", locked: true, competencyModelId: "cm-ghost" }),
      db
    );
    expect(errors.join(" ")).toMatch(/competency model 'cm-ghost' not found/);
  });

  it("requires at least one SMV accuracy target before review, even when targetsBySMV is an empty array rather than missing", () => {
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "reviewed", targetsBySMV: [] }),
      db
    );
    expect(errors.join(" ")).toMatch(/at least one SMV accuracy target before review/);
  });

  it("refuses an illegal status transition (draft -> operational, skipping the matrix)", () => {
    const existing = makeAssemblyModel({ status: "draft" });
    const dbWithExisting = { ...db, assemblyModels: [existing] };
    const errors = validateAssemblyModelLifecycle(
      makeAssemblyModel({ status: "operational", locked: true }),
      dbWithExisting
    );
    expect(errors.join(" ")).toMatch(/Illegal assembly model status transition: 'draft' -> 'operational'/);
  });

  it("allows the legal draft -> reviewed transition", () => {
    const existing = makeAssemblyModel({ status: "draft" });
    const dbWithExisting = { ...db, assemblyModels: [existing] };
    const errors = validateAssemblyModelLifecycle(makeAssemblyModel({ status: "reviewed" }), dbWithExisting);
    expect(errors).toEqual([]);
  });
});

describe("validateQMatrixModelLifecycle", () => {
  it("accepts a draft with nothing filled in yet", () => {
    expect(validateQMatrixModelLifecycle({ id: "qm-new", status: "draft" }, db)).toEqual([]);
  });

  it("requires name/competencyModelId/attributeIds before review", () => {
    const errors = validateQMatrixModelLifecycle({ id: "qm-new", status: "reviewed" }, db);
    expect(errors.join(" ")).toMatch(/must have a name before review/);
    expect(errors.join(" ")).toMatch(/must reference a competencyModelId before review/);
    expect(errors.join(" ")).toMatch(/at least one attribute before review/);
  });

  it("requires at least one entry before confirmation", () => {
    const errors = validateQMatrixModelLifecycle(
      makeQMatrix({ status: "confirmed", locked: true, entries: [] }),
      db
    );
    expect(errors.join(" ")).toMatch(/at least one item-attribute entry before confirmation/);
  });

  it("activates cleanly when the bound competency model is operational at the matching version", () => {
    expect(validateQMatrixModelLifecycle(makeQMatrix({ status: "operational", locked: true }), db)).toEqual([]);
  });

  it("activates cleanly when the bound competency model is confirmed and locked at the matching version", () => {
    expect(
      validateQMatrixModelLifecycle(
        makeQMatrix({
          status: "operational",
          locked: true,
          competencyModelId: "cm-confirmed",
          competencyModelVersion: 2,
        }),
        db
      )
    ).toEqual([]);
  });

  it("refuses activation when the bound competency model is not a frozen parent", () => {
    const errors = validateQMatrixModelLifecycle(
      makeQMatrix({ status: "operational", locked: true, competencyModelId: "cm2", competencyModelVersion: 1 }),
      db
    );
    expect(errors.join(" ")).toMatch(/locked, non-archived parent/);
  });

  it("refuses an illegal status transition (confirmed -> draft, a reviewer-only path)", () => {
    const existing = makeQMatrix({ status: "confirmed", locked: true });
    const dbWithExisting = { ...db, qMatrixModels: [existing] };
    const errors = validateQMatrixModelLifecycle(makeQMatrix({ status: "draft" }), dbWithExisting);
    expect(errors.join(" ")).toMatch(/Illegal Q-matrix status transition: 'confirmed' -> 'draft'/);
  });

  it("allows the legal draft -> reviewed transition", () => {
    const existing = makeQMatrix({ status: "draft" });
    const dbWithExisting = { ...db, qMatrixModels: [existing] };
    const errors = validateQMatrixModelLifecycle(makeQMatrix({ status: "reviewed" }), dbWithExisting);
    expect(errors).toEqual([]);
  });

  it("refuses activation on a competencyModelVersion mismatch", () => {
    const errors = validateQMatrixModelLifecycle(
      makeQMatrix({ status: "operational", locked: true, competencyModelVersion: 1 }),
      db
    );
    expect(errors.join(" ")).toMatch(/does not match the competency model's current version/);
  });

  it("refuses activation when the bound competency model does not exist", () => {
    const errors = validateQMatrixModelLifecycle(
      makeQMatrix({ status: "operational", locked: true, competencyModelId: "cm-does-not-exist" }),
      db
    );
    expect(errors.join(" ")).toMatch(/competency model 'cm-does-not-exist' not found/);
  });

  it("treats an explicitly empty attributeIds[] the same as a missing one before review", () => {
    const errors = validateQMatrixModelLifecycle(
      { id: "qm-new", status: "reviewed", name: "Q", competencyModelId: "cm1", attributeIds: [] },
      db
    );
    expect(errors.join(" ")).toMatch(/at least one attribute before review/);
  });

  it("treats a wholly-absent entries field the same as an empty array before confirmation", () => {
    const errors = validateQMatrixModelLifecycle(
      makeQMatrix({ status: "confirmed", locked: true, entries: undefined }),
      db
    );
    expect(errors.join(" ")).toMatch(/at least one item-attribute entry before confirmation/);
  });
});
