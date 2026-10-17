// Opening Warrants used to exceed React's update depth. Steps 3, 4, and 7
// report validity from an effect that lists the callback as a dependency.
// The wizard must keep the previous validity array when the flag is unchanged,
// or that effect re-renders the wizard and runs again until React stops the step.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import EvidenceWizard from "../EvidenceWizard";
import { EvidenceWizardProvider } from "../EvidenceWizardContext";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

useAuth.mockReturnValue({
  auth: { token: "t", username: "admin1", role: "admin" },
});

describe("Evidence wizard Warrants step", () => {
  it("opens without an update-depth crash", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <EvidenceWizardProvider
          initialModel={{
            name: "Part naming evidence",
            description: "Observes whether the student names the indicated plant part.",
            competencyId: "c1",
            claimStatement:
              "The student can name the indicated plant part within part naming across familiar diagrams, sufficient to support a mastery claim.",
            warrants: [],
            status: "draft",
          }}
          competencies={[
            {
              id: "c1",
              name: "Names the part",
              modelId: "cm1",
              variableType: "binary",
              states: [],
            },
          ]}
          competencyModels={[
            {
              id: "cm1",
              name: "Plant part naming",
              status: "confirmed",
              locked: true,
              versionNumber: 1,
            },
          ]}
        >
          <EvidenceWizard onCancel={() => {}} onSaved={() => {}} />
        </EvidenceWizardProvider>
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: /Warrants/ }));

    expect(
      await screen.findByRole("heading", { name: "Structured Warrants" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not be displayed/)).not.toBeInTheDocument();
  });
});
