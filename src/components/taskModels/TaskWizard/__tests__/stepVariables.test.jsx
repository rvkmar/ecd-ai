// D117 — Task Model Variables step binds library ids + per-model settings.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StepVariables from "../steps/StepVariables";
import { buildInitialDraft } from "../TaskModelWizardContext";

vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
}));

import { useTaskModelVariables } from "@/api/queries/taskModelVariables";

const bloomVar = {
  id: "tmv-bloom",
  name: "Bloom depth",
  type: "categorical",
  valueSet: "bloomLevel",
};
const numericVar = {
  id: "tmv-time",
  name: "Time budget",
  type: "numeric",
  range: { min: 1, max: 60 },
};

describe("StepVariables (D117)", () => {
  beforeEach(() => {
    useTaskModelVariables.mockReturnValue({
      data: [bloomVar, numericVar],
      isLoading: false,
    });
  });

  it("adds a library variable and records required + allowedValues settings", async () => {
    const user = userEvent.setup();
    let draft = buildInitialDraft({ name: "TM" });
    const setDraft = (updater) => {
      draft = typeof updater === "function" ? updater(draft) : updater;
      rerender(
        <StepVariables draft={draft} setDraft={setDraft} disabled={false} />
      );
    };

    const { rerender } = render(
      <StepVariables draft={draft} setDraft={setDraft} disabled={false} />
    );

    await user.selectOptions(
      screen.getByLabelText(/Add from library/i),
      "tmv-bloom"
    );

    expect(draft.taskModelVariableIds).toEqual(["tmv-bloom"]);
    expect(draft.taskModelVariableSettings).toEqual([
      { taskModelVariableId: "tmv-bloom", required: false, variation: "varying" },
    ]);

    await user.click(screen.getByRole("checkbox", { name: /Required on this Task Model/i }));
    expect(draft.taskModelVariableSettings[0].required).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "analyze" }));
    expect(draft.taskModelVariableSettings[0].allowedValues).toContain("analyze");
    expect(screen.getByTestId("tmv-family-size")).toHaveTextContent("1");

    await user.click(screen.getByRole("radio", { name: "Fixed" }));
    expect(draft.taskModelVariableSettings[0].variation).toBe("fixed");
    expect(draft.taskModelVariableSettings[0].fixedValue).toBeTruthy();
    expect(screen.getByTestId("tmv-family-size")).toHaveTextContent("1");
  });

  it("preserves the same variable id shape two Task Models can share", () => {
    const a = buildInitialDraft({
      id: "tm-a",
      taskModelVariableIds: ["tmv-bloom"],
      taskModelVariableSettings: [
        { taskModelVariableId: "tmv-bloom", required: true, allowedValues: ["analyze"] },
      ],
    });
    const b = buildInitialDraft({
      id: "tm-b",
      taskModelVariableIds: ["tmv-bloom"],
      taskModelVariableSettings: [
        { taskModelVariableId: "tmv-bloom", required: false },
      ],
    });
    expect(a.taskModelVariableIds[0]).toBe(b.taskModelVariableIds[0]);
    expect(a.taskModelVariableSettings[0].required).not.toBe(
      b.taskModelVariableSettings[0].required
    );
  });
});
