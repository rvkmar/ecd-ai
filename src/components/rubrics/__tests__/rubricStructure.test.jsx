import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRubrics } from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import RubricTable from "../RubricTable";
import { designPatterns, evidenceModels, rubrics } from "./rubricTabFixture";

vi.mock("@/api/queries/rubrics", () => ({
  useRubrics: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));

function query(data) {
  return { data, isLoading: false, error: null };
}

function rowById(id) {
  const rows = screen.getAllByRole("row");
  const row = rows.find((candidate) => {
    const cells = within(candidate).queryAllByRole("cell");
    return cells[0]?.textContent === id;
  });
  if (!row) throw new Error(`No row ${id}`);
  return within(row).getAllByRole("cell").map((cell) => cell.textContent);
}

function groupCount(card, label) {
  const button = within(card).getByRole("button", {
    name: new RegExp(`^${label}\\s+\\d`),
  });
  return within(button).getByText(/^\d+$/).textContent;
}

describe("Rubric structure", () => {
  beforeEach(() => {
    useRubrics.mockReturnValue(query(rubrics));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
  });

  it("lists status, readiness, shape, and who cites each rubric", () => {
    render(<RubricTable />);

    expect(screen.getByRole("heading", { name: "Rubric Structure" })).toBeInTheDocument();
    expect(screen.getByText(/evaluationProcedures.rubricId/)).toBeInTheDocument();
    expect(screen.getByText(/phases.rubricId/)).toBeInTheDocument();

    expect(rowById("rub-function").slice(0, 8)).toEqual([
      "rub-function",
      "Plant function judgement",
      "confirmed",
      "Ready",
      "1",
      "2",
      "1",
      "1",
    ]);
    expect(rowById("rub-equiv").slice(0, 8)).toEqual([
      "rub-equiv",
      "Fraction equivalence judgement",
      "draft",
      "Ready",
      "1",
      "2",
      "1",
      "1",
    ]);
    expect(rowById("rub-phase").slice(0, 8)).toEqual([
      "rub-phase",
      "Phase only judgement",
      "draft",
      "Ready",
      "1",
      "2",
      "1",
      "0",
    ]);
    expect(rowById("rub-thin").slice(0, 8)).toEqual([
      "rub-thin",
      "Started only",
      "draft",
      "Not ready",
      "0",
      "0",
      "0",
      "0",
    ]);
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Criteria" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Levels" })).toBeInTheDocument();
  });

  it("sorts by name and filters by a citing evidence model", async () => {
    const user = userEvent.setup({ delay: null });
    render(<RubricTable />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual([
      "Fraction equivalence judgement",
      "Levels only",
      "Pattern only judgement",
      "Phase only judgement",
      "Plant function judgement",
      "Plant function judgement (copy)",
      "Started only",
    ]);

    await user.type(screen.getByRole("textbox", { name: "Search rubrics" }), "Phase scoring");
    expect(screen.getByText("rub-phase")).toBeInTheDocument();
    expect(screen.queryByText("rub-function")).not.toBeInTheDocument();
    expect(screen.queryByText("rub-equiv")).not.toBeInTheDocument();
  });

  it("shows criteria-by-levels and both citation paths in Ingredients View", async () => {
    const user = userEvent.setup({ delay: null });
    render(<RubricTable />);
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));

    const card = screen
      .getByRole("heading", { name: "Plant function judgement" })
      .closest(".rounded-2xl");
    expect(
      within(card).getByText("Confirmed • Ready • 1 criterion • 2 levels")
    ).toBeInTheDocument();
    await user.click(within(card).getByRole("heading", { name: "Plant function judgement" }));

    const phase = screen.getByRole("heading", { name: "Phase only judgement" }).closest(".rounded-2xl");
    await user.click(within(phase).getByRole("heading", { name: "Phase only judgement" }));

    const fraction = screen
      .getByRole("heading", { name: "Fraction equivalence judgement" })
      .closest(".rounded-2xl");
    await user.click(within(fraction).getByRole("heading", { name: "Fraction equivalence judgement" }));

    const thin = screen.getByRole("heading", { name: "Started only" }).closest(".rounded-2xl");
    await user.click(within(thin).getByRole("heading", { name: "Started only" }));

    expect(groupCount(card, "Description")).toBe("1");
    expect(groupCount(card, "Criteria")).toBe("1");
    expect(groupCount(card, "Exemplars")).toBe("2");
    expect(groupCount(card, "Evidence models")).toBe("1");
    expect(groupCount(card, "Design patterns")).toBe("1");

    await user.click(within(card).getByRole("button", { name: /^Criteria\s+1/ }));
    expect(within(card).getByText("Function match")).toBeInTheDocument();
    expect(within(card).getByText(/Low, High/)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Evidence models\s+1/ }));
    expect(within(card).getByText("Part function evidence")).toBeInTheDocument();
    expect(within(card).getByText(/procedure ep-plant-fn/)).toBeInTheDocument();
    expect(within(card).getByText(/phase 1 on ep-plant-fn/)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /^Design patterns\s+1/ }));
    expect(within(card).getByText("Explain a labelled diagram")).toBeInTheDocument();

    await user.click(within(phase).getByRole("button", { name: /^Evidence models\s+1/ }));
    expect(within(phase).getByText("Phase scoring evidence")).toBeInTheDocument();
    expect(within(phase).getByText(/phase 1 on ep-phase/)).toBeInTheDocument();
    expect(within(phase).queryByText(/procedure ep-phase/)).not.toBeInTheDocument();

    await user.click(within(fraction).getByRole("button", { name: /^Evidence models\s+1/ }));
    expect(within(fraction).getByText(/procedure ep-equiv/)).toBeInTheDocument();
    expect(within(fraction).queryByText(/phase 1 on ep-equiv/)).not.toBeInTheDocument();

    expect(within(thin).getByText("Draft • Not ready • 0 criteria • 0 levels")).toBeInTheDocument();
    expect(groupCount(thin, "Criteria")).toBe("0");
    expect(groupCount(thin, "Evidence models")).toBe("0");
    expect(groupCount(thin, "Design patterns")).toBe("0");
  });
});
