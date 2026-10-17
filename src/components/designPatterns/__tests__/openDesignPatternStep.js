import { screen, within } from "@testing-library/react";

/** Click a design-pattern rail step. The rail does not gate. */
export async function openDesignPatternStep(user, label) {
  const rail = screen.getByRole("navigation", { name: "Wizard steps" });
  const button = within(rail).getByRole("button", {
    name: (name) => name.includes(label),
  });
  await user.click(button);
}
