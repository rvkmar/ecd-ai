import type { Meta, StoryObj } from "@storybook/react-vite";
import ProvenanceStamp from "../ProvenanceStamp";

const meta: Meta<typeof ProvenanceStamp> = {
  title: "Psychometrics/ProvenanceStamp",
  component: ProvenanceStamp,
  args: {
    provenance: {
      jobId: "job1789319022666002",
      packageVersion: "mirt 1.47",
      sampleSize: 1000,
      computedAt: "2026-09-13T12:01:00.000Z",
      parameterSetId: "ps1789319081640",
    },
  },
};
export default meta;
type Story = StoryObj<typeof ProvenanceStamp>;

export const Default: Story = {};

export const EvidenceModelSource: Story = {
  args: {
    provenance: {
      jobId: "job-attr",
      packageVersion: "node classifyAttributeProfile",
      sampleSize: 4,
      computedAt: "2026-09-16T18:00:00.000Z",
      evidenceModelId: "em-diagnostic",
    },
  },
};
