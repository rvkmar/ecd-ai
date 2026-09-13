// server/delivery/__tests__/assemblyProgress.test.js
//
// Day 34 (Week 7): resolveAssemblyProgress is read-only enrichment, never a
// stopping decision -- these tests pin the "refuse rather than guess"
// behaviour (zero or ambiguous Assembly Models -> omitted, not an error)
// as carefully as the accumulation math itself.

import { describe, it, expect } from "vitest";
import { evaluateDeclaredTargets, resolveAssemblyProgress } from "../assemblyProgress.js";

function posterior(overrides = {}) {
  return {
    smvId: "smv1",
    competencyModelId: "cm1",
    supported: true,
    estimate: 0.5,
    precision: 0.3,
    // Day 39: the theta-scale check now gates on `method`, not `smvType`
    // (see assemblyProgress.js's own comment) -- "eap" is the continuous
    // IRT/Rasch branch's method and is the realistic default for a
    // fixture that otherwise looks like a continuous posterior.
    method: "eap",
    modelFamily: "irt",
    ...overrides,
  };
}

function assemblyModel(overrides = {}) {
  return {
    id: "am1",
    competencyModelId: "cm1",
    targetsBySMV: [{ smvId: "smv1", requiredSEM: 0.4 }],
    ...overrides,
  };
}

describe("resolveAssemblyProgress", () => {
  it("reports met when precision is within the required SEM", () => {
    const result = resolveAssemblyProgress([posterior({ precision: 0.3 })], { assemblyModels: [assemblyModel()] });
    expect(result).toEqual([{
      smvId: "smv1",
      assemblyModelId: "am1",
      estimate: 0.5,
      precision: 0.3,
      requiredSEM: 0.4,
      stoppingCriterionMet: true,
    }]);
  });

  it("reports not-met when precision is coarser than the required SEM", () => {
    const result = resolveAssemblyProgress([posterior({ precision: 0.5 })], { assemblyModels: [assemblyModel()] });
    expect(result[0].stoppingCriterionMet).toBe(false);
  });

  it("treats an exact match at the boundary as met (<=, not <)", () => {
    const result = resolveAssemblyProgress([posterior({ precision: 0.4 })], { assemblyModels: [assemblyModel()] });
    expect(result[0].stoppingCriterionMet).toBe(true);
  });

  /* Day 57 changed this test's REASON, not its assertion. It was written
     when no decision rule existed at all; now one does, but this fixture's
     posterior is `method: "eap"` -- theta on the real line, not a mastery
     probability -- so it is still refused, now by the scale guard in
     attributeClassification.js. See ADR 0004 decision 4. */
  it("refuses a classification-accuracy target against a theta-scale posterior", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv1", requiredClassificationAccuracy: 0.85 }] });
    const result = resolveAssemblyProgress([posterior()], { assemblyModels: [am] });
    expect(result[0].requiredClassificationAccuracy).toBe(0.85);
    expect(result[0].stoppingCriterionMet).toBeNull();
    expect(result[0].note).toMatch(/not on that scale/);
    // No classification was made, so none is reported.
    expect(result[0].classification).toBeUndefined();
    expect(result[0].expectedClassificationAccuracy).toBeUndefined();
  });

  /** A genuine DINA/G-DINA attribute-mastery posterior -- the only kind a
   *  classification target may be evaluated against. */
  function masteryPosterior(overrides = {}) {
    return posterior({
      method: "attribute-mastery-posterior",
      modelFamily: "dina",
      smvType: "binary",
      estimate: 0.92,
      precision: Math.sqrt(0.92 * 0.08),
      ...overrides,
    });
  }

  it("evaluates a classification target against a mastery posterior and reports the decision", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv1", requiredClassificationAccuracy: 0.85 }] });
    const result = resolveAssemblyProgress([masteryPosterior()], { assemblyModels: [am] });

    expect(result[0].stoppingCriterionMet).toBe(true);
    expect(result[0].classification).toBe("master");
    expect(result[0].expectedClassificationAccuracy).toBeCloseTo(0.92, 10);
    expect(result[0].masteryThreshold).toBe(0.5);
    expect(result[0].note).toBeUndefined();
  });

  it("reports not-met -- not null -- for a mastery posterior short of its target", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv1", requiredClassificationAccuracy: 0.95 }] });
    const result = resolveAssemblyProgress([masteryPosterior({ estimate: 0.7 })], { assemblyModels: [am] });

    // false and null are different statements: "evaluated, not met" vs
    // "nobody evaluated this". D56's stopping rule treats both as "do not
    // stop", but only one of them is a measurement claim.
    expect(result[0].stoppingCriterionMet).toBe(false);
    expect(result[0].classification).toBe("master");
    expect(result[0].expectedClassificationAccuracy).toBeCloseTo(0.7, 10);
  });

  it("classifies a low posterior as nonmaster with the complementary accuracy", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv1", requiredClassificationAccuracy: 0.85 }] });
    const result = resolveAssemblyProgress([masteryPosterior({ estimate: 0.1 })], { assemblyModels: [am] });

    expect(result[0].classification).toBe("nonmaster");
    expect(result[0].expectedClassificationAccuracy).toBeCloseTo(0.9, 10);
    expect(result[0].stoppingCriterionMet).toBe(true);
  });

  it("a borderline posterior is distinguishable in the record from a confident one", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv1", requiredClassificationAccuracy: 0.85 }] });

    const borderline = resolveAssemblyProgress([masteryPosterior({ estimate: 0.52 })], { assemblyModels: [am] })[0];
    const confident = resolveAssemblyProgress([masteryPosterior({ estimate: 0.97 })], { assemblyModels: [am] })[0];

    // Same classification, very different warrant -- and the record says so.
    expect(borderline.classification).toBe("master");
    expect(confident.classification).toBe("master");
    expect(borderline.expectedClassificationAccuracy).toBeCloseTo(0.52, 10);
    expect(confident.expectedClassificationAccuracy).toBeCloseTo(0.97, 10);
    expect(borderline.stoppingCriterionMet).toBe(false);
    expect(confident.stoppingCriterionMet).toBe(true);
  });

  it("carries an advisory when a target sits at or below the floor of the measure", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv1", requiredClassificationAccuracy: 0.4 }] });
    const result = resolveAssemblyProgress([masteryPosterior({ estimate: 0.51 })], { assemblyModels: [am] });

    // Honestly met -- the schema permits (0, 1] -- but it cannot fail, and
    // an author who wrote it almost certainly did not mean "stop on the
    // first scored response".
    expect(result[0].stoppingCriterionMet).toBe(true);
    expect(result[0].advisory).toMatch(/cannot fail/);
  });

  it("omits an SMV with no Assembly Model targeting its Competency Model", () => {
    const result = resolveAssemblyProgress([posterior()], { assemblyModels: [] });
    expect(result).toEqual([]);
  });

  it("refuses to guess when several Assembly Models target the same Competency Model", () => {
    const result = resolveAssemblyProgress(
      [posterior()],
      { assemblyModels: [assemblyModel({ id: "am1" }), assemblyModel({ id: "am2" })] }
    );
    expect(result).toEqual([]);
  });

  it("D60 P0: a draft sibling does not make the unique governing model disappear", () => {
    // The revision case: operational AM in production, author opens a draft
    // replacement for the same Competency Model. Before D60 this was
    // candidates.length !== 1 → omit, which silently killed targetsMet.
    const result = resolveAssemblyProgress(
      [posterior({ precision: 0.3 })],
      {
        assemblyModels: [
          assemblyModel({ id: "am-live", status: "operational" }),
          assemblyModel({ id: "am-draft", status: "draft" }),
        ],
      }
    );
    expect(result).toHaveLength(1);
    expect(result[0].assemblyModelId).toBe("am-live");
    expect(result[0].stoppingCriterionMet).toBe(true);
  });

  it("D60 P0: an archived predecessor does not veto its confirmed replacement", () => {
    const result = resolveAssemblyProgress(
      [posterior({ precision: 0.3 })],
      {
        assemblyModels: [
          assemblyModel({ id: "am-old", status: "archived" }),
          assemblyModel({ id: "am-new", status: "confirmed" }),
        ],
      }
    );
    expect(result).toHaveLength(1);
    expect(result[0].assemblyModelId).toBe("am-new");
  });

  it("two confirmed models for the same Competency Model are still refused", () => {
    const result = resolveAssemblyProgress(
      [posterior()],
      {
        assemblyModels: [
          assemblyModel({ id: "am1", status: "confirmed" }),
          assemblyModel({ id: "am2", status: "confirmed" }),
        ],
      }
    );
    expect(result).toEqual([]);
  });

  it("a caller-supplied governing model wins even when two confirmed models exist", () => {
    const preferred = assemblyModel({ id: "am1", status: "confirmed" });
    const result = resolveAssemblyProgress(
      [posterior({ precision: 0.3 })],
      { assemblyModels: [preferred, assemblyModel({ id: "am2", status: "confirmed" })] },
      { assemblyModel: preferred }
    );
    expect(result).toHaveLength(1);
    expect(result[0].assemblyModelId).toBe("am1");
    expect(result[0].stoppingCriterionMet).toBe(true);
  });

  it("omits an SMV the matched Assembly Model doesn't target", () => {
    const am = assemblyModel({ targetsBySMV: [{ smvId: "smv-other", requiredSEM: 0.4 }] });
    const result = resolveAssemblyProgress([posterior()], { assemblyModels: [am] });
    expect(result).toEqual([]);
  });

  it("skips a refused (unsupported) posterior entirely", () => {
    const result = resolveAssemblyProgress(
      [{ smvId: "smv1", competencyModelId: "cm1", supported: false, reason: "mixed parameter sets" }],
      { assemblyModels: [assemblyModel()] }
    );
    expect(result).toEqual([]);
  });

  it("skips a posterior with no resolvable competencyModelId (refused before SMV resolution)", () => {
    const result = resolveAssemblyProgress(
      [{ smvId: undefined, supported: false, reason: "unimplemented family" }],
      { assemblyModels: [assemblyModel()] }
    );
    expect(result).toEqual([]);
  });

  it("handles multiple SMVs independently in one call", () => {
    const am = assemblyModel({
      targetsBySMV: [
        { smvId: "smv1", requiredSEM: 0.4 },
        { smvId: "smv2", requiredSEM: 0.2 },
      ],
    });
    const result = resolveAssemblyProgress(
      [posterior({ smvId: "smv1", precision: 0.3 }), posterior({ smvId: "smv2", precision: 0.3 })],
      { assemblyModels: [am] }
    );
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.smvId === "smv1").stoppingCriterionMet).toBe(true);
    expect(result.find((r) => r.smvId === "smv2").stoppingCriterionMet).toBe(false);
  });

  it("returns [] for an empty posteriors array without touching db", () => {
    expect(resolveAssemblyProgress([], {})).toEqual([]);
    expect(resolveAssemblyProgress(undefined, { assemblyModels: [] })).toEqual([]);
  });

  it("refuses to compare a requiredSEM target against a non-EAP posterior's precision (attribute mastery)", () => {
    const result = resolveAssemblyProgress(
      [posterior({ smvType: "binary", method: "attribute-mastery-posterior", modelFamily: "dina", precision: 0.1 })],
      { assemblyModels: [assemblyModel()] }
    );
    expect(result).toEqual([{
      smvId: "smv1",
      assemblyModelId: "am1",
      estimate: 0.5,
      precision: 0.1,
      requiredSEM: 0.4,
      stoppingCriterionMet: null,
      note: "A requiredSEM target is defined on the theta scale and cannot be compared to a 'dina' model's precision (method: 'attribute-mastery-posterior').",
    }]);
  });

  // Day 39 (adversarial review, P1-6): a raw-score (CTT/sum/threshold)
  // model is explicitly allowed on a `continuous` SMV (RAW_SCORE_SMV_TYPES
  // in evidenceAccumulation.js), so `smvType === "continuous"` alone does
  // NOT mean the precision is on the theta scale -- its "weighted-
  // proportion" method must still be refused the same way attribute
  // mastery is, which the old smvType-only gate missed entirely.
  it("refuses to compare a requiredSEM target against a raw-score posterior's precision, even though its smvType is 'continuous'", () => {
    const result = resolveAssemblyProgress(
      [posterior({ smvType: "continuous", method: "weighted-proportion", modelFamily: "sum", precision: 0.2 })],
      { assemblyModels: [assemblyModel()] }
    );
    expect(result[0].stoppingCriterionMet).toBeNull();
    expect(result[0].note).toMatch(/cannot be compared to a 'sum' model's precision/);
  });

  it("still evaluates a requiredSEM target normally for an EAP (continuous IRT/Rasch) posterior", () => {
    const withType = resolveAssemblyProgress(
      [posterior({ smvType: "continuous", method: "eap", precision: 0.3 })],
      { assemblyModels: [assemblyModel()] }
    );
    expect(withType[0].stoppingCriterionMet).toBe(true);

    const withoutType = resolveAssemblyProgress(
      [posterior({ precision: 0.3 })], // helper's default is already method: "eap"
      { assemblyModels: [assemblyModel()] }
    );
    expect(withoutType[0].stoppingCriterionMet).toBe(true);
  });
});

describe("evaluateDeclaredTargets", () => {
  function masteryPosterior(overrides = {}) {
    return posterior({
      method: "attribute-mastery-posterior",
      modelFamily: "dina",
      smvType: "binary",
      estimate: 0.92,
      precision: Math.sqrt(0.92 * 0.08),
      ...overrides,
    });
  }

  it("refuses to treat an unscored declared SMV as met (the D56/D57 gap)", () => {
    const am = assemblyModel({
      targetsBySMV: [
        { smvId: "smv1", requiredClassificationAccuracy: 0.85 },
        { smvId: "smv2", requiredClassificationAccuracy: 0.85 },
      ],
    });
    const progress = resolveAssemblyProgress([masteryPosterior({ smvId: "smv1" })], { assemblyModels: [am] });
    const result = evaluateDeclaredTargets(am, progress);

    expect(progress).toHaveLength(1);
    expect(result.declaredCount).toBe(2);
    expect(result.scoredCount).toBe(1);
    expect(result.metCount).toBe(1);
    expect(result.allScoredAndMet).toBe(false);
    expect(result.rows.find((r) => r.smvId === "smv2")).toMatchObject({ scored: false, met: false });
  });

  it("is met only when every declared target is scored and stoppingCriterionMet", () => {
    const am = assemblyModel({
      targetsBySMV: [
        { smvId: "smv1", requiredClassificationAccuracy: 0.85 },
        { smvId: "smv2", requiredClassificationAccuracy: 0.85 },
      ],
    });
    const progress = resolveAssemblyProgress(
      [masteryPosterior({ smvId: "smv1" }), masteryPosterior({ smvId: "smv2" })],
      { assemblyModels: [am] }
    );

    expect(evaluateDeclaredTargets(am, progress)).toMatchObject({
      declaredCount: 2,
      scoredCount: 2,
      metCount: 2,
      allScoredAndMet: true,
    });
  });

  it("does not stop when both declared targets are scored and one is unmet", () => {
    const am = assemblyModel({
      targetsBySMV: [
        { smvId: "smv1", requiredClassificationAccuracy: 0.85 },
        { smvId: "smv2", requiredClassificationAccuracy: 0.85 },
      ],
    });
    const progress = resolveAssemblyProgress(
      [masteryPosterior({ smvId: "smv1" }), masteryPosterior({ smvId: "smv2", estimate: 0.7 })],
      { assemblyModels: [am] }
    );
    const result = evaluateDeclaredTargets(am, progress);

    expect(result.scoredCount).toBe(2);
    expect(result.metCount).toBe(1);
    expect(result.allScoredAndMet).toBe(false);
    expect(result.rows.find((r) => r.smvId === "smv2").met).toBe(false);
  });

  it("keeps a single continuous SEM target that is met as a stop", () => {
    const am = assemblyModel();
    const progress = resolveAssemblyProgress([posterior({ precision: 0.3 })], { assemblyModels: [am] });

    expect(evaluateDeclaredTargets(am, progress)).toMatchObject({
      declaredCount: 1,
      scoredCount: 1,
      metCount: 1,
      allScoredAndMet: true,
    });
  });

  it("zero declared targets is not all-met", () => {
    expect(evaluateDeclaredTargets(assemblyModel({ targetsBySMV: [] }), []).allScoredAndMet).toBe(false);
    expect(evaluateDeclaredTargets(assemblyModel({ targetsBySMV: undefined }), []).allScoredAndMet).toBe(false);
  });

  it("does not count a progress row from a different Assembly Model as scored", () => {
    const am = assemblyModel({ id: "am-governing" });
    const result = evaluateDeclaredTargets(am, [{
      smvId: "smv1",
      assemblyModelId: "am-other",
      stoppingCriterionMet: true,
    }]);

    expect(result.scoredCount).toBe(0);
    expect(result.allScoredAndMet).toBe(false);
  });
});
