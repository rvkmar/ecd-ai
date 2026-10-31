import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  additionalKsaRefResolves,
  addressedByResolves,
  persistWarrantBacking,
} from "../evidenceArgument.js";
import { createEvidenceModelRecord } from "../../../server/routes/evidenceModels.js";

const competency = {
  id: "c1",
  name: "Names the part",
  modelId: "cm1",
  variableType: "binary",
};

const competencyModel = {
  id: "cm1",
  versionNumber: 1,
  status: "confirmed",
  locked: true,
};

function warrant(extra = {}) {
  return {
    id: "w1",
    reasoningStatement: "Selecting the name is evidence of plant-part naming proficiency.",
    cognitiveAttribute: "Plant-part naming",
    performanceCondition: "A labelled diagram with one part called out.",
    limitationClause: "Does not show that the student can state the function.",
    ...extra,
  };
}

function model(extra = {}) {
  return {
    id: "em1",
    name: "Part naming",
    competencyId: "c1",
    competencyModelVersion: 1,
    claimStatement:
      "The student can name the called-out plant part on a familiar diagram well enough to support a mastery claim.",
    warrants: [warrant()],
    observables: [
      {
        id: "obs1",
        statement: "The learner selects the name of the called-out part.",
        type: "selected_response",
        warrantId: "w1",
      },
    ],
    fairnessNotes:
      "Diagram vocabulary is introduced first. Residual language risk is accepted for this grade.",
    status: "draft",
    ...extra,
  };
}

function db(extra = {}) {
  return {
    competencies: [competency],
    competencyModels: [competencyModel],
    evidenceModels: [],
    designPatterns: [
      {
        id: "dp1",
        name: "Name a plant part",
        additionalKsas: [
          { label: "Diagram conventions", relationship: "required_but_not_measured" },
          { id: "ksa-reading", label: "Reading a label", competencyId: "c-read" },
        ],
      },
    ],
    taskModelVariables: [{ id: "tmv-diagram", name: "Plant diagram" }],
    ...extra,
  };
}

function backingErrors(result) {
  return (result.errors || []).filter((message) => /backing|alternativeExplanations/i.test(message));
}

describe("evidence argument by lifecycle status", () => {
  it("accepts a draft that has no backing and no alternative explanations", () => {
    const result = validateEntity("evidenceModels", model(), db(), { strict: false });
    expect(backingErrors(result)).toEqual([]);
    expect(result.warnings).toBeUndefined();
  });

  it("refuses review when a warrant has no backing", () => {
    const draft = model();
    const store = db({ evidenceModels: [draft] });
    const result = validateEntity(
      "evidenceModels",
      { ...draft, status: "reviewed" },
      store,
      { strict: false }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Warrant w1 missing backing/);
  });

  it("does not require a warrant list at review when none was authored", () => {
    const draft = model({ warrants: [] });
    const store = db({ evidenceModels: [draft] });
    const result = validateEntity(
      "evidenceModels",
      { ...draft, status: "reviewed" },
      store,
      { strict: false }
    );
    expect(backingErrors(result)).toEqual([]);
  });

  it("accepts review when backing is present and explanations are complete", () => {
    const reviewed = model({
      status: "reviewed",
      warrants: [warrant({ backing: "Plant-part naming research." })],
      alternativeExplanations: [
        {
          text: "The student matched a memorised diagram label.",
          additionalKsaRef: "dp1:Diagram conventions",
          addressedBy: "obs1",
        },
      ],
    });
    const result = validateEntity("evidenceModels", reviewed, db(), { strict: false });
    expect(backingErrors(result)).toEqual([]);
  });

  it("requires text and addressedBy on each alternative explanation from review onward", () => {
    const reviewed = model({
      status: "reviewed",
      warrants: [warrant({ backing: "Plant-part naming research." })],
      alternativeExplanations: [{ text: "", additionalKsaRef: "", addressedBy: "" }],
    });
    const result = validateEntity("evidenceModels", reviewed, db(), { strict: false });
    expect(result.errors.join(" ")).toMatch(/needs text/);
    expect(result.errors.join(" ")).toMatch(/needs addressedBy/);
  });

  it("still accepts an incomplete explanation on a draft", () => {
    const result = validateEntity(
      "evidenceModels",
      model({
        alternativeExplanations: [{ text: "", addressedBy: "missing" }],
      }),
      db(),
      { strict: false }
    );
    expect(backingErrors(result)).toEqual([]);
  });

  it.each(["confirmed", "operational", "suspended"])(
    "applies the same backing rule at %s",
    (status) => {
      const result = validateEntity(
        "evidenceModels",
        model({ status, warrants: [warrant()] }),
        db(),
        { strict: false }
      );
      expect(result.errors.join(" ")).toMatch(/missing backing/);
    }
  );
});

describe("additional KSA resolution", () => {
  const store = db();

  it("resolves a label, an id, a pattern-qualified label, and a competency id", () => {
    expect(additionalKsaRefResolves("Diagram conventions", store)).toBe(true);
    expect(additionalKsaRefResolves("ksa-reading", store)).toBe(true);
    expect(additionalKsaRefResolves("dp1:Diagram conventions", store)).toBe(true);
    expect(additionalKsaRefResolves("c-read", store)).toBe(true);
    expect(additionalKsaRefResolves("dp1:0", store)).toBe(true);
  });

  it("rejects a ref that is not an additional KSA", () => {
    expect(additionalKsaRefResolves("Focal naming skill", store)).toBe(false);
  });

  it("flags a reviewed model whose additionalKsaRef does not resolve", () => {
    const reviewed = model({
      status: "reviewed",
      warrants: [warrant({ backing: "Plant-part naming research." })],
      alternativeExplanations: [
        {
          text: "Reading the printed label, not the plant part.",
          additionalKsaRef: "not-a-ksa",
          addressedBy: "obs1",
        },
      ],
    });
    const result = validateEntity("evidenceModels", reviewed, store, { strict: false });
    expect(result.errors.join(" ")).toMatch(/does not match an additional KSA/);
  });

  it("accepts an observable or a task model variable as addressedBy", () => {
    expect(addressedByResolves("obs1", model(), store)).toBe(true);
    expect(addressedByResolves("tmv-diagram", model(), store)).toBe(true);
    expect(addressedByResolves("tmv-missing", model(), store)).toBe(false);
  });

  it("rejects an addressedBy that matches neither", () => {
    const reviewed = model({
      status: "reviewed",
      warrants: [warrant({ backing: "Plant-part naming research." })],
      alternativeExplanations: [
        {
          text: "The diagram font was unfamiliar.",
          addressedBy: "nowhere",
        },
      ],
    });
    const result = validateEntity("evidenceModels", reviewed, store, { strict: false });
    expect(result.errors.join(" ")).toMatch(/does not match an observable or a task model variable/);
  });
});

describe("legacy reviewed models", () => {
  it("warns and stays valid when a reviewed model is checked without a database", () => {
    const legacy = model({ status: "reviewed" });
    const result = validateEntity("evidenceModels", legacy, null, { strict: false });
    expect(result.valid).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/Reads stay valid/);
    expect(backingErrors(result)).toEqual([]);
  });

  it("warns and stays valid when the stored model was already reviewed without backing", () => {
    const legacy = model({ status: "reviewed" });
    const store = db({ evidenceModels: [legacy] });
    const result = validateEntity("evidenceModels", legacy, store, { strict: false });
    expect(result.valid).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/Already-reviewed model is missing backing on warrant w1/);
    expect(backingErrors(result)).toEqual([]);
  });

  it("does not fail a read-shaped validation of an already-confirmed model", () => {
    const legacy = model({ status: "confirmed", locked: true });
    const store = db({ evidenceModels: [legacy] });
    const result = validateEntity("evidenceModels", legacy, store);
    expect(result.warnings.join(" ")).toMatch(/Reads stay valid/);
    expect(backingErrors(result)).toEqual([]);
  });

  it("still rejects a new alternative explanation that is incomplete", () => {
    const legacy = model({ status: "reviewed" });
    const store = db({ evidenceModels: [legacy] });
    const result = validateEntity(
      "evidenceModels",
      {
        ...legacy,
        alternativeExplanations: [{ text: "Memorised the figure." }],
      },
      store,
      { strict: false }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/needs addressedBy/);
    expect(result.warnings.join(" ")).toMatch(/Already-reviewed/);
  });
});

describe("backing persistence", () => {
  it("copies backingEvidence onto backing when the schema field was omitted", () => {
    const stored = persistWarrantBacking(warrant({ backingEvidence: "Curriculum guide." }));
    expect(stored.backing).toBe("Curriculum guide.");
    expect(stored.backingEvidence).toBe("Curriculum guide.");
  });

  it("keeps backingEvidence through create", () => {
    const store = db();
    const created = createEvidenceModelRecord(
      {
        name: "Part naming",
        competencyId: "c1",
        claimStatement: model().claimStatement,
        warrants: [warrant({ backingEvidence: "Curriculum guide for the diagram." })],
        observables: [
          {
            id: "obs1",
            statement: "The learner selects the name of the called-out part.",
            warrantId: "w1",
          },
        ],
        alternativeExplanations: [
          {
            text: "The student read the printed label.",
            additionalKsaRef: "Diagram conventions",
            addressedBy: "obs1",
          },
        ],
      },
      store
    );
    expect(created.ok).toBe(true);
    expect(created.record.warrants[0].backing).toBe("Curriculum guide for the diagram.");
    expect(created.record.warrants[0].backingEvidence).toBe("Curriculum guide for the diagram.");
    expect(created.record.alternativeExplanations).toHaveLength(1);
    const reviewed = validateEntity(
      "evidenceModels",
      { ...created.record, status: "reviewed", fairnessNotes: model().fairnessNotes },
      { ...store, evidenceModels: [created.record] },
      { strict: false }
    );
    expect(backingErrors(reviewed)).toEqual([]);
  });
});
