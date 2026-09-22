// D117 — library panel can create a Task Model Variable without a CAF status.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/queries/taskModelVariables", () => ({
  useTaskModelVariables: vi.fn(),
  useCreateTaskModelVariable: vi.fn(),
  useDeleteTaskModelVariable: vi.fn(),
}));

import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import TaskModelVariableBuilder from "../TaskModelVariableBuilder";

describe("TaskModelVariableBuilder (D117)", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "tmv1", name: "Bloom depth" });
    useTaskModelVariables.mockReturnValue({ data: [], isLoading: false });
    useCreateTaskModelVariable.mockReturnValue({
      mutateAsync,
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
