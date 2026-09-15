import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import fs from "fs";
import path from "path";
import StudentSessionList from "../../components/sessions/StudentSessionList.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";

vi.mock("../../auth/AuthProvider.jsx", () => ({
  useAuth: vi.fn(),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

function jsonOk(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("Student My Sessions (D50 leftover discovery)", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      auth: { username: "stud1", role: "student", token: "t" },
    });
  });

  it("StudentDashboard no longer ships the My Sessions placeholder", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../StudentDashboard.jsx"), "utf8");
    expect(src).not.toMatch(/Upcoming\/Active Sessions here/);
    expect(src).toMatch(/StudentSessionList/);
  });

  it("StudentDashboard Delivery includes a Reports tab for performance", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../StudentDashboard.jsx"), "utf8");
    expect(src).toMatch(/StudentSessionReports/);
    expect(src).toMatch(/label: "Reports"/);
  });

  it("lists attendable sessions and Play opens /student/sessions/:id/player", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/api/sessions/mine")) {
        return jsonOk([
          {
            id: "s-attend",
            studentId: "stud1",
            status: "in_progress",
            taskIds: ["t1"],
            responses: [],
          },
        ]);
      }
      return jsonOk([]);
    });

    render(
      <MemoryRouter initialEntries={["/student"]}>
        <LocationProbe />
        <Routes>
          <Route path="/student" element={<StudentSessionList />} />
          <Route
            path="/student/sessions/:sessionId/player"
            element={<div>Student player</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("s-attend")).toBeInTheDocument());
    expect(screen.getByText("Continue")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Student player")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/student/sessions/s-attend/player"
    );
  });

  it("shows a reason when there is nothing to attend", async () => {
    global.fetch = vi.fn(() => jsonOk([]));
    render(
      <MemoryRouter>
        <StudentSessionList />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(
        screen.getByText(/No upcoming or in-progress sessions are available for you yet/)
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/stud1/)).toBeInTheDocument();
    expect(screen.queryByText("Play")).toBeNull();
  });

  it("loads the list from /api/sessions/mine, not GET /api/sessions/:id", async () => {
    const fetchMock = vi.fn((url) => {
      const href = String(url);
      expect(href).toContain("/api/sessions/mine");
      expect(href).not.toMatch(/\/api\/sessions\/(?!mine(?:\?|$))/);
      return jsonOk([]);
    });
    global.fetch = fetchMock;
    render(
      <MemoryRouter>
        <StudentSessionList />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(
        screen.getByText(/No upcoming or in-progress sessions are available for you yet/)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(/Could not load sessions/)).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("treats a leftover /mine 404 Session not found as an empty list, not an alert", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Session not found" }),
        text: () => Promise.resolve(JSON.stringify({ error: "Session not found" })),
      })
    );
    render(
      <MemoryRouter>
        <StudentSessionList />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(
        screen.getByText(/No upcoming or in-progress sessions are available for you yet/)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(/Could not load sessions/)).toBeNull();
    expect(screen.queryByText(/Session not found/)).toBeNull();
  });
});
