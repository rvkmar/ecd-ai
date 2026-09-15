import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(() => {}, { success: () => {}, error: () => {} }),
}));

vi.mock("../../../api/queries/policies", () => ({
  usePolicies: () => ({ data: [], isLoading: false }),
}));

beforeEach(() => {
  global.fetch = vi.fn((url, opts = {}) => {
    const href = String(url);
    let body = {};
    if (href.includes("/wizard-timing")) {
      body = {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [],
        studentId: "stud1",
        wizardPhase: "draft",
        wizardPhaseTimings: {
          draft: {
            startedAt: "2026-09-15T10:00:00.000Z",
            endedAt: null,
            durationMs: null,
          },
          review: { startedAt: null, endedAt: null, durationMs: null },
          completed: { startedAt: null, endedAt: null, durationMs: null },
          submitted: { startedAt: null, endedAt: null, durationMs: null },
        },
      };
    } else if (href.includes("/next-task")) {
      body = { taskId: null };
    } else if (href.includes("/api/sessions/")) {
      body = {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [],
        studentId: "stud1",
      };
    } else {
      body = [];
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
});

import SessionPlayer from "../SessionPlayer.jsx";

describe("SessionPlayer — student wizard has no Pause", () => {
  it("does not show Pause once the playable session has loaded", async () => {
    render(
      <MemoryRouter>
        <SessionPlayer sessionId="s-play" />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId("session-player-back")).toBeInTheDocument()
    );
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.getByTestId("wizard-phase-timer")).toBeInTheDocument();
  });
});
