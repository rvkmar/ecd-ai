import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesignPatternLibraryView } from "../DesignPatternBuilder.jsx";
import { openDesignPatternStep } from "./openDesignPatternStep.js";

const domainAnalyses = [
  {
    id: "da-plant",
    name: "Plant structure",
    valuedKnowledge: [{ id: "vk-plant", label: "Leaf, root, stem, and flower" }],
    taskFeatures: [{ id: "tf-plant", label: "A labelled diagram of a flowering plant" }],
  },
];

describe("design pattern domain analysis citation editor", () => {
  it("keeps a label-only KSA and saves a chosen valued knowledge id", async () => {
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
            domainAnalysisId: "da-plant",
            focalKsas: [{ label: "Plant-part vocabulary" }],
          },
        ]}
        domainAnalyses={domainAnalyses}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await openDesignPatternStep(user, "Focal KSAs");
    expect(screen.getByLabelText("Focal KSAs 1")).toHaveValue("Plant-part vocabulary");
    expect(screen.getByLabelText("Focal KSAs 1 valued knowledge")).toHaveValue("");

    await user.selectOptions(
      screen.getByLabelText("Focal KSAs 1 valued knowledge"),
      "vk-plant"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith({
      id: "dp1",
      payload: expect.objectContaining({
        focalKsas: [
          { label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" },
        ],
      }),
    });
  });

  it("saves a task feature on a characteristic feature without dropping the label", async () => {
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
            domainAnalysisId: "da-plant",
            characteristicFeatures: [{ label: "One part is called out" }],
            variableFeatures: [],
          },
        ]}
        domainAnalyses={domainAnalyses}
        taskModelVariables={[{ id: "tmv-diagram", name: "Plant diagram" }]}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await openDesignPatternStep(user, "Characteristic & variable features");
    expect(screen.getByLabelText("Characteristic Features 1")).toHaveValue("One part is called out");
    expect(screen.getByLabelText("Characteristic Features 1 task feature")).toHaveValue("");

    await user.selectOptions(
      screen.getByLabelText("Characteristic Features 1 task feature"),
      "tf-plant"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith({
      id: "dp1",
      payload: expect.objectContaining({
        characteristicFeatures: [
          { label: "One part is called out", taskFeatureId: "tf-plant" },
        ],
      }),
    });
  });
});
