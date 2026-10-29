import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Step1Instantiation from "../Step1Instantiation.jsx";

let mockCtx;

vi.mock("../../ItemWizardContext", () => ({
  useItemWizard: () => mockCtx,
}));

vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: () => ({
    data: [
      {
        id: "tm1",
        name: "Plant part clone",
        status: "confirmed",
        locked: true,
        expectedObservations: [
          { observationId: "obs-plant-name", evidenceModelId: "em1", weight: 1 },
        ],
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/api/queries/templates", () => ({
  useTemplates: () => ({
    data: [
      { id: "tpl1", taskModelId: "tm1" },
      { id: "tpl-other", taskModelId: "tm-other" },
    ],
  }),
}));

vi.mock("@/api/queries/taskSpecs", () => ({
  useTaskSpecs: () => ({
    data: [
      {
        id: "tspec-remember-formal",
        templateId: "tpl1",
        tmvAssignment: [
          { taskModelVariableId: "tmv-bloom", value: "remember" },
          { taskModelVariableId: "tmv-register", value: "formal" },
        ],
      },
      {
        id: "tspec-other",
        templateId: "tpl-other",
        tmvAssignment: [{ taskModelVariableId: "tmv-bloom", value: "apply" }],
      },
    ],
  }),
}));

vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: () => ({
    data: [
      {
        id: "em1",
        name: "Part naming evidence",
        observables: [
          { id: "obs-plant-name", statement: "Selects the name of the called-out part." },
        ],
      },
    ],
  }),
}));

vi.mock("@/api/queries/competencies", () => ({
  useCompetencies: () => ({ data: [] }),
}));

function makeCtx(overrides = {}) {
  return {
    item: {
      taskModelId: "tm1",
      observationId: "obs-plant-name",
      taskSpecId: null,
      evidenceModelId: "em1",
    },
    ctx: {},
    taskModel: {
      id: "tm1",
      name: "Plant part clone",
      status: "confirmed",
      locked: true,
      expectedObservations: [
        { observationId: "obs-plant-name", evidenceModelId: "em1", weight: 1 },
      ],
    },
    evidenceModel: { id: "em1", name: "Part naming evidence" },
    chainLoading: false,
    bindTaskModel: vi.fn(),
    bindObservation: vi.fn(),
    bindTaskSpec: vi.fn(),
    canEdit: true,
    ...overrides,
  };
}

describe("Item wizard Step 1 task spec citation (D155)", () => {
  beforeEach(() => {
    mockCtx = makeCtx();
  });

  it("lists specs generated from templates bound to this Task Model", () => {
    render(<Step1Instantiation />);
    const select = screen.getByLabelText(/generated task spec/i);
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: /remember · formal/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /apply/i })).not.toBeInTheDocument();
  });

  it("cites the chosen spec without filling stimulus or scoring", async () => {
    const user = userEvent.setup();
    render(<Step1Instantiation />);
    await user.selectOptions(
      screen.getByLabelText(/generated task spec/i),
      "tspec-remember-formal"
    );
    expect(mockCtx.bindTaskSpec).toHaveBeenCalledWith("tspec-remember-formal");
  });
});
