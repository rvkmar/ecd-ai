import { describe, it, expect } from "vitest";
import {
  ESTIMAND_LABELS,
  attributeRowsFromArtefact,
  profileDistributionFromArtefact,
} from "../attributeProfileView";
import {
  DIF_INVESTIGATION_FRAMING,
  difRowsFromArtefact,
  etsEffectSizeBand,
} from "../difView";

describe("attributeProfileView (D84)", () => {
  it("keeps probability-averaged and classification-counted as distinct fields", () => {
    const rows = attributeRowsFromArtefact({
      payload: {
        parameters: {
          attributes: {
            attrA: {
              probabilityAveragedMasteryRate: 0.6,
              classificationCountedMasteryRate: 2 / 3,
              nMaster: 2,
              nAssigned: 3,
              nIndeterminate: 1,
            },
          },
        },
      },
    });
    expect(rows[0].probabilityAveragedMasteryRate).toBe(0.6);
    expect(rows[0].classificationCountedMasteryRate).toBeCloseTo(2 / 3);
    expect(ESTIMAND_LABELS.probabilityAveraged).toMatch(/Probability-averaged/);
    expect(ESTIMAND_LABELS.classificationCounted).toMatch(/Classification-counted/);
    expect(ESTIMAND_LABELS.probabilityAveraged).not.toBe(
      ESTIMAND_LABELS.classificationCounted
    );
  });

  it("reads profile distribution", () => {
    const dist = profileDistributionFromArtefact({
      payload: {
        parameters: {
          profileDistribution: [{ profileKey: "a|b", count: 1, rate: 0.25 }],
        },
      },
    });
    expect(dist).toHaveLength(1);
  });
});

describe("difView (D84)", () => {
  it("maps ETS class to effect-size band and keeps framing copy", () => {
    expect(etsEffectSizeBand("C").label).toMatch(/Large/);
    expect(DIF_INVESTIGATION_FRAMING).toMatch(/not a finding that one group/i);

    const rows = difRowsFromArtefact({
      payload: {
        parameters: {
          "Item.5": {
            statistic: 0.0001,
            pValue: 0.0001,
            alphaMH: 3,
            deltaMH: -2.4,
            etsClass: "C",
            flag: true,
            method: "Mantel-Haenszel",
            pair: "focal vs reference",
          },
        },
      },
    });
    expect(rows[0].flag).toBe(true);
    expect(rows[0].effectSizeBand).toMatch(/ETS C/);
    expect(rows[0].method).toBe("Mantel-Haenszel");
  });
});
