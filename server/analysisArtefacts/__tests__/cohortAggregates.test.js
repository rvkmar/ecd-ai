import { describe, it, expect } from "vitest";
import { MIN_CELL_SIZE } from "../../utils/aggregatePrivacy.js";
import { aggregateArtefactScores, buildDistrictAggregateHtml } from "../cohortAggregates.js";

describe("cohort / district score aggregates", () => {
  it("suppresses cells below MIN_CELL_SIZE", () => {
    const artefact = {
      payload: {
        scores: Array.from({ length: MIN_CELL_SIZE - 1 }, (_, i) => ({ personId: `p${i}`, raw: i })),
      },
      scope: { districtId: "d1" },
    };
    const small = aggregateArtefactScores(artefact, { level: "district" });
    expect(small.suppressed).toBe(true);
    expect(small.n).toBeNull();
  });

  it("summarises a district cell when n meets the floor", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      personId: `p${i}`,
      raw: 10 + i,
      theta: i * 0.2,
      districtId: "d1",
    }));
    const artefact = {
      payload: {
        scores: rows,
        parameters: { i1: { flags: [{ code: "tooHard" }] } },
        diagnostics: { testLevel: { reliability: { kr20: 0.8 }, domains: { math: { id: "math", mean: 4, sd: 1, nItems: 3 } } } },
      },
      scope: { districtId: "d1" },
    };
    const agg = aggregateArtefactScores(artefact, { level: "district" });
    expect(agg.suppressed).toBe(false);
    expect(agg.cells.d1.n).toBe(6);
    expect(agg.flagCounts.tooHard).toBe(1);
    expect(agg.domains[0].id).toBe("math");
  });

  it("renders a technical-report HTML shell for a district aggregate", () => {
    const artefact = {
      id: "aa1",
      jobId: "job1",
      packageVersion: "mirt 1.48",
      payload: { scores: [] },
    };
    const html = buildDistrictAggregateHtml(artefact, {
      level: "district",
      minCellSize: MIN_CELL_SIZE,
      cells: {},
      flagCounts: {},
      domains: [],
      reliability: { kr20: 0.8, cronbachAlpha: 0.81, sem: 1.2 },
    });
    expect(html).toMatch(/class="report"/);
    expect(html).toMatch(/<header class="cover">/);
    expect(html).toMatch(/District \/ cohort summary/);
    expect(html).toMatch(/psychometric analysis bureau/);
  });
});
