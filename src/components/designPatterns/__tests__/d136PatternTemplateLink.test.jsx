import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DesignPatternLibraryView,
  patternTemplateHref,
} from "../DesignPatternBuilder.jsx";
import { openDesignPatternStep } from "./openDesignPatternStep.js";
import {
  TemplateLibraryView,
  templatePatternHref,
} from "../../templates/TemplateBuilder.jsx";

const pattern = {
  id: "dp1",
  name: "Explain a diagram",
  status: "confirmed",
  summary: "Students explain a diagram.",
  rationale: "Explanation is the construct.",
};

const template = {
  id: "tpl1",
  name: "Diagram family",
  status: "draft",
  competencyModelId: "cm1",
  evidenceModelId: "em1",
  taskModelId: "tm1",
  presentationModelId: "pm1",
  designPatternId: "dp1",
};

describe("D136 pattern and template navigation", () => {
  it("lists a pattern's templates as links and can link another", async () => {
    const user = userEvent.setup();
    const onLinkTemplate = vi.fn();
    render(
      <DesignPatternLibraryView
        patterns={[pattern]}
        templates={[
          template,
          { id: "tpl2", name: "Unlinked family", status: "draft" },
        ]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
        onLinkTemplate={onLinkTemplate}
      />
    );

    const fromLibrary = screen.getByRole("link", { name: "Diagram family" });
    expect(fromLibrary).toHaveAttribute("href", patternTemplateHref("tpl1"));

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await openDesignPatternStep(user, "Review & confirm");
    await user.selectOptions(screen.getByLabelText("Link a template"), "tpl2");
    await user.click(screen.getByRole("button", { name: "Link template" }));
    expect(onLinkTemplate).toHaveBeenCalledWith({
      id: "tpl2",
      designPatternId: "dp1",
    });
  });

  it("keeps Confirm available when the template cites no pattern, and links back when it does", async () => {
    const user = userEvent.setup();
    render(
      <TemplateLibraryView
        templates={[{ ...template, designPatternId: "" }]}
        designPatterns={[pattern]}
        competencyModels={[{ id: "cm1", name: "CM" }]}
        competencies={[{ id: "c1", modelId: "cm1" }]}
        evidenceModels={[{ id: "em1", name: "EM", competencyId: "c1" }]}
        taskModels={[{ id: "tm1", name: "TM", evidenceModelIds: ["em1"] }]}
        presentationModels={[{ id: "pm1", name: "PM", taskModelId: "tm1" }]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onConfirm={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    const patternSelect = screen.getByRole("combobox", { name: /Design pattern/ });
    expect(patternSelect).toHaveValue("");

    await user.selectOptions(patternSelect, "dp1");
    expect(screen.getByRole("link", { name: "Open Explain a diagram" })).toHaveAttribute(
      "href",
      templatePatternHref("dp1")
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });
});
