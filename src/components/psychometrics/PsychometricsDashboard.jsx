// D81 — psychometric dashboard shell. Lists analysisArtefacts; D82 adds
// the item-analysis figure pane.

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAnalysisArtefacts } from "@/api/queries/analysisArtefacts";
import Spinner from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import AttributeProfileDashboard from "./AttributeProfileDashboard";
import DifDashboard from "./DifDashboard";
import ItemAnalysisDashboard from "./ItemAnalysisDashboard";
import ProvenanceStamp from "./ProvenanceStamp";
import ReferenceInformationChart from "./ReferenceInformationChart";
import TestInformationDashboard from "./TestInformationDashboard";
import { provenanceFromArtefact } from "./provenance";

const KIND_FILTERS = [
  { value: "all", label: "All kinds" },
  { value: "item-analysis", label: "Item analysis" },
  { value: "test-information", label: "Test information" },
  { value: "dif-analysis", label: "DIF" },
  { value: "equating", label: "Equating" },
  { value: "attribute-profile-summary", label: "Attribute-profile cohort" },
];

const DEMO_PROVENANCE = {
  jobId: "job-d81-reference",
  packageVersion: "analytic-fisher (irtEngine parity)",
  sampleSize: 3,
  computedAt: "2026-09-17T00:00:00.000Z",
  derivedFrom: "known-2pl-testinfo fixture (reference chart)",
};

export default function PsychometricsDashboard() {
  const [kind, setKind] = useState("all");
  const [panel, setPanel] = useState("item-analysis");
  const filters = useMemo(
    () => (kind === "all" ? {} : { kind }),
    [kind]
  );
  const { data, isLoading, isError, error, refetch, isFetching } =
    useAnalysisArtefacts(filters);

  const artefacts = Array.isArray(data) ? data : data?.items || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Psychometrics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Provenance-bearing analysis artefacts from calibration jobs. Every
            figure in this workspace must carry a stamp.
          </p>
          <p className="mt-2 text-caption text-muted-foreground">
            Bookmark:{" "}
            <Link
              to="/admin/psychometrics"
              className="text-primary underline-offset-2 hover:underline"
            >
              /admin/psychometrics
            </Link>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          Refresh
        </Button>
      </div>

      <Tabs value={panel} onValueChange={setPanel}>
        <TabsList className="flex flex-wrap gap-2">
          <TabsTrigger value="item-analysis">Item analysis</TabsTrigger>
          <TabsTrigger value="test-information">Test information</TabsTrigger>
          <TabsTrigger value="attribute-profile">Attribute profiles</TabsTrigger>
          <TabsTrigger value="dif">DIF</TabsTrigger>
          <TabsTrigger value="catalogue">Artefact catalogue</TabsTrigger>
          <TabsTrigger value="reference">Reference chrome</TabsTrigger>
        </TabsList>

        <TabsContent value="item-analysis" className="mt-6">
          <ItemAnalysisDashboard />
        </TabsContent>

        <TabsContent value="test-information" className="mt-6">
          <TestInformationDashboard />
        </TabsContent>

        <TabsContent value="attribute-profile" className="mt-6">
          <AttributeProfileDashboard />
        </TabsContent>

        <TabsContent value="dif" className="mt-6">
          <DifDashboard />
        </TabsContent>

        <TabsContent value="catalogue" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-[220px]" aria-label="Filter by artefact kind">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                {KIND_FILTERS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <p className="text-sm text-destructive" role="alert">
              Could not load analysis artefacts
              {error?.message ? `: ${error.message}` : "."}
            </p>
          ) : artefacts.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground"
              data-testid="psychometrics-empty"
            >
              No analysis artefacts yet. Run an analysis job from Parameter
              estimation, then return here.
            </div>
          ) : (
            <ul className="space-y-4" data-testid="psychometrics-artefact-list">
              {artefacts.map((artefact) => {
                const provenance = provenanceFromArtefact(artefact);
                return (
                  <li
                    key={artefact.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">{artefact.kind}</h3>
                      <span className="font-mono text-2xs text-muted-foreground">
                        {artefact.id}
                      </span>
                    </div>
                    {provenance ? (
                      <ProvenanceStamp provenance={provenance} />
                    ) : (
                      <p className="mt-2 text-sm text-destructive">
                        Artefact is missing provenance fields and cannot be charted.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="reference" className="mt-6 space-y-3">
          <p className="text-caption text-muted-foreground">
            Shared recharts treatment and mandatory stamp (D81).
          </p>
          <ReferenceInformationChart provenance={DEMO_PROVENANCE} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
