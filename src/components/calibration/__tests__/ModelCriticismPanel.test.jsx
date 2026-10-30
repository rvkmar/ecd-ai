import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModelCriticismPanel from "../ModelCriticismPanel";

const apiFetch = vi.fn();

vi.mock("@/api/apiClient", () => ({
  apiFetch: (...args) => apiFetch(...args),
  apiErrorMessage: (err, fallback) => err?.message || fallback,
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { token: "t" } }),
}));

const fit = {
  cdmFit: { M2: 12.4, df: 8, p: 0.13, RMSEA2: 0.021, SRMSR: 0.031 },
  qValidation: {
    eps: 0.95,
    nItems: 2,
    nChanged: 1,
    suggestions: [{ itemId: "Item.2", original: [1, 0], suggested: [0, 1], pvaf: 0.97 }],
  },
  personFit: {
    statistic: "Zh",
    cutoff: -2,
    rule: "Zh < cutoff",
    nPersons: 4,
    nFinite: 4,
    nMisfit: 1,
    proportionMisfit: 0.25,
  },
  localDependence: {
    statistic: "Q3",
    threshold: 0.2,
    maxAbsQ3: 0.31,
    nPairs: 1,
    nFlaggedPairs: 1,
    flaggedPairs: [{ itemId1: "Item.1", itemId2: "Item.2", q3: 0.31 }],
  },
};

describe("ModelCriticismPanel", () => {
  it("renders nothing when the response has no criticism fields", () => {
    const { container } = render(<ModelCriticismPanel fitStatistics={{ logLik: -12.3 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows summaries and loads only the misfitting persons", async () => {
    apiFetch.mockImplementation(async (url) => {
      if (String(url).endsWith("/person-fit")) {
        return {
          rows: [
            { personId: "p1", Zh: -2.4, misfit: true },
            { personId: "p2", Zh: 0.2, misfit: false },
          ],
        };
      }
      return { itemIds: ["Item.1", "Item.2"], values: [[1, 0.31], [0.31, 1]] };
    });
    const user = userEvent.setup();
    render(<ModelCriticismPanel fitStatistics={fit} jobId="job-1" />);

    expect(screen.getByTestId("model-criticism-cdm")).toHaveTextContent("12.400");
    expect(screen.getByTestId("model-criticism-cdm")).toHaveTextContent("0.0210");
    expect(screen.getByTestId("model-criticism-cdm")).toHaveTextContent("0.0310");
    expect(screen.getByTestId("model-criticism-qval")).toHaveTextContent("Item.2");
    expect(screen.getByTestId("model-criticism-qval")).toHaveTextContent("0.970");
    expect(screen.getByTestId("model-criticism-person")).toHaveTextContent("1 of 4 (25.0%)");
    expect(screen.getByTestId("model-criticism-q3")).toHaveTextContent("0.310");
    expect(screen.getByText("Item.1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show misfitting persons/i }));
    expect(await screen.findByText("p1")).toBeInTheDocument();
    expect(screen.queryByText("p2")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/calibrationJobs/job-1/person-fit",
      {},
      { token: "t" }
    );

    await user.click(screen.getByRole("button", { name: /show q3 matrix/i }));
    expect(await screen.findByTestId("q3-matrix")).toHaveTextContent("0.310");
    expect(screen.getByTestId("q3-mean")).toHaveTextContent("0.310");
    expect(screen.getByTestId("model-criticism-q3")).toHaveTextContent("Yen");
    expect(screen.getByTestId("model-criticism-q3")).toHaveTextContent("|Q3| > 0.20");
  });

  it("suggests a bundle for flagged items that share a work product", async () => {
    const onEnableBundle = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelCriticismPanel
        fitStatistics={fit}
        items={[
          { id: "Item.1", interaction: { workProductId: "wp_passage" } },
          { id: "Item.2", interaction: { workProductId: "wp_passage" } },
        ]}
        onEnableBundle={onEnableBundle}
      />
    );
    expect(screen.getByTestId("bundle-candidates")).toHaveTextContent("wp_passage");
    expect(screen.getByTestId("bundle-candidates")).toHaveTextContent("Item.1");
    await user.click(screen.getByRole("button", { name: /enable bundle scoring/i }));
    expect(onEnableBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        basis: "workProduct",
        sourceId: "wp_passage",
        itemIds: ["Item.1", "Item.2"],
      })
    );
  });
});
