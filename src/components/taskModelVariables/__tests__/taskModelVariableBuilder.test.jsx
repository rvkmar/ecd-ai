// D117 create + D118 consumers-before-edit / valueSet read-only.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
  useCreateTaskModelVariable: vi.fn(),
  useUpdateTaskModelVariable: vi.fn(),
  useDeleteTaskModelVariable: vi.fn(),
}));

vi.mock("@/api/queries/taskModels", () => ({
  useTaskModels: vi.fn(),
}));

import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useUpdateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import TaskModelVariableBuilder, {
  TaskModelVariableLibraryView,
  consumersForVariable,
} from "../TaskModelVariableBuilder";

const BLOOM_VAR = {
  id: "tmv-bloom",
  name: "Bloom depth",
  type: "categorical",
  valueSet: "bloomLevel",
};

const TASK_MODELS = [
  {
    id: "tm1",
    name: "Fractions Form A",
    status: "draft",
    taskModelVariableIds: ["tmv-bloom"],
  },
  {
    id: "tm2",
    name: "Fractions Form B",
    status: "confirmed",
    taskModelVariableIds: ["tmv-bloom"],
  },
  { id: "tm3", name: "Unrelated", taskModelVariableIds: [] },
];

describe("consumersForVariable", () => {
  it("returns Task Models that list the variable id", () => {
    expect(consumersForVariable(TASK_MODELS, "tmv-bloom").map((t) => t.id)).toEqual([
      "tm1",
      "tm2",
    ]);
  });
});

describe("TaskModelVariableLibraryView (D118)", () => {
  it("shows consumers on the row before edit", () => {
    render(
      <TaskModelVariableLibraryView
        variables={[BLOOM_VAR]}
        taskModels={TASK_MODELS}
      />
    );
    expect(screen.getByTestId("tmv-consumers-tmv-bloom")).toHaveTextContent(
      "Fractions Form A, Fractions Form B"
    );
  });

  it("lists consumers and locks vocabulary levels when editing a valueSet variable", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue({});
    render(
      <TaskModelVariableLibraryView
        variables={[BLOOM_VAR]}
        taskModels={TASK_MODELS}
        onUpdate={onUpdate}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent(
      "Fractions Form A"
    );
    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent(
      "Fractions Form B"
    );
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent(
      "read-only"
    );
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent(
      "ecdVocabulary.js"
    );
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent(
      "analyze"
    );

    await user.clear(screen.getByLabelText(/^Name$/i));
    await user.type(screen.getByLabelText(/^Name$/i), "Bloom depth (renamed)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onUpdate).toHaveBeenCalledWith({
      id: "tmv-bloom",
      payload: expect.objectContaining({
        name: "Bloom depth (renamed)",
        type: "categorical",
        valueSet: "bloomLevel",
      }),
    });
    expect(onUpdate.mock.calls[0][0].payload.possibleValues).toBeUndefined();
  });

  it("refuses delete when consumers exist and names them", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <TaskModelVariableLibraryView
        variables={[BLOOM_VAR]}
        taskModels={TASK_MODELS}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Fractions Form A")
    );
  });
});

describe("TaskModelVariableBuilder (D117 create)", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "tmv1", name: "Bloom depth" });
    useTaskModelVariables.mockReturnValue({ data: [], isLoading: false });
    useTaskModels.mockReturnValue({ data: [] });
    useCreateTaskModelVariable.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useUpdateTaskModelVariable.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useDeleteTaskModelVariable.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("posts a categorical valueSet record (no status field)", async () => {
    const user = userEvent.setup();
    render(<TaskModelVariableBuilder />);

    await user.type(screen.getByLabelText(/^Name$/i), "Bloom depth");
    await user.click(
      screen.getByRole("button", { name: "Create Task Model Variable" })
    );

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bloom depth",
        type: "categorical",
        valueSet: "bloomLevel",
      })
    );
    expect(mutateAsync.mock.calls[0][0].status).toBeUndefined();
  });
});
