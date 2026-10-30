// D117 create + D118 consumers-before-edit / valueSet read-only.
// The library view is the create and edit form. The three-tab shell
// covers Dashboard, Structure, and Manage.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

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

vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
}));

vi.mock("@/api/queries/taskSpecs", () => ({
  useTaskSpecs: vi.fn(),
}));

import {
  useTaskModelVariables,
  useCreateTaskModelVariable,
  useUpdateTaskModelVariable,
  useDeleteTaskModelVariable,
} from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useTaskSpecs } from "@/api/queries/taskSpecs";
import TaskModelVariableBuilder, {
  TaskModelVariableLibraryView,
  consumersForVariable,
  isVariableInUse,
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

const PATTERNS = [
  {
    id: "dp1",
    name: "Name a plant part",
    variableFeatures: [{ label: "Bloom depth", taskModelVariableId: "tmv-bloom" }],
  },
];

describe("consumersForVariable", () => {
  it("returns Task Models that list the variable id", () => {
    expect(consumersForVariable(TASK_MODELS, "tmv-bloom").map((t) => t.id)).toEqual([
      "tm1",
      "tm2",
    ]);
  });
});

describe("isVariableInUse", () => {
  it("is true for a task model citation or a design pattern citation", () => {
    expect(isVariableInUse(BLOOM_VAR, { taskModels: TASK_MODELS, designPatterns: [] })).toBe(true);
    expect(
      isVariableInUse(
        { id: "tmv-only-pattern", name: "Only a pattern" },
        { taskModels: [], designPatterns: PATTERNS }
      )
    ).toBe(false);
    expect(
      isVariableInUse(BLOOM_VAR, {
        taskModels: [],
        designPatterns: PATTERNS,
      })
    ).toBe(true);
    expect(isVariableInUse({ id: "tmv-free", name: "Free" }, { taskModels: [], designPatterns: [] })).toBe(
      false
    );
  });
});

describe("TaskModelVariableLibraryView (D118)", () => {
  it("lists consumers and locks vocabulary levels when editing a valueSet variable", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue({});
    render(
      <TaskModelVariableLibraryView
        variables={[BLOOM_VAR]}
        taskModels={TASK_MODELS}
        designPatterns={PATTERNS}
        focusId="tmv-bloom"
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent("Fractions Form A");
    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent("Fractions Form B");
    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent("Name a plant part");
    expect(screen.getByTestId("tmv-consumers-before-edit")).toHaveTextContent(
      "Saving is checked against the Task Models"
    );
    expect(screen.getByLabelText(/^Type$/i)).toBeDisabled();
    expect(screen.queryByLabelText(/Value set/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent("read-only");
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent("ecdVocabulary.js");
    expect(screen.getByTestId("tmv-valueset-readonly")).toHaveTextContent("analyze");

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
});

describe("TaskModelVariableBuilder (D117 create)", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "tmv1", name: "Bloom depth" });
    useTaskModelVariables.mockReturnValue({ data: [], isLoading: false, error: null });
    useTaskModels.mockReturnValue({ data: [], isLoading: false, error: null });
    useDesignPatterns.mockReturnValue({ data: [], isLoading: false, error: null });
    useDomainAnalyses.mockReturnValue({ data: [], isLoading: false, error: null });
    useTaskSpecs.mockReturnValue({ data: [], isLoading: false, error: null });
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
    render(
      <MemoryRouter>
        <TaskModelVariableBuilder />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Manage Task Model Variables" }));
    await user.click(screen.getByRole("button", { name: "New Task Model Variable" }));
    await user.type(screen.getByLabelText(/^Name$/i), "Bloom depth");
    await user.click(screen.getByRole("button", { name: "Create Task Model Variable" }));

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
