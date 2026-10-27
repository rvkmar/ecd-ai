// D82 — item-analysis p-value / point-biserial figures (mandatory stamp).

import {
  Bar,
  BarChart,
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
import { ITEM_ANALYSIS_BOUNDS } from "./itemAnalysisFlags";

function optionEntries(distractors) {
  if (!distractors || typeof distractors !== "object") return [];
  if (Array.isArray(distractors)) {
    return distractors.map((d, i) => [d.id || String(i), d]);
  }
  return Object.entries(distractors);
}

function quantileChartData(row) {
  const entries = optionEntries(row?.distractors);
  const quantiles = new Map();
  for (const [oid, d] of entries) {
    for (const q of d?.quantiles || []) {
      const key = Number(q.quantile);
      if (!Number.isFinite(key)) continue;
      const prev = quantiles.get(key) || { quantile: key };
      prev[oid] = typeof q.proportion === "number" ? q.proportion : null;
      quantiles.set(key, prev);
    }
  }
  return {
    series: entries.map(([oid, d]) => ({
      id: oid,
      keyed: Boolean(d?.keyed),
    })),
    points: [...quantiles.values()].sort((a, b) => a.quantile - b.quantile),
  };
}

export default function ItemAnalysisCharts({
  provenance,
  rows = [],
  scoreFrequency = [],
  quantileRow = null,
}) {
  const data = rows.map((r) => ({
    itemId: r.itemId,
    pValue: r.pValue,
    pointBiserial: r.pointBiserial,
  }));
  const quantile = quantileRow ? quantileChartData(quantileRow) : { series: [], points: [] };

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

      {scoreFrequency.length > 0 ? (
        <PsychometricFigure
          provenance={provenance}
          title="Score distribution"
          description="Number-correct frequency from the classical test-level summary."
        >
          <div className="h-64 w-full" data-testid="item-analysis-score-histogram">
            <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
              <BarChart data={scoreFrequency} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="score" {...chartAxisProps} />
                <YAxis allowDecimals={false} {...chartAxisProps} />
                <Tooltip contentStyle={chartTooltipContentStyle} />
                <Legend wrapperStyle={chartLegendWrapperStyle} />
                <Bar dataKey="n" name="examinees" fill={chartColor(4)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PsychometricFigure>
      ) : null}

      {quantile.points.length > 0 ? (
        <PsychometricFigure
          provenance={provenance}
          title={`Quantile plot — ${quantileRow.itemId}`}
          description="Option selection rate by number-correct quantile. The keyed option should rise with ability."
        >
          <div className="h-64 w-full" data-testid="item-analysis-quantile-plot">
            <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
              <LineChart data={quantile.points} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="quantile" {...chartAxisProps} />
                <YAxis domain={[0, 1]} {...chartAxisProps} />
                <Tooltip contentStyle={chartTooltipContentStyle} />
                <Legend wrapperStyle={chartLegendWrapperStyle} />
                {quantile.series.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.keyed ? `${s.id} (key)` : s.id}
                    stroke={chartColor(i)}
                    strokeDasharray={s.keyed ? undefined : seriesStrokeDasharray(i)}
                    dot
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PsychometricFigure>
      ) : null}
    </div>
  );
}
