import type { Meta, StoryObj } from "@storybook/react-vite";
import TestInformationCharts from "../TestInformationCharts";
import { evaluateSemTarget } from "../testInformationCurve";

const points = [
  { theta: -2, information: 0.25, conditionalSEM: 2.0 },
  { theta: -1, information: 0.55, conditionalSEM: 1.35 },
  { theta: 0, information: 0.9, conditionalSEM: 1.05 },
  { theta: 1, information: 0.55, conditionalSEM: 1.35 },
  { theta: 2, information: 0.25, conditionalSEM: 2.0 },
];

const requiredSEM = 0.35;
const evaluation = evaluateSemTarget(points, requiredSEM);

const meta: Meta<typeof TestInformationCharts> = {
  title: "Psychometrics/TestInformationCharts",
  component: TestInformationCharts,
  args: {
    provenance: {
      jobId: "job-d83-story",
      packageVersion: "analytic-2PL Fisher",
      sampleSize: 10,
      computedAt: "2026-09-17T00:00:00.000Z",
      evidenceModelId: "em-irt",
    },
    points,
    requiredSEM,
    evaluation,
  },
};
export default meta;
type Story = StoryObj<typeof TestInformationCharts>;

export const NeverMeetsTarget: Story = {};

export const MeetsSomewhere: Story = {
  args: {
    points: [
      { theta: -1, information: 4, conditionalSEM: 0.5 },
      { theta: 0, information: 16, conditionalSEM: 0.25 },
      { theta: 1, information: 4, conditionalSEM: 0.5 },
    ],
    evaluation: evaluateSemTarget(
      [
        { theta: -1, information: 4, conditionalSEM: 0.5 },
        { theta: 0, information: 16, conditionalSEM: 0.25 },
        { theta: 1, information: 4, conditionalSEM: 0.5 },
      ],
      0.35
    ),
  },
};
