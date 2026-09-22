// server/delivery/__tests__/d122RubricSharedAcrossEMs.test.js
//
// D122 exit check (scoring path): one confirmed library rubric baked into
// two Evidence Models' packages scores the same work product identically.

import { describe, it, expect } from "vitest";
import { identifyEvidence } from "../evidenceIdentification.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";
import { buildCompositeLibrary } from "../../compositeLibrary/builder.js";

const rubric = {
  id: "rub-shared",
  name: "Accuracy",
  status: "confirmed",
  dimensions: [
    {
      id: "accuracy",
      name: "Accuracy",
      levels: [
        { value: 0, label: "Incorrect", exemplar: "Wrong answer work sample" },
        { value: 1, label: "Correct", exemplar: "Correct answer work sample" },
      ],
      activatesAt: 1,
    },
  ],
};

function em(id) {
  return {
    id,
    versionNumber: 1,
    observables: [
      {
        id: "o1",
        type: "constructed_response",
        evidenceRule: {
          direction: "supports",
          strengthLevel: 3,
          activationCondition: "any",
          justification: "Rubric rating.",
        },
      },
    ],
    evaluationProcedures: [
      {
        id: `ep-${id}`,
        observableId: "o1",
        workProductType: "constructed_response",
        method: "rubric",
        description: "Rate constructed response with shared rubric.",
        rubricId: "rub-shared",
      },
    ],
  };
}

function tm(id, emId) {
  return {
    id,
    versionNumber: 1,
    status: "operational",
    locked: true,
    evidenceModelIds: [emId],
    expectedObservations: [
      { observationId: "o1", evidenceModelId: emId, required: true, weight: 1 },
    ],
  };
}

function item(id, tmId, emId) {
  return {
    id,
    taskModelId: tmId,
    taskModelVersion: 1,
    status: "confirmed",
    observationId: "o1",
    evidenceModelId: emId,
    evidenceModelVersion: 1,
    interaction: { type: "constructed" },
    scoring: { method: "dichotomous", evidenceActivationMap: [] },
  };
}

describe("D122 exit check — shared rubric across two EMs", () => {
  it("bakes the same dimensions from one confirmed rubric into two packages", () => {
    const emA = em("em-a");
    const emB = em("em-b");
    const tmA = tm("tm-a", "em-a");
    const tmB = tm("tm-b", "em-b");
    const db = {
      rubrics: [rubric],
      evidenceModels: [emA, emB],
      taskModels: [tmA, tmB],
      items: [item("item-a", "tm-a", "em-a"), item("item-b", "tm-b", "em-b")],
      compositeLibrary: [],
    };

    const pkgA = buildCompositeLibrary(tmA, db);
    const pkgB = buildCompositeLibrary(tmB, db);
    const artA = pkgA.record.items[0].evaluationProcedure.artifact;
    const artB = pkgB.record.items[0].evaluationProcedure.artifact;
    expect(artA).toEqual(artB);
    expect(artA.kind).toBe("rubric");
    expect(artA.dimensions[0].levels).toEqual([0, 1]);
    expect(pkgA.record.items[0].evaluationProcedure.rubricId).toBe("rub-shared");
  });

  it("identifies identically through both Evidence Models", () => {
    const emA = em("em-a");
    const emB = em("em-b");
    const tmA = tm("tm-a", "em-a");
    const tmB = tm("tm-b", "em-b");
    const itemA = item("item-a", "tm-a", "em-a");
    const itemB = item("item-b", "tm-b", "em-b");
    const db = seedActivePackages({
      rubrics: [rubric],
      evidenceModels: [emA, emB],
      taskModels: [tmA, tmB],
      items: [itemA, itemB],
      compositeLibrary: [],
    });

    const wp = { dimensions: { accuracy: 1 } };
    const a = identifyEvidence(wp, itemA, db, { taskModelId: "tm-a" });
    const b = identifyEvidence(wp, itemB, db, { taskModelId: "tm-b" });
    expect(a.refused).toBeFalsy();
    expect(b.refused).toBeFalsy();
    expect(a.activated).toBe(true);
    expect(b.activated).toBe(true);
    expect(a.strength).toBe(b.strength);
    expect(a.direction).toBe(b.direction);
  });
});
