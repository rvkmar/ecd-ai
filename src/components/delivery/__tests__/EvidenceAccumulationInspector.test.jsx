import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("lists persisted SMV posteriors from session records", async () => {
    apiFetch.mockImplementation((url) => {
      if (String(url).includes("/api/sessions/active")) {
        return Promise.resolve([
          {
            id: "s-acc",
            status: "in_progress",
            studentModel: {
              smvPosteriors: {
                theta: { smvId: "theta", estimate: 0.42, precision: 0.1 },
              },
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<EvidenceAccumulationInspector />);

    await waitFor(() => {
      expect(screen.getByText("s-acc")).toBeInTheDocument();
    });
    expect(screen.getByText(/theta: 0.42/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect" })).toBeInTheDocument();
  });
});
