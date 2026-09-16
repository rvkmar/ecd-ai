// src/utils/__tests__/qMatrixAndDina.test.js
//
// Day 18 (Week 4, core schema): the new `qMatrixModels` collection, plus
// `dina`/`gdina` as statistical model types on `evidenceModels`. Structural
// + referential-integrity validation only -- no Q-matrix editor, no DINA
// config panel (both are explicit W10 deliverables). Exit check: a G-DINA
// model validates against a Q-matrix, and refuses a continuous SMV.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";

const competencyModel = {
  id: "cm1",
  name: "Fraction Diagnostics",
  measurementIntent: "multidimensional",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
  smVariables: [
    {
      id: "attr-equivalence",
      label: "Attribute: Fraction Equivalence",
      type: "binary",
      scale: { states: ["non-mastery", "mastery"] },
      priorDistribution: { family: "bernoulli", params: { p: 0.5 } },
    },
    {
      id: "attr-simplification",
      label: "Attribute: Simplification",
      type: "binary",
      scale: { states: ["non-mastery", "mastery"] },
      priorDistribution: { family: "beta", params: { alpha: 2, beta: 2 } },
    },
    {
      id: "smv-theta",
      label: "Numerical Reasoning Ability",
      type: "continuous",
      scale: { min: -4, max: 4 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
    },
  ],
};

function makeQMatrix(overrides = {}) {
  return {
    id: "qm1",
    name: "Fraction Diagnostics Q-matrix",
    competencyModelId: "cm1",
    competencyModelVersion: 1,
    attributeIds: ["attr-equivalence", "attr-simplification"],
    entries: [
      { itemId: "i1", attributeId: "attr-equivalence", required: true },
      { itemId: "i1", attributeId: "attr-simplification", required: false },
      { itemId: "i2", attributeId: "attr-simplification", required: true },
    ],
    status: "draft",
    ...overrides,
  };
}

function makeDb(overrides = {}) {
  return {
    competencyModels: [competencyModel],
    items: [{ id: "i1" }, { id: "i2" }],
    qMatrixModels: [],
    policies: [],
    ...overrides,
  };
}

function qMatrixErrors(model, db = makeDb()) {
  const { errors } = validateEntity("qMatrixModels", model, db);
  return errors || [];
}

describe("qMatrixModels — passing fixture", () => {
  it("accepts a well-formed Q-matrix over two binary attributes", () => {
    expect(qMatrixErrors(makeQMatrix())).toEqual([]);
  });
});

describe("qMatrixModels — deliberate mutations", () => {
  // NOTE: these three attributeIds-mutation tests clear `entries` to `[]`.
  // The default fixture's entries reference BOTH "attr-equivalence" and
  // "attr-simplification"; a mutation that removes "attr-simplification"
  // from attributeIds (as all three of these do) also makes those entries
  // reference an undeclared attributeId, firing TWO extra "not declared in
  // attributeIds" errors that have nothing to do with the rule under test.
  // The original (fixed) versions of these tests only asserted a substring
  // match, so they passed anyway while quietly failing to isolate the rule
  // they claimed to test -- see the exact-array assertions below, and the
  // "does not isolate the rule under test" describe block further down for
  // a reproduction using the *unmodified* fixture.
  it("refuses a continuous SMV as an attribute", () => {
    const mutated = makeQMatrix({ attributeIds: ["attr-equivalence", "smv-theta"], entries: [] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual([
      "attributeIds[1] ('smv-theta') is a 'continuous' Student Model Variable. Q-matrix attributes must be binary.",
    ]);
  });

  it("rejects an attributeId that does not exist on the competency model", () => {
    const mutated = makeQMatrix({ attributeIds: ["attr-equivalence", "attr-does-not-exist"], entries: [] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual([
      "attributeIds[1] names 'attr-does-not-exist', which does not exist on competency model 'cm1'.",
    ]);
  });

  it("rejects duplicate attributeIds", () => {
    const mutated = makeQMatrix({ attributeIds: ["attr-equivalence", "attr-equivalence"], entries: [] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual(["Duplicate attributeIds entry 'attr-equivalence'."]);
  });

  it("rejects an entry referencing an undeclared attributeId", () => {
    const mutated = makeQMatrix({
      entries: [{ itemId: "i1", attributeId: "attr-not-declared" }],
    });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/not declared in attributeIds/);
  });

  it("rejects an entry referencing an unknown itemId", () => {
    const mutated = makeQMatrix({
      entries: [{ itemId: "i-does-not-exist", attributeId: "attr-equivalence" }],
    });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/references unknown itemId/);
  });

  it("rejects a duplicate (itemId, attributeId) entry pair", () => {
    const mutated = makeQMatrix({
      entries: [
        { itemId: "i1", attributeId: "attr-equivalence" },
        { itemId: "i1", attributeId: "attr-equivalence" },
      ],
    });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/duplicates the \(itemId, attributeId\) pair/);
  });

  it("rejects a dangling competencyModelId", () => {
    const mutated = makeQMatrix({ competencyModelId: "cm-does-not-exist" });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/Invalid competencyModelId/);
  });

  it("requires a name", () => {
    const mutated = makeQMatrix({ name: undefined });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/Q-matrix name is required/);
  });

  // Day 21: lifecycle wiring added `locked`, mirroring competencyModels/
  // assemblyModels' own "confirmed must be locked" rule.
  it("requires a confirmed Q-matrix to be locked", () => {
    const mutated = makeQMatrix({ status: "confirmed", locked: false });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/Confirmed Q-matrix models must be locked/);
  });

  it("requires a competencyModelId", () => {
    const mutated = makeQMatrix({ competencyModelId: undefined });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/competencyModelId is required/);
  });

  it("requires a status", () => {
    const mutated = makeQMatrix({ status: undefined });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/status is required/);
  });

  it("rejects a status value outside the lifecycle STATUS enum", () => {
    const mutated = makeQMatrix({ status: "bogus" });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/Invalid Q-matrix status 'bogus'/);
  });

  it("rejects attributeIds that is not an array", () => {
    const mutated = makeQMatrix({ attributeIds: "attr-equivalence", entries: [] });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/attributeIds should be array/);
  });

  it("rejects entries that is not an array", () => {
    const mutated = makeQMatrix({ entries: "not-an-array" });
    const errors = qMatrixErrors(mutated);
    expect(errors.join(" ")).toMatch(/entries should be array/);
  });

  it("rejects an entry missing attributeId", () => {
    const mutated = makeQMatrix({ entries: [{ itemId: "i1" }] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual(["entries[0] requires both itemId and attributeId."]);
  });

  it("rejects an entry missing itemId", () => {
    const mutated = makeQMatrix({ entries: [{ attributeId: "attr-equivalence" }] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual(["entries[0] requires both itemId and attributeId."]);
  });

  it("rejects a null entry in entries[] rather than throwing", () => {
    const mutated = makeQMatrix({ entries: [null] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual(["entries[0] requires both itemId and attributeId."]);
  });

  it("rejects an entry.itemId that is null rather than merely absent", () => {
    const mutated = makeQMatrix({ entries: [{ itemId: null, attributeId: "attr-equivalence" }] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual(["entries[0] requires both itemId and attributeId."]);
  });

  it("rejects entry.required when it is a non-boolean truthy value", () => {
    const mutated = makeQMatrix({
      entries: [{ itemId: "i1", attributeId: "attr-equivalence", required: "yes" }],
    });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual(["entries[0].required should be boolean"]);
  });

  it("still evaluates an attributeIds entry that is not a string (no crash, reports it by String() identity)", () => {
    const mutated = makeQMatrix({ attributeIds: [42], entries: [] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toEqual([
      "attributeIds[0] names '42', which does not exist on competency model 'cm1'.",
    ]);
  });
});

// The three attributeIds-mutation tests above were originally written
// against the UNMODIFIED fixture (entries left as the default three
// entries, two of which reference "attr-simplification"). Reproduced here
// to document, on the record, that the original assertions -- a substring
// `.toMatch()` on the joined error string -- passed *despite* two
// unrelated "not declared in attributeIds" errors being present, because
// they never asserted the errors array was exactly what the test claimed
// to isolate. This describe block exists so a future change that
// re-introduces that non-isolation (e.g. reverting the `entries: []` fix
// above) is caught by an exact-count assertion rather than silently
// tolerated again.
describe("qMatrixModels — attributeIds mutations must not silently drag in entries[] noise", () => {
  it("removing a declared attributeId that live entries still reference produces BOTH the target error and referential-integrity noise", () => {
    const mutated = makeQMatrix({ attributeIds: ["attr-equivalence", "smv-theta"] });
    const errors = qMatrixErrors(mutated);
    expect(errors).toHaveLength(3);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Q-matrix attributes must be binary/),
        "entries[1] references attributeId 'attr-simplification', which is not declared in attributeIds.",
        "entries[2] references attributeId 'attr-simplification', which is not declared in attributeIds.",
      ])
    );
  });
});

describe("evidenceModels.statisticalModels — dina/gdina structural checks", () => {
  // F14 fix (D53b): binding a dina/gdina statistical model to a Q-matrix
  // now requires the Q-matrix itself to be confirmed/operational/suspended
  // -- so every fixture in this block that is meant to validate CLEANLY
  // uses a confirmed Q-matrix. The "confirmed" state alone is sufficient
  // for this cross-entity check ("requires a confirmed Q-matrix to be
  // locked" above already enforces `locked` on the Q-matrix's OWN
  // validation, so nothing here needs to re-check it).
  const dinaDb = () => ({
    competencyModels: [competencyModel],
    qMatrixModels: [makeQMatrix({ status: "confirmed", locked: true })],
    competencies: [{ id: "c-mastery", modelId: "cm1", variableType: "binary" }],
  });

  function draftEvidenceModel(overrides = {}) {
    return {
      id: "em1",
      competencyId: "c-mastery",
      statisticalModels: [
        {
          id: "sm1",
          type: "gdina",
          active: true,
          structureConfig: { qMatrixId: "qm1" },
        },
      ],
      ...overrides,
    };
  }

  function evidenceErrors(model, db, options = { strict: false }) {
    const { errors } = validateEntity("evidenceModels", model, db, options);
    return errors || [];
  }

  it("a G-DINA model validates cleanly against a well-formed Q-matrix", () => {
    expect(evidenceErrors(draftEvidenceModel(), dinaDb())).toEqual([]);
  });

  it("a G-DINA model refuses a Q-matrix that references a continuous SMV", () => {
    const badQMatrix = makeQMatrix({ id: "qm-bad", attributeIds: ["attr-equivalence", "smv-theta"] });
    const db = { ...dinaDb(), qMatrixModels: [badQMatrix] };
    const model = draftEvidenceModel({
      statisticalModels: [
        { id: "sm1", type: "gdina", active: true, structureConfig: { qMatrixId: "qm-bad" } },
      ],
    });
    const errors = evidenceErrors(model, db);
    expect(errors.join(" ")).toMatch(/DINA\/G-DINA models require every Q-matrix attribute to be a binary Student Model Variable/);
  });

  it("requires structureConfig.qMatrixId under strict validation", () => {
    const model = draftEvidenceModel({
      statisticalModels: [{ id: "sm1", type: "dina", active: true, structureConfig: {} }],
    });
    const errors = evidenceErrors(model, dinaDb(), { strict: true });
    expect(errors.join(" ")).toMatch(/requires structureConfig\.qMatrixId/);
  });

  it("rejects a dangling qMatrixId", () => {
    const model = draftEvidenceModel({
      statisticalModels: [
        { id: "sm1", type: "dina", active: true, structureConfig: { qMatrixId: "qm-does-not-exist" } },
      ],
    });
    const errors = evidenceErrors(model, dinaDb());
    expect(errors.join(" ")).toMatch(/references unknown qMatrixId/);
  });

  // F14 (D53a live walk, session 10; fixed D53b): nothing previously
  // checked the bound Q-matrix's OWN lifecycle status. A confirmed, locked
  // Evidence Model could cite a Q-matrix an author was still actively
  // editing, or one withdrawn from service.
  it.each(["draft", "reviewed", "archived"])(
    "F14: refuses a dina/gdina model bound to a %s Q-matrix",
    (status) => {
      const draftQMatrix = makeQMatrix({ status });
      const db = { ...dinaDb(), qMatrixModels: [draftQMatrix] };
      const model = draftEvidenceModel({
        statisticalModels: [
          { id: "sm1", type: "dina", active: true, structureConfig: { qMatrixId: "qm1" } },
        ],
      });
      const errors = evidenceErrors(model, db);
      expect(errors.join(" ")).toMatch(
        new RegExp(`bound to Q-matrix 'qm1', which is '${status}'`)
      );
    }
  );

  it.each(["confirmed", "operational", "suspended"])(
    "F14: accepts a dina/gdina model bound to a %s (locked) Q-matrix",
    (status) => {
      const lockedQMatrix = makeQMatrix({ status, locked: true });
      const db = { ...dinaDb(), qMatrixModels: [lockedQMatrix] };
      const model = draftEvidenceModel({
        statisticalModels: [
          { id: "sm1", type: "dina", active: true, structureConfig: { qMatrixId: "qm1" } },
        ],
      });
      expect(evidenceErrors(model, db)).toEqual([]);
    }
  );

  it("F14: allowDraftParents relaxes the Q-matrix lifecycle gate, matching every other 'draft parent' guard", () => {
    const draftQMatrix = makeQMatrix({ status: "draft" });
    const db = { ...dinaDb(), qMatrixModels: [draftQMatrix] };
    const model = draftEvidenceModel({
      statisticalModels: [
        { id: "sm1", type: "dina", active: true, structureConfig: { qMatrixId: "qm1" } },
      ],
    });
    const { errors } = validateEntity("evidenceModels", model, db, { strict: false, allowDraftParents: true });
    expect((errors || []).join(" ")).not.toMatch(/DINA\/G-DINA models may only bind to/);
  });
});

describe("evidenceModels — confirmed-status compatibility for gdina", () => {
  // Exercises the two OTHER checks touched today (variable-type compatibility
  // and decision-rule/statistical-model coherence), both gated on
  // `status === "confirmed"` rather than `strict` -- {strict:false} skips the
  // unrelated warrant/observable completeness gates so only those two are on.
  function confirmedGdinaModel(overrides = {}) {
    return {
      id: "em1",
      competencyId: "c-mastery",
      competencyModelVersion: 1,
      status: "confirmed",
      observables: [{ id: "o1", evidenceRule: { direction: "supports" } }],
      statisticalModels: [
        {
          id: "sm1",
          type: "gdina",
          active: true,
          structureConfig: { qMatrixId: "qm1" },
          parameterSets: [{
            parameterSetId: "ps1",
            parameters: {},
            packageVersion: "CDM-8.2",
            converged: true,
            sampleSize: 600,
            calibratedAt: new Date().toISOString(),
          }],
          activeParameterSetId: "ps1",
        },
      ],
      decisionRule: {
        type: "mastery",
        threshold: 0.75,
        direction: "above",
        justification: "Cut derived from the 2026 calibration study establishing mastery classification accuracy.",
      },
      fairnessNotes:
        "Confirmed G-DINA fixture: residual DIF risk accepted after gender and language review on the calibration sample.",
      evaluationProcedures: [
        {
          id: "ep1",
          observableId: "o1",
          workProductType: "mcq_selection",
          method: "key",
          description: "Answer key maps response to dichotomous observable for G-DINA.",
          artifactRef: "inline:key/o1",
          artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
        },
      ],
      difReviewChecklist: [
        { id: "dif1", prompt: "Gender DIF reviewed?", status: "pass" },
        { id: "dif2", prompt: "Language-load reviewed?", status: "pass" },
        { id: "dif3", prompt: "Access reviewed?", status: "na" },
      ],
      ...overrides,
    };
  }

  const db = () => ({
    competencyModels: [competencyModel],
    // F14 fix (D53b): see the identical note on dinaDb() above.
    qMatrixModels: [makeQMatrix({ status: "confirmed", locked: true })],
    competencies: [{ id: "c-mastery", modelId: "cm1", variableType: "binary" }],
  });

  it("a fully-specified confirmed gdina evidence model on a binary competency validates cleanly", () => {
    const { errors } = validateEntity("evidenceModels", confirmedGdinaModel(), db(), { strict: false });
    expect(errors).toEqual([]);
  });

  it("rejects a gdina mastery decision with a threshold outside a posterior probability", () => {
    const model = confirmedGdinaModel({ decisionRule: { ...confirmedGdinaModel().decisionRule, threshold: 1.5 } });
    const { errors } = validateEntity("evidenceModels", model, db(), { strict: false });
    expect(errors.join(" ")).toMatch(/DINA\/G-DINA mastery decision must use posterior probability between 0 and 1/);
  });
});
