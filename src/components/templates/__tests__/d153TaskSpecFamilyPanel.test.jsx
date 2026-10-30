import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { projectTaskSpecFamily } from "@/utils/taskModelVariableFamily";
import { TemplateLibraryView } from "../TemplateBuilder.jsx";
import TaskSpecFamilyPanel from "../TaskSpecFamilyPanel.jsx";

const variables = [
  {
    id: "tmv-bloom",
    name: "Cognitive demand",
    type: "categorical",
    possibleValues: [
      { value: "remember", label: "Remember" },
      { value: "understand", label: "Understand" },
      { value: "apply", label: "Apply" },
      { value: "analyze", label: "Analyze" },
      { value: "evaluate", label: "Evaluate" },
    ],
  },
  {
    id: "tmv-register",
    name: "Scenario register",
    type: "categorical",
    possibleValues: [
      { value: "formal", label: "Formal" },
      { value: "informal", label: "Informal" },
    ],
  },
  {
    id: "tmv-stimulus",
    name: "Stimulus policy",
    type: "categorical",
    possibleValues: [{ value: "static", label: "Static" }],
  },
];

const settings = [
  {
    taskModelVariableId: "tmv-bloom",
    variation: "varying",
    allowedValues: ["remember", "understand", "apply", "analyze", "evaluate"],
  },
  {
    taskModelVariableId: "tmv-register",
    variation: "varying",
    allowedValues: ["formal", "informal"],
  },
  {
    taskModelVariableId: "tmv-stimulus",
    variation: "fixed",
    fixedValue: "static",
  },
];

const assignments = projectTaskSpecFamily(settings, variables);
const preview = { assignments, count: assignments.length, existingCount: 0 };
const specs = assignments.map((tmvAssignment, i) => ({
  id: `tspec${i}`,
  templateId: "tpl1",
  tmvAssignment,
  stale: false,
}));

const libraryProps = {
  templates: [
    {
      id: "tpl1",
      name: "Blueprint",
      status: "confirmed",
      competencyModelId: "cm1",
      evidenceModelId: "em1",
      taskModelId: "tm1",
      presentationModelId: "pm1",
    },
  ],
  competencyModels: [{ id: "cm1", name: "Student CM" }],
  competencies: [{ id: "c1", name: "Attr", modelId: "cm1" }],
  evidenceModels: [{ id: "em1", name: "EM1", competencyId: "c1" }],
  taskModels: [
    {
      id: "tm1",
      name: "TM1",
      status: "confirmed",
      locked: true,
      evidenceModelIds: ["em1"],
      taskModelVariableIds: ["tmv-bloom", "tmv-register", "tmv-stimulus"],
      taskModelVariableSettings: settings,
    },
  ],
  presentationModels: [{ id: "pm1", name: "PM1", taskModelId: "tm1" }],
  taskModelVariables: variables,
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onConfirm: vi.fn(),
  onDelete: vi.fn(),
};

describe("D153 TaskSpecFamilyPanel", () => {
  it("shows varying TMVs as columns and the fixed stimulus as a note", () => {
    render(
      <TaskSpecFamilyPanel
        preview={preview}
        variables={variables}
        onGenerate={vi.fn()}
        onReplace={vi.fn()}
        onRetire={vi.fn()}
      />
    );

    const table = screen.getByTestId("task-spec-family-preview-table");
    expect(within(table).getByText("Cognitive demand")).toBeInTheDocument();
    expect(within(table).getByText("Scenario register")).toBeInTheDocument();
    expect(within(table).queryByText("Stimulus policy")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-spec-family-fixed")).toHaveTextContent(
      /Stimulus policy:\s*Static/
    );
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByRole("button", { name: "Generate family" })).toBeInTheDocument();
  });

  it("generates from the preview and retires a stored family", async () => {
    const user = userEvent.setup({ delay: null });
    const onGenerate = vi.fn();
    const onRetire = vi.fn();
    const onReplace = vi.fn();

    const { rerender } = render(
      <TaskSpecFamilyPanel
        preview={preview}
        variables={variables}
        onGenerate={onGenerate}
        onReplace={onReplace}
        onRetire={onRetire}
      />
    );

    await user.click(screen.getByRole("button", { name: "Generate family" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);

    rerender(
      <TaskSpecFamilyPanel
        preview={{ ...preview, existingCount: specs.length }}
        specs={specs}
        variables={variables}
        onGenerate={onGenerate}
        onReplace={onReplace}
        onRetire={onRetire}
      />
    );

    const family = screen.getByTestId("task-spec-family-table");
    expect(within(family).getByText("Cognitive demand")).toBeInTheDocument();
    expect(within(family).getByText("Scenario register")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate family" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retire family" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Retire family" }));
    expect(onRetire).toHaveBeenCalledTimes(1);
  });

  it("opens the confirmed template family panel from the library view", async () => {
    const user = userEvent.setup({ delay: null });
    const onGenerate = vi.fn();
    render(
      <TemplateLibraryView
        {...libraryProps}
        familyPreview={preview}
        onGenerateFamily={onGenerate}
        onReplaceFamily={vi.fn()}
        onRetireFamily={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("task-spec-family-panel")).toBeInTheDocument();
    expect(screen.getByTestId("task-spec-family-preview-table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate family" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows predicted difficulties and covariate effects, and can ask for a fit", async () => {
    const user = userEvent.setup({ delay: null });
    const onEstimate = vi.fn();
    const predicted = specs.map((spec, index) => ({
      ...spec,
      predictedParameters: {
        parameterStatus: "predicted",
        origin: "predicted",
        sourceModel: "eRm::LLTM",
        normalization: "The reference pattern is fixed at difficulty 0.",
        b: index === 0 ? 0 : 0.3,
        bSe: index === 0 ? 0 : 0.08,
        effects: [
          {
            name: "tmv-bloom=apply",
            role: "level",
            label: "Cognitive demand: Apply vs Remember",
            estimate: 0.7,
            se: 0.05,
          },
        ],
      },
    }));
    render(
      <TaskSpecFamilyPanel
        specs={predicted}
        variables={variables}
        onEstimate={onEstimate}
        onReplace={vi.fn()}
        onRetire={vi.fn()}
      />
    );
    expect(screen.getAllByTestId("lltm-predicted-badge").length).toBeGreaterThan(0);
    expect(screen.getByTestId("lltm-effects")).toHaveTextContent("Apply vs Remember");
    expect(screen.getByTestId("lltm-effects")).toHaveTextContent("Predicted");
    expect(screen.getByTestId("lltm-effects")).toHaveTextContent("eRm::LLTM");
    await user.click(screen.getByTestId("lltm-estimate-button"));
    expect(onEstimate).toHaveBeenCalledTimes(1);
  });
});
