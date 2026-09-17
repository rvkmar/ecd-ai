// D83 — test-information + reliability dashboard with requiredSEM overlay.

import { useMemo, useState } from "react";

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import Spinner from "@/components/ui/Spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import TestInformationCharts from "./TestInformationCharts";
import PsychometricExportToolbar from "./PsychometricExportToolbar";
import { provenanceFromArtefact } from "./provenance";
import {
  continuousSemTargetsFromAssemblyModels,
  curvePointsFromArtefact,
  evaluateSemTarget,
  reliabilityFromArtefact,
} from "./testInformationCurve";

const NONE = "none";

function formatRel(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

function ReliabilityPanel({ reliability }) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="test-information-reliability"
    >
      <h4 className="font-medium">Reliability (labelled distinctly)</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-label text-muted-foreground">
            Classical KR-20 (response matrix)
          </dt>
          <dd className="font-mono text-sm" data-testid="reliability-kr20">
            {formatRel(reliability.kr20)}
          </dd>
        </div>
        <div>
          <dt className="text-label text-muted-foreground">
            IRT marginal reliability
          </dt>
          <dd className="font-mono text-sm" data-testid="reliability-marginal">
            {formatRel(reliability.marginalReliability)}
          </dd>
        </div>
      </dl>
      {reliability.reliabilityNote ? (
        <p className="mt-3 text-caption text-muted-foreground">
          {reliability.reliabilityNote}
        </p>
      ) : (
        <p className="mt-3 text-caption text-muted-foreground">
          KR-20 is classical on the matrix; marginal reliability (when present)
          is an IRT quantity — do not interchange them.
        </p>
      )}
      {reliability.authority ? (
        <p className="mt-2 text-caption text-muted-foreground">{reliability.authority}</p>
      ) : null}
    </div>
  );
}

export default function TestInformationDashboard() {
  const { data, isLoading, isError, error } = useAnalysisArtefacts({
    kind: "test-information",
  });
  const { data: assemblyModels = [] } = useAssemblyModels();

  const artefacts = Array.isArray(data) ? data : data?.items || [];
  const semTargets = useMemo(
    () => continuousSemTargetsFromAssemblyModels(assemblyModels),
    [assemblyModels]
  );

  const [selectedId, setSelectedId] = useState(null);
  const [targetKey, setTargetKey] = useState(NONE);

  const selected =
    artefacts.find((a) => a.id === selectedId) || artefacts[0] || null;

  const points = useMemo(
    () => (selected ? curvePointsFromArtefact(selected) : []),
    [selected]
  );
  const provenance = selected ? provenanceFromArtefact(selected) : null;
  const reliability = selected ? reliabilityFromArtefact(selected) : null;

  const activeTarget = useMemo(() => {
    if (targetKey === NONE) return null;
    return semTargets.find((t) => `${t.assemblyModelId}::${t.smvId}` === targetKey) || null;
  }, [semTargets, targetKey]);

  const requiredSEM = activeTarget?.requiredSEM ?? null;
  const evaluation = useMemo(
    () => evaluateSemTarget(points, requiredSEM),
    [points, requiredSEM]
  );

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load test-information artefacts
        {error?.message ? `: ${error.message}` : "."}
      </p>
    );
  }

  if (!artefacts.length) {
    return (
      <div
        className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"
        data-testid="test-information-empty"
      >
        No test-information artefacts yet. From Parameter estimation, enqueue
        fixture <code className="font-mono text-2xs">known-2pl-testinfo</code>{" "}
        (or a live IRT matrix), process, and ingest — then return here.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="test-information-dashboard">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          Test information &amp; reliability
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          I(θ) and conditional SEM from D78 artefacts. Overlay an Assembly
          Model&apos;s requiredSEM on the same axes so a bank that cannot meet
          the target anywhere is visible without arithmetic.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={selected?.id || ""}
          onValueChange={setSelectedId}
        >
          <SelectTrigger className="w-[280px]" aria-label="Select test-information artefact">
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

        <Select value={targetKey} onValueChange={setTargetKey}>
          <SelectTrigger className="w-[320px]" aria-label="Overlay Assembly requiredSEM">
            <SelectValue placeholder="Assembly requiredSEM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No requiredSEM overlay</SelectItem>
            {semTargets.map((t) => (
              <SelectItem
                key={`${t.assemblyModelId}::${t.smvId}`}
                value={`${t.assemblyModelId}::${t.smvId}`}
              >
                {t.assemblyName} · {t.smvId} · SEM≤{t.requiredSEM}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!provenance ? (
        <p className="text-sm text-destructive">
          Selected artefact is missing provenance and cannot be charted.
        </p>
      ) : (
        <>
          <PsychometricExportToolbar
            view="test-information"
            provenance={provenance}
            artefact={selected}
          />
          <TestInformationCharts
            provenance={provenance}
            points={points}
            requiredSEM={requiredSEM}
            evaluation={evaluation}
          />
          <ReliabilityPanel reliability={reliability} />
        </>
      )}
    </div>
  );
}
