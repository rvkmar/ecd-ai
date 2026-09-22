// src/components/templates/__tests__/d127TemplateBuilder.test.jsx
//
// D127 exit check: author a template; family size updates live as TMV
// settings change; incoherent binding surfaces the server's own message.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TemplateLibraryView,
  evidenceModelsForCompetencyModel,
  taskModelsForEvidenceModel,
  presentationModelsForTaskModel,
  familySizeFromTaskModel,
} from "../TemplateBuilder.jsx";

const competencyModels = [{ id: "cm1", name: "Student CM" }];
const competencies = [{ id: "c1", name: "Attr", modelId: "cm1" }];
const evidenceModels = [
  { id: "em1", name: "EM1", competencyId: "c1" },
  { id: "em-other", name: "Other EM", competencyId: "c-other" },
];
const taskModelVariables = [
  {
    id: "tmv-bloom",
    name: "Bloom",
    type: "categorical",
    possibleValues: [
      { value: "remember" },
      { value: "apply" },
      { value: "analyze" },
    ],
  },
  {
    id: "tmv-mode",
    name: "Mode",
    type: "categorical",
    possibleValues: [{ value: "a" }, { value: "b" }],
  },
];

const taskModels = [
  {
    id: "tm1",
    name: "TM1",
    status: "draft",
    locked: false,
    evidenceModelIds: ["em1"],
    taskModelVariableIds: ["tmv-bloom", "tmv-mode"],
    taskModelVariableSettings: [
      { taskModelVariableId: "tmv-bloom", variation: "varying" },
      { taskModelVariableId: "tmv-mode", variation: "varying" },
    ],
  },
];

const presentationModels = [
  { id: "pm1", name: "PM for TM1", taskModelId: "tm1" },
  { id: "pm2", name: "PM for other", taskModelId: "tm-other" },
];

describe("D127 binding filters", () => {
  it("filters EMs by competency model membership", () => {
    expect(
      evidenceModelsForCompetencyModel(evidenceModels, competencies, "cm1").map(
        (e) => e.id
      )
    ).toEqual(["em1"]);
  });

  it("filters TMs by evidenceModelIds and PMs by taskModelId", () => {
    expect(taskModelsForEvidenceModel(taskModels, "em1").map((t) => t.id)).toEqual([
      "tm1",
    ]);
    expect(
      presentationModelsForTaskModel(presentationModels, "tm1").map((p) => p.id)
    ).toEqual(["pm1"]);
  });

  it("projects family size 3×2 = 6 from the bound Task Model", () => {
    expect(familySizeFromTaskModel(taskModels[0], taskModelVariables)).toBe(6);
  });
});

describe("D127 TemplateLibraryView", () => {
  it("updates family size live when a setting switches to fixed", async () => {
    const user = userEvent.setup();
    render(
      <TemplateLibraryView
        templates={[]}
        competencyModels={competencyModels}
        competencies={competencies}
        evidenceModels={evidenceModels}
        taskModels={taskModels}
        presentationModels={presentationModels}
        taskModelVariables={taskModelVariables}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText(/Student Model/i), "cm1");
    await user.selectOptions(screen.getByLabelText(/Evidence Model/i), "em1");
    await user.selectOptions(screen.getByLabelText(/Task Model/i), "tm1");

    expect(screen.getByTestId("template-family-size")).toHaveTextContent("6");

    // Fix Bloom → family becomes 1 × 2 = 2
    const bloomFixed = screen.getAllByLabelText(/^Fixed$/i)[0];
    await user.click(bloomFixed);
    await waitFor(() =>
      expect(screen.getByTestId("template-family-size")).toHaveTextContent("2")
    );
  });

  it("surfaces the server's own message on confirm failure", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(
      Object.assign(new Error("Template validation failed"), {
        body: {
          error: "Template validation failed",
          details: [
            "presentationModelId 'pm2' is bound to taskModelId 'tm-other', not this template's 'tm1'.",
          ],
        },
      })
    );
    const onUpdate = vi.fn().mockResolvedValue({});

    render(
      <TemplateLibraryView
        templates={[
          {
            id: "tpl1",
            name: "Draft tpl",
            status: "draft",
            competencyModelId: "cm1",
            evidenceModelId: "em1",
            taskModelId: "tm1",
            presentationModelId: "pm1",
          },
        ]}
        competencyModels={competencyModels}
        competencies={competencies}
        evidenceModels={evidenceModels}
        taskModels={taskModels}
        presentationModels={presentationModels}
        taskModelVariables={taskModelVariables}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={onConfirm}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(screen.getByTestId("template-server-error")).toHaveTextContent(
        /presentationModelId 'pm2' is bound to taskModelId 'tm-other'/
      );
    });
    expect(onConfirm).toHaveBeenCalledWith("tpl1");
  });

  it("creates a draft via onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({
      id: "tpl-new",
      name: "Family A",
      status: "draft",
      competencyModelId: "cm1",
      evidenceModelId: "em1",
      taskModelId: "tm1",
      presentationModelId: "pm1",
    });

    render(
      <TemplateLibraryView
        templates={[]}
        competencyModels={competencyModels}
        competencies={competencies}
        evidenceModels={evidenceModels}
        taskModels={taskModels}
        presentationModels={presentationModels}
        taskModelVariables={taskModelVariables}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/^Name$/i), "Family A");
    await user.selectOptions(screen.getByLabelText(/Student Model/i), "cm1");
    await user.selectOptions(screen.getByLabelText(/Evidence Model/i), "em1");
    await user.selectOptions(screen.getByLabelText(/Task Model/i), "tm1");
    await user.selectOptions(screen.getByLabelText(/Presentation Model/i), "pm1");
    await user.click(screen.getByRole("button", { name: /Create draft/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0].name).toBe("Family A");
    expect(onCreate.mock.calls[0][0].taskModelId).toBe("tm1");
  });
});
