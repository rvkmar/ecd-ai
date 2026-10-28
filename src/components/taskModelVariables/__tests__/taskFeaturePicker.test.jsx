import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskModelVariableLibraryView } from "../TaskModelVariableBuilder.jsx";

const analyses = [
  {
    id: "da-plant",
    name: "Plant structure",
    taskFeatures: [{ id: "tf-plant", label: "A labelled diagram of a flowering plant" }],
  },
  {
    id: "da-frac",
    name: "Fractions",
    taskFeatures: [{ id: "tf-frac", label: "Two fractions" }],
  },
];

describe("task model variable task feature picker", () => {
  it("leaves the citation unset and saves one from the chosen analysis", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({});
    render(
      <TaskModelVariableLibraryView
        domainAnalyses={analyses}
        onCreate={onCreate}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Domain Analysis")).toHaveValue("");
    expect(screen.getByLabelText("Task feature")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Plant structure: A labelled diagram of a flowering plant" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Domain Analysis"), "da-plant");
    expect(screen.queryByRole("option", { name: "Two fractions" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Task feature"), "tf-plant");
    await user.type(screen.getByLabelText(/^Name$/i), "Plant diagram");
    await user.click(screen.getByRole("button", { name: "Create Task Model Variable" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Plant diagram",
        domainAnalysisId: "da-plant",
        taskFeatureId: "tf-plant",
      })
    );
  });
});
