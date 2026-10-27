import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignPatternLibraryView } from "../DesignPatternBuilder.jsx";
import { openDesignPatternStep } from "./openDesignPatternStep.js";

const competencies = [{ id: "c-plant", name: "Names the part", modelId: "cm-plant" }];
const competencyModels = [
  {
    id: "cm-plant",
    name: "Plant part naming",
    smVariables: [{ id: "smv-names-part", label: "Names the part" }],
  },
];

const linked = {
  id: "dp-plant",
  name: "Name a plant part",
  status: "confirmed",
  summary: "The examinee names the part a plant diagram calls out.",
  rationale: "Naming is the recognition task.",
  focalKsas: [
    {
      label: "Plant-part vocabulary",
      competencyId: "c-plant",
      competencyModelId: "cm-plant",
      smvId: "smv-names-part",
    },
  ],
  additionalKsas: [
    { label: "Reading a label", relationship: "potentially_confounding" },
  ],
};

describe("design pattern KSA link editor", () => {
  it("shows the label when unlinked, then saves a chosen competency", async () => {
    const user = userEvent.setup({ delay: null });
    const onUpdate = vi.fn().mockResolvedValue({});
    render(
      <DesignPatternLibraryView
        patterns={[
          {
            id: "dp1",
            name: "Name a plant part",
            status: "draft",
            summary: "Names the part.",
            rationale: "Naming is the claim.",
            focalKsas: [{ label: "Plant-part vocabulary" }],
          },
        ]}
        competencies={competencies}
        competencyModels={competencyModels}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await openDesignPatternStep(user, "Focal KSAs");
    expect(screen.getByLabelText("Focal KSAs 1")).toHaveValue("Plant-part vocabulary");
    expect(screen.getByLabelText("Focal KSAs 1 competency")).toHaveValue("");
    expect(screen.getByRole("note")).toHaveTextContent(/not linked/);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();

    await user.selectOptions(screen.getByLabelText("Focal KSAs 1 competency"), "c-plant");
    await user.selectOptions(
      screen.getByLabelText("Focal KSAs 1 student model variable"),
      "cm-plant::smv-names-part"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith({
      id: "dp1",
      payload: expect.objectContaining({
        focalKsas: [
          {
            label: "Plant-part vocabulary",
            competencyId: "c-plant",
            competencyModelId: "cm-plant",
            smvId: "smv-names-part",
          },
        ],
      }),
    });
  });

  it("pre-fills seeding from the focal KSA and sends an override", async () => {
    const user = userEvent.setup({ delay: null });
    const onSeed = vi.fn().mockResolvedValue({
      evidenceModel: { name: "Name a plant part evidence" },
      taskModel: { name: "Name a plant part task" },
    });
    render(
      <DesignPatternLibraryView
        patterns={[linked]}
        competencies={competencies}
        competencyModels={competencyModels}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
        onSeed={onSeed}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await openDesignPatternStep(user, "Review & confirm");
    expect(screen.getByLabelText("Competency")).toHaveValue("c-plant");
    expect(screen.getByLabelText("Student model variable")).toHaveValue(
      "cm-plant::smv-names-part"
    );

    await user.selectOptions(screen.getByLabelText("Student model variable"), "");
    await user.click(screen.getByRole("button", { name: "Seed draft models" }));
    expect(onSeed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dp-plant",
        competencyId: "c-plant",
        competencyModelId: "",
        smvId: "",
      })
    );
  });
});
