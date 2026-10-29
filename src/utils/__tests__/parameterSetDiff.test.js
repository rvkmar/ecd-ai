import { describe, it, expect } from "vitest";
import {
  diffFamily,
  diffParameterSets,
  movementMagnitude,
} from "../parameterSetDiff.js";

describe("parameterSetDiff", () => {
  it("sorts IRT rows by largest |Δ| first", () => {
    const rows = diffParameterSets(
      {
        small: { a: 1.0, b: 0.1 },
        large: { a: 1.0, b: 1.2 },
        _kind: "irt-parameters",
      },
      {
        small: { a: 1.0, b: 0.0 },
        large: { a: 1.0, b: -0.4 },
      }
    );
    expect(rows.map((row) => row.id)).toEqual(["large", "small"]);
    expect(rows[0].db).toBeCloseTo(1.6);
    expect(movementMagnitude(rows[0])).toBeGreaterThan(movementMagnitude(rows[1]));
  });

  it("sorts DINA rows by largest slip/guess movement", () => {
    const rows = diffParameterSets(
      { quiet: { slip: 0.1, guess: 0.1 }, loud: { slip: 0.4, guess: 0.1 } },
      { quiet: { slip: 0.1, guess: 0.1 }, loud: { slip: 0.1, guess: 0.1 } }
    );
    expect(rows.map((row) => row.id)).toEqual(["loud", "quiet"]);
    expect(diffFamily(rows)).toBe("dina");
  });

  it("ignores reserved _ keys", () => {
    const rows = diffParameterSets(
      { o1: { a: 1, b: 0 }, _fit: { logLik: 1 } },
      { o1: { a: 1, b: 0.5 } }
    );
    expect(rows.map((row) => row.id)).toEqual(["o1"]);
  });
});
