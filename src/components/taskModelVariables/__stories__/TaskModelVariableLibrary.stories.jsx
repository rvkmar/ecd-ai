// D118. Storybook story for the TMV library in both themes.
// Toggle Light / Dark via the Storybook theme toolbar (preview.tsx
// toggles the app `.dark` class).

import React from "react";
import { TaskModelVariableLibraryView } from "../TaskModelVariableBuilder";

const meta = {
  title: "Task Model Variables/Library",
  component: TaskModelVariableLibraryView,
  parameters: {
    docs: {
      description: {
        component:
          "Shared Task Model Variable library. Consumers are visible before edit. Use the theme toolbar for light and dark.",
      },
    },
  },
};
export default meta;

const variables = [
  {
    id: "tmv-bloom",
    name: "Bloom depth",
    type: "categorical",
    valueSet: "bloomLevel",
  },
  {
    id: "tmv-custom",
    name: "Scenario register",
    type: "categorical",
    possibleValues: [
      { value: "formal", label: "Formal" },
      { value: "informal", label: "Informal" },
    ],
  },
];

const taskModels = [
  {
    id: "tm1",
    name: "Fractions Form A",
    status: "draft",
    taskModelVariableIds: ["tmv-bloom"],
  },
  {
    id: "tm2",
    name: "Fractions Form B",
    status: "confirmed",
    taskModelVariableIds: ["tmv-bloom", "tmv-custom"],
  },
];

/** Default list: consumers column populated for Bloom. */
export const WithConsumers = {
  render: () => (
    <TaskModelVariableLibraryView
      variables={variables}
      taskModels={taskModels}
      onCreate={async () => {}}
      onUpdate={async () => {}}
      onDelete={() => {}}
    />
  ),
};

/** Empty library — create form only. */
export const Empty = {
  render: () => (
    <TaskModelVariableLibraryView
      variables={[]}
      taskModels={[]}
      onCreate={async () => {}}
      onUpdate={async () => {}}
      onDelete={() => {}}
    />
  ),
};
