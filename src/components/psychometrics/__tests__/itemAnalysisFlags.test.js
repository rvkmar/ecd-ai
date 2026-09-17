import { describe, it, expect } from "vitest";
import {
  flagsForItemRow,
  itemRowsFromArtefact,
  ITEM_ANALYSIS_BOUNDS,
} from "../itemAnalysisFlags";

describe("itemAnalysisFlags (D82)", () => {
  it("flags too hard, too easy, and low / negative discrimination with thresholds", () => {
    const hard = flagsForItemRow({ pValue: 0.1, pointBiserial: 0.4 });
    expect(hard.some((f) => f.code === "tooHard")).toBe(true);
    expect(hard[0].message).toMatch(/0\.20/);
    expect(hard[0].message).toMatch(/simplify|keying/i);

    const easy = flagsForItemRow({ pValue: 0.95, pointBiserial: 0.4 });
    expect(easy.some((f) => f.code === "tooEasy")).toBe(true);
    expect(easy[0].message).toMatch(/0\.90/);

    const low = flagsForItemRow({ pValue: 0.5, pointBiserial: 0.04 });
    expect(low).toHaveLength(1);
    expect(low[0].code).toBe("lowDiscrimination");
    expect(low[0].threshold).toBe(ITEM_ANALYSIS_BOUNDS.lowDiscrimination.threshold);
    expect(low[0].message).toMatch(/0\.20/);
    expect(low[0].message).toMatch(/review the distractors or retire/i);

    const neg = flagsForItemRow({ pValue: 0.5, pointBiserial: -0.1 });
    expect(neg.some((f) => f.code === "negativeDiscrimination")).toBe(true);
    expect(neg[0].message).toMatch(/negative/i);
  });

  it("does not flag in-bounds items", () => {
    expect(
      flagsForItemRow({ pValue: 0.6, pointBiserial: 0.35 })
    ).toEqual([]);
  });

  it("flattens artefact parameters into rows with flags", () => {
    const rows = itemRowsFromArtefact({
      payload: {
        parameters: {
          "Item.easy": { pValue: 0.95, pointBiserial: 0.3, n: 100, distractors: null },
          "Item.ok": { pValue: 0.55, pointBiserial: 0.4, n: 100, distractors: null },
        },
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.itemId === "Item.easy").flags[0].code).toBe("tooEasy");
    expect(rows.find((r) => r.itemId === "Item.ok").flags).toEqual([]);
  });
});
