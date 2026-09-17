import type { Meta, StoryObj } from "@storybook/react-vite";
import ItemAnalysisCharts from "../ItemAnalysisCharts";
import { itemRowsFromArtefact } from "../itemAnalysisFlags";

const artefact = {
  payload: {
    parameters: {
      "Item.1": { pValue: 0.55, pointBiserial: 0.32, n: 200, distractors: null },
      "Item.2": { pValue: 0.12, pointBiserial: 0.28, n: 200, distractors: null },
      "Item.3": { pValue: 0.92, pointBiserial: 0.05, n: 200, distractors: null },
    },
  },
};

const meta: Meta<typeof ItemAnalysisCharts> = {
  title: "Psychometrics/ItemAnalysisCharts",
  component: ItemAnalysisCharts,
  args: {
    provenance: {
      jobId: "job-d82-story",
      packageVersion: "TAM 4.3.25",
      sampleSize: 200,
      computedAt: "2026-09-17T00:00:00.000Z",
      evidenceModelId: "em-ctt",
    },
    rows: itemRowsFromArtefact(artefact),
  },
};
export default meta;
type Story = StoryObj<typeof ItemAnalysisCharts>;

export const Default: Story = {};
