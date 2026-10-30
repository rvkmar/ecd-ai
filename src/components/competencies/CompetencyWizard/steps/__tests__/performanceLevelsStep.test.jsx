import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const wizard = {
  model: { locked: false },
  competencies: [],
  updateCompetency: vi.fn(),
  setPerformanceLevelsDraftReady: vi.fn(),
};

vi.mock("../../CompetencyWizardContext", () => ({
  useCompetencyWizard: () => wizard,
}));

import StepPerformanceLevels from "../StepPerformanceLevels";
import { STEP_CONFIG } from "../../CompetencyWizard";

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("student model wizard steps", () => {
  it("puts performance levels before confirmation", () => {
    expect(STEP_CONFIG.map((step) => step.label)).toEqual([
      "Model Identity",
      "Measurement Intent",
      "Construct Framework",
      "Latent Variables",
      "State Space / Scale",
      "Structural Relationships",
      "Domain Classification",
      "Structural Audit",
      "Performance Levels",
      "Confirmation",
    ]);
  });
});

describe("performance level worksheet", () => {
  beforeEach(() => {
    wizard.model = { locked: false };
    wizard.competencies = [{ id: "c1", name: "Naming", orderIndex: 0 }];
    wizard.updateCompetency.mockClear();
    wizard.setPerformanceLevelsDraftReady.mockClear();
  });

  it("writes an Angoff cut onto the level as a probability", () => {
    render(<StepPerformanceLevels />);

    fireEvent.click(screen.getByRole("button", { name: "Add level" }));
    type("Level label", "Proficient");
    type("Descriptor", "Can name the indicated part.");
    type("Item 1 panelist ratings", "0.5, 1");
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    type("Item 2 panelist ratings", "0.25");

    expect(screen.getByText("Computed cut: 0.5")).toBeInTheDocument();
    expect(wizard.updateCompetency).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply cut" }));

    expect(wizard.updateCompetency).toHaveBeenCalledTimes(1);
    expect(wizard.updateCompetency).toHaveBeenCalledWith("c1", {
      performanceLevelScale: "probability",
      performanceLevels: [
        {
          label: "Proficient",
          descriptor: "Can name the indicated part.",
          cut: 0.5,
        },
      ],
    });
  });

  it("writes a bookmark cut onto the level as theta", () => {
    render(<StepPerformanceLevels />);

    fireEvent.click(screen.getByRole("button", { name: "Add level" }));
    type("Level label", "Proficient");
    type("Descriptor", "Can name the indicated part.");
    fireEvent.click(screen.getByRole("button", { name: "Bookmark" }));
    type("Item 1 difficulty", "-1");
    type("Item 2 difficulty", "0.4");
    fireEvent.change(screen.getByLabelText("Bookmark position"), { target: { value: "1" } });

    expect(screen.getByText("Computed cut: 0.4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply cut" }));

    expect(wizard.updateCompetency).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        performanceLevelScale: "theta",
        performanceLevels: [
          expect.objectContaining({ label: "Proficient", cut: 0.4 }),
        ],
      })
    );
  });

  it("does not apply an Angoff cut while the scale is theta", () => {
    render(<StepPerformanceLevels />);
    fireEvent.click(screen.getByRole("radio", { name: "Theta" }));
    fireEvent.click(screen.getByRole("button", { name: "Add level" }));
    type("Level label", "Proficient");
    type("Item 1 panelist ratings", "0.5, 1");
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    type("Item 2 panelist ratings", "0.25");

    expect(screen.getByRole("button", { name: "Apply cut" })).toBeDisabled();
    expect(screen.getByText(/writes a probability cut/)).toBeInTheDocument();
  });
});
