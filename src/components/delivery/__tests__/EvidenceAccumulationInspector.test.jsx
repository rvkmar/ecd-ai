import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { apiFetch } from "../../../api/apiClient.js";
import EvidenceAccumulationInspector from "../EvidenceAccumulationInspector.jsx";

vi.mock("../../../auth/AuthProvider.jsx", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../../api/apiClient.js", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../sessions/SessionReport", () => ({
  default: ({ sessionId }) => <div>Report for {sessionId}</div>,
}));

describe("EvidenceAccumulationInspector", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      auth: { role: "admin", username: "admin1", token: "t" },
    });
  });

  it("loads SMV posteriors from GET /:id when Inspect is clicked, not from the list", async () => {
    apiFetch.mockImplementation((url) => {
      const href = String(url);
      if (href.includes("/api/sessions/active")) {
        return Promise.resolve([
          {
            id: "s-acc",
            status: "in_progress",
            responseCount: 2,
            answeredTaskIds: ["t1"],
          },
        ]);
      }
      if (href.includes("/api/sessions/archived")) {
        return Promise.resolve([]);
      }
      if (href.includes("/api/sessions/s-acc")) {
        return Promise.resolve({
          id: "s-acc",
          status: "in_progress",
          studentModel: {
            smvPosteriors: {
              theta: { smvId: "theta", estimate: 0.42, precision: 0.1 },
            },
          },
        });
      }
      return Promise.resolve([]);
    });

    render(<EvidenceAccumulationInspector />);

    await waitFor(() => {
      expect(screen.getByText("s-acc")).toBeInTheDocument();
    });
    expect(screen.getByText("Inspect to load")).toBeInTheDocument();
    expect(screen.queryByText(/theta: 0.42/)).toBeNull();
    expect(apiFetch.mock.calls.every(([url]) => !String(url).endsWith("/api/sessions/s-acc"))).toBe(
      true
    );

    await userEvent.click(screen.getByRole("button", { name: "Inspect" }));

    await waitFor(() => {
      expect(screen.getByText(/theta: 0.42/)).toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/sessions/s-acc", {}, expect.anything());
    expect(screen.getByText("Report for s-acc")).toBeInTheDocument();
  });
});
