import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DesignPatternLibraryView,
  designPatternPayload,
} from "../DesignPatternBuilder.jsx";

describe("D133 design pattern narrative", () => {
  it("saves a draft from the title and keeps blank KSA rows off the payload", () => {
    const form = {
      name: "  Explain a diagram  ",
      summary: "",
      rationale: "",
      focalKsas: [{ label: "  Model-based explanation  " }, { label: "   " }],
      additionalKsas: [],
    };
    expect(designPatternPayload(form)).toEqual({
      name: "Explain a diagram",
      summary: "",
      rationale: "",
      focalKsas: [{ label: "Model-based explanation" }],
      additionalKsas: [],
    });
  });

  it("creates a draft without a rationale and refuses confirm until the argument is complete", async () => {
    const user = userEvent.setup({ delay: null });
    const onCreate = vi.fn().mockResolvedValue({
      id: "dp1",
      name: "Explain a diagram",
      status: "draft",
      summary: "",
      rationale: "",
      focalKsas: [],
      additionalKsas: [],
    });
    const onConfirm = vi.fn();

    render(
      <DesignPatternLibraryView
        patterns={[]}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onConfirm={onConfirm}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();

    await user.type(screen.getByLabelText("Title"), "Explain a diagram");
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Explain a diagram",
      summary: "",
      rationale: "",
      focalKsas: [],
      additionalKsas: [],
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByText(/rationale is required/i)).toBeInTheDocument();
  });

  it("confirms once summary, rationale, and a focal KSA are saved", async () => {
    const user = userEvent.setup({ delay: null });
    const onUpdate = vi.fn().mockResolvedValue({});
    const onConfirm = vi.fn().mockResolvedValue({});

    render(
      <DesignPatternLibraryView
        patterns={[
          {
            id: "dp1",
            name: "Explain a diagram",
            status: "draft",
            summary: "",
            rationale: "",
            focalKsas: [],
            additionalKsas: [],
          },
        ]}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={onConfirm}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Summary"), "Students explain a labelled diagram.");
    await user.type(
      screen.getByLabelText("Rationale"),
      "The pattern separates explanation from recognition."
    );
    await user.click(screen.getByRole("button", { name: "Add Focal KSAs" }));
    await user.type(screen.getByLabelText("Focal KSAs 1"), "Model-based explanation");
    await user.click(screen.getByRole("button", { name: "Add Additional KSAs" }));
    await user.type(screen.getByLabelText("Additional KSAs 1"), "Diagram conventions");

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(onUpdate).toHaveBeenCalledWith({
      id: "dp1",
      payload: {
        name: "Explain a diagram",
        summary: "Students explain a labelled diagram.",
        rationale: "The pattern separates explanation from recognition.",
        focalKsas: [{ label: "Model-based explanation" }],
        additionalKsas: [{ label: "Diagram conventions" }],
      },
    });
    expect(onConfirm).toHaveBeenCalledWith("dp1");
  });

  it("shows the server refusal when confirm fails", async () => {
    const user = userEvent.setup({ delay: null });
    const err = new Error("Confirm failed");
    err.body = {
      error: "Design pattern validation failed",
      details: ["Design pattern rationale is required. An empty rationale is not a pattern."],
    };
    render(
      <DesignPatternLibraryView
        patterns={[
          {
            id: "dp1",
            name: "Explain a diagram",
            status: "draft",
            summary: "About diagrams.",
            rationale: "Why this pattern exists.",
            focalKsas: [],
            additionalKsas: [],
          },
        ]}
        onCreate={vi.fn()}
        onUpdate={vi.fn().mockResolvedValue({})}
        onConfirm={vi.fn().mockRejectedValue(err)}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/rationale is required/i);
  });
});
