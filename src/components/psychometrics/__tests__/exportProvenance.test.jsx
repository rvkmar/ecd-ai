// D85 — every W17 view's CSV/PDF export carries provenance.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import PsychometricFigure from "../PsychometricFigure";
import {
  PSYCHOMETRIC_EXPORT_VIEWS,
  assertExportCarriesProvenance,
  buildExportsForView,
  buildCsvExport,
  buildPdfExport,
} from "../exportProvenance";

const baseProvenance = {
  jobId: "job-d85",
  packageVersion: "test-pkg 1.0",
  sampleSize: 100,
  computedAt: "2026-09-17T00:00:00.000Z",
  evidenceModelId: "em-1",
};

const fixtures = {
  "item-analysis": {
    provenance: { ...baseProvenance, jobId: "job-ia" },
    artefact: {
      payload: {
        parameters: {
          "Item.1": { pValue: 0.5, pointBiserial: 0.3, n: 100, distractors: null },
        },
      },
    },
  },
  "test-information": {
    provenance: { ...baseProvenance, jobId: "job-ti" },
    artefact: {
      payload: {
        parameters: {
          theta: [-1, 0, 1],
          information: [0.8, 0.9, 0.5],
          conditionalSEM: [1.1, 1.05, 1.4],
        },
        fitStatistics: { kr20: 0.35 },
      },
    },
  },
  "attribute-profile": {
    provenance: { ...baseProvenance, jobId: "job-ap" },
    artefact: {
      payload: {
        parameters: {
          attributes: {
            attrA: {
              probabilityAveragedMasteryRate: 0.6,
              classificationCountedMasteryRate: 0.5,
            },
          },
          profileDistribution: [{ profileKey: "a", count: 1, rate: 1 }],
        },
      },
    },
  },
  dif: {
    provenance: { ...baseProvenance, jobId: "job-dif" },
    artefact: {
      payload: {
        parameters: {
          "Item.5": {
            statistic: 0.01,
            pValue: 0.01,
            alphaMH: 3,
            deltaMH: -2.4,
            etsClass: "C",
            flag: true,
            method: "Mantel-Haenszel",
            pair: "focal vs reference",
          },
        },
      },
    },
  },
};

describe("psychometric export provenance (D85)", () => {
  it("covers every W17 dashboard view", () => {
    expect(PSYCHOMETRIC_EXPORT_VIEWS).toEqual([
      "item-analysis",
      "test-information",
      "attribute-profile",
      "dif",
    ]);
  });

  it("refuses CSV/PDF without provenance", () => {
    expect(() =>
      buildCsvExport({
        view: "item-analysis",
        provenance: null,
        dataHeaders: ["a"],
        dataRows: [],
      })
    ).toThrow(/requires provenance/);
    expect(() =>
      buildPdfExport({
        view: "dif",
        provenance: { jobId: "x" },
        bodyLines: [],
      })
    ).toThrow();
  });

  it.each(PSYCHOMETRIC_EXPORT_VIEWS)(
    "%s CSV and PDF carry job/package/sample/computedAt/source",
    (view) => {
      const { provenance, artefact } = fixtures[view];
      const { csv, pdf } = buildExportsForView(view, { provenance, artefact });
      expect(assertExportCarriesProvenance(csv, provenance)).toBe(true);
      expect(assertExportCarriesProvenance(pdf, provenance)).toBe(true);
      expect(pdf.startsWith("%PDF")).toBe(true);
      expect(csv).toMatch(/psychometric-export provenance-required/);
    }
  );

  it("on-screen figures still refuse to render without provenance (all views use PsychometricFigure)", () => {
    expect(() =>
      render(
        <PsychometricFigure>
          <div>no stamp</div>
        </PsychometricFigure>
      )
    ).toThrow(/requires provenance/);

    for (const view of PSYCHOMETRIC_EXPORT_VIEWS) {
      const { provenance } = fixtures[view];
      const { getByTestId, unmount } = render(
        <PsychometricFigure provenance={provenance} title={view}>
          <div>ok</div>
        </PsychometricFigure>
      );
      expect(getByTestId("provenance-stamp")).toBeInTheDocument();
      unmount();
    }
  });
});
