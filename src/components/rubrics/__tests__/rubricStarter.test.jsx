import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { generateRubricDraft } from "../rubricStarter";
import { RubricLibraryView } from "../RubricBuilder";

describe("generateRubricDraft", () => {
  it("writes a four-level grid and does not keep the subject or topic as fields", () => {
    const draft = generateRubricDraft({
      subjectId: "science",
      topicId: "plant-diagrams",
      idFor: (name, index) => `dim_${index}`,
    });
    expect(draft.name).toBe("Plant diagrams");
    expect(draft.subjectId).toBeUndefined();
    expect(draft.topicId).toBeUndefined();
    expect(draft.dimensions).toHaveLength(3);
    expect(draft.dimensions[0].levels.map((level) => level.label)).toEqual([
      "Beginning",
      "Developing",
      "Accomplished",
      "Exemplary",
    ]);
    expect(draft.dimensions[0].activatesAt).toBe(2);
    for (const dimension of draft.dimensions) {
      for (const level of dimension.levels) {
        expect(level.descriptor.trim().length).toBeGreaterThan(0);
        expect(level.exemplar).toBe(level.descriptor);
      }
    }
  });

  it("returns nothing when the topic is not in the list", () => {
    expect(generateRubricDraft({ subjectId: "science", topicId: "missing" })).toBeNull();
  });
});

describe("RubricLibraryView starter", () => {
  it("fills the table from a subject and topic, then saves the edited sentences", () => {
    const onCreate = vi.fn();
    render(<RubricLibraryView rubrics={[]} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "science" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "plant-diagrams" } });
    fireEvent.click(screen.getByRole("button", { name: "Write a first draft" }));

    expect(screen.getByRole("columnheader", { name: "Beginning" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Exemplary" })).toBeInTheDocument();
    const cell = screen.getByLabelText("Naming parts Beginning");
    expect(cell.value).toContain("Names a part that is not shown");
    fireEvent.change(cell, { target: { value: "Edited naming sentence." } });
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    const payload = onCreate.mock.calls[0][0];
    expect(payload.name).toBe("Plant diagrams");
    expect(payload.subjectId).toBeUndefined();
    expect(payload.topicId).toBeUndefined();
    expect(payload.dimensions[0].levels[0]).toMatchObject({
      label: "Beginning",
      descriptor: "Edited naming sentence.",
      exemplar: "Edited naming sentence.",
    });
    expect(payload.dimensions[0].levels).toHaveLength(4);
  });
});
