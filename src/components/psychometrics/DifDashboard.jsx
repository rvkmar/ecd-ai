// D84 — DIF dashboard (D69 artefacts). Investigation framing is on-screen.

import { useMemo, useState } from "react";

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
import { provenanceFromArtefact } from "./provenance";
import {
  DIF_FLAG_NOT,
  DIF_INVESTIGATION_FRAMING,
  difRowsFromArtefact,
} from "./difView";

function formatNum(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function DifDashboard() {
  const { data, isLoading, isError, error } = useAnalysisArtefacts({
    kind: "dif-analysis",
  });
  const artefacts = Array.isArray(data) ? data : data?.items || [];
  const [selectedId, setSelectedId] = useState(null);

  const selected =
    artefacts.find((a) => a.id === selectedId) || artefacts[0] || null;
  const rows = useMemo(
    () => (selected ? difRowsFromArtefact(selected) : []),
    [selected]
  );
  const provenance = selected ? provenanceFromArtefact(selected) : null;
  const diagnostics = selected?.payload?.diagnostics || {};

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load DIF artefacts
        {error?.message ? `: ${error.message}` : "."}
      </p>
    );
  }

  if (!artefacts.length) {
    return (
      <div
        className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"
        data-testid="dif-empty"
      >
        No DIF artefacts yet. Enqueue fixture{" "}
        <code className="font-mono text-2xs">planted-dif</code> from Parameter
        estimation, process, ingest, then return here.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dif-dashboard">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          Differential item functioning
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-item Mantel–Haenszel results from D69 artefacts: statistic,
          flag, method, and ETS effect-size band. Operational flag is ETS C.
        </p>
      </div>

      <div
        className="rounded-xl border border-amber-600/40 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
        data-testid="dif-framing"
        role="note"
      >
        <p className="font-medium">What a DIF flag means</p>
        <p className="mt-1 text-caption">{DIF_INVESTIGATION_FRAMING}</p>
        <p className="mt-2 text-caption">{DIF_FLAG_NOT}</p>
      </div>

      <Select value={selected?.id || ""} onValueChange={setSelectedId}>
        <SelectTrigger className="w-[320px]" aria-label="Select DIF artefact">
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
        <PsychometricFigure
          provenance={provenance}
          title="DIF by item"
          description={`Method ${diagnostics.method || "difR::difMH"}; pair from artefact rows.`}
        >
          <div data-testid="dif-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Statistic</TableHead>
                  <TableHead>p-value</TableHead>
                  <TableHead>α_MH</TableHead>
                  <TableHead>δ_MH</TableHead>
                  <TableHead>Effect-size band</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Pair</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.itemId}
                    data-testid={`dif-row-${r.itemId}`}
                    className={r.flag ? "bg-amber-50/80 dark:bg-amber-950/20" : undefined}
                  >
                    <TableCell className="font-mono text-2xs">{r.itemId}</TableCell>
                    <TableCell>{formatNum(r.statistic, 4)}</TableCell>
                    <TableCell>{formatNum(r.pValue, 4)}</TableCell>
                    <TableCell>{formatNum(r.alphaMH, 3)}</TableCell>
                    <TableCell>{formatNum(r.deltaMH, 3)}</TableCell>
                    <TableCell data-testid={`dif-band-${r.itemId}`}>
                      {r.effectSizeBand}
                    </TableCell>
                    <TableCell data-testid={`dif-flag-${r.itemId}`}>
                      {r.flag ? "Flagged (investigate item)" : "—"}
                    </TableCell>
                    <TableCell className="text-caption">{r.method}</TableCell>
                    <TableCell className="text-caption">{r.pair}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </PsychometricFigure>
      )}
    </div>
  );
}
