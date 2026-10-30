import { describe, it, expect } from "vitest";
import {
  Q3_ABS_THRESHOLD,
  bundleCandidates,
  bundleAlreadyEnabled,
  calibrationBundleRequestErrors,
  calibrationBundlesFromEvidenceModel,
  mergeEnabledBundle,
  passageKeyOf,
  planBundleScoring,
  scoringBundleAuthoringErrors,
  scoringBundlesForParameterSet,
  workProductIdOf,
} from "../scoringBundles.js";
import { parameterSetFromCalibrationResponse } from "../../../server/r/calibrationContract.js";

const passage = "The river rose overnight and covered the lower field completely.";

function item(id, extra = {}) {
  return {
    id,
    interaction: { workProductId: extra.workProductId },
    stimulus: extra.stimulus,
  };
}

describe("scoring bundle suggestions", () => {
  it("uses the documented Q3 threshold of 0.2", () => {
    expect(Q3_ABS_THRESHOLD).toBe(0.2);
  });

  it("groups flagged items that share a work product or a passage", () => {
    const items = [
      item("a", { workProductId: "wp1" }),
      item("b", { workProductId: "wp1" }),
      item("c", {
        stimulus: { layout: "passage_based", passageId: "stem-9" },
      }),
      item("d", {
        stimulus: { layout: "passage_based", passageId: "stem-9" },
      }),
      item("e", { workProductId: "wp_alone" }),
    ];
    expect(workProductIdOf(items[0])).toBe("wp1");
    expect(passageKeyOf(items[2])).toBe("stem-9");
    expect(passageKeyOf(item("z", {
      stimulus: { layout: "passage_based", blocks: [{ content: { text: passage } }] },
    }))).toMatch(/^passage:/);

    const candidates = bundleCandidates(
      [
        { itemId1: "a", itemId2: "b", q3: 0.44 },
        { itemId1: "c", itemId2: "d", q3: -0.31 },
        { itemId1: "a", itemId2: "e", q3: 0.25 },
      ],
      items
    );
    expect(candidates.map((row) => row.basis).sort()).toEqual(["passage", "workProduct"]);
    const work = candidates.find((row) => row.basis === "workProduct");
    expect(work.itemIds).toEqual(["a", "b"]);
    expect(work.sourceId).toBe("wp1");
    const sharedPassage = candidates.find((row) => row.basis === "passage");
    expect(sharedPassage.itemIds).toEqual(["c", "d"]);
  });

  it("does not suggest a pair with no shared work product or passage", () => {
    const items = [item("a"), item("b")];
    expect(bundleCandidates([{ itemId1: "a", itemId2: "b", q3: 0.5 }], items)).toEqual([]);
  });
});

describe("scoring bundle authoring", () => {
  const db = {
    items: [
      item("a", { workProductId: "wp1" }),
      item("b", { workProductId: "wp1" }),
    ],
  };

  it("accepts an enabled bundle and rejects a second claim on the same item", () => {
    const row = {
      id: "bundle_workProduct_wp1",
      enabled: true,
      basis: "workProduct",
      sourceId: "wp1",
      itemIds: ["a", "b"],
    };
    expect(scoringBundleAuthoringErrors([row], db)).toEqual([]);
    expect(scoringBundleAuthoringErrors([row, { ...row, id: "other" }], db).join(" ")).toMatch(/more than one/);
    expect(scoringBundleAuthoringErrors(undefined, db)).toEqual([]);
  });

  it("rejects a work product bundle whose items do not share that work product", () => {
    const errors = scoringBundleAuthoringErrors([
      {
        id: "bundle_workProduct_wp9",
        enabled: true,
        basis: "workProduct",
        sourceId: "wp9",
        itemIds: ["a", "b"],
      },
    ], db);
    expect(errors.join(" ")).toMatch(/does not use work product/);
  });
});

describe("calibration request bundles", () => {
  it("sends only enabled bundles whose members are all in the matrix", () => {
    const model = {
      scoringBundles: [
        { id: "on", enabled: true, basis: "workProduct", sourceId: "wp1", itemIds: ["a", "b"] },
        { id: "off", enabled: false, basis: "workProduct", sourceId: "wp2", itemIds: ["c", "d"] },
        { id: "partial", enabled: true, basis: "passage", sourceId: "p", itemIds: ["a", "missing"] },
      ],
    };
    expect(calibrationBundlesFromEvidenceModel(model, ["a", "b", "c", "d"])).toEqual([
      { id: "on", basis: "workProduct", sourceId: "wp1", itemIds: ["a", "b"] },
    ]);
    expect(calibrationBundlesFromEvidenceModel({}, ["a", "b"])).toEqual([]);
  });

  it("rejects a bundle id that collides with an item column", () => {
    const errors = calibrationBundleRequestErrors({
      model: { family: "irt", subtype: "2PL", itemIds: ["a", "b", "c"] },
      bundles: [{ id: "c", itemIds: ["a", "b"] }],
    });
    expect(errors.join(" ")).toMatch(/collides/);
  });
});

describe("parameter set bundle summary", () => {
  it("keeps ids and drops a matrix", () => {
    const kept = scoringBundlesForParameterSet([
      {
        id: "bundle_wp",
        itemIds: ["a", "b"],
        model: "GRM",
        maxScore: 2,
        matrix: [[1, 0.4], [0.4, 1]],
      },
    ]);
    expect(kept).toEqual([
      { id: "bundle_wp", itemIds: ["a", "b"], model: "GRM", maxScore: 2 },
    ]);
    const set = parameterSetFromCalibrationResponse({
      parameters: { bundle_wp: { a: 1, b: [-0.2, 0.4] } },
      packageVersion: "mirt 1.48",
      converged: true,
      sampleSize: 40,
      calibratedAt: "2026-10-30T00:00:00.000Z",
      scoringBundles: kept,
    }, { parameterSetId: "ps1" });
    expect(set.scoringBundles).toEqual(kept);
    expect(set.parameters.bundle_wp.b).toEqual([-0.2, 0.4]);
  });

  it("omits the field when the response has no bundles", () => {
    const set = parameterSetFromCalibrationResponse({
      parameters: { a: { a: 1, b: 0 } },
      packageVersion: "mirt 1.48",
      converged: true,
      sampleSize: 40,
      calibratedAt: "2026-10-30T00:00:00.000Z",
    }, { parameterSetId: "ps1" });
    expect(set.scoringBundles).toBeUndefined();
  });
});

describe("planBundleScoring", () => {
  const parameterSet = {
    scoringBundles: [{
      id: "bundle_wp",
      itemIds: ["itemA", "itemB"],
      model: "GRM",
      maxScore: 2,
    }],
    parameters: {
      bundle_wp: { a: 1, thresholds: [-1, 1] },
    },
  };

  it("sums two correct items into one graded observation", () => {
    const responses = [
      { itemId: "itemA", activated: true, direction: "supports" },
      { itemId: "itemB", activated: true, direction: "supports" },
      { itemId: "itemC", activated: false, direction: "supports" },
    ];
    const plan = planBundleScoring(responses, parameterSet, (response) => ({
      u: response.activated ? 1 : 0,
    }));
    expect(plan.observations).toEqual([
      {
        u: 2,
        params: parameterSet.parameters.bundle_wp,
        itemId: "bundle_wp",
        observableId: "bundle_wp",
      },
    ]);
    expect([...plan.consumed].sort()).toEqual([0, 1]);
    expect(plan.warnings).toEqual([]);
  });

  it("does nothing when the parameter set has no bundles", () => {
    const plan = planBundleScoring(
      [{ itemId: "itemA" }, { itemId: "itemB" }],
      { parameters: { itemA: { a: 1, b: 0 } } },
      () => ({ u: 1 })
    );
    expect(plan.observations).toEqual([]);
    expect(plan.consumed.size).toBe(0);
  });

  it("excludes a partial bundle instead of scoring the answered item alone", () => {
    const plan = planBundleScoring(
      [{ itemId: "itemA", activated: true }],
      parameterSet,
      () => ({ u: 1 })
    );
    expect(plan.observations).toEqual([]);
    expect(plan.consumed.has(0)).toBe(true);
    expect(plan.warnings[0]).toMatch(/missing a member/);
  });

  it("merges an enabled bundle without keeping an overlapping row", () => {
    const candidate = {
      basis: "workProduct",
      sourceId: "wp1",
      itemIds: ["a", "b"],
    };
    const merged = mergeEnabledBundle(
      [{ id: "old", enabled: true, basis: "workProduct", sourceId: "wp1", itemIds: ["a", "c"] }],
      candidate
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].enabled).toBe(true);
    expect(merged[0].itemIds).toEqual(["a", "b"]);
    expect(bundleAlreadyEnabled(merged, candidate)).toBe(true);
  });
});
