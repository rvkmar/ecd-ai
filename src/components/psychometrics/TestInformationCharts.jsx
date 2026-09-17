// D83 — I(θ) and conditional SEM charts with Assembly requiredSEM overlay.

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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

export default function TestInformationCharts({
  provenance,
  points = [],
  requiredSEM = null,
  evaluation = null,
}) {
  const hasTarget = typeof requiredSEM === "number" && Number.isFinite(requiredSEM);

  return (
    <div className="space-y-4">
      {evaluation?.status === "never-meets" ? (
        <div
          className="rounded-xl border border-amber-600/40 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="sem-never-meets"
          role="status"
        >
          <p className="font-medium">Bank cannot meet requiredSEM anywhere</p>
          <p className="mt-1 text-caption">{evaluation.message}</p>
        </div>
      ) : null}
      {evaluation?.status === "meets-somewhere" ? (
        <div
          className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
          data-testid="sem-meets-somewhere"
          role="status"
        >
          {evaluation.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PsychometricFigure
          provenance={provenance}
          title="Test information I(θ)"
          description="Analytic Fisher information across θ from the analysis artefact."
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PsychometricFigure>

        <PsychometricFigure
          provenance={provenance}
          title="Conditional SEM"
          description={
            hasTarget
              ? `Dashed line is Assembly requiredSEM = ${requiredSEM}. Curve above the line cannot meet the target at that θ.`
              : "Select an Assembly Model target to overlay requiredSEM."
          }
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
                {hasTarget ? (
                  <ReferenceLine
                    y={requiredSEM}
                    stroke={chartColor(2)}
                    strokeDasharray="6 4"
                    label={{
                      value: `requiredSEM ${requiredSEM}`,
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                      position: "insideTopRight",
                    }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="conditionalSEM"
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
      </div>
    </div>
  );
}
