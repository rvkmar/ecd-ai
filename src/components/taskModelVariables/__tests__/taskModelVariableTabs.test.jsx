import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useUpdateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import TaskModelVariableBuilder from "../TaskModelVariableBuilder";
import { uniqueTaskModelVariableCopyName } from "../taskModelVariableUsage";
import {
  bloom,
  designPatterns,
  taskModels,
  variables,
} from "./taskModelVariableTabFixture";

vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
  useCreateTaskModelVariable: vi.fn(),
  useUpdateTaskModelVariable: vi.fn(),
  useDeleteTaskModelVariable: vi.fn(),
}));
vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
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

function renderBuilder(path = "/admin?tab=taskmodelvariables") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TaskModelVariableBuilder />
    </MemoryRouter>
  );
}

describe("uniqueTaskModelVariableCopyName", () => {
  it("uses (copy) and then a number, ignoring case", () => {
    expect(uniqueTaskModelVariableCopyName("Bloom demand", [])).toBe("Bloom demand (copy)");
    expect(
      uniqueTaskModelVariableCopyName("Bloom demand", [{ name: "bloom demand (copy)" }])
    ).toBe("Bloom demand (copy 2)");
    expect(
      uniqueTaskModelVariableCopyName("Solve steps", [{ name: "SOLVE STEPS (COPY)" }])
    ).toBe("Solve steps (copy 2)");
    expect(
      uniqueTaskModelVariableCopyName("Bloom demand", [
        { name: "Bloom demand (copy)" },
        { name: "Bloom demand (copy 2)" },
      ])
    ).toBe("Bloom demand (copy 3)");
  });
});

describe("Task Model Variable three-tab shell", () => {
  beforeEach(() => {
    useTaskModelVariables.mockReturnValue(query(variables));
    useTaskModels.mockReturnValue(query(taskModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
    useCreateTaskModelVariable.mockReturnValue(idleMutation());
    useUpdateTaskModelVariable.mockReturnValue(idleMutation());
    useDeleteTaskModelVariable.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Task Model Variable Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Task Model Variables" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Task Model Variable Dashboard" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Task Model Variable Structure" }));
    expect(screen.getByRole("heading", { name: "Task Model Variable Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Task Model Variable Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));
    expect(screen.getByRole("heading", { name: "Manage Task Model Variables" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Task Model Variable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plant diagram/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Task Model Variable" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Filter by lifecycle status" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by type" })).toBeInTheDocument();
  });

  it("opens Manage with the focused variable loaded from focus or id", () => {
    const { unmount } = renderBuilder(`/admin?tab=taskmodelvariables&focus=${bloom.id}`);

    expect(screen.getByRole("button", { name: "Manage Task Model Variables" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Task Model Variable Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue(bloom.name);
    expect(screen.getByLabelText(/^Type$/i)).toBeDisabled();
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent("bloomLevel");
    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent("Plant part naming");
    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent("Name a plant part");
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();

    unmount();
    renderBuilder(`/admin?tab=taskmodelvariables&id=${bloom.id}`);
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue(bloom.name);
    expect(screen.getByTestId("tmv-valueset-readonly")).toBeInTheDocument();
  });

  it("opens the form from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));
    await user.click(screen.getByRole("button", { name: "New Task Model Variable" }));

    expect(screen.getByRole("button", { name: "Create Task Model Variable" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Type$/i)).toHaveValue("categorical");
    expect(screen.getByLabelText(/^Type$/i)).toBeEnabled();
    expect(screen.getByLabelText(/Value set/i)).toHaveValue("bloomLevel");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Task Model Variables" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Task Model Variable" })).not.toBeInTheDocument();
  });

  it("edits, duplicates with a unique name, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    const create = vi.fn().mockResolvedValue({ id: "tmv-new" });
    useDeleteTaskModelVariable.mockReturnValue({ mutateAsync: remove, isPending: false });
    useCreateTaskModelVariable.mockReturnValue({ mutateAsync: create, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));

    await user.click(screen.getByRole("button", { name: /Plant diagram/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Plant diagram");
    expect(screen.getByLabelText(/^Type$/i)).toBeDisabled();
    expect(screen.getByLabelText(/Value set/i)).toHaveValue("");
    expect(screen.getByLabelText(/Value set/i)).toBeDisabled();
    expect(screen.getByLabelText(/Possible values/i)).toHaveValue("leaf, root");

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Bloom demand Ready/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Bloom demand (copy 2)");
    expect(screen.getByLabelText(/^Type$/i)).toHaveValue("categorical");
    expect(screen.getByLabelText(/^Type$/i)).toBeEnabled();
    expect(screen.getByLabelText(/Value set/i)).toHaveValue("bloomLevel");
    expect(screen.getByLabelText(/Value set/i)).toBeEnabled();
    expect(screen.queryByTestId("tmv-valueset-readonly")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create Task Model Variable" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bloom demand (copy 2)",
        type: "categorical",
        valueSet: "bloomLevel",
      })
    );
    expect(create.mock.calls[0][0].id).toBeUndefined();
    expect(create.mock.calls[0][0].status).toBeUndefined();

    await user.click(screen.getByRole("button", { name: /Diagram familiarity/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("tmv-familiar");
    expect(remove).not.toHaveBeenCalledWith("tmv-diagram");
    expect(remove).not.toHaveBeenCalledWith("tmv-denominator");
  });

  it("filters by type and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "numeric");
    expect(screen.getByRole("button", { name: /Fraction denominator/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant diagram/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Started only/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "all");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by readiness" }), "not-ready");
    expect(screen.getByRole("button", { name: /Started only/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bloom demand/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plant diagram/ })).not.toBeInTheDocument();
  });

  it("keeps Delete disabled when only a design pattern cites the variable", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));
    await user.click(screen.getByRole("button", { name: /Fraction denominator/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("shows the worked example when Manage has no records", async () => {
    const user = userEvent.setup({ delay: null });
    useTaskModelVariables.mockReturnValue(query([]));
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));
    expect(screen.getByRole("complementary", { name: "Worked example" })).toHaveTextContent(
      "Diagram familiarity"
    );
    expect(screen.getByText("No Task Model Variables defined yet.")).toBeInTheDocument();
  });
});
