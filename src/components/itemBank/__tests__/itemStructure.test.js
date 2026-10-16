// src/components/itemBank/__tests__/itemStructure.test.js
//
// The Item Bank's structural logic: the shared response vocabulary, the
// readiness function, the activation map and the derivation from the
// bound Task Model.

import { describe, it, expect } from "vitest";

import {
  OBSERVABLE_RESPONSE_MODE_VALUES,
  INTERACTION_TYPE_VALUES,
  interactionTypesForObservable,
  isInteractionCompatible,
  deriveAllowedScoringMethods,
  responsePatternIsSpecified,
  INTERACTION_COMPATIBILITY,
} from "@/utils/ecdVocabulary";

import {
  buildInitialItemDraft,
  normalizeActivationMap,
  newActivationRule,
  activationMapIssues,
  activationRuleIssues,
  deriveEvidenceBinding,
  deriveItemContext,
  itemReadiness,
  itemIsReady,
  itemCompatibilityNotes,
  operationalReadiness,
  stepBlockingChecks,
  ITEM_WIZARD_STEP_KEYS,
  exposureBand,
  REASONING_TYPES,
  BLOOM_LEVELS,
} from "../itemConstants";

import { toolsAllowedList } from "@/utils/schema";
import { apiErrorMessage } from "@/api/apiClient";
import {
  REASONING_TYPES as TM_REASONING_TYPES,
  BLOOM_LEVELS as TM_BLOOM_LEVELS,
} from "@/components/taskModels/taskModelConstants";

/* ---------------------------------------------------------- fixtures */

const observable = {
  id: "obs_1",
  statement: "Selects the correct linear equation",
  type: "selected_response",
  warrantId: "w_1",
  evidenceRule: { direction: "supports", strengthLevel: 4 },
};

const evidenceModel = {
  id: "em_1",
  name: "Numerical Reasoning",
  status: "operational",
  locked: true,
  versionNumber: 3,
  competencyId: "cmp_1",
  observables: [observable],
  warrants: [{ id: "w_1", reasoningStatement: "…" }],
  statisticalModels: [{ id: "sm_1", type: "irt", subtype: "2pl", active: true }],
};

const taskModel = {
  id: "tm_1",
  name: "Solve a multistep equation",
  status: "operational",
  locked: true,
  versionNumber: 2,
  evidenceModelIds: ["em_1"],
  primaryEvidenceModelId: "em_1",
  expectedObservations: [
    { observationId: "obs_1", evidenceModelId: "em_1", required: true, weight: 1 },
  ],
  blueprintConstraints: {},
};

function completeItem(overrides = {}) {
  return buildInitialItemDraft({
    id: "it_1",
    taskModelId: "tm_1",
    taskModelVersion: 2,
    observationId: "obs_1",
    evidenceModelId: "em_1",
    evidenceModelVersion: 3,
    stimulus: { layout: "single", blocks: [{ id: "b1", type: "text", text: "…" }] },
    interaction: {
      type: "mcq",
      responseComponents: [{ id: "rc1", label: "A", value: "A", isCorrect: true }],
      config: {},
    },
    scoring: {
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        {
          responsePattern: { equalsCorrect: true },
          score: 1,
          activatesObservable: true,
          rationale: "Choosing the correct equation is the observable.",
        },
      ],
    },
    psychometrics: {
      statisticalModelType: "irt",
      calibrationStatus: "pilot",
      irtParams: { a: 1.1, b: 0.2 },
    },
    equivalenceGroupId: "grp_1",
    exposureControl: { usageCount: 0, maxUsageBeforeRetire: 500 },
    status: "draft",
    versionNumber: 1,
    ...overrides,
  });
}

const ctxFor = (item) => deriveItemContext(item, { taskModel, evidenceModel });

/* ------------------------------------------------- shared vocabulary */

describe("ecdVocabulary", () => {
  it("keeps observable modes and interaction types as SEPARATE vocabularies", () => {
    // The regression this whole module exists to prevent: schema.js used
    // to require interaction.type === observable.type between two enums
    // with no value in common, so no item could ever satisfy it.
    const overlap = OBSERVABLE_RESPONSE_MODE_VALUES.filter((m) =>
      INTERACTION_TYPE_VALUES.includes(m)
    );
    expect(overlap).toEqual([]);
  });

  it("relates them by compatibility, and every observable mode has an entry", () => {
    for (const mode of OBSERVABLE_RESPONSE_MODE_VALUES) {
      expect(INTERACTION_COMPATIBILITY).toHaveProperty(mode);
    }
  });

  it("never maps an observable onto an interaction type the registry cannot render", () => {
    for (const mode of OBSERVABLE_RESPONSE_MODE_VALUES) {
      for (const t of interactionTypesForObservable(mode)) {
        expect(INTERACTION_TYPE_VALUES).toContain(t);
      }
    }
  });

  it("accepts mcq, multiselect and likert for a selected response", () => {
    expect(isInteractionCompatible("selected_response", "mcq")).toBe(true);
    expect(isInteractionCompatible("selected_response", "multiselect")).toBe(true);
    expect(isInteractionCompatible("selected_response", "likert")).toBe(true);
    expect(isInteractionCompatible("selected_response", "numeric")).toBe(false);
  });

  it("refuses to pretend a rated performance is a text box", () => {
    // Silently mapping performance -> constructed would let an author
    // confirm an item that collects the wrong evidence entirely.
    expect(interactionTypesForObservable("performance")).toEqual([]);
    expect(interactionTypesForObservable("artifact")).toEqual([]);
    expect(interactionTypesForObservable("process_trace")).toEqual([]);
  });

  it("derives scoring methods from the active statistical model", () => {
    expect(deriveAllowedScoringMethods({ type: "rasch" })).toEqual(["dichotomous"]);
    expect(deriveAllowedScoringMethods({ type: "irt", subtype: "grm" })).toEqual([
      "polytomous",
    ]);
    expect(deriveAllowedScoringMethods({ type: "ctt" })).toEqual([
      "dichotomous",
      "weighted_sum",
    ]);
    expect(deriveAllowedScoringMethods({ type: "bayesian_network" })).toEqual([
      "categorical_activation",
    ]);
    expect(deriveAllowedScoringMethods(null)).toEqual([]);
  });

  it("treats an empty response pattern as unspecified", () => {
    expect(responsePatternIsSpecified("dichotomous", {})).toBe(false);
    expect(responsePatternIsSpecified("dichotomous", { equalsCorrect: false })).toBe(true);
    expect(responsePatternIsSpecified("weighted_sum", { minScore: 2 })).toBe(true);
    expect(responsePatternIsSpecified("weighted_sum", { minScore: null })).toBe(false);
  });

  // Day 27: reconciles the Wizard-authored descriptor shape (equalsCorrect
  // etc.) with the raw-response shape server/delivery/evidenceIdentification.js
  // actually matches against a work product (e.g. `{ selected: "opt_a" }`,
  // the shape samples/sample-items.json uses) -- before this fix, an item
  // using that shape could never be confirmed, since `equalsCorrect` was
  // absent and nothing else counted as "specified".
  it("also treats a raw-response-shaped pattern (not the descriptor's own field) as specified", () => {
    expect(responsePatternIsSpecified("dichotomous", { selected: "opt_a" })).toBe(true);
    expect(responsePatternIsSpecified("dichotomous", { selected: ["opt_b", "opt_c"] })).toBe(true);
    expect(responsePatternIsSpecified("dichotomous", { selected: "" })).toBe(false);
    expect(responsePatternIsSpecified("dichotomous", { selected: [] })).toBe(false);
    // Still rejects a genuinely empty pattern either way.
    expect(responsePatternIsSpecified("dichotomous", {})).toBe(false);
    expect(responsePatternIsSpecified("dichotomous", null)).toBe(false);
  });
});

/* ------------------------------------------------------ draft shape */

describe("buildInitialItemDraft", () => {
  it("preserves fields the old default factory dropped", () => {
    const draft = buildInitialItemDraft({
      taskModelId: "tm_1",
      equivalenceGroupId: "grp_9",
      metadata: { subject: "Maths" },
      cognitiveDemand: { bloomLevel: "apply" },
      parentItemId: "it_0",
    });

    expect(draft.equivalenceGroupId).toBe("grp_9");
    expect(draft.metadata.subject).toBe("Maths");
    expect(draft.cognitiveDemand.bloomLevel).toBe("apply");
    expect(draft.parentItemId).toBe("it_0");
  });

  it("is idempotent, so an untouched item does not open dirty", () => {
    const once = buildInitialItemDraft(completeItem());
    const twice = buildInitialItemDraft(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

/* ------------------------------------------------- activation map */

describe("evidence activation map", () => {
  it("upgrades legacy records written with the old key names", () => {
    const upgraded = normalizeActivationMap([
      {
        condition: { equalsCorrect: true },
        activateObservable: true,
        score: 1,
      },
    ]);

    expect(upgraded[0].responsePattern).toEqual({ equalsCorrect: true });
    expect(upgraded[0].activatesObservable).toBe(true);
    // rationale had no UI at all, so legacy rows have none -- and that is
    // now reported rather than silently failing the save.
    expect(upgraded[0].rationale).toBe("");
  });

  it("requires a rationale on every rule", () => {
    const rule = newActivationRule({
      responsePattern: { equalsCorrect: true },
      activatesObservable: true,
    });

    expect(activationRuleIssues(rule, "dichotomous").join(" ")).toMatch(/rationale/i);
  });

  it("requires at least one ACTIVATING rule", () => {
    const issues = activationMapIssues({
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        newActivationRule({
          responsePattern: { equalsCorrect: false },
          activatesObservable: false,
          rationale: "Wrong answer.",
        }),
      ],
    });

    expect(issues.join(" ")).toMatch(/no rule activates the observable/i);
  });

  it("catches a rule awarding more than maxScore", () => {
    const issues = activationMapIssues({
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        newActivationRule({
          responsePattern: { equalsCorrect: true },
          score: 3,
          activatesObservable: true,
          rationale: "…",
        }),
      ],
    });

    expect(issues.join(" ")).toMatch(/awards 3 but maxScore is 1/);
  });

  it("reports an empty map rather than accepting it", () => {
    expect(activationMapIssues({ method: "dichotomous", evidenceActivationMap: [] })
      .join(" ")).toMatch(/at least one activation rule/i);
  });
});

/* ----------------------------------------------------- derivation */

describe("derivation from the Task Model", () => {
  it("resolves the evidence binding from the declared observation", () => {
    const binding = deriveEvidenceBinding(taskModel, "obs_1", [evidenceModel]);
    expect(binding.evidenceModelId).toBe("em_1");
    expect(binding.evidenceModelVersion).toBe(3);
  });

  it("returns nulls rather than throwing for an undeclared observation", () => {
    const binding = deriveEvidenceBinding(taskModel, "nope", [evidenceModel]);
    expect(binding.evidenceModelId).toBeNull();
    expect(binding.declaredObservation).toBeNull();
  });

  it("derives the construct through the chain instead of storing it", () => {
    expect(ctxFor(completeItem()).competencyId).toBe("cmp_1");
  });

  it("narrows interactions by the blueprint whitelist, never widens", () => {
    const narrowed = deriveItemContext(completeItem(), {
      taskModel: {
        ...taskModel,
        blueprintConstraints: { allowedInteractionTypes: ["mcq", "numeric"] },
      },
      evidenceModel,
    });

    // numeric is in the whitelist but cannot elicit a selected_response.
    expect(narrowed.allowedInteractionTypes).toEqual(["mcq"]);
  });

  it("treats an EMPTY whitelist as no constraint, not as a total block", () => {
    const unconstrained = deriveItemContext(completeItem(), {
      taskModel: { ...taskModel, blueprintConstraints: { allowedInteractionTypes: [] } },
      evidenceModel,
    });

    expect(unconstrained.allowedInteractionTypes).toEqual([
      "mcq",
      "multiselect",
      "likert",
    ]);
  });

  it("flags a blueprint that contradicts the observation", () => {
    const contradictory = deriveItemContext(completeItem(), {
      taskModel: {
        ...taskModel,
        blueprintConstraints: { allowedInteractionTypes: ["numeric"] },
      },
      evidenceModel,
    });

    expect(contradictory.allowedInteractionTypes).toEqual([]);
    expect(contradictory.interactionBlockedByBlueprint).toBe(true);
  });
});

/* ------------------------------------------------------ readiness */

describe("itemReadiness", () => {
  it("fails when the activating rule awards no score", () => {
    const issues = activationMapIssues({
      method: "dichotomous",
      maxScore: 1,
      evidenceActivationMap: [
        {
          responsePattern: { equalsCorrect: true },
          score: 0,
          activatesObservable: true,
          rationale: "Correct, but the rule awards nothing.",
        },
      ],
    });
    expect(issues.some((issue) => /score greater than 0/.test(issue))).toBe(true);
  });

  it("fails a multiple-choice item with a blank option and no correct option", () => {
    const item = completeItem({
      interaction: {
        type: "mcq",
        responseComponents: [
          { id: "a", label: "Cell membrane", value: "Nucleus", isCorrect: false },
          { id: "b", label: "", value: "", isCorrect: false },
        ],
        config: {},
      },
    });
    const failing = itemReadiness(item, ctxFor(item)).filter((c) => !c.ok);
    expect(failing.map((f) => f.id)).toContain("choiceOptions");
  });

  it("passes a fully authored item", () => {
    const item = completeItem();
    const failing = itemReadiness(item, ctxFor(item)).filter((c) => !c.ok);
    expect(failing.map((f) => f.id)).toEqual([]);
    expect(itemIsReady(item, ctxFor(item))).toBe(true);
  });

  it("fails an item whose interaction cannot elicit the observable", () => {
    const item = completeItem({
      interaction: { type: "numeric", responseComponents: [{ id: "r" }], config: {} },
    });
    const failing = itemReadiness(item, ctxFor(item)).filter((c) => !c.ok);
    expect(failing.map((f) => f.id)).toContain("interactionCompatible");
  });

  it("fails an IRT item with no parameters, and passes a CTT one", () => {
    const noParams = completeItem({
      psychometrics: { statisticalModelType: "irt", irtParams: {} },
    });
    expect(
      itemReadiness(noParams, ctxFor(noParams)).find((c) => c.id === "irtParams").ok
    ).toBe(false);

    const cttModel = {
      ...evidenceModel,
      statisticalModels: [{ id: "sm", type: "ctt", active: true }],
    };
    const cttItem = completeItem({
      scoring: {
        method: "dichotomous",
        maxScore: 1,
        evidenceActivationMap: [
          {
            responsePattern: { equalsCorrect: true },
            score: 1,
            activatesObservable: true,
            rationale: "…",
          },
        ],
      },
      psychometrics: { statisticalModelType: "ctt", irtParams: {} },
    });
    const cttCtx = deriveItemContext(cttItem, { taskModel, evidenceModel: cttModel });
    expect(itemReadiness(cttItem, cttCtx).find((c) => c.id === "irtParams").ok).toBe(true);
  });

  it("names the step that fixes each failing check", () => {
    const empty = buildInitialItemDraft({});
    for (const check of itemReadiness(empty, deriveItemContext(empty, {}))) {
      expect(ITEM_WIZARD_STEP_KEYS).toContain(check.step);
    }
  });
});

/* --------------------------------------------------- step gating */

describe("step gating", () => {
  it("does not block step 1 on an error whose fix lives on step 5", () => {
    // The regression: the old wizard gated Next on the WHOLE item
    // validating, so an unfinished scoring map blocked the very first
    // step -- and the step that would fix it was unreachable from there.
    const noScoring = completeItem({
      scoring: { method: "", maxScore: 1, evidenceActivationMap: [] },
    });

    expect(stepBlockingChecks("instantiation", noScoring, ctxFor(noScoring))).toEqual([]);
    expect(stepBlockingChecks("stimulus", noScoring, ctxFor(noScoring))).toEqual([]);
  });

  it("blocks instantiation until the binding resolves", () => {
    const empty = buildInitialItemDraft({});
    const blockers = stepBlockingChecks("instantiation", empty, deriveItemContext(empty, {}));
    expect(blockers.map((b) => b.id)).toContain("taskModel");
  });

  it("blocks the interaction step on an incompatible interaction", () => {
    const bad = completeItem({
      interaction: { type: "numeric", responseComponents: [{ id: "r" }], config: {} },
    });
    expect(
      stepBlockingChecks("interaction", bad, ctxFor(bad)).map((b) => b.id)
    ).toContain("interactionCompatible");
  });

  it("never blocks the review step, which is where problems are explained", () => {
    const empty = buildInitialItemDraft({});
    expect(stepBlockingChecks("review", empty, deriveItemContext(empty, {}))).toEqual([]);
  });
});

/* --------------------------------------------- coherence + operations */

describe("itemCompatibilityNotes", () => {
  it("mirrors the schema rule about counter-evidence on a supporting observable", () => {
    const item = completeItem({
      scoring: {
        method: "dichotomous",
        maxScore: 1,
        evidenceActivationMap: [
          {
            responsePattern: { equalsCorrect: true },
            score: 1,
            activatesObservable: true,
            rationale: "…",
          },
          {
            responsePattern: { equalsCorrect: false },
            score: 0,
            activatesObservable: false,
            rationale: "…",
          },
        ],
      },
    });

    const blocking = itemCompatibilityNotes(item, ctxFor(item)).filter(
      (n) => n.severity === "blocking"
    );
    expect(blocking.map((n) => n.message).join(" ")).toMatch(/counter-evidence/i);
  });

  it("blocks IRT parameters on a non-IRT evidence model", () => {
    const cttModel = {
      ...evidenceModel,
      statisticalModels: [{ id: "sm", type: "ctt", active: true }],
    };
    const item = completeItem();
    const notes = itemCompatibilityNotes(
      item,
      deriveItemContext(item, { taskModel, evidenceModel: cttModel })
    );
    expect(
      notes.filter((n) => n.severity === "blocking").map((n) => n.message).join(" ")
    ).toMatch(/IRT parameters are present/);
  });
});

describe("operationalReadiness", () => {
  it("requires an equivalence group and an exposure ceiling", () => {
    const item = completeItem({ equivalenceGroupId: "", exposureControl: {} });
    const failing = operationalReadiness(item, ctxFor(item)).filter((c) => !c.ok);
    expect(failing.map((f) => f.id)).toEqual(
      expect.arrayContaining(["equivalenceGroup", "exposureCeiling"])
    );
  });

  it("requires the Evidence Model to be live", () => {
    const item = completeItem();
    const paused = deriveItemContext(item, {
      taskModel,
      evidenceModel: { ...evidenceModel, status: "suspended" },
    });
    expect(
      operationalReadiness(item, paused).find((c) => c.id === "evidenceLive").ok
    ).toBe(false);
  });
});

describe("exposureBand", () => {
  it("classifies against the ceiling", () => {
    expect(exposureBand({ exposureControl: {} })).toBe("unbounded");
    expect(
      exposureBand({ exposureControl: { usageCount: 10, maxUsageBeforeRetire: 100 } })
    ).toBe("healthy");
    expect(
      exposureBand({ exposureControl: { usageCount: 85, maxUsageBeforeRetire: 100 } })
    ).toBe("nearing");
    expect(
      exposureBand({ exposureControl: { usageCount: 100, maxUsageBeforeRetire: 100 } })
    ).toBe("exhausted");
  });
});

/* ==========================================================
   Regressions from the live wizard walkthrough (2026-08-22)
   Each of these is a defect a browser found and static
   verification did not.
   ========================================================== */

describe("toolsAllowedList (P0-1: white-screen crash)", () => {
  // taskStructure.resourceConstraints.toolsAllowed had no declared type.
  // The Task Model editor wrote a comma-separated STRING; the Item Wizard
  // read it as string[] behind a `?.length` guard -- truthy for a
  // non-empty string -- and called .join() on it. That threw out of a
  // render and unmounted the entire admin console to a blank page. It
  // looked intermittent because only a Task Model that actually named a
  // tool triggered it.
  //
  // The array is now the only shape: the Day 10 migration
  // (002-normalize-tools-allowed.js) rewrote every on-disk string to an
  // array, so the reader no longer parses comma-separated strings -- a
  // leftover string is treated as unrecognized, not re-parsed.
  it("reads the array shape", () => {
    expect(toolsAllowedList({ toolsAllowed: ["a", "b"] })).toEqual(["a", "b"]);
    expect(toolsAllowedList({ toolsAllowed: [" a ", "", "b"] })).toEqual(["a", "b"]);
  });

  it("returns an empty list for anything that isn't an array", () => {
    expect(toolsAllowedList({ toolsAllowed: "Scratch pad" })).toEqual([]);
    expect(toolsAllowedList({ toolsAllowed: "" })).toEqual([]);
    expect(toolsAllowedList({})).toEqual([]);
    expect(toolsAllowedList(undefined)).toEqual([]);
  });

  it("always returns something .join can be called on", () => {
    for (const raw of [["a"], "Scratch pad", "", undefined, null, 7]) {
      expect(Array.isArray(toolsAllowedList({ toolsAllowed: raw }))).toBe(true);
    }
  });
});

describe("apiErrorMessage (P1-1: swallowed server reason)", () => {
  // Every validation failure this API produces carries the actionable
  // sentence in `details[]`, which this function did not read -- so a
  // toast showed only "Item lifecycle validation failed." while the
  // preflight panel, reading the body itself, showed the real reason.
  it("leads with the detail when there is exactly one", () => {
    expect(
      apiErrorMessage(
        { body: { error: "Item lifecycle validation failed.", details: ["Needs a and b."] } },
        "fallback"
      )
    ).toBe("Needs a and b.");
  });

  it("keeps the headline when there are several", () => {
    const msg = apiErrorMessage(
      { body: { error: "Item validation failed.", details: ["one", "two"] } },
      "fallback"
    );
    expect(msg).toMatch(/Item validation failed\./);
    expect(msg).toMatch(/one/);
    expect(msg).toMatch(/two/);
  });

  it("is unchanged for bodies without details", () => {
    expect(apiErrorMessage({ body: { error: "Nope." } }, "f")).toBe("Nope.");
    expect(apiErrorMessage({ body: { errors: ["a", "b"] } }, "f")).toBe("a, b");
    expect(apiErrorMessage({}, "f")).toBe("f");
  });
});

describe("deliverability, refused at Step 1", () => {
  // Previously an author could bind an observation, invest five steps of
  // stimulus and metadata work, and only discover at the interaction step
  // that no interaction could elicit it -- an empty dropdown and a
  // disabled Next, with the only remedy being to go back and discard the
  // work. The contradiction is knowable at binding time.
  const emWith = (type) => ({
    ...evidenceModel,
    observables: [{ ...observable, type }],
  });

  it("blocks a rated response mode at instantiation", () => {
    const item = completeItem();
    const ctx = deriveItemContext(item, { taskModel, evidenceModel: emWith("performance") });
    expect(stepBlockingChecks("instantiation", item, ctx).map((b) => b.id)).toContain(
      "deliverable"
    );
  });

  it("blocks a blueprint that contradicts the observation, at instantiation", () => {
    const item = completeItem();
    const ctx = deriveItemContext(item, {
      taskModel: { ...taskModel, blueprintConstraints: { allowedInteractionTypes: ["mcq"] } },
      evidenceModel: emWith("numeric_response"),
    });

    const blocker = stepBlockingChecks("instantiation", item, ctx).find(
      (b) => b.id === "deliverable"
    );
    expect(blocker).toBeTruthy();
    expect(blocker.detail).toMatch(/contradict each other/);
  });

  it("does not fire for a deliverable binding", () => {
    const item = completeItem();
    expect(stepBlockingChecks("instantiation", item, ctxFor(item))).toEqual([]);
  });
});

describe("shared cognitive vocabularies (P2-4)", () => {
  // The item wizard declared four reasoning types while Task Model
  // blueprints declare from a seven-value list. Three blueprint values
  // could not be recorded on an item at all, so blueprint-coverage
  // reporting showed a permanent, unclearable departure.
  it("can record every reasoning type a blueprint may declare", () => {
    expect(REASONING_TYPES).toEqual(TM_REASONING_TYPES);
    const values = REASONING_TYPES.map((r) => r.value);
    for (const v of ["procedural", "deductive", "algorithmic"]) {
      expect(values).toContain(v);
    }
  });

  it("shares one Bloom list with the blueprint step", () => {
    expect(BLOOM_LEVELS).toEqual(TM_BLOOM_LEVELS);
  });
});
