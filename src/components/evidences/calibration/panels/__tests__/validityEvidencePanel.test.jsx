import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ValidityEvidencePanel from "../ValidityEvidencePanel";

const apiFetch = vi.fn();

vi.mock("@/api/apiClient", () => ({
  apiFetch: (...args) => apiFetch(...args),
  apiErrorMessage: (err, fallback) => err?.message || fallback,
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { role: "admin", username: "admin1", token: "t" } }),
}));

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ValidityEvidencePanel
        evidenceModel={{
          id: "em1",
          warrants: [{ id: "w1" }],
          alternativeExplanations: [{ text: "Speeded responding" }],
        }}
      />
    </QueryClientProvider>
  );
}

describe("ValidityEvidencePanel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url, options = {}) => {
      if (url.startsWith("/api/validityEvidence") && (!options.method || options.method === "GET")) {
        return [
          {
            id: "ve-fit",
            evidenceModelId: "em1",
            type: "internal-structure",
            summary: "Person fit: 1 of 8 persons with Zh below -2.",
            body: "Person fit: 1 of 8 persons with Zh below -2.",
            source: "tu4-fit",
            author: "system",
            createdAt: "2026-10-31T01:00:00.000Z",
            warrantIds: [],
          },
        ];
      }
      if (options.method === "POST") {
        return { id: "ve-new", ...JSON.parse(options.body) };
      }
      return [];
    });
  });

  it("shows linked fit evidence and posts a new response-process row", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByText(/Person fit: 1 of 8/)).toBeInTheDocument();
    expect(screen.getByText(/linked from model-criticism fit/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Summary"), "Think-aloud named the claim.");
    await user.type(screen.getByLabelText("Source"), "cognitive lab");
    await user.click(screen.getByRole("checkbox", { name: "w1" }));
    await user.click(screen.getByRole("button", { name: "Add evidence" }));

    const post = apiFetch.mock.calls.find((call) => call[1]?.method === "POST");
    expect(post[0]).toBe("/api/validityEvidence");
    const body = JSON.parse(post[1].body);
    expect(body).toMatchObject({
      evidenceModelId: "em1",
      type: "response-process",
      summary: "Think-aloud named the claim.",
      source: "cognitive lab",
      warrantIds: ["w1"],
    });
  });
});
