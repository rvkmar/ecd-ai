// server/r/__tests__/benchmarkPerturbation.test.js
// D88: each of the five CI benchmarks must FAIL when its stated
// expectations are perturbed. Always-run — no R required.
//
// Companion to the live paths in *Pipeline.test.js. Those prove today's
// estimates pass; this proves the acceptance predicates are not inert.

import { describe, it, expect } from "vitest";
import {
  LSAT7_ITEM_IDS,
  PLANTED_DIF_ITEM,
  SIM10_REQUIRED_COUNTS,
  KNOWN_EQUATING_SLOPE,
  KNOWN_EQUATING_INTERCEPT,
  EQUATING_SLOPE_TOLERANCE,
  EQUATING_INTERCEPT_TOLERANCE,
  checkLsat7IrtAcceptance,
  checkSim10GdinaAcceptance,
  checkLsat7CttAcceptance,
  checkPlantedDifAcceptance,
  checkKnownEquatingAcceptance,
  checkRBackendBenchmarkPackages,
} from "./benchmarkAcceptance.js";

const PUBLISHED_MEANS = {
  "Item.1": 0.828,
  "Item.2": 0.658,
  "Item.3": 0.772,
  "Item.4": 0.606,
  "Item.5": 0.843,
};

function goodLsat7Irt() {
  return {
    converged: true,
    packageVersion: "mirt 1.47",
    sampleSize: 1000,
    parameters: Object.fromEntries(
      LSAT7_ITEM_IDS.map((id) => [
        id,
        {
          a: 1.2,
          // Harder Item.4 (higher b) vs easier Item.5 (lower b)
          b: id === "Item.4" ? 0.5 : id === "Item.5" ? -0.8 : 0,
          c: 0,
        },
      ])
    ),
  };
}

function goodSim10(itemIds) {
  const parameters = {};
  for (let i = 0; i < itemIds.length; i += 1) {
    const k = SIM10_REQUIRED_COUNTS[i];
    const n = 2 ** k;
    const probs = Array.from({ length: n }, (_, j) => 0.2 + (0.6 * j) / (n - 1));
    parameters[itemIds[i]] = { probabilities: probs };
  }
  return {
    converged: true,
    packageVersion: "GDINA 2.9.12",
    sampleSize: 1000,
    parameters,
  };
}

function goodCtt() {
  return {
    converged: true,
    packageVersion: "TAM 4.3.25",
    sampleSize: 1000,
    parameters: Object.fromEntries(
      LSAT7_ITEM_IDS.map((id) => [
        id,
        {
          difficulty: PUBLISHED_MEANS[id],
          discrimination: 0.35,
          n: 1000,
        },
      ])
    ),
    fitStatistics: { kr20: 0.45, nPersons: 1000, nItems: 5 },
  };
}

function goodDif() {
  const parameters = {};
  for (let i = 1; i <= 8; i += 1) {
    const id = `Item.${i}`;
    const planted = id === PLANTED_DIF_ITEM;
    parameters[id] = {
      flag: planted,
      etsClass: planted ? "C" : "A",
      deltaMH: planted ? -2.4 : 0.2,
      method: "Mantel-Haenszel",
    };
  }
  return {
    converged: true,
    packageVersion: "difR 6.1.0",
    sampleSize: 800,
    parameters,
  };
}

function goodEquating() {
  return {
    converged: true,
    packageVersion: "plink 1.5.1",
    sampleSize: 800,
    parameters: {
      method: "Mean/Sigma",
      from: "Y",
      to: "X",
      slope: KNOWN_EQUATING_SLOPE,
      intercept: KNOWN_EQUATING_INTERCEPT,
    },
  };
}

describe("D88 LSAT7 IRT acceptance (D64)", () => {
  it("passes a structurally valid mirt response", () => {
    const r = checkLsat7IrtAcceptance(goodLsat7Irt());
    expect(r.ok, r.failures.join("; ")).toBe(true);
  });

  it("fails when Item.5/Item.4 b ordering is inverted", () => {
    const bad = goodLsat7Irt();
    bad.parameters["Item.5"].b = 1.5;
    bad.parameters["Item.4"].b = -1.5;
    const r = checkLsat7IrtAcceptance(bad);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/Item\.5\.b/);
  });

  it("fails when sampleSize is perturbed", () => {
    const bad = goodLsat7Irt();
    bad.sampleSize = 999;
    expect(checkLsat7IrtAcceptance(bad).ok).toBe(false);
  });

  it("fails when packageVersion is not mirt", () => {
    const bad = goodLsat7Irt();
    bad.packageVersion = "contract-stub (not mirt)";
    expect(checkLsat7IrtAcceptance(bad).ok).toBe(false);
  });
});

describe("D88 sim10GDINA acceptance (D66)", () => {
  const itemIds = Array.from({ length: 10 }, (_, i) => `Item.${i + 1}`);

  it("passes a structurally valid GDINA response", () => {
    const r = checkSim10GdinaAcceptance(goodSim10(itemIds), { itemIds });
    expect(r.ok, r.failures.join("; ")).toBe(true);
  });

  it("fails when P(all) ≤ P(none) on an item", () => {
    const bad = goodSim10(itemIds);
    const probs = bad.parameters["Item.1"].probabilities;
    bad.parameters["Item.1"].probabilities = [probs[probs.length - 1], ...probs.slice(1, -1), probs[0]];
    const r = checkSim10GdinaAcceptance(bad, { itemIds });
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/P\(all mastered\)/);
  });

  it("fails when probability table length does not match 2^k", () => {
    const bad = goodSim10(itemIds);
    bad.parameters["Item.10"].probabilities = [0.1, 0.9]; // need 8 for k=3
    const r = checkSim10GdinaAcceptance(bad, { itemIds });
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/2\^3/);
  });
});

describe("D88 LSAT7 CTT acceptance (D67)", () => {
  it("passes a structurally valid TAM CTT response", () => {
    const r = checkLsat7CttAcceptance(goodCtt(), { publishedMeans: PUBLISHED_MEANS });
    expect(r.ok, r.failures.join("; ")).toBe(true);
  });

  it("fails when difficulty is perturbed away from the published mean", () => {
    const bad = goodCtt();
    bad.parameters["Item.1"].difficulty = 0.5;
    const r = checkLsat7CttAcceptance(bad, { publishedMeans: PUBLISHED_MEANS });
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/published mean/);
  });

  it("fails when KR-20 is perturbed outside (0,1)", () => {
    const bad = goodCtt();
    bad.fitStatistics.kr20 = 1.2;
    expect(checkLsat7CttAcceptance(bad, { publishedMeans: PUBLISHED_MEANS }).ok).toBe(
      false
    );
  });

  it("fails when Item.5/Item.4 difficulty order is inverted", () => {
    const bad = goodCtt();
    bad.parameters["Item.5"].difficulty = 0.4;
    bad.parameters["Item.4"].difficulty = 0.9;
    // Drop publishedMeans so only ordering fires (means would also fail)
    const r = checkLsat7CttAcceptance(bad, {});
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/Item\.5\.difficulty/);
  });
});

describe("D88 planted DIF acceptance (D69)", () => {
  it("passes a unique ETS-C flag on Item.5", () => {
    const r = checkPlantedDifAcceptance(goodDif());
    expect(r.ok, r.failures.join("; ")).toBe(true);
  });

  it("fails when the planted item is not unique", () => {
    const bad = goodDif();
    bad.parameters["Item.1"].flag = true;
    bad.parameters["Item.1"].etsClass = "C";
    bad.parameters["Item.1"].deltaMH = -2.0;
    const r = checkPlantedDifAcceptance(bad);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/exactly one flagged/);
  });

  it("fails when the planted item drops below ETS C |deltaMH|", () => {
    const bad = goodDif();
    bad.parameters[PLANTED_DIF_ITEM].deltaMH = -1.0;
    bad.parameters[PLANTED_DIF_ITEM].etsClass = "B";
    const r = checkPlantedDifAcceptance(bad);
    expect(r.ok).toBe(false);
  });
});

describe("D88 known equating acceptance (D70)", () => {
  it("passes slope/intercept inside stated tolerances", () => {
    const r = checkKnownEquatingAcceptance(goodEquating());
    expect(r.ok, r.failures.join("; ")).toBe(true);
  });

  it("fails when slope is perturbed outside tolerance", () => {
    const bad = goodEquating();
    bad.parameters.slope = KNOWN_EQUATING_SLOPE + EQUATING_SLOPE_TOLERANCE + 0.05;
    const r = checkKnownEquatingAcceptance(bad);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/slope/);
  });

  it("fails when intercept is perturbed outside tolerance", () => {
    const bad = goodEquating();
    bad.parameters.intercept =
      KNOWN_EQUATING_INTERCEPT - EQUATING_INTERCEPT_TOLERANCE - 0.05;
    const r = checkKnownEquatingAcceptance(bad);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/intercept/);
  });

  it("fails when packageVersion is not plink", () => {
    const bad = goodEquating();
    bad.packageVersion = "mirt 1.47";
    expect(checkKnownEquatingAcceptance(bad).ok).toBe(false);
  });
});

describe("D88 Hub R package gate", () => {
  it("passes a healthy payload with mirt/GDINA/TAM/difR/plink", () => {
    const r = checkRBackendBenchmarkPackages({
      status: "healthy",
      packages: {
        mirt: "1.47",
        GDINA: "2.13.1",
        TAM: "4.3.25",
        difR: "6.1.0",
        plink: "1.5.1",
      },
    });
    expect(r.ok, r.failures.join("; ")).toBe(true);
  });

  it("fails loudly when plink is missing from the Hub image", () => {
    const r = checkRBackendBenchmarkPackages({
      status: "healthy",
      packages: {
        mirt: "1.47",
        GDINA: "2.13.1",
        TAM: "4.3.25",
        difR: "6.1.0",
        // plink absent — the D70 Hub gap
      },
    });
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/plink/);
  });
});
