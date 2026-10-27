import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DeliveryModelBuilder from "../DeliveryModelBuilder";
import { uniqueDeliveryCopyName } from "../deliveryModelUsage";

const plant = {
  id: "dm-plant",
  name: "Plant part naming delivery",
  description: "One sitting.",
  status: "draft",
  competencyModelId: "cm-plant",
  assemblyModelId: "am-plant",
  policyId: "p-fixed",
  presentationModelId: "pm-plant",
  administration: {
    timeLimitMinutes: 20,
    attempts: 1,
    allowedReview: true,
    feedbackMode: "immediate",
  },
  updatedAt: "2026-01-02T00:00:00.000Z",
};

vi.mock("@/api/queries/deliveryModels", () => ({
  useDeliveryModels: vi.fn(),
  useSessionsForDeliveryModels: vi.fn(),
  useCreateDeliveryModel: vi.fn(),
  useUpdateDeliveryModel: vi.fn(),
  useConfirmDeliveryModel: vi.fn(),
  useDeleteDeliveryModel: vi.fn(),
}));
vi.mock("@/api/queries/competencies", () => ({ useCompetencyModels: vi.fn() }));
vi.mock("@/api/queries/assemblyModels", () => ({ useAssemblyModels: vi.fn() }));
vi.mock("@/api/queries/policies", () => ({ usePolicies: vi.fn() }));
vi.mock("@/api/queries/presentationModels", () => ({ usePresentationModels: vi.fn() }));

import {
  useDeliveryModels,
  useSessionsForDeliveryModels,
  useCreateDeliveryModel,
  useUpdateDeliveryModel,
  useConfirmDeliveryModel,
  useDeleteDeliveryModel,
} from "@/api/queries/deliveryModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { usePolicies } from "@/api/queries/policies";
import { usePresentationModels } from "@/api/queries/presentationModels";

function query(data) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderBuilder(path = "/admin?tab=deliverymodels") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DeliveryModelBuilder />
    </MemoryRouter>
  );
}

describe("uniqueDeliveryCopyName", () => {
  it("uses (copy) and then a number, ignoring case", () => {
    expect(uniqueDeliveryCopyName("Plant part naming delivery", [])).toBe(
      "Plant part naming delivery (copy)"
    );
    expect(
      uniqueDeliveryCopyName("Plant part naming delivery", [
        { name: "plant part naming delivery (copy)" },
      ])
    ).toBe("Plant part naming delivery (copy 2)");
  });
});

describe("Delivery model three-tab shell", () => {
  beforeEach(() => {
    useDeliveryModels.mockReturnValue(query([plant]));
    useSessionsForDeliveryModels.mockReturnValue(
      query([{ id: "s1", deliveryModelId: "dm-plant", studentId: "stud1" }])
    );
    useCompetencyModels.mockReturnValue(query([{ id: "cm-plant", name: "Plant part naming", status: "draft" }]));
    useAssemblyModels.mockReturnValue(
      query([{ id: "am-plant", name: "Plant part naming assembly", status: "draft", competencyModelId: "cm-plant" }])
    );
    usePolicies.mockReturnValue(query([{ id: "p-fixed", name: "Fixed form", type: "fixed" }]));
    usePresentationModels.mockReturnValue(
      query([{ id: "pm-plant", name: "Plant part presentation", status: "draft" }])
    );
    useCreateDeliveryModel.mockReturnValue(idleMutation());
    useUpdateDeliveryModel.mockReturnValue(idleMutation());
    useConfirmDeliveryModel.mockReturnValue(idleMutation());
    useDeleteDeliveryModel.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup();
    renderBuilder();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delivery Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Delivery Models" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delivery Model Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Total").parentElement).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Delivery Structure" }));
    expect(screen.getByRole("heading", { name: "Delivery Structure" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Plant part naming delivery" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ingredients View" }));
    await user.click(screen.getByRole("heading", { name: "Plant part naming delivery" }));
    await user.click(screen.getByRole("button", { name: /Administration/ }));
    expect(screen.getByText("Time limit: 20 minutes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage Delivery Models" }));
    expect(screen.getByRole("button", { name: "New Delivery Model" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Plant part naming delivery/ }));
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("title", "Remove citations before deleting");
  });

  it("opens Manage when focus is set, and duplicate prefills a copy name", async () => {
    const user = userEvent.setup();
    useSessionsForDeliveryModels.mockReturnValue(query([]));
    renderBuilder("/admin?tab=deliverymodels&focus=dm-plant");
    expect(screen.getByRole("heading", { name: "Edit delivery model" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Plant part naming delivery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Plant part naming delivery/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByRole("heading", { name: "New delivery model" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Plant part naming delivery (copy)")).toBeInTheDocument();
  });

  it("filters Manage by readiness", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Delivery Models" }));
    const readiness = screen.getByLabelText(/readiness/i);
    await user.selectOptions(readiness, "ready");
    expect(screen.getByText("No Delivery Models match the current filters.")).toBeInTheDocument();
    expect(within(document.body).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
