// D81 — reference chart proving shared recharts chrome + mandatory stamp.

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import PsychometricFigure from "./PsychometricFigure";
import {
  chartAxisProps,
  chartColor,
  chartContainerMin,
  chartGridProps,
  chartLegendWrapperStyle,
  chartTooltipContentStyle,
  seriesStrokeDasharray,
} from "./chartTheme";

const DEFAULT_SERIES = [
  { theta: -2, information: 0.35, sem: 1.7 },
  { theta: -1, information: 0.85, sem: 1.1 },
  { theta: 0, information: 1.4, sem: 0.85 },
  { theta: 1, information: 0.9, sem: 1.05 },
  { theta: 2, information: 0.4, sem: 1.6 },
];

/**
 * Synthetic test-information style line chart. Not a live artefact view —
 * documents the block's chart system for Storybook and compose tests.
 */
export default function ReferenceInformationChart({
  provenance,
  data = DEFAULT_SERIES,
  title = "Reference test information",
  description = "Shared W17 chart chrome (recharts + token colours + patterned series).",
}) {
  return (
    <PsychometricFigure
      provenance={provenance}
      title={title}
      description={description}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          {...chartContainerMin}
        >
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis
              dataKey="theta"
              label={{
                value: "θ",
                position: "insideBottomRight",
                offset: -2,
                fill: "hsl(var(--muted-foreground))",
                fontSize: 12,
              }}
              {...chartAxisProps}
            />
            <YAxis {...chartAxisProps} />
            <Tooltip contentStyle={chartTooltipContentStyle} />
            <Legend wrapperStyle={chartLegendWrapperStyle} />
            <Line
              type="monotone"
              dataKey="information"
              name="I(θ)"
              stroke={chartColor(0)}
              strokeWidth={2}
              strokeDasharray={seriesStrokeDasharray(0)}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="sem"
              name="SEM"
              stroke={chartColor(1)}
              strokeWidth={2}
              strokeDasharray={seriesStrokeDasharray(1)}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </PsychometricFigure>
  );
}
