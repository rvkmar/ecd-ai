import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ParameterSetRegistry from "../ParameterSetRegistry";

const apiFetch = vi.fn();

vi.mock("@/api/apiClient", () => ({
  apiFetch: (...args) => apiFetch(...args),
}));

vi.mock("@/api/queries/evidenceModels", () => ({
  useActivateParameterSet: () => ({
    isPending: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

function renderRegistry(parameterSet) {
  return render(
    <ParameterSetRegistry
      evidenceModel={{ id: "em1", status: "confirmed", locked: true }}
      statisticalModel={{
        id: "sm1",
        type: "irt",
        subtype: "2PL",
        activeParameterSetId: parameterSet.parameterSetId,
        parameterSets: [{ ...parameterSet, calibratedAt: "2026-10-30T00:00:00.000Z" }],
      }}
    />
  );
}

describe("ParameterSetReport", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.stubGlobal("open", vi.fn());
    if (typeof URL.createObjectURL !== "function") {
      URL.createObjectURL = () => "blob:report";
    }
  });

  it("does not show an inline report or person ids when the set has no reference", async () => {
    const user = userEvent.setup();
    renderRegistry({
      parameterSetId: "ps-fat",
      parameters: { item_a: { a: 1 } },
      reportHtml: "<html>secret-report-marker</html>",
      fitStatistics: {
        RMSEA: 0.02,
        personScores: { personIds: ["stud-secret"], theta: [0.4], se: [0.1] },
      },
    });

    await user.click(screen.getByRole("button", { name: "Inspect" }));

    expect(screen.getByTestId("parameter-set-report-missing")).toHaveTextContent(
      "report not stored on this model"
    );
    expect(screen.queryByText(/secret-report-marker/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stud-secret/)).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("loads the report and person scores from the calibration job", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url) => {
      if (url === "/api/calibrationJobs/job-1/report") {
        return { html: "<html><body>job report</body></html>" };
      }
      if (url === "/api/calibrationJobs/job-1") {
        return {
          response: {
            fitStatistics: {
              personScores: { personIds: ["stud-9"], theta: [0.25], se: [0.11] },
            },
          },
        };
      }
      throw new Error(url);
    });

    renderRegistry({
      parameterSetId: "ps-job",
      parameters: { item_a: { a: 1 } },
      calibrationJobId: "job-1",
    });

    await user.click(screen.getByRole("button", { name: "Inspect" }));
    expect(screen.queryByTestId("parameter-set-report-missing")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("parameter-set-open-report"));
    expect(apiFetch).toHaveBeenCalledWith("/api/calibrationJobs/job-1/report", {}, undefined);
    expect(window.open).toHaveBeenCalled();

    await user.click(screen.getByTestId("parameter-set-load-scores"));
    expect(apiFetch).toHaveBeenCalledWith("/api/calibrationJobs/job-1", {}, undefined);
    expect(screen.getByTestId("parameter-set-person-scores")).toHaveTextContent("stud-9");
    expect(screen.getByTestId("parameter-set-person-scores")).toHaveTextContent("theta 0.25");
  });

  it("loads the report and person scores from the analysis artefact", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url) => {
      if (url === "/api/analysisArtefacts/aa-1/report") {
        return { html: "<html><body>artefact report</body></html>" };
      }
      if (url === "/api/analysisArtefacts/aa-1/scores") {
        return { rows: [{ personId: "stud-4", theta: -0.2, se: 0.3 }] };
      }
      throw new Error(url);
    });

    renderRegistry({
      parameterSetId: "ps-aa",
      parameters: { item_a: { a: 1 } },
      analysisArtefactId: "aa-1",
    });

    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await user.click(screen.getByTestId("parameter-set-open-report"));
    await user.click(screen.getByTestId("parameter-set-load-scores"));

    expect(apiFetch).toHaveBeenCalledWith("/api/analysisArtefacts/aa-1/report", {}, undefined);
    expect(apiFetch).toHaveBeenCalledWith("/api/analysisArtefacts/aa-1/scores", {}, undefined);
    expect(screen.getByTestId("parameter-set-person-scores")).toHaveTextContent("stud-4");
  });

  it("says the report is not stored when the cited record has none", async () => {
    const user = userEvent.setup();
    apiFetch.mockRejectedValue(new Error("404"));

    renderRegistry({
      parameterSetId: "ps-missing",
      parameters: { item_a: { a: 1 } },
      calibrationJobId: "job-missing",
    });

    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await user.click(screen.getByTestId("parameter-set-open-report"));

    expect(screen.getByTestId("parameter-set-report-missing")).toHaveTextContent(
      "report not stored on this model"
    );
  });
});
