import type { Meta, StoryObj } from "@storybook/react-vite";
import ReferenceInformationChart from "../ReferenceInformationChart";

const meta: Meta<typeof ReferenceInformationChart> = {
  title: "Psychometrics/ReferenceInformationChart",
  component: ReferenceInformationChart,
  args: {
    provenance: {
      jobId: "job-d81-reference",
      packageVersion: "analytic-fisher (irtEngine parity)",
      sampleSize: 3,
      computedAt: "2026-09-17T00:00:00.000Z",
      derivedFrom: "known-2pl-testinfo fixture (reference chart)",
    },
  },
};
export default meta;
type Story = StoryObj<typeof ReferenceInformationChart>;

/** Toggle light/dark via the Storybook theme toolbar (app `.dark` class). */
export const Default: Story = {};
