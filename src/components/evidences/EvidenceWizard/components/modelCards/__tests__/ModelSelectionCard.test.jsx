import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModelSelectionCard from "../ModelSelectionCard.jsx";

const meta = {
  type: "irt",
  label: "IRT",
  description: "Item response theory",
  family: "continuous",
  complexity: "medium",
};

describe("ModelSelectionCard (D73 F-A3)", () => {
  it("is a keyboard-operable button, not a click-only div", async () => {
    const onSelect = vi.fn();
    render(
      <ModelSelectionCard
        modelMeta={meta}
        selected={false}
        onSelect={onSelect}
        locked={false}
      />
    );
    const card = screen.getByRole("button", { name: /IRT/ });
    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("irt");
  });
});
