import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useDomainAnalyses, useCreateDomainAnalysis, useUpdateDomainAnalysis, useConfirmDomainAnalysis } from "@/api/queries/domainAnalyses";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import DomainAnalysisEditor from "../DomainAnalysisEditor";
import { analyses, patterns, qMatrices, readyDraft } from "./domainAnalysisTabFixture";

vi.mock("@/api/queries/domainAnalyses", () => ({
  useDomainAnalyses: vi.fn(),
  useCreateDomainAnalysis: vi.fn(),
  useUpdateDomainAnalysis: vi.fn(),
  useConfirmDomainAnalysis: vi.fn(),
}));
vi.mock("@/api/queries/designPatterns", () => ({
  useDesignPatterns: vi.fn(),
}));
vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: vi.fn(),
}));

function query(data = []) {
  return { data, isLoading: false, error: null };
}

function idleMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

function renderEditor(path = "/admin?tab=domainanalyses") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DomainAnalysisEditor />
    </MemoryRouter>
  );
}

describe("Domain Analysis three-tab shell", () => {
  beforeEach(() => {
    useDomainAnalyses.mockReturnValue(query(analyses));
    useDesignPatterns.mockReturnValue(query(patterns));
    useQMatrixModels.mockReturnValue(query(qMatrices));
    useCreateDomainAnalysis.mockReturnValue(idleMutation());
    useUpdateDomainAnalysis.mockReturnValue(idleMutation());
    useConfirmDomainAnalysis.mockReturnValue(idleMutation());
  });

  it("opens on Dashboard and switches to Structure and Manage", async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor();

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Domain Analysis Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Domain Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveClass("bg-primary");
    expect(screen.getByRole("heading", { name: "Domain Analysis Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Domain Analysis Structure" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Domain Analysis Structure" }));
    expect(screen.getByRole("heading", { name: "Domain Analysis Structure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Domain Analysis Structure" })).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Manage Domain Analysis" }));
    expect(screen.getByRole("heading", { name: "Domain Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guided setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Domain Analysis Dashboard" })).not.toBeInTheDocument();
  });

  it("opens Manage with the focused analysis loaded", () => {
    renderEditor(`/admin?tab=domainanalyses&focus=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Domain Analysis" })).toHaveClass("bg-primary");
    expect(screen.queryByRole("heading", { name: "Domain Analysis Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue(readyDraft.name);
    expect(screen.getByRole("heading", { name: "Domain Analysis" })).toBeInTheDocument();
  });

  it("treats domainAnalysisId on the URL as the same deep link", () => {
    renderEditor(`/admin?tab=domainanalyses&domainAnalysisId=${readyDraft.id}`);

    expect(screen.getByRole("button", { name: "Manage Domain Analysis" })).toHaveClass("bg-primary");
    expect(screen.getByLabelText("Name")).toHaveValue(readyDraft.name);
  });
});
