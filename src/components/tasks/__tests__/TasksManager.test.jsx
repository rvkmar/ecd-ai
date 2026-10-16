import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TasksManager from "../TasksManager";

const fx = vi.hoisted(() => ({
  taskModels: [
    {
      id: "tm-live",
      name: "Operational Fractions",
      status: "operational",
      locked: true,
    },
    {
      id: "tm-draft",
      name: "Draft Fractions",
      status: "draft",
      locked: false,
    },
  ],
  items: [
    {
      id: "itemA",
      taskModelId: "tm-live",
      status: "confirmed",
      stimulus: { blocks: [{ type: "text", content: "What is 1/2?" }] },
    },
    {
      id: "itemSuspended",
      taskModelId: "tm-live",
      status: "suspended",
      name: "Retired item",
    },
    {
      id: "itemObject",
      taskModelId: "tm-live",
      status: "confirmed",
      stimulus: {
        blocks: [{ type: "text", content: { text: "Name the part", format: "plain" } }],
      },
    },
    {
      id: "itemOther",
      taskModelId: "tm-draft",
      status: "confirmed",
      name: "Wrong TM item",
    },
  ],
  tasks: [],
}));

const mutateAsync = vi.fn();
const deleteAsync = vi.fn();

vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: () => ({ data: fx.taskModels, isLoading: false }),
}));

vi.mock("@/api/queries/items", () => ({
  useItems: () => ({ data: fx.items, isLoading: false }),
}));

vi.mock("@/api/queries/tasks", () => ({
  useTasks: () => ({ data: fx.tasks, isLoading: false }),
  useCreateTask: () => ({ mutateAsync, isPending: false }),
  useDeleteTask: () => ({ mutateAsync: deleteAsync, isPending: false }),
}));

describe("TasksManager instantiable TM + item bind (D115b)", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    deleteAsync.mockReset();
    fx.tasks = [];
  });

  it("lists only instantiable Task Models and eligible items, then POSTs both", async () => {
    const notify = vi.fn();
    mutateAsync.mockResolvedValue({
      id: "t-new",
      taskModelId: "tm-live",
      itemId: "itemA",
    });
    const user = userEvent.setup();
    render(<TasksManager notify={notify} />);

    const tmSelect = screen.getByLabelText("Task Model");
    expect(tmSelect).toHaveTextContent("Operational Fractions");
    expect(tmSelect).not.toHaveTextContent("Draft Fractions");

    await user.selectOptions(tmSelect, "tm-live");

    const itemSelect = screen.getByLabelText("Item Bank item");
    expect(itemSelect).toHaveTextContent("What is 1/2?");
    expect(itemSelect).toHaveTextContent("Name the part");
    expect(itemSelect).not.toHaveTextContent("[object Object]");
    expect(itemSelect).not.toHaveTextContent("Retired item");
    expect(itemSelect).not.toHaveTextContent("Wrong TM item");

    const submit = screen.getByRole("button", { name: "Create instantiated task" });
    expect(submit).toBeDisabled();

    await user.selectOptions(itemSelect, "itemA");
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(mutateAsync).toHaveBeenCalledWith({
      taskModelId: "tm-live",
      itemId: "itemA",
    });
    expect(notify).toHaveBeenCalledWith("Instantiated task created");
  });

  it("does not post a task-model-only payload", async () => {
    const notify = vi.fn();
    const user = userEvent.setup();
    render(<TasksManager notify={notify} />);

    await user.selectOptions(screen.getByLabelText("Task Model"), "tm-live");
    const submit = screen.getByRole("button", { name: "Create instantiated task" });
    expect(submit).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
