import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  useRubrics,
  useCreateRubric,
  useUpdateRubric,
  useConfirmRubric,
  useDeleteRubric,
} from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import RubricBuilder from "../RubricBuilder";
import { uniqueRubricCopyName } from "../rubricUsage";
import {
  designPatterns,
  evidenceModels,
  plantFunction,
  rubrics,
} from "./rubricTabFixture";

vi.mock("@/api/queries/rubrics", () => ({
  useRubrics: vi.fn(),
  useCreateRubric: vi.fn(),
  useUpdateRubric: vi.fn(),
  useConfirmRubric: vi.fn(),
  useDeleteRubric: vi.fn(),
}));
vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=rubrics") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RubricBuilder />
    </MemoryRouter>
  );
}

describe("uniqueRubricCopyName", () => {
  it("uses (copy) and then a number, ignoring case", () => {
    expect(uniqueRubricCopyName("Plant function judgement", [])).toBe(
      "Plant function judgement (copy)"
    );
    expect(
      uniqueRubricCopyName("Plant function judgement", [
        { name: "plant function judgement (copy)" },
      ])
    ).toBe("Plant function judgement (copy 2)");
    expect(
      uniqueRubricCopyName("Solve steps", [{ name: "SOLVE STEPS (COPY)" }])
    ).toBe("Solve steps (copy 2)");
    expect(
      uniqueRubricCopyName("Plant function judgement", [
        { name: "Plant function judgement (copy)" },
        { name: "Plant function judgement (copy 2)" },
      ])
    ).toBe("Plant function judgement (copy 3)");
  });
});

describe("Rubric three-tab shell", () => {
  beforeEach(() => {
    useRubrics.mockReturnValue(query(rubrics));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
    useCreateRubric.mockReturnValue(idleMutation());
    useUpdateRubric.mockReturnValue(idleMutation());
    useConfirmRubric.mockReturnValue(idleMutation());
    useDeleteRubric.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rubric Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Rubrics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Rubric Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rubric Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rubric Structure" }));
    expect(screen.getByRole("heading", { name: "Rubric Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rubric Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));
    expect(screen.getByRole("heading", { name: "Manage Rubrics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Rubric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant function judgement Ready/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by lifecycle status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by readiness" })).toBeInTheDocument();
  });

  it("opens Manage with the focused rubric loaded from focus or id", () => {
    const { unmount } = renderBuilder(`/admin?tab=rubrics&focus=${plantFunction.id}`);

    expect(screen.getByRole("button", { name: "Manage Rubrics" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Rubric Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue(plantFunction.name);
    expect(screen.getByTestId("rubric-consumers-before-edit")).toHaveTextContent(
      "Part function evidence"
    );
    expect(screen.getByTestId("rubric-consumers-before-edit")).toHaveTextContent(
      "Explain a labelled diagram"
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();

    unmount();
    renderBuilder(`/admin?tab=rubrics&id=${plantFunction.id}`);
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue(plantFunction.name);
    expect(screen.getByTestId("rubric-consumers-before-edit")).toHaveTextContent(
      "Part function evidence"
    );
  });

  it("opens the form from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));
    await user.click(screen.getByRole("button", { name: "New Rubric" }));

    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a first draft" })).toBeDisabled();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("");
    expect(screen.getByRole("columnheader", { name: "Low" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "High" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Rubrics" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
  });

  it("edits, confirms a draft, duplicates as a draft, and deletes an unused rubric", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    const create = vi.fn().mockResolvedValue({ id: "rub-new" });
    const update = vi.fn().mockResolvedValue({ id: "rub-bare" });
    const confirm = vi.fn().mockResolvedValue({ id: "rub-bare", status: "confirmed" });
    useDeleteRubric.mockReturnValue({ mutateAsync: remove, isPending: false });
    useCreateRubric.mockReturnValue({ mutateAsync: create, isPending: false });
    useUpdateRubric.mockReturnValue({ mutateAsync: update, isPending: false });
    useConfirmRubric.mockReturnValue({ mutateAsync: confirm, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));

    await user.click(screen.getByRole("button", { name: /Plant function judgement Ready/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Plant function judgement");
    expect(screen.getByLabelText("Function match High")).toHaveValue(
      "The student says a leaf makes food for the plant."
    );

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Levels only/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(update).toHaveBeenCalledWith({
      id: "rub-bare",
      payload: expect.objectContaining({ name: "Levels only", status: "draft" }),
    });
    expect(confirm).toHaveBeenCalledWith("rub-bare");

    await user.click(screen.getByRole("button", { name: /Plant function judgement Ready/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Plant function judgement (copy 2)");
    expect(screen.getByRole("button", { name: "Create draft" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Plant function judgement (copy 2)",
        status: "draft",
      })
    );
    expect(create.mock.calls[0][0].id).toBeUndefined();
    expect(create.mock.calls[0][0].dimensions[0].id).toBe("function-match");
    expect(create.mock.calls[0][0].dimensions[0].levels).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Started only/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("rub-thin");
    expect(remove).not.toHaveBeenCalledWith("rub-function");
  });

  it("duplicates every level of a four-level rubric", async () => {
    const user = userEvent.setup({ delay: null });
    const create = vi.fn().mockResolvedValue({ id: "rub-new" });
    useCreateRubric.mockReturnValue({ mutateAsync: create, isPending: false });
    const wide = {
      id: "rub-wide",
      name: "Four band judgement",
      description: "Four bands.",
      status: "confirmed",
      dimensions: [
        {
          id: "bands",
          name: "Bands",
          activatesAt: 2,
          levels: [0, 1, 2, 3].map((value) => ({
            value,
            label: `Band ${value}`,
            descriptor: `Sentence ${value}`,
            exemplar: `Sentence ${value}`,
          })),
        },
      ],
    };
    useRubrics.mockReturnValue(query([wide]));
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));
    await user.click(screen.getByRole("button", { name: /Four band judgement/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Four band judgement (copy)");
    expect(screen.getByLabelText("Level 4 label")).toHaveValue("Band 3");
    expect(screen.getByLabelText("Bands Band 3")).toHaveValue("Sentence 3");
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    const payload = create.mock.calls[0][0];
    expect(payload.status).toBe("draft");
    expect(payload.id).toBeUndefined();
    expect(payload.dimensions[0].levels).toHaveLength(4);
    expect(payload.dimensions[0].levels.map((level) => level.label)).toEqual([
      "Band 0",
      "Band 1",
      "Band 2",
      "Band 3",
    ]);
    expect(payload.dimensions[0].levels[3].exemplar).toBe("Sentence 3");
    expect(payload.dimensions[0].activatesAt).toBe(2);
  });

  it("keeps Delete disabled for a phase citation and a design-pattern citation", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));

    await user.click(screen.getByRole("button", { name: /Phase only judgement/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Phase only judgement/ }));
    await user.click(screen.getByRole("button", { name: /Pattern only judgement/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("filters by status and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "confirmed"
    );
    expect(screen.getByRole("button", { name: /Plant function judgement Ready/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction equivalence judgement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Started only/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "all"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by readiness" }),
      "not-ready"
    );
    expect(screen.getByRole("button", { name: /Started only/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant function judgement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Levels only/ })).not.toBeInTheDocument();
  });

  it("shows the empty manage message when the library has no records", async () => {
    const user = userEvent.setup({ delay: null });
    useRubrics.mockReturnValue(query([]));
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Rubrics" }));
    expect(screen.getByText("No Rubrics defined yet.")).toBeInTheDocument();
  });
});
