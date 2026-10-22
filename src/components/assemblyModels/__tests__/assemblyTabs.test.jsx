import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  useAssemblyModels,
  useAssemblyModel,
  useCreateAssemblyModel,
  useUpdateAssemblyModel,
  useTransitionAssemblyModel,
  useDeleteAssemblyModel,
} from "@/api/queries/assemblyModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { usePolicies } from "@/api/queries/policies";
import AssemblyModelBuilder from "../AssemblyModelBuilder";
import {
  assemblyModels,
  competencyModels,
  policies,
  readyDraft,
  thinDraft,
} from "./assemblyTabFixture";

vi.mock("@/api/queries/assemblyModels", () => ({
  useAssemblyModels: vi.fn(),
  useAssemblyModel: vi.fn(),
  useCreateAssemblyModel: vi.fn(),
  useUpdateAssemblyModel: vi.fn(),
  useTransitionAssemblyModel: vi.fn(),
  useDeleteAssemblyModel: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: vi.fn(),
}));
vi.mock("@/api/queries/policies", () => ({
  usePolicies: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=assembly") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AssemblyModelBuilder />
    </MemoryRouter>
  );
}

function nameField() {
  return screen.getByPlaceholderText(/Fractions Diagnostic Assembly Model/);
}

describe("Assembly Model three-tab shell", () => {
  beforeEach(() => {
    useAssemblyModels.mockReturnValue(query(assemblyModels));
    useAssemblyModel.mockImplementation((id) => query(assemblyModels.find((row) => row.id === id)));
    useCompetencyModels.mockReturnValue(query(competencyModels));
    usePolicies.mockReturnValue(query(policies));
    useCreateAssemblyModel.mockReturnValue(idleMutation());
    useUpdateAssemblyModel.mockReturnValue(idleMutation());
    useTransitionAssemblyModel.mockReturnValue(idleMutation());
    useDeleteAssemblyModel.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assembly Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Assembly Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Assembly Model Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Assembly Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Assembly Structure" }));
    expect(screen.getByRole("heading", { name: "Assembly Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assembly Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Assembly Models" }));
    expect(screen.getByRole("heading", { name: "Manage Assembly Models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Assembly Model" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant part naming assembly/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Assembly Model Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused assembly model loaded", async () => {
    renderBuilder(`/admin?tab=assembly&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Assembly Models" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Assembly Model Dashboard" })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    const combo = screen.getByRole("combobox");
    expect(combo.textContent).toContain("Plant part naming");
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("treats id and assemblyModelId on the URL as the same deep link", async () => {
    const { unmount } = renderBuilder(`/admin?tab=assembly&id=${readyDraft.id}`);
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    unmount();

    renderBuilder(`/admin?tab=assembly&assemblyModelId=${thinDraft.id}`);
    expect(await screen.findByDisplayValue(thinDraft.name)).toBeInTheDocument();
  });

  it("opens the existing wizard from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Assembly Models" }));
    await user.click(screen.getByRole("button", { name: "New Assembly Model" }));

    expect(nameField()).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Assembly Models" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Identity" })).not.toBeInTheDocument();
  });

  it("edits, duplicates, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    useDeleteAssemblyModel.mockReturnValue({ mutateAsync: remove, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Assembly Models" }));

    await user.click(screen.getByRole("button", { name: /Plant part naming assembly/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByDisplayValue(readyDraft.name)).toBeInTheDocument();
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Unfinished assembly/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(nameField()).toHaveValue("Unfinished assembly copy");
    expect(screen.getByRole("combobox").textContent).toContain("Select a Student Model");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Reviewed assembly/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(nameField()).toHaveValue("Reviewed assembly copy");
    expect(screen.getByRole("combobox").textContent).toContain("Plant part naming");

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Fraction assembly/ }));
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Unfinished assembly/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("am-thin");
  });

  it("filters by status and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Assembly Models" }));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "confirmed"
    );
    expect(screen.getByRole("button", { name: /Fraction assembly/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant part naming assembly/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Live fraction assembly/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "operational"
    );
    expect(screen.getByRole("button", { name: /Live fraction assembly/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction assembly/ })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by lifecycle status" }),
      "all"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by readiness" }),
      "not-ready"
    );
    expect(screen.getByRole("button", { name: /Unfinished assembly/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant part naming assembly/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reviewed assembly/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fraction assembly/ })).not.toBeInTheDocument();
  });
});
