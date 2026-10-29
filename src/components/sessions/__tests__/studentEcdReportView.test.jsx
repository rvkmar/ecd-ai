import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentEcdReportView from "../StudentEcdReportView.jsx";

const report = {
  overview: {
    nItems: 2,
    nScored: 2,
    nCorrect: 1,
    percentDisplay: 50,
    sd: 0.707,
    se: 0.5,
    theta: 0.4,
    thetaSe: 0.707,
    selectionStrategy: "IRT",
  },
  interpretation: {
    headline: "Developing overall performance (50% of 2 scored responses).",
    body: "The observed proportion correct is 50%.",
  },
  competencies: [{
    id: "c-name",
    name: "Plant part naming",
    n: 2,
    nScored: 2,
    nCorrect: 1,
    mean: 0.5,
    percent: 0.5,
    percentDisplay: 50,
    sd: 0.707,
    se: 0.5,
    band: "developing",
    bandLabel: "Developing",
    interpretation: "Plant part naming: partial command (50% on 2 items).",
  }],
  evidence: [{
    id: "em-plant",
    name: "Part naming evidence",
    n: 2,
    nScored: 2,
    nCorrect: 1,
    mean: 0.5,
    percent: 0.5,
    percentDisplay: 50,
    sd: 0.707,
    se: 0.5,
    band: "developing",
    bandLabel: "Developing",
    interpretation: "Part naming evidence: partial command (50% on 2 items).",
  }],
  tasks: [],
  taskModels: [],
  items: [{
    index: 1,
    itemId: "it-leaf",
    itemName: "Leaf on the diagram",
    excerpt: "The arrow points to a flat green part.",
    taskName: "Leaf diagram",
    observationName: "obs-plant-name",
    evidenceModelName: "Part naming evidence",
    competencyName: "Plant part naming",
    selected: "Leaf",
    score: 1,
  }],
  strengths: [],
  focus: ["Plant part naming"],
  nextSteps: ["Revisit Plant part naming."],
  guideNotes: [],
  occasions: [
    { sessionId: "s0", timestamp: "2026-10-01T00:00:00.000Z", estimate: 0.2 },
    { sessionId: "s1", timestamp: "2026-10-29T00:00:00.000Z", estimate: 0.6 },
  ],
};

describe("StudentEcdReportView", () => {
  it("renders competency and evidence tables, charts, and interpretations", () => {
    render(<StudentEcdReportView report={report} />);
    expect(screen.getByTestId("student-ecd-report")).toBeInTheDocument();
    expect(screen.getByText(/Developing overall performance/)).toBeInTheDocument();
    expect(screen.getAllByText("Plant part naming").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Part naming evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/partial command/).length).toBeGreaterThan(0);
    expect(screen.getByText("Leaf on the diagram")).toBeInTheDocument();
    expect(screen.getByText("Where to focus")).toBeInTheDocument();
    expect(screen.getByLabelText(/Mean score by competency/)).toBeInTheDocument();
    expect(screen.getByLabelText(/across completed occasions/)).toBeInTheDocument();
  });
});
