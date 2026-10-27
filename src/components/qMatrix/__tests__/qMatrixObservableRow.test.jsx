import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QMatrixEditor from "../QMatrixEditor";
import { ingredientGroupsForDesign } from "../DiagnosticDesignTable";

const fx = vi.hoisted(() => ({
  matrix: {
    id: "qm1",
    name: "Plant part Q-matrix",
    description: "",
    competencyModelId: "cm-plant",
    competencyModelVersion: 1,
    attributeIds: ["smv-names-function"],
    entries: [
      { itemId: "it-function", attributeId: "smv-names-function" },
      {
        observableId: "obs-plant-function",
        evidenceModelId: "em-function",
        attributeId: "smv-names-function",
      },
    ],
    status: "draft",
    locked: false,
  },
  competencyModels: [{
    id: "cm-plant",
    name: "Plant part naming",
    versionNumber: 1,
    smVariables: [{ id: "smv-names-function", type: "binary", label: "Names the function" }],
  }],
  competencies: [{ id: "c-function", name: "Names the function", modelId: "cm-plant" }],
  evidenceModels: [{
    id: "em-function",
    name: "Part function evidence",
    competencyId: "c-function",
    observables: [{
      id: "obs-plant-function",
      statement: "The learner selects the function of the named plant part.",
    }],
  }],
  items: [{
    id: "it-function",
    name: "Job of the leaf",
    evidenceModelId: "em-function",
    observationId: "obs-plant-function",
  }],
}));

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModel: () => ({ data: fx.matrix, isLoading: false }),
  useQMatrixModels: () => ({ data: [fx.matrix], isLoading: false }),
  useCreateQMatrixModel: () => ({ mutateAsync: vi.fn() }),
  useUpdateQMatrixModel: () => ({ mutateAsync: vi.fn() }),
  useTransitionQMatrixModel: () => ({ mutateAsync: vi.fn() }),
  useDeleteQMatrixModel: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: () => ({ data: fx.competencyModels }),
  useCompetencies: () => ({ data: fx.competencies }),
}));

vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: () => ({ data: fx.evidenceModels, isLoading: false, error: null }),
}));

vi.mock("@/api/queries/items", () => ({
  useItems: () => ({ data: fx.items }),
}));

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: () => ({ data: [], isLoading: false, error: null }),
}));

const ORIGINAL_ENTRIES = [
  { itemId: "it-function", attributeId: "smv-names-function" },
  {
    observableId: "obs-plant-function",
    evidenceModelId: "em-function",
    attributeId: "smv-names-function",
  },
];

describe("Q-matrix observable row", () => {
  afterEach(() => {
    fx.matrix.entries = ORIGINAL_ENTRIES.map((entry) => ({ ...entry }));
  });

  it("shows the observable as a row and still offers the item", () => {
    render(<QMatrixEditor qMatrixId="qm1" onCancel={vi.fn()} />);

    expect(screen.getByRole("rowheader", { name: /selects the function of the named plant part/i })).toBeInTheDocument();
    expect(screen.getByText("Part function evidence")).toBeInTheDocument();
    expect(screen.getByLabelText(/Item for The learner selects the function/)).toHaveValue("");
    expect(screen.getByRole("rowheader", { name: /it-function/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Item for The learner selects the function/ })).toBeInTheDocument();
  });

  it("lists the observable link in Ingredients View", () => {
    const groups = ingredientGroupsForDesign(fx.matrix, {
      competencyModels: fx.competencyModels,
      domainAnalyses: [],
      evidenceModels: fx.evidenceModels,
    });
    const observables = groups.find((group) => group.key === "observables");
    expect(observables.items).toHaveLength(1);
    expect(observables.items[0].primary).toBe("The learner selects the function of the named plant part.");
    expect(observables.items[0].secondary).toMatch(/Part function evidence/);
    expect(observables.items[0].secondary).toMatch(/Names the function/);
    const items = groups.find((group) => group.key === "items");
    expect(items.items.map((item) => item.primary)).toEqual(["it-function"]);
  });

  it("adds an observable from the grouped picker", async () => {
    const user = userEvent.setup();
    fx.matrix.entries = [{ itemId: "it-function", attributeId: "smv-names-function" }];
    render(<QMatrixEditor qMatrixId="qm1" onCancel={vi.fn()} />);

    await user.click(screen.getByText("+ Add observable…"));
    expect(screen.getByText("Part function evidence")).toBeInTheDocument();
    await user.click(screen.getByText("The learner selects the function of the named plant part."));
    expect(screen.getByRole("rowheader", { name: /selects the function of the named plant part/i })).toBeInTheDocument();
  });
});
