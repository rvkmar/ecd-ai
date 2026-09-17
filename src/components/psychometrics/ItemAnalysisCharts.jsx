// D82 — item-analysis p-value / point-biserial figures (mandatory stamp).

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
} from "./chartTheme";
import { ITEM_ANALYSIS_BOUNDS } from "./itemAnalysisFlags";

export default function ItemAnalysisCharts({ provenance, rows = [] }) {
  const data = rows.map((r) => ({
    itemId: r.itemId,
    pValue: r.pValue,
    pointBiserial: r.pointBiserial,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PsychometricFigure
        provenance={provenance}
        title="Item p-values"
        description={`Advisory bounds: too hard below ${ITEM_ANALYSIS_BOUNDS.tooHard.threshold}; too easy above ${ITEM_ANALYSIS_BOUNDS.tooEasy.threshold}.`}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="itemId" {...chartAxisProps} interval={0} angle={-20} textAnchor="end" height={56} />
              <YAxis domain={[0, 1]} {...chartAxisProps} />
              <Tooltip contentStyle={chartTooltipContentStyle} />
              <Legend wrapperStyle={chartLegendWrapperStyle} />
              <ReferenceLine
                y={ITEM_ANALYSIS_BOUNDS.tooHard.threshold}
                stroke={chartColor(2)}
                strokeDasharray="4 4"
                label={{ value: "hard", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
              <ReferenceLine
                y={ITEM_ANALYSIS_BOUNDS.tooEasy.threshold}
                stroke={chartColor(3)}
                strokeDasharray="2 3"
                label={{ value: "easy", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
              <Bar dataKey="pValue" name="p-value" fill={chartColor(0)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PsychometricFigure>

      <PsychometricFigure
        provenance={provenance}
        title="Point-biserial discrimination"
        description={`Advisory floor ${ITEM_ANALYSIS_BOUNDS.lowDiscrimination.threshold}; negative values are flagged separately.`}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="itemId" {...chartAxisProps} interval={0} angle={-20} textAnchor="end" height={56} />
              <YAxis domain={[-0.5, 1]} {...chartAxisProps} />
              <Tooltip contentStyle={chartTooltipContentStyle} />
              <Legend wrapperStyle={chartLegendWrapperStyle} />
              <ReferenceLine
                y={ITEM_ANALYSIS_BOUNDS.lowDiscrimination.threshold}
                stroke={chartColor(1)}
                strokeDasharray="6 4"
                label={{ value: "0.20", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              <Bar dataKey="pointBiserial" name="point-biserial" fill={chartColor(1)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PsychometricFigure>
    </div>
  );
}
