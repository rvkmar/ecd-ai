// D82 — item-analysis dashboard: real artefacts, stamps, actionable flags.

import { useMemo, useState } from "react";

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import Spinner from "@/components/ui/Spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ItemAnalysisCharts from "./ItemAnalysisCharts";
import ItemAnalysisTable from "./ItemAnalysisTable";
import { itemRowsFromArtefact } from "./itemAnalysisFlags";
import { provenanceFromArtefact } from "./provenance";

const ALL = "all";

function labelFor(id, list, fallbackPrefix) {
  if (!id) return "(none)";
  const found = list.find((x) => x.id === id);
  return found?.name || found?.title || `${fallbackPrefix} ${id}`;
}

function DistractorPanel({ rows, diagnostics }) {
  const withDistractors = rows.filter(
    (r) => r.distractors != null && r.distractors !== undefined
  );
  return (
    <div
      className="rounded-xl border border-border bg-muted/20 p-4 text-sm"
      data-testid="item-analysis-distractors"
    >
      <h4 className="font-medium">Distractor analysis</h4>
      {diagnostics?.distractorsNote ? (
        <p className="mt-1 text-caption text-muted-foreground">
          {diagnostics.distractorsNote}
        </p>
      ) : null}
      {withDistractors.length === 0 ? (
        <p className="mt-2 text-caption text-muted-foreground">
          No option-level distractors on these items (typical for dichotomous
          0/1 matrices). When present, each option&apos;s selection rate appears
          here.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {withDistractors.map((row) => (
            <li key={row.itemId}>
              <p className="font-mono text-2xs">{row.itemId}</p>
              <pre className="mt-1 overflow-auto rounded bg-card p-2 text-2xs">
                {JSON.stringify(row.distractors, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ItemAnalysisDashboard() {
  const { data, isLoading, isError, error } = useAnalysisArtefacts({
    kind: "item-analysis",
  });
  const { data: evidenceModels = [] } = useEvidenceModels();
  const { data: taskModels = [] } = useTaskModels();

  const artefacts = Array.isArray(data) ? data : data?.items || [];

  const [emFilter, setEmFilter] = useState(ALL);
  const [tmFilter, setTmFilter] = useState(ALL);
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    return artefacts.filter((a) => {
      const em = a.scope?.evidenceModelId;
      const tm = a.scope?.taskModelId;
      if (emFilter !== ALL && em !== emFilter) return false;
      if (tmFilter !== ALL) {
        if (tmFilter === "none") {
          if (tm) return false;
        } else if (tm !== tmFilter) {
          return false;
        }
      }
      return true;
    });
  }, [artefacts, emFilter, tmFilter]);

  const selected =
    filtered.find((a) => a.id === selectedId) || filtered[0] || null;

  const rows = useMemo(
    () => (selected ? itemRowsFromArtefact(selected) : []),
    [selected]
  );
  const provenance = selected ? provenanceFromArtefact(selected) : null;

  const emOptions = useMemo(() => {
    const ids = [...new Set(artefacts.map((a) => a.scope?.evidenceModelId).filter(Boolean))];
    return ids;
  }, [artefacts]);

  const tmOptions = useMemo(() => {
    const ids = [
      ...new Set(artefacts.map((a) => a.scope?.taskModelId).filter(Boolean)),
    ];
    return ids;
  }, [artefacts]);

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load item-analysis artefacts
        {error?.message ? `: ${error.message}` : "."}
      </p>
    );
  }

  if (!artefacts.length) {
    return (
      <div
        className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"
        data-testid="item-analysis-empty"
      >
        No item-analysis artefacts yet. From Parameter estimation, enqueue
        fixture <code className="font-mono text-2xs">lsat7-item-analysis</code>{" "}
        (or a live matrix), process, and ingest — then return here.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="item-analysis-dashboard">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Item analysis</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          p-values, point-biserial, and distractors from D77 analysis artefacts.
          Flags are advisory and always name their threshold and a next action.
          This view informs; it never gates Evidence Model lifecycle.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={emFilter} onValueChange={setEmFilter}>
          <SelectTrigger className="w-[220px]" aria-label="Filter by Evidence Model">
            <SelectValue placeholder="Evidence Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Evidence Models</SelectItem>
            {emOptions.map((id) => (
              <SelectItem key={id} value={id}>
                {labelFor(id, evidenceModels, "EM")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tmFilter} onValueChange={setTmFilter}>
          <SelectTrigger className="w-[220px]" aria-label="Filter by Task Model">
            <SelectValue placeholder="Task Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Task Models</SelectItem>
            <SelectItem value="none">No Task Model on scope</SelectItem>
            {tmOptions.map((id) => (
              <SelectItem key={id} value={id}>
                {labelFor(id, taskModels, "TM")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selected?.id || ""}
          onValueChange={setSelectedId}
          disabled={!filtered.length}
        >
          <SelectTrigger className="w-[260px]" aria-label="Select artefact">
            <SelectValue placeholder="Artefact" />
          </SelectTrigger>
          <SelectContent>
            {filtered.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.id} · {a.packageVersion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!filtered.length ? (
        <p className="text-sm text-muted-foreground">
          No artefacts match the Evidence / Task Model filters.
        </p>
      ) : !provenance ? (
        <p className="text-sm text-destructive">
          Selected artefact is missing provenance and cannot be charted.
        </p>
      ) : (
        <>
          <ItemAnalysisCharts provenance={provenance} rows={rows} />
          <ItemAnalysisTable rows={rows} />
          <DistractorPanel
            rows={rows}
            diagnostics={selected.payload?.diagnostics}
          />
          {selected.payload?.diagnostics?.authority ? (
            <p className="text-caption text-muted-foreground">
              {selected.payload.diagnostics.authority}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
