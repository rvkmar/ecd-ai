import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompetencyModelList from "../CompetencyModelList.jsx";

const confirmed = {
  id: "cm1",
  name: "Diagnostic Walk",
  status: "confirmed",
  locked: true,
  versionNumber: 1,
  updatedAt: "2026-09-15T00:00:00.000Z",
};

const archived = {
  ...confirmed,
  status: "archived",
};

describe("CompetencyModelList archive affordance", () => {
  it("shows an Archive button and Confirmed badge on a confirmed model", async () => {
    render(<CompetencyModelList models={[confirmed]} />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Diagnostic Walk/));
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("shows an Archived badge and no Archive button after archival", async () => {
    render(<CompetencyModelList models={[archived]} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).toBeNull();
    await userEvent.click(screen.getByText(/Diagnostic Walk/));
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clone" })).toBeNull();
  });
});
