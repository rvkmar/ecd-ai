// D81 — shared recharts chrome for W17. One library (recharts), token
// colours, and treatments that stay readable in light and dark without
// relying on hue alone (labels + stroke patterns on series).

/** CSS variable colours — flip with the app `.dark` class. */
export function chartColor(index) {
  const n = ((index % 5) + 5) % 5;
  return `hsl(var(--chart-${n + 1}))`;
}

/** Categorical series: colour + dash so series stay distinguishable. */
export const SERIES_STROKE_DASHARRAY = [
  undefined,
  "6 4",
  "2 3",
  "8 3 2 3",
  "1 4",
];

export function seriesStrokeDasharray(index) {
  return SERIES_STROKE_DASHARRAY[((index % 5) + 5) % 5];
}

export const chartAxisProps = {
  stroke: "hsl(var(--muted-foreground))",
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
  tickLine: { stroke: "hsl(var(--border))" },
  axisLine: { stroke: "hsl(var(--border))" },
};

export const chartGridProps = {
  stroke: "hsl(var(--border))",
  strokeDasharray: "3 3",
};

export const chartTooltipContentStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  color: "hsl(var(--popover-foreground))",
  fontSize: "0.75rem",
};

export const chartLegendWrapperStyle = {
  fontSize: "0.75rem",
  color: "hsl(var(--muted-foreground))",
};

/** Shared ResponsiveContainer floor so recharts does not skip first paint. */
export const chartContainerMin = { minWidth: 280, minHeight: 220 };
