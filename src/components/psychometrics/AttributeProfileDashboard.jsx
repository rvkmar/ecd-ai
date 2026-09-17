// D84 — cohort attribute-profile dashboard (D79 artefacts).

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";
import Spinner from "@/components/ui/Spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import PsychometricFigure from "./PsychometricFigure";
import {
  chartAxisProps,
  chartColor,
  chartContainerMin,
  chartGridProps,
  chartLegendWrapperStyle,
  chartTooltipContentStyle,
} from "./chartTheme";
import { provenanceFromArtefact } from "./provenance";
import {
  ESTIMAND_LABELS,
  attributeRowsFromArtefact,
  estimandNotesFromArtefact,
  profileDistributionFromArtefact,
} from "./attributeProfileView";

function formatRate(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

export default function AttributeProfileDashboard() {
  const { data, isLoading, isError, error } = useAnalysisArtefacts({
    kind: "attribute-profile-summary",
  });
  const artefacts = Array.isArray(data) ? data : data?.items || [];
  const [selectedId, setSelectedId] = useState(null);

  const selected =
    artefacts.find((a) => a.id === selectedId) || artefacts[0] || null;
  const rows = useMemo(
    () => (selected ? attributeRowsFromArtefact(selected) : []),
    [selected]
  );
  const profiles = useMemo(
    () => (selected ? profileDistributionFromArtefact(selected) : []),
    [selected]
  );
  const notes = selected ? estimandNotesFromArtefact(selected) : {};
  const provenance = selected ? provenanceFromArtefact(selected) : null;

  const chartData = rows.map((r) => ({
    attributeId: r.attributeId,
    probabilityAveraged: r.probabilityAveragedMasteryRate,
    classificationCounted: r.classificationCountedMasteryRate,
  }));

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load attribute-profile artefacts
        {error?.message ? `: ${error.message}` : "."}
      </p>
    );
  }

  if (!artefacts.length) {
    return (
      <div
        className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"
        data-testid="attribute-profile-empty"
      >
        No attribute-profile cohort artefacts yet. Enqueue fixture{" "}
        <code className="font-mono text-2xs">known-attribute-profile-cohort</code>{" "}
        from Parameter estimation, process, ingest, then return here.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="attribute-profile-dashboard">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          Attribute-profile cohort
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mastery rates and observed profile distribution from D79 artefacts.
          Probability-averaged and classification-counted rates are labelled
          distinctly and never silently interchanged.
        </p>
      </div>

      <Select value={selected?.id || ""} onValueChange={setSelectedId}>
        <SelectTrigger className="w-[320px]" aria-label="Select attribute-profile artefact">
          <SelectValue placeholder="Artefact" />
        </SelectTrigger>
        <SelectContent>
          {artefacts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.id} · {a.packageVersion}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!provenance ? (
        <p className="text-sm text-destructive">
          Selected artefact is missing provenance and cannot be charted.
        </p>
      ) : (
        <>
          <div
            className="rounded-xl border border-border bg-muted/20 p-4 text-caption text-muted-foreground"
            data-testid="estimand-legend"
          >
            <p>
              <span className="font-medium text-foreground">Estimand A — </span>
              {ESTIMAND_LABELS.probabilityAveraged}
              {notes.probabilityAveragedMasteryRate
                ? ` — ${notes.probabilityAveragedMasteryRate}`
                : ""}
            </p>
            <p className="mt-2">
              <span className="font-medium text-foreground">Estimand B — </span>
              {ESTIMAND_LABELS.classificationCounted}
              {notes.classificationCountedMasteryRate
                ? ` — ${notes.classificationCountedMasteryRate}`
                : ""}
            </p>
            {notes.meanExpectedClassificationAccuracy ? (
              <p className="mt-2">{notes.meanExpectedClassificationAccuracy}</p>
            ) : null}
          </div>

          <PsychometricFigure
            provenance={provenance}
            title="Mastery rates by attribute"
            description="Two bars per attribute: probability-averaged vs classification-counted."
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" {...chartContainerMin}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="attributeId" {...chartAxisProps} />
                  <YAxis domain={[0, 1]} {...chartAxisProps} />
                  <Tooltip contentStyle={chartTooltipContentStyle} />
                  <Legend wrapperStyle={chartLegendWrapperStyle} />
                  <Bar
                    dataKey="probabilityAveraged"
                    name="Probability-averaged"
                    fill={chartColor(0)}
                  />
                  <Bar
                    dataKey="classificationCounted"
                    name="Classification-counted"
                    fill={chartColor(1)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PsychometricFigure>

          <div data-testid="attribute-profile-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Attribute</TableHead>
                  <TableHead>Probability-averaged</TableHead>
                  <TableHead>Classification-counted</TableHead>
                  <TableHead>nMaster / nAssigned</TableHead>
                  <TableHead>Indeterminate</TableHead>
                  <TableHead>Mean ECA (individual)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.attributeId}>
                    <TableCell className="font-mono text-2xs">{r.attributeId}</TableCell>
                    <TableCell data-testid={`prob-avg-${r.attributeId}`}>
                      {formatRate(r.probabilityAveragedMasteryRate)}
                    </TableCell>
                    <TableCell data-testid={`class-count-${r.attributeId}`}>
                      {formatRate(r.classificationCountedMasteryRate)}
                    </TableCell>
                    <TableCell>
                      {r.nMaster ?? "—"} / {r.nAssigned ?? "—"}
                    </TableCell>
                    <TableCell>{r.nIndeterminate ?? "—"}</TableCell>
                    <TableCell>
                      {formatRate(r.meanExpectedClassificationAccuracy)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PsychometricFigure
            provenance={provenance}
            title="Observed profile distribution"
            description="Counts of distinct classified attribute profiles in the cohort."
          >
            <ul className="space-y-1 text-sm" data-testid="profile-distribution">
              {profiles.map((p) => (
                <li key={p.profileKey} className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono text-2xs">{p.profileKey}</span>
                  <span>
                    n={p.count} · rate={formatRate(p.rate)}
                  </span>
                </li>
              ))}
            </ul>
          </PsychometricFigure>
        </>
      )}
    </div>
  );
}
