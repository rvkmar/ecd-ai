// server/delivery/__tests__/evidenceIdentification.test.js
//
// Day 27 (Week 6): Evidence Identification. Exit check: given a work
// product and an item, returns observable variable values -- and,
// critically, NOT a score. Fixtures are the repo's own worked example
// (samples/sample-items.json, now with its "MCQ"/"binary" values fixed to
// the real ecdVocabulary enum), so this also serves as a regression test
// against that sample data.

import { describe, it, expect } from "vitest";
import { identifyEvidence } from "../evidenceIdentification.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const evidenceModel = {
  id: "em-numerical-reasoning",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
      type: "selected_response",
      evidenceRule: { direction: "supports", strengthLevel: 4, activationCondition: "any", justification: "Direct evidence of equivalence recognition." },
    },
    // o2 has no embedded evidenceRule -- must fall back to evidenceRules[].
    { id: "o2", type: "selected_response" },
  ],
  evidenceRules: [
    { observableId: "o2", direction: "supports", strengthLevel: 3, activationCondition: "any", justification: "Magnitude comparison evidence." },
  ],
  evaluationProcedures: [
    {
      id: "ep-o1",
      observableId: "o1",
      workProductType: "mcq_selection",
      method: "key",
      description: "Key for equivalent fractions.",
      artifactRef: "keys/o1.json",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_a" }] },
    },
    {
      id: "ep-o2",
      observableId: "o2",
      workProductType: "mcq_selection",
      method: "key",
      description: "Key for fraction comparison.",
      artifactRef: "keys/o2.json",
      artifact: { kind: "key", correctPatterns: [{ selected: "opt_b" }] },
    },
  ],
};

const taskModel = {
  id: "tm-numerical-reasoning",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em-numerical-reasoning"],
  expectedObservations: [
    { observationId: "o1", evidenceModelId: "em-numerical-reasoning", required: true, weight: 1 },
    { observationId: "o2", evidenceModelId: "em-numerical-reasoning", required: true, weight: 1 },
  ],
};

const equivalentFractionsItem = {
  id: "item-equivalent-fractions",
  taskModelId: "tm-numerical-reasoning",
  taskModelVersion: 1,
  status: "confirmed",
  observationId: "o1",
  evidenceModelId: "em-numerical-reasoning",
  evidenceModelVersion: 1,
  scoring: {
    method: "dichotomous",
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "1/2 is equivalent to 2/4." },
      { responsePattern: { selected: ["opt_b", "opt_c", "opt_d"] }, activatesObservable: false, rationale: "Distractor." },
    ],
  },
};

const fractionComparisonItem = {
  id: "item-fraction-comparison",
  taskModelId: "tm-numerical-reasoning",
  taskModelVersion: 1,
  status: "confirmed",
  observationId: "o2",
  evidenceModelId: "em-numerical-reasoning",
  evidenceModelVersion: 1,
  scoring: {
    method: "dichotomous",
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_b" }, activatesObservable: true, rationale: "5/8 is larger." },
      { responsePattern: { selected: ["opt_a", "opt_c"] }, activatesObservable: false, rationale: "Incorrect or non-committal." },
    ],
  },
};

function makeDb(overrides = {}) {
  const { compositeLibrary, ...rest } = overrides;
  const db = {
    evidenceModels: [evidenceModel],
    taskModels: [taskModel],
    items: [equivalentFractionsItem, fractionComparisonItem],
    ...rest,
  };
  if (compositeLibrary !== undefined) {
    db.compositeLibrary = compositeLibrary;
  } else {
    seedActivePackages(db);
  }
  return db;
}

/** Identify against a package compiled from `item` (and any extra overrides). */
function identify(workProduct, item, overrides = {}) {
  return identifyEvidence(workProduct, item, makeDb({ items: [item], ...overrides }));
}

describe("identifyEvidence — happy path against the repo's own worked example", () => {
  it("returns an activated Observable Variable value for a response that activates the observable", () => {
    const result = identify({ selected: "opt_a" }, equivalentFractionsItem);

    expect(result).toEqual({
      observationId: "o1",
      observableId: "o1",
      activated: true,
      direction: "supports",
      strength: 4, // strengthOverride wins over evidenceRule.strengthLevel
      rationale: "1/2 is equivalent to 2/4.",
      evaluationMethod: "key",
      evaluationProcedureId: "ep-o1",
    });
  });

  it("returns a non-activated value for a distractor response, via array-membership matching", () => {
    const result = identify({ selected: "opt_c" }, equivalentFractionsItem);

    expect(result.activated).toBe(false);
    expect(result.direction).toBe("supports"); // the observable's declared direction, regardless of activation
    expect(result.rationale).toBe("Distractor.");
  });

  it("falls back to evidenceModel.evidenceRules[] when the observable has no embedded evidenceRule", () => {
    const result = identify({ selected: "opt_b" }, fractionComparisonItem);

    expect(result.activated).toBe(true);
    expect(result.direction).toBe("supports");
    expect(result.strength).toBe(3); // no strengthOverride on this entry -> evidenceRule.strengthLevel
  });
});

describe("identifyEvidence — never emits a score", () => {
  it("the result never contains a score/correct/scoredValue field, for any input", () => {
    for (const [workProduct, item] of [
      [{ selected: "opt_a" }, equivalentFractionsItem],
      [{ selected: "opt_c" }, equivalentFractionsItem],
      [{ selected: "opt_b" }, fractionComparisonItem],
    ]) {
      const result = identify(workProduct, item);
      const keys = Object.keys(result);
      expect(keys).not.toContain("score");
      expect(keys).not.toContain("scoredValue");
      expect(keys).not.toContain("correct");
      expect(keys).not.toContain("isCorrect");
    }
  });
});

describe("identifyEvidence — degrades gracefully rather than throwing", () => {
  it("scores from the package-baked map when the evidence model did not resolve at compile time", () => {
    // Pre-D49c this re-walked db.evidenceModels and warned. The package still
    // bakes the item's activation map; direction is null because no
    // evidenceRule resolved. Identification must not consult a live EM.
    const item = { ...equivalentFractionsItem, evidenceModelId: "em-ghost" };
    const result = identify({ selected: "opt_a" }, item);

    expect(result.refused).toBeUndefined();
    expect(result.activated).toBe(true);
    expect(result.direction).toBeNull();
    expect(result.strength).toBe(4);
  });

  it("scores from the package-baked map when the compiled evidenceRule is missing", () => {
    const item = { ...equivalentFractionsItem, observationId: "o-does-not-exist" };
    const result = identify({ selected: "opt_a" }, item);

    expect(result.refused).toBeUndefined();
    expect(result.activated).toBe(true);
    expect(result.direction).toBeNull();
    expect(result.observableId).toBe("o-does-not-exist");
  });

  it("warns (but does not throw) when the work product matches no declared responsePattern", () => {
    const result = identify({ selected: "opt_z" }, equivalentFractionsItem);

    expect(result.activated).toBeNull();
    expect(result.direction).toBe("supports"); // still resolvable even without a pattern match
    expect(result.warning).toMatch(/did not match any declared responsePattern/);
  });

  it("handles an item with no evidenceActivationMap at all (empty, not missing)", () => {
    const item = { ...equivalentFractionsItem, scoring: {} };
    // Empty map falls back to baked evaluationProcedure key artifact.
    const result = identify({ selected: "opt_a" }, item);
    expect(result.activated).toBe(true);
    expect(result.evaluationMethod).toBe("key");
    expect(result.evaluationProcedureId).toBe("ep-o1");
  });

  it("falls back to evaluationProcedure key when activation map is empty and pattern misses", () => {
    const item = { ...equivalentFractionsItem, scoring: { evidenceActivationMap: [] } };
    const result = identify({ selected: "opt_z" }, item);
    expect(result.activated).toBe(false);
    expect(result.evaluationMethod).toBe("key");
  });

  it("throws for a missing item", () => {
    expect(() => identifyEvidence({ selected: "opt_a" }, null, makeDb())).toThrow(/requires an item/);
  });

  it("throws for a missing db", () => {
    expect(() => identifyEvidence({ selected: "opt_a" }, equivalentFractionsItem, null)).toThrow(/requires a db snapshot/);
  });
});

describe("identifyEvidence — response pattern matching semantics", () => {
  it("does not match a pattern object against a work product missing the relevant key", () => {
    const result = identify({}, equivalentFractionsItem);
    expect(result.activated).toBeNull();
  });

  it("requires ALL keys in a multi-key pattern to match (conjunction, not disjunction)", () => {
    const multiKeyItem = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { selected: "opt_a", confidence: "high" }, activatesObservable: true, rationale: "Confident and correct." },
        ],
      },
    };
    expect(identify({ selected: "opt_a", confidence: "low" }, multiKeyItem).activated).toBeNull();
    expect(identify({ selected: "opt_a", confidence: "high" }, multiKeyItem).activated).toBe(true);
  });

  // FIXED (Day 27 adversarial review): `matchesResponsePattern` now
  // explicitly rejects an empty `{}` pattern before doing the vacuous-truth
  // `Object.entries({}).every(...)` check, so an empty pattern matches
  // NOTHING rather than everything.
  it("an empty {} responsePattern matches nothing (fixed from the original vacuous-truth bug)", () => {
    const itemWithEmptyPattern = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: {}, activatesObservable: true, rationale: "Empty pattern -- must not match everything." },
        ],
      },
    };
    const result = identify({ totally: "unrelated", shape: 123 }, itemWithEmptyPattern);
    expect(result.activated).toBeNull();
    expect(result.warning).toMatch(/did not match any declared responsePattern/);
  });

  // FIXED: since an empty pattern no longer matches anything, it can no
  // longer shadow a later, specific entry either -- the specific entry is
  // reached and matches normally.
  it("an empty-pattern entry declared first no longer shadows a later, specific entry", () => {
    const itemWithLeadingEmptyPattern = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: {}, activatesObservable: true, rationale: "Accidentally empty." },
          { responsePattern: { selected: "opt_a" }, activatesObservable: false, rationale: "The real rule, now reachable." },
        ],
      },
    };
    const result = identify({ selected: "opt_a" }, itemWithLeadingEmptyPattern);
    expect(result.activated).toBe(false);
    expect(result.rationale).toBe("The real rule, now reachable.");
  });

  // FIXED (Day 30 adversarial review): a multi-select work product
  // (`selected: ["opt_a", ...]`) now matches an array-typed pattern by
  // overlap -- both sides are normalized to arrays and compared for any
  // shared value, rather than comparing the whole actual array by
  // reference against the pattern array's elements (which could never
  // succeed). Single-value-vs-single-value matching (the common MCQ case)
  // is unaffected -- see the tests above, still passing.
  it("a multi-select (array-valued) work product matches an array-typed pattern by overlap", () => {
    const multiSelectItem = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { selected: ["opt_a", "opt_b"] }, activatesObservable: true, rationale: "Any of a/b selected." },
        ],
      },
    };
    expect(identify({ selected: ["opt_a"] }, multiSelectItem).activated).toBe(true);
    expect(identify({ selected: ["opt_a", "opt_c"] }, multiSelectItem).activated).toBe(true);
    expect(identify({ selected: ["opt_c", "opt_d"] }, multiSelectItem).activated).toBeNull();
  });

  it("a single-valued pattern matches a multi-select work product that includes it", () => {
    const item = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { selected: "opt_a" }, activatesObservable: true, rationale: "Includes the key option." },
        ],
      },
    };
    expect(identify({ selected: ["opt_a", "opt_c"] }, item).activated).toBe(true);
    expect(identify({ selected: ["opt_c", "opt_d"] }, item).activated).toBeNull();
  });

  it("handles falsy pattern/work-product values (0, false, empty string) with strict equality, no loose coercion", () => {
    const zeroScoreItem = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { score: 0 }, activatesObservable: true, rationale: "A raw score of exactly zero is still evidence." },
        ],
      },
    };
    // Exact falsy match succeeds.
    expect(identify({ score: 0 }, zeroScoreItem).activated).toBe(true);
    // A different falsy value does NOT loosely coerce to match (0 !== false, 0 !== "").
    expect(identify({ score: false }, zeroScoreItem).activated).toBeNull();
    expect(identify({ score: "" }, zeroScoreItem).activated).toBeNull();
  });
});

describe("identifyEvidence — activation map authoring gaps", () => {
  // FIXED (Day 27 adversarial review): an entry missing `activatesObservable`
  // entirely (an authoring mistake) now returns activated:null with a
  // warning, distinguishing "author forgot the field" from a deliberate
  // false. schema.js separately requires activatesObservable to be a strict
  // boolean at confirm-time (~line 2723); this is the defensive counterpart
  // for whenever this function is called against a non-confirmed item.
  it("a matched entry missing activatesObservable now returns activated:null with a warning, not a silent false", () => {
    const itemMissingFlag = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { selected: "opt_a" }, rationale: "activatesObservable field omitted by mistake." },
        ],
      },
    };
    const result = identify({ selected: "opt_a" }, itemMissingFlag);
    expect(result.activated).toBeNull();
    expect(result.warning).toMatch(/does not declare activatesObservable as a boolean/);
  });

  // KNOWN GAP, still present: two entries with genuinely overlapping (not
  // identical) responsePatterns (both match the same work product) still
  // resolve via `Array.prototype.find`'s first-match-wins semantics, with no
  // runtime warning that a second, conflicting entry also matched. Day 27
  // added an EXACT-duplicate-pattern guard to schema.js's confirm-time
  // validation (a byte-identical responsePattern on two rules is now
  // refused), which covers the unambiguous case; true semantic overlap
  // (e.g. one pattern's array-valued key being a superset of another's) is
  // deliberately left unguarded -- detecting that in general needs the
  // pattern's array/membership semantics, a fuzzier problem than this pass
  // scoped in.
  it("CURRENT BEHAVIOR (still a gap): overlapping-but-not-identical activationMap entries resolve silently via first-match-wins", () => {
    const overlappingItem = {
      ...equivalentFractionsItem,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { selected: "opt_a" }, activatesObservable: true, rationale: "Specific rule, declared first." },
          { responsePattern: { selected: ["opt_a", "opt_b"] }, activatesObservable: false, rationale: "Broader, conflicting rule, declared second." },
        ],
      },
    };
    const result = identify({ selected: "opt_a" }, overlappingItem);
    expect(result.activated).toBe(true); // first entry wins
    expect(result.rationale).toBe("Specific rule, declared first.");
    expect(result.warning).toBeUndefined(); // no signal that entry 2 also matched
  });
});

describe("identifyEvidence — strength resolution when nothing declares a strength", () => {
  // KNOWN-RISKY (speculative, flagged for whoever builds Accumulation next):
  // `strength: null` is meant to mean "genuinely unknown magnitude", not
  // "weak but nonzero". If Accumulation ever does arithmetic on `strength`
  // without an explicit null-check (e.g. `strength * weight`), JS coerces
  // `null` to `0` silently (no throw, no NaN) -- indistinguishable from a
  // deliberately-declared zero-strength observation. This test only pins
  // down that `strength` really does come back as `null` (not `undefined`,
  // not `0`) when neither strengthOverride nor evidenceRule.strengthLevel is
  // set; it does not assert anything about Accumulation, which doesn't
  // exist yet.
  it("resolves strength to null (not 0, not undefined) when neither strengthOverride nor evidenceRule.strengthLevel is set", () => {
    const noStrengthEvidenceModel = {
      id: "em-no-strength",
      observables: [{ id: "o1", type: "selected_response", evidenceRule: { direction: "supports" } }], // no strengthLevel
    };
    const item = {
      id: "item-no-strength",
      taskModelId: "tm-numerical-reasoning",
      taskModelVersion: 1,
      status: "confirmed",
      observationId: "o1",
      evidenceModelId: "em-no-strength",
      evidenceModelVersion: 1,
      scoring: {
        evidenceActivationMap: [
          { responsePattern: { selected: "opt_a" }, activatesObservable: true, rationale: "No strength info anywhere." }, // no strengthOverride
        ],
      },
    };
    const result = identify({ selected: "opt_a" }, item, { evidenceModels: [noStrengthEvidenceModel] });
    expect(result.activated).toBe(true);
    expect(result.strength).toBeNull();
    expect(Number.isNaN(result.strength)).toBe(false);
  });
});
