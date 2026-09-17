// D81 — a figure cannot compose without a complete provenance stamp.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PsychometricFigure from "../PsychometricFigure";
import ReferenceInformationChart from "../ReferenceInformationChart";
import {
  assertPsychometricProvenance,
  provenanceFromArtefact,
} from "../provenance";

const complete = {
  jobId: "job-1",
  packageVersion: "mirt 1.47",
  sampleSize: 1000,
  computedAt: "2026-09-17T00:00:00.000Z",
  parameterSetId: "ps-1",
};

describe("psychometric provenance (D81)", () => {
  it("assertPsychometricProvenance accepts a complete stamp", () => {
    expect(assertPsychometricProvenance(complete)).toBe(true);
  });

  it("refuses missing job, package, sample, computedAt, or source", () => {
    expect(() => assertPsychometricProvenance(null)).toThrow(/requires provenance/);
    expect(() =>
      assertPsychometricProvenance({ ...complete, jobId: "" })
    ).toThrow(/jobId/);
    expect(() =>
      assertPsychometricProvenance({ ...complete, packageVersion: "  " })
    ).toThrow(/packageVersion/);
    expect(() =>
      assertPsychometricProvenance({ ...complete, sampleSize: -1 })
    ).toThrow(/sampleSize/);
    expect(() =>
      assertPsychometricProvenance({ ...complete, computedAt: null })
    ).toThrow(/computedAt/);
    expect(() =>
      assertPsychometricProvenance({
        jobId: "j",
        packageVersion: "p",
        sampleSize: 1,
        computedAt: "2026-01-01",
      })
    ).toThrow(/derived from/);
  });

  it("provenanceFromArtefact maps analysisArtefact fields", () => {
    const p = provenanceFromArtefact({
      jobId: "job-a",
      packageVersion: "TAM 4.3.25",
      sampleSize: 1000,
      computedAt: "2026-09-16T12:00:00.000Z",
      scope: { evidenceModelId: "em1" },
      payload: { statisticalModelId: "sm-ctt" },
    });
    expect(p.jobId).toBe("job-a");
    expect(p.statisticalModelId).toBe("sm-ctt");
    expect(p.evidenceModelId).toBe("em1");
    expect(assertPsychometricProvenance(p)).toBe(true);
  });

  it("PsychometricFigure cannot render without provenance (compose guard)", () => {
    expect(() =>
      render(
        <PsychometricFigure>
          <div>chart</div>
        </PsychometricFigure>
      )
    ).toThrow(/requires provenance/);

    expect(() =>
      render(
        <PsychometricFigure provenance={{ jobId: "j", packageVersion: "p" }}>
          <div>chart</div>
        </PsychometricFigure>
      )
    ).toThrow();
  });

  it("PsychometricFigure always mounts the stamp when provenance is complete", () => {
    render(
      <PsychometricFigure provenance={complete} title="Demo">
        <div data-testid="chart-body">chart</div>
      </PsychometricFigure>
    );
    expect(screen.getByTestId("psychometric-figure")).toBeInTheDocument();
    expect(screen.getByTestId("provenance-stamp")).toBeInTheDocument();
    expect(screen.getByText("job-1")).toBeInTheDocument();
    expect(screen.getByText("mirt 1.47")).toBeInTheDocument();
    expect(screen.getByText("Parameter set ps-1")).toBeInTheDocument();
    expect(screen.getByTestId("chart-body")).toBeInTheDocument();
  });

  it("ReferenceInformationChart composes only with a stamp", () => {
    expect(() => render(<ReferenceInformationChart />)).toThrow(
      /requires provenance/
    );

    render(<ReferenceInformationChart provenance={complete} />);
    expect(screen.getByTestId("provenance-stamp")).toBeInTheDocument();
    expect(screen.getByText(/Reference test information/)).toBeInTheDocument();
  });
});
