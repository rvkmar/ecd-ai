// D53. UI spec §6 item 2: "It has a Storybook story exercising light and
// dark."
//
// The stories drive `DINAConfigPanelView`, the pure half, rather than the
// default-exported container: the container's whole body is two hooks, and
// a story wired to them would need a query client and an auth token to
// show anything but the empty state. Same division as D51's QMatrixGrid.

import { useState } from "react";
import { DINAConfigPanelView } from "../DINAConfigPanel";

const meta = {
  title: "Evidence Wizard/DINAConfigPanel",
  component: DINAConfigPanelView,
};
export default meta;

const competencyModel = {
  id: "cm1",
  name: "Grade 6 Fraction Diagnosis",
  smVariables: [
    { id: "a1", label: "Fraction Equivalence", type: "binary" },
    { id: "a2", label: "Common Denominators", type: "binary" },
    { id: "a3", label: "Simplification", type: "binary" },
  ],
};

const qMatrices = [
  {
    id: "qm1",
    name: "Fractions Diagnostic",
    status: "confirmed",
    competencyModelId: "cm1",
    attributeIds: ["a1", "a2", "a3"],
    entries: [
      { itemId: "item-101", attributeId: "a1" },
      { itemId: "item-102", attributeId: "a1" },
      { itemId: "item-102", attributeId: "a2" },
      { itemId: "item-103", attributeId: "a3" },
    ],
  },
  {
    id: "qm2",
    name: "Fractions Diagnostic (revision)",
    status: "draft",
    competencyModelId: "cm1",
    attributeIds: ["a1", "a2"],
    entries: [{ itemId: "item-101", attributeId: "a1" }],
  },
];

function Stateful({ initialQMatrixId = "", ...rest }) {
  const [structureConfig, setStructureConfig] = useState({
    observableIds: ["obs-1"],
    qMatrixId: initialQMatrixId,
  });

  return (
    <DINAConfigPanelView
      model={{ id: "sm1", type: "dina", structureConfig }}
      competencyModel={competencyModel}
      qMatrices={qMatrices}
      onChange={setStructureConfig}
      {...rest}
    />
  );
}

/* Nothing bound yet: the Combobox, and no derived sections at all. */
export const Unbound = {
  render: () => <Stateful />,
};

/* The ordinary working state — binding chosen, attributes derived. */
export const Bound = {
  render: () => <Stateful initialQMatrixId="qm1" />,
};

/* A trait perspective stored on the Student Model while a diagnostic model
   is selected. Advisory, never blocking. */
export const TraitPerspectiveAdvisory = {
  render: () => (
    <DINAConfigPanelView
      model={{ id: "sm1", type: "gdina", structureConfig: { qMatrixId: "qm1" } }}
      competencyModel={{ ...competencyModel, psychologicalPerspective: "trait" }}
      qMatrices={qMatrices}
      onChange={() => {}}
    />
  ),
};

/* A Q-matrix that has drifted off binary SMVs. The server refuses this on
   confirm; the panel's job is to show WHICH attribute, so the refusal is
   actionable. */
export const DriftedAttribute = {
  render: () => (
    <DINAConfigPanelView
      model={{ id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm-drift" } }}
      competencyModel={{
        ...competencyModel,
        smVariables: [
          ...competencyModel.smVariables,
          { id: "a4", label: "Overall Proficiency", type: "continuous" },
        ],
      }}
      qMatrices={[
        {
          id: "qm-drift",
          name: "Drifted",
          status: "draft",
          competencyModelId: "cm1",
          attributeIds: ["a1", "a4"],
          entries: [{ itemId: "item-101", attributeId: "a1" }],
        },
      ]}
      onChange={() => {}}
    />
  ),
};

/* No Q-matrix for this competency model yet — the state an author hits
   first, so it has to say what to do rather than sit blank. */
export const NoQMatrixYet = {
  render: () => (
    <DINAConfigPanelView
      model={{ id: "sm1", type: "dina", structureConfig: {} }}
      competencyModel={competencyModel}
      qMatrices={[]}
      onChange={() => {}}
    />
  ),
};

/* A confirmed evidence model: everything readable, nothing writable. */
export const Locked = {
  render: () => <Stateful initialQMatrixId="qm1" locked />,
};
