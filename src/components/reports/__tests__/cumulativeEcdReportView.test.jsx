import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CumulativeEcdReportView from "../CumulativeEcdReportView.jsx";

describe("CumulativeEcdReportView", () => {
  it("renders a student cumulative document with tables and interpretations", () => {
    render(
      <CumulativeEcdReportView
        report={{
          kind: "student",
          student: { id: "stu1", name: "Pat" },
          overview: { nSessions: 2, nScored: 4, percentDisplay: 50, from: "2026-10-01", to: "2026-10-20" },
          interpretation: { headline: "Developing cumulative performance.", body: "Uneven across competencies." },
          norms: { group: "class", n: 12, suppressed: false, percentileRank: 62.5, quartile: "q3", quartileLabel: "Third quartile" },
          competencies: [{
            id: "c-name",
            name: "Plant part naming",
            n: 3,
            nSessions: 2,
            nStudents: 1,
            percentDisplay: 67,
            percentileRank: 58.3,
            band: "developing",
            bandLabel: "Developing",
            interpretation: "Plant part naming: partial command.",
          }],
          evidence: [],
          tasks: [],
          taskModels: [],
          sessions: [{ sessionId: "s1", finishedAt: "2026-10-01T00:00:00.000Z", nItems: 2, percentDisplay: 50, band: "developing", bandLabel: "Developing" }],
          strengths: [],
          focus: ["Plant part naming"],
          nextSteps: ["Revisit Plant part naming."],
        }}
      />
    );
    expect(screen.getByTestId("cumulative-ecd-student")).toBeInTheDocument();
    expect(screen.getByText(/Developing cumulative performance/)).toBeInTheDocument();
    expect(screen.getByText("Plant part naming")).toBeInTheDocument();
    expect(screen.getByText(/Revisit Plant part naming/)).toBeInTheDocument();
    expect(screen.getByText(/62.5/)).toBeInTheDocument();
    expect(screen.getByText(/Third quartile/)).toBeInTheDocument();
  });

  it("renders named students on the teacher classroom report", () => {
    render(
      <CumulativeEcdReportView
        report={{
          kind: "teacher",
          teacher: { id: "teach1", name: "teach1" },
          overview: { nSessions: 2, nStudents: 2, nScored: 4, percentDisplay: 40 },
          interpretation: { headline: "Developing classroom performance.", body: "Focus photosynthesis." },
          competencies: [{
            id: "c-photo",
            name: "Photosynthesis",
            nStudents: 2,
            nSessions: 2,
            n: 2,
            percentDisplay: 20,
            nEmerging: 2,
            nDeveloping: 0,
            nMostlySecure: 0,
            nSecure: 0,
            band: "emerging",
            bandLabel: "Emerging",
            interpretation: "Photosynthesis: classroom-wide focus.",
          }],
          evidence: [],
          tasks: [],
          taskModels: [],
          students: [{
            id: "stu1",
            name: "Pat",
            classId: "6A",
            nSessions: 1,
            percentDisplay: 40,
            percentileRank: 25,
            quartileLabel: "Second quartile",
            band: "emerging",
            bandLabel: "Emerging",
            weakestCompetency: { name: "Photosynthesis", percentDisplay: 20 },
          }],
          nextSteps: ["Focus class time on Photosynthesis."],
        }}
      />
    );
    expect(screen.getByTestId("cumulative-ecd-teacher")).toBeInTheDocument();
    expect(screen.getByText("Pat")).toBeInTheDocument();
    expect(screen.getByText(/What to focus on in class/)).toBeInTheDocument();
    expect(screen.getByText(/Second quartile/)).toBeInTheDocument();
  });

  it("omits a students table on the district curriculum report and marks suppressed cells", () => {
    render(
      <CumulativeEcdReportView
        report={{
          kind: "district",
          districtId: "d1",
          overview: { suppressed: true, nStudents: null, nSessions: null },
          interpretation: { headline: "District d1: no students in scope.", body: "Small cells suppressed." },
          competencies: [{
            id: "c-name",
            name: "Plant part naming",
            suppressed: true,
            interpretation: "Plant part naming: too few students to report (n < 5).",
          }],
          evidence: [],
          tasks: [],
          taskModels: [],
          classes: [{ id: "6A", suppressed: true }],
          schools: [],
          districts: [],
          nextSteps: ["Cells below n = 5 are suppressed."],
        }}
      />
    );
    expect(screen.getByTestId("cumulative-ecd-district")).toBeInTheDocument();
    expect(screen.getByText(/Curriculum plan/)).toBeInTheDocument();
    expect(screen.getAllByText("n < 5").length).toBeGreaterThan(0);
    expect(screen.queryByRole("columnheader", { name: "Student" })).not.toBeInTheDocument();
  });
});
