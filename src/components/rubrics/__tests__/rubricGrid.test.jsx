import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RubricLibraryView } from "../RubricBuilder";

function level(value, label, text = "") {
  return { value, label, descriptor: text, exemplar: text };
}

describe("RubricLibraryView level columns", () => {
  it("starts at two levels and saves a rubric with four", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<RubricLibraryView rubrics={[]} onCreate={onCreate} />);

    expect(screen.getByLabelText("Level 1 label")).toHaveValue("Low");
    expect(screen.getByLabelText("Level 2 label")).toHaveValue("High");
    expect(screen.getByLabelText("Level 1 score")).toHaveValue(0);
    expect(screen.getByLabelText("Level 2 score")).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Remove level 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove level 2" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add level" }));
    await user.click(screen.getByRole("button", { name: "Add level" }));

    expect(screen.getByLabelText("Level 3 label")).toHaveValue("Level 3");
    expect(screen.getByLabelText("Level 4 label")).toHaveValue("Level 4");
    expect(screen.getByLabelText("Level 3 score")).toHaveValue(2);
    expect(screen.getByLabelText("Level 4 score")).toHaveValue(3);
    expect(screen.getByLabelText("Criterion Level 3")).toHaveValue("");
    expect(screen.getByLabelText("Criterion Level 4")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Level 3 label"), {
      target: { value: "Strong" },
    });
    fireEvent.change(screen.getByLabelText("Level 4 label"), {
      target: { value: "Exceptional" },
    });
    fireEvent.change(screen.getByLabelText("Criterion Strong"), {
      target: { value: "Clear and complete." },
    });
    fireEvent.change(screen.getByLabelText("Criterion Exceptional"), {
      target: { value: "Clear, complete, and checked." },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Four level rubric" },
    });
    await user.click(screen.getByRole("button", { name: "Add criterion" }));
    const second = screen.getByLabelText("Criterion 2");
    fireEvent.change(second, { target: { value: "Evidence" } });
    expect(screen.getByLabelText("Evidence Exceptional")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Create draft" }));

    const payload = onCreate.mock.calls[0][0];
    expect(payload.dimensions).toHaveLength(2);
    expect(payload.dimensions[0].levels.map((entry) => entry.label)).toEqual([
      "Low",
      "High",
      "Strong",
      "Exceptional",
    ]);
    expect(payload.dimensions[0].levels.map((entry) => entry.value)).toEqual([0, 1, 2, 3]);
    expect(payload.dimensions[0].levels[2]).toMatchObject({
      descriptor: "Clear and complete.",
      exemplar: "Clear and complete.",
    });
    expect(payload.dimensions[1].levels).toHaveLength(4);
    expect(payload.dimensions[1].levels[3].descriptor).toBe("");
    expect(payload.dimensions[0].activatesAt).toBe(1);
  });

  it("removes an empty level immediately and asks before dropping descriptors", async () => {
    const user = userEvent.setup();
    render(<RubricLibraryView rubrics={[]} />);

    await user.click(screen.getByRole("button", { name: "Add level" }));
    await user.click(screen.getByRole("button", { name: "Remove level 3" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Level 3 label")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add level" }));
    fireEvent.change(screen.getByLabelText("Criterion Level 3"), {
      target: { value: "A sentence that would be lost." },
    });
    await user.click(screen.getByRole("button", { name: "Remove level 3" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("This level has descriptors.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Criterion Level 3")).toHaveValue(
      "A sentence that would be lost."
    );

    await user.click(screen.getByRole("button", { name: "Remove level 3" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove level" })
    );
    expect(screen.queryByLabelText("Level 3 label")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove level 1" })).toBeDisabled();
  });

  it("keeps a duplicate score from replacing the previous one", () => {
    render(<RubricLibraryView rubrics={[]} />);
    const score = screen.getByLabelText("Level 2 score");
    fireEvent.focus(score);
    fireEvent.change(score, { target: { value: "0" } });
    fireEvent.blur(score);
    expect(screen.getByLabelText("Level 2 score")).toHaveValue(1);
    expect(screen.getByLabelText("Level 1 score")).toHaveValue(0);
  });

  it("edits and saves a rubric that already has four levels", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const row = {
      id: "rub-four",
      name: "Plant diagrams",
      status: "draft",
      dimensions: [
        {
          id: "naming",
          name: "Naming parts",
          activatesAt: 2,
          levels: [
            level(0, "Beginning", "Names the wrong part."),
            level(1, "Developing", "Names some parts."),
            level(2, "Accomplished", "Names each part."),
            level(3, "Exemplary", "Names each part and contrasts them."),
          ],
        },
      ],
    };
    render(<RubricLibraryView rubrics={[row]} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("columnheader", { name: "Beginning" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Exemplary" })).toBeInTheDocument();
    expect(screen.getByLabelText("Naming parts Exemplary")).toHaveValue(
      "Names each part and contrasts them."
    );
    fireEvent.change(screen.getByLabelText("Level 4 label"), {
      target: { value: "Advanced" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    const payload = onUpdate.mock.calls[0][0].payload;
    expect(payload.dimensions[0].levels).toHaveLength(4);
    expect(payload.dimensions[0].levels.map((entry) => entry.label)).toEqual([
      "Beginning",
      "Developing",
      "Accomplished",
      "Advanced",
    ]);
    expect(payload.dimensions[0].levels[3].exemplar).toBe(
      "Names each part and contrasts them."
    );
    expect(payload.dimensions[0].activatesAt).toBe(2);
  });

  it("shows every imported level past the add button's upper bound", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const levels = Array.from({ length: 11 }, (_, value) =>
      level(value, `Band ${value}`, value === 0 ? "low" : "")
    );
    const row = {
      id: "rub-wide",
      name: "Wide rubric",
      status: "draft",
      dimensions: [
        { id: "wide", name: "Breadth", activatesAt: 1, levels },
        {
          id: "short",
          name: "Depth",
          activatesAt: 1,
          levels: levels.slice(0, 2),
        },
      ],
    };
    render(<RubricLibraryView rubrics={[row]} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Level 11 label")).toHaveValue("Band 10");
    expect(screen.getByRole("button", { name: "Add level" })).toBeDisabled();
    expect(screen.getByLabelText("Depth Band 10")).toHaveValue("");
    expect(screen.getByLabelText("Breadth Band 0")).toHaveValue("low");

    await user.click(screen.getByRole("button", { name: "Save" }));
    const payload = onUpdate.mock.calls[0][0].payload;
    expect(payload.dimensions[0].levels).toHaveLength(11);
    expect(payload.dimensions[1].levels).toHaveLength(11);
    expect(payload.dimensions[1].levels[10]).toMatchObject({
      label: "Band 10",
      descriptor: "",
      value: 10,
    });
  });
});
