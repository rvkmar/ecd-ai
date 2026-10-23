import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  useWorkProducts,
  useCreateWorkProduct,
  useUpdateWorkProduct,
  useDeleteWorkProduct,
} from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import WorkProductBuilder from "../WorkProductBuilder";
import { uniqueWorkProductCopyName } from "../workProductUsage";
import {
  designPatterns,
  evidenceModels,
  items,
  partName,
  workProducts,
} from "./workProductTabFixture";

vi.mock("@/api/queries/workProducts", () => ({
  useWorkProducts: vi.fn(),
  useCreateWorkProduct: vi.fn(),
  useUpdateWorkProduct: vi.fn(),
  useDeleteWorkProduct: vi.fn(),
}));
vi.mock("@/api/queries/items", () => ({
  useItems: vi.fn(),
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

function renderBuilder(path = "/admin?tab=workproducts") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkProductBuilder />
    </MemoryRouter>
  );
}

describe("uniqueWorkProductCopyName", () => {
  it("uses (copy) and then a number, ignoring case", () => {
    expect(uniqueWorkProductCopyName("Selected plant-part name", [])).toBe(
      "Selected plant-part name (copy)"
    );
    expect(
      uniqueWorkProductCopyName("Selected plant-part name", [
        { name: "selected plant-part name (copy)" },
      ])
    ).toBe("Selected plant-part name (copy 2)");
    expect(
      uniqueWorkProductCopyName("Solve steps", [{ name: "SOLVE STEPS (COPY)" }])
    ).toBe("Solve steps (copy 2)");
  });
});

describe("Work Product three-tab shell", () => {
  beforeEach(() => {
    useWorkProducts.mockReturnValue(query(workProducts));
    useItems.mockReturnValue(query(items));
    useEvidenceModels.mockReturnValue(query(evidenceModels));
    useDesignPatterns.mockReturnValue(query(designPatterns));
    useCreateWorkProduct.mockReturnValue(idleMutation());
    useUpdateWorkProduct.mockReturnValue(idleMutation());
    useDeleteWorkProduct.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work Product Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Work Products" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Work Product Dashboard" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Work Product Structure" }));
    expect(screen.getByRole("heading", { name: "Work Product Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work Product Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Work Products" }));
    expect(screen.getByRole("heading", { name: "Manage Work Products" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Work Product" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Selected plant-part name/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Filter by lifecycle status" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by type" })).toBeInTheDocument();
  });

  it("opens Manage with the focused work product loaded", () => {
    renderBuilder(`/admin?tab=workproducts&focus=${partName.id}`);

    expect(screen.getByRole("button", { name: "Manage Work Products" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Work Product Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue(partName.name);
    expect(screen.getByLabelText(/^Type$/i)).toHaveValue("selected_response");
    expect(screen.getByLabelText(/^Type$/i)).toBeDisabled();
    expect(screen.getByTestId("wp-consumers-before-edit")).toHaveTextContent("Leaf on the diagram");
    expect(screen.getByTestId("wp-consumers-before-edit")).toHaveTextContent("Part naming evidence");
    expect(screen.getByTestId("wp-consumers-before-edit")).toHaveTextContent("Name a plant part");
    expect(screen.getByText(/Type cannot change while items bind/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to list" })).toBeInTheDocument();
  });

  it("opens the form from New and returns to the list on Cancel", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Work Products" }));
    await user.click(screen.getByRole("button", { name: "New Work Product" }));

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Type$/i)).toHaveValue("selected_response");
    expect(screen.getByLabelText(/^Type$/i)).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Manage Work Products" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument();
  });

  it("edits, duplicates with a unique name, and deletes from the card", async () => {
    const user = userEvent.setup({ delay: null });
    const remove = vi.fn().mockResolvedValue({ success: true });
    useDeleteWorkProduct.mockReturnValue({ mutateAsync: remove, isPending: false });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Work Products" }));

    await user.click(screen.getByRole("button", { name: /Selected plant-part name/ }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Selected plant-part name");
    expect(screen.getByLabelText(/^Type$/i)).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Back to list" }));
    await user.click(screen.getByRole("button", { name: /Solve steps Ready/ }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue("Solve steps (copy 2)");
    expect(screen.getByLabelText(/^Type$/i)).toHaveValue("process_trace");
    expect(screen.getByLabelText(/^Type$/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /Started only/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("wp-thin");
    expect(remove).not.toHaveBeenCalledWith("wp-part-name");
  });

  it("filters by type and readiness", async () => {
    const user = userEvent.setup({ delay: null });
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Work Products" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "process_trace");
    expect(screen.getByRole("button", { name: /Solve steps \(copy\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Solve steps Ready/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Selected plant-part name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Started only/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "all");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by readiness" }), "not-ready");
    expect(screen.getByRole("button", { name: /Started only/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Solve steps/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Selected plant-part name/ })).not.toBeInTheDocument();
  });

  it("shows the worked example when Manage has no records", async () => {
    const user = userEvent.setup({ delay: null });
    useWorkProducts.mockReturnValue(query([]));
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Manage Work Products" }));
    expect(screen.getByRole("complementary", { name: "Worked example" })).toHaveTextContent(
      "Selected plant-part name"
    );
    expect(screen.getByText("No Work Products defined yet.")).toBeInTheDocument();
  });
});
