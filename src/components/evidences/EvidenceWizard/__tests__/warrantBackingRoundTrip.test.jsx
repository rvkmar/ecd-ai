import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import WarrantBuilder from "../components/WarrantBuilder";
import AlternativeExplanationsEditor from "../components/AlternativeExplanationsEditor";
import { EvidenceWizardProvider, useEvidenceWizardContext } from "../EvidenceWizardContext";
import { persistWarrantBacking } from "@/utils/evidenceArgument";
import { validateEntity } from "@/utils/schema.js";

const competency = {
  id: "c1",
  name: "Names the part",
  modelId: "cm1",
  facet: "Plant-part naming",
  variableType: "binary",
  states: [{ value: "non-mastery" }, { value: "mastery" }],
};

const competencyModel = {
  id: "cm1",
  name: "Plant structure",
  status: "confirmed",
  locked: true,
  versionNumber: 1,
  constructFramework: { reference: "Grade 10 plant-part curriculum" },
};

describe("WarrantBuilder backing round-trip", () => {
  it("keeps the builder backing on the warrant that is saved", async () => {
    const user = userEvent.setup();
    const created = [];

    render(
      <WarrantBuilder
        claimText="The student can identify the called-out plant part."
        competency={competency}
        competencyModel={competencyModel}
        onCreate={(warrant) => created.push(warrant)}
      />
    );

    await user.click(screen.getByRole("button", { name: "Show Builder" }));
    const useButtons = await screen.findAllByRole("button", { name: "Use" });
    await user.click(useButtons[0]);
    await user.click(screen.getByRole("button", { name: "Add Warrant" }));

    expect(created).toHaveLength(1);
    expect(created[0].backingEvidence).toBeTruthy();
    expect(created[0].backing).toBe(created[0].backingEvidence);

    const persisted = persistWarrantBacking(created[0]);
    const reviewed = {
      id: "em1",
      competencyId: "c1",
      claimStatement:
        "The student can name the called-out plant part on a familiar diagram well enough to support a mastery claim.",
      status: "reviewed",
      warrants: [persisted],
      fairnessNotes:
        "Diagram vocabulary is introduced first. Residual language risk is accepted for this grade.",
    };
    const result = validateEntity(
      "evidenceModels",
      reviewed,
      {
        competencies: [competency],
        competencyModels: [competencyModel],
        evidenceModels: [{ ...reviewed, status: "draft" }],
      },
      { strict: false }
    );
    expect(result.errors.filter((message) => /backing/i.test(message))).toEqual([]);
    expect(persisted.backing).toBe(created[0].backing);
  });
});

function Probe() {
  const { draftModel } = useEvidenceWizardContext();
  return <pre data-testid="probe">{JSON.stringify(draftModel.alternativeExplanations || [])}</pre>;
}

describe("alternative explanations editor", () => {
  it("lets an author add text, a KSA, and what addresses the explanation", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <EvidenceWizardProvider
          initialModel={{
            id: "em1",
            name: "Part naming",
            competencyId: "c1",
            status: "draft",
            claimStatement:
              "The student can name the called-out plant part on a familiar diagram well enough to support a mastery claim.",
            warrants: [],
            observables: [{ id: "obs1", statement: "Selects the called-out part." }],
          }}
          competencies={[competency]}
          competencyModels={[competencyModel]}
        >
          <AlternativeExplanationsEditor
            patterns={[
              {
                id: "dp1",
                name: "Name a plant part",
                additionalKsas: [{ label: "Diagram conventions" }],
              },
            ]}
            taskModelVariables={[{ id: "tmv-diagram", name: "Plant diagram" }]}
          />
          <Probe />
        </EvidenceWizardProvider>
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "Add explanation" }));
    await user.type(screen.getByLabelText("Text"), "The student matched a memorised label.");
    await user.selectOptions(screen.getByLabelText("Additional KSA"), "dp1:Diagram conventions");
    await user.selectOptions(screen.getByLabelText("Addressed by"), "obs1");

    const saved = JSON.parse(screen.getByTestId("probe").textContent);
    expect(saved).toEqual([
      {
        text: "The student matched a memorised label.",
        additionalKsaRef: "dp1:Diagram conventions",
        addressedBy: "obs1",
      },
    ]);
  });
});
