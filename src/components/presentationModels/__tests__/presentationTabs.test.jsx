import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  usePresentationModels,
  usePresentationModel,
  useCreatePresentationModel,
  useUpdatePresentationModel,
  useTransitionPresentationModel,
  useDeletePresentationModel,
} from "@/api/queries/presentationModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { useTemplates } from "@/api/queries/templates";
import PresentationModelBuilder, { duplicatePresentationDraft } from "../PresentationModelBuilder";
import {
  presentationModels,
  readyDraft,
  reviewedModel,
  taskModels,
  templates,
  thinDraft,
} from "./presentationTabFixture";

vi.mock("@/api/queries/presentationModels", () => ({
  usePresentationModels: vi.fn(),
  usePresentationModel: vi.fn(),
  useCreatePresentationModel: vi.fn(),
  useUpdatePresentationModel: vi.fn(),
  useTransitionPresentationModel: vi.fn(),
  useDeletePresentationModel: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));
vi.mock("@/api/queries/templates", () => ({
  useTemplates: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=presentation") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PresentationModelBuilder />
    </MemoryRouter>
  );
}

function nameField() {
  return screen.getByPlaceholderText(/Fractions linear presentation/);
}

describe("Presentation Model three-tab shell", () => {
  beforeEach(() => {
    usePresentationModels.mockReturnValue(query(presentationModels));
    usePresentationModel.mockImplementation((id) =>
      query(presentationModels.find((row) => row.id === id))
    );
    useTaskModels.mockReturnValue(query(taskModels));
    useTemplates.mockReturnValue(query(templates));
    useCreatePresentationModel.mockReturnValue(idleMutation());
    useUpdatePresentationModel.mockReturnValue(idleMutation());
    useTransitionPresentationModel.mockReturnValue(idleMutation());
    useDeletePresentationModel.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Presentation Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Presentation Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Presentation Model Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Presentation Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Presentation Structure" }));
    expect(screen.getByRole("heading", { name: "Presentation Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Presentation Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Presentation Models" }));
    expect(screen.getByRole("heading", { name: "Manage Presentation Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Presentation Model" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant part presentation/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Presentation Model Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused presentation model loaded", async () => {
    renderBuilder(`/admin?tab=presentation&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Presentation Models" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Presentation Model Dashboard" })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("treats id and presentationModelId on the old and direct addresses as the same deep link", async () => {
    const { unmount } = renderBuilder(`/admin?tab=presentation&id=${readyDraft.id}`);
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    unmount();

    renderBuilder(`/admin/presentation-models?presentationModelId=${thinDraft.id}`);
    expect(await screen.findByDisplayValue(thinDraft.name)).toBeInTheDocument();
  });

  it("opens the existing wizard from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Presentation Models" }));
    await user.click(screen.getByRole("button", { name: "New Presentation Model" }));

    expect(nameField()).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Presentation Models" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Identity" })).not.toBeInTheDocument();
  });

  it("copies the overlay into a new draft without an id, status, or lock", () => {
    const seed = duplicatePresentationDraft(readyDraft);
    expect(seed.name).toBe("Plant part presentation copy");
    expect(seed.taskModelId).toBe(readyDraft.taskModelId);
    expect(seed.layout).toEqual(readyDraft.layout);
    expect(seed.conditionalDisplay).toEqual(readyDraft.conditionalDisplay);
    expect(seed.accessibility).toEqual(readyDraft.accessibility);
    expect(seed.layout).not.toBe(readyDraft.layout);
    expect(seed.id).toBeUndefined();
    expect(seed.status).toBeUndefined();
    expect(seed.locked).toBeUndefined();
    expect(seed.versionNumber).toBeUndefined();
  });

  it("edits, duplicates, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    useDeletePresentationModel.mockReturnValue({ mutateAsync: remove, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Presentation Models" }));

    await user.click(screen.getByRole("button", { name: /Plant part presentation/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Unfinished presentation/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(nameField()).toHaveValue("Unfinished presentation copy");
    expect(screen.getByRole("combobox").textContent).toContain("Select a Task Model");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Reviewed presentation/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(nameField()).toHaveValue("Reviewed presentation copy");
    expect(await screen.findByDisplayValue(reviewedModel.description)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Fraction presentation/ }));
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Unfinished presentation/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("pm-thin");
  });

  it("filters by status and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Presentation Models" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "confirmed"
    );
    expect(screen.getByRole("button", { name: /Fraction presentation/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant part presentation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Live fraction presentation/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "operational"
    );
    expect(screen.getByRole("button", { name: /Live fraction presentation/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction presentation/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "all"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by readiness" }),
      "not-ready"
    );
    expect(screen.getByRole("button", { name: /Unfinished presentation/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant part presentation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reviewed presentation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction presentation/ })).not.toBeInTheDocument();
  });
});
