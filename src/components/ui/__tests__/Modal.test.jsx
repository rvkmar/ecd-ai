import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "../Modal.jsx";

describe("Modal (D73 F-A1)", () => {
  it("exposes a dialog name when open and is not in the tree when closed", () => {
    const { rerender } = render(
      <Modal isOpen={false} title="Finish session?" message="This cannot be undone." />
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <Modal
        isOpen
        title="Finish session?"
        message="This cannot be undone."
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByRole("dialog", { name: "Finish session?" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal
        isOpen
        title="Finish session?"
        message="This cannot be undone."
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
