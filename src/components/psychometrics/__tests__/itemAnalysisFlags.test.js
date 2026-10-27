import { describe, it, expect } from "vitest";
import {
  flagsForItemRow,
  itemRowsFromArtefact,
  ITEM_ANALYSIS_BOUNDS,
} from "../itemAnalysisFlags";
import { irtFitRows } from "../IrtFitTable";

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

  it("keeps R-supplied flags instead of recomputing them", () => {
    const flags = flagsForItemRow({
      pValue: 0.1,
      pointBiserial: 0.4,
      flags: [
        {
          code: "attractiveDistractor",
          threshold: 0.05,
          message: "Unkeyed option C has point-biserial 0.22.",
        },
      ],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("attractiveDistractor");
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

describe("irtFitRows", () => {
  it("joins parameters, standard errors, and item fit without curve keys", () => {
    const rows = irtFitRows({
      parameters: {
        theta: [-1, 0, 1],
        information: [0.2, 0.8, 0.2],
        "Item.1": { a: 1.2, b: -0.4, c: 0.1 },
      },
      standardErrors: { "Item.1": { a: 0.05, b: 0.04, c: 0.02 } },
      itemFit: { "Item.1": { S_X2: 4.2, "p.S_X2": 0.12, outfit: 1.01 } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemId: "Item.1",
      a: 1.2,
      seA: 0.05,
      b: -0.4,
      seB: 0.04,
      sx2: 4.2,
      outfit: 1.01,
    });
  });
});
