// D51 -- Q-matrix grid: rendering and toggle behavior.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QMatrixGrid from "../QMatrixGrid";

const attributes = [
  { id: "a1", label: "Fraction Addition" },
  { id: "a2", label: "Common Denominators" },
];
const items = [{ id: "i1" }, { id: "i2", metadata: { subject: "Math" } }];

describe("QMatrixGrid", () => {
  it("renders a message instead of a table when there are no items", () => {
    render(<QMatrixGrid attributes={attributes} items={[]} entries={[]} />);
    expect(screen.getByText(/no items added yet/i)).toBeInTheDocument();
  });

  it("renders one checkbox per item x attribute cell", () => {
    render(<QMatrixGrid attributes={attributes} items={items} entries={[]} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(items.length * attributes.length);
    screen.getAllByRole("checkbox").forEach((cb) => {
      expect(cb.className).toMatch(/h-6/);
      expect(cb.className).toMatch(/w-6/);
    });
  });

  it("reflects entries as checked and calls onToggleCell on click", () => {
    const onToggleCell = vi.fn();
    render(
      <QMatrixGrid
        attributes={attributes}
        items={items}
        entries={[{ itemId: "i1", attributeId: "a1" }]}
        onToggleCell={onToggleCell}
      />
    );
    const checkbox = screen.getByLabelText("i1 requires Fraction Addition");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(onToggleCell).toHaveBeenCalledWith("i1", "a1");
  });

  it("disables checkboxes and hides the remove column when readOnly", () => {
    render(
      <QMatrixGrid attributes={attributes} items={items} entries={[]} readOnly />
    );
    screen.getAllByRole("checkbox").forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.queryByLabelText(/remove i1 from q-matrix/i)).not.toBeInTheDocument();
  });

  it("calls onRemoveItem when the remove control is clicked", () => {
    const onRemoveItem = vi.fn();
    render(
      <QMatrixGrid
        attributes={attributes}
        items={items}
        entries={[]}
        onRemoveItem={onRemoveItem}
      />
    );
    fireEvent.click(screen.getByLabelText(/remove i1 from q-matrix/i));
    expect(onRemoveItem).toHaveBeenCalledWith("i1");
  });

  it("highlights a row named in rowErrors", () => {
    const { container } = render(
      <QMatrixGrid
        attributes={attributes}
        items={items}
        entries={[]}
        rowErrors={[{ code: "empty-row", itemId: "i1" }]}
      />
    );
    const row = screen.getByText("i1").closest("tr");
    expect(row.className).toMatch(/bg-red-50/);
    const otherRow = container.querySelector("tbody tr:nth-child(2)");
    expect(otherRow.className).not.toMatch(/bg-red-50/);
  });
});
