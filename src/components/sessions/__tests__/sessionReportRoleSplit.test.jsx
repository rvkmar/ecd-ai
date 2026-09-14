// D59: SessionReport must not fetch teacher-report for an examinee, and
// must show the D57 classification / D58 stop on the report surfaces.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import path from "path";

vi.mock("../../../api/queries/policies", () => ({
  usePolicies: () => ({ data: [], isLoading: false }),
}));

const authState = { role: "student" };
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { role: authState.role, username: `${authState.role}1`, token: "t" } }),
}));

const fetches = [];
vi.mock("../../../api/apiClient", () => ({
  apiFetch: vi.fn((url) => {
    fetches.push(String(url));
    const stopped = {
      rule: "targetsMet",
      assemblyModelId: "am1",
      reason: "Every declared Assembly Model target is scored and met (1 of 1) at 2 response(s).",
    };
    const attributeProfile = [
      { smvId: "attrA", classification: "master", expectedClassificationAccuracy: 0.95 },
    ];
    if (String(url).includes("teacher-report")) {
      return Promise.resolve({
        sessionId: "s-d59",
        studentName: "Pat",
        selectionStrategy: "BayesianNetwork",
        responses: [],
        modelSummary: {},
        recommendations: { individualLevel: [], groupLevel: [] },
        stopped,
        attributeProfile,
      });
    }
    if (String(url).includes("learner-feedback")) {
      return Promise.resolve({
        sessionId: "s-d59",
        summary: { level: "1 of 1 attributes classified as mastered", message: stopped.reason },
        strengths: ["attrA"],
        focusAreas: [],
        nextSteps: [],
        encouragement: "Great effort! Keep practicing.",
        stopped,
        attributeProfile,
      });
    }
    return Promise.resolve({
      sessionId: "s-d59",
      stopped,
      attributeProfile,
    });
  }),
}));

import SessionReport from "../SessionReport.jsx";
import { apiFetch } from "../../../api/apiClient";

const reportSrc = fs.readFileSync(
  path.resolve(__dirname, "../SessionReport.jsx"),
  "utf8"
);

beforeEach(() => {
  fetches.length = 0;
  authState.role = "student";
});

describe("SessionReport — role split (D59)", () => {
  it("does not request teacher-report unless can(role, view, teacherReports)", () => {
    expect(reportSrc).toMatch(/can\(auth\?\.role, "view", "teacherReports"\)/);
    expect(reportSrc).toMatch(/if \(canViewTeacherReports\)/);
  });

  it("a student never fetches teacher-report and never sees the teacher tab", async () => {
    authState.role = "student";
    render(<SessionReport sessionId="s-d59" />);

    expect(await screen.findByText("Session Report: s-d59")).toBeInTheDocument();
    expect(screen.getByText("Learner Feedback")).toBeInTheDocument();
    expect(screen.queryByText("Teacher Report")).toBeNull();
    expect(fetches.some((u) => u.includes("teacher-report"))).toBe(false);
    expect(fetches.some((u) => u.includes("learner-feedback"))).toBe(true);
  });

  it("a teacher fetches teacher-report and can open that tab", async () => {
    authState.role = "teacher";
    render(<SessionReport sessionId="s-d59" />);

    expect(await screen.findByText("Session Report: s-d59")).toBeInTheDocument();
    expect(fetches.some((u) => u.includes("teacher-report"))).toBe(true);

    await userEvent.click(screen.getByText("Teacher Report"));
    expect(screen.getByRole("heading", { name: "Teacher Report" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stop reason" })).toBeInTheDocument();
    expect(screen.getAllByText(/attrA: master/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("SessionReport — classification and stop on report surfaces", () => {
  it("shows the stop reason and attribute profile in the report header", async () => {
    render(<SessionReport sessionId="s-d59" />);
    const header = await screen.findByTestId("report-header-measurement");
    expect(within(header).getByText("Measurement target met")).toBeInTheDocument();
    expect(within(header).getByText(/Every declared Assembly Model target/)).toBeInTheDocument();
    expect(within(header).getByText(/attrA: master \(confidence 0\.95\)/)).toBeInTheDocument();
  });

  it("repeats stop + profile on the learner tab", async () => {
    render(<SessionReport sessionId="s-d59" />);
    expect(await screen.findByText("Why this session ended")).toBeInTheDocument();
    expect(screen.getByText("Attribute profile")).toBeInTheDocument();
    expect(screen.getByText("attrA")).toBeInTheDocument();
  });

  it("keeps Close when every report endpoint fails", async () => {
    apiFetch.mockImplementation(() => Promise.reject(new Error("404")));
    const onClose = vi.fn();
    render(<SessionReport sessionId="s-d59" onClose={onClose} />);
    expect(await screen.findByText("Failed to load report")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
