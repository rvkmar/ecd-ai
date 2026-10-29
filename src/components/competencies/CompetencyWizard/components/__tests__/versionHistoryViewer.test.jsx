import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VersionHistoryViewer from "../VersionHistoryViewer";

const parent = {
  id: "cm-parent",
  parentModelId: null,
  versionNumber: 1,
  status: "confirmed",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const clone = {
  id: "cm-clone",
  parentModelId: "cm-parent",
  versionNumber: 2,
  status: "draft",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

describe("VersionHistoryViewer", () => {
  it("renders Current with CheckCircle2 when a clone sits next to its parent", () => {
    render(
      <VersionHistoryViewer
        currentModel={clone}
        allModels={[parent, clone]}
        onSelectVersion={vi.fn()}
      />
    );

    expect(screen.getByTestId("version-history-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("version-history-current")).toHaveTextContent(
      "Current"
    );
    expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
  });
});
