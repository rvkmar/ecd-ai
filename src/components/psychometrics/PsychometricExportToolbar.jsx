// D85 — shared CSV/PDF export controls (provenance required).

import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch } from "@/api/apiClient";
import { exportViewToFiles } from "./exportProvenance";
import { fetchAnalysisArtefactScores } from "@/api/queries/analysisArtefacts";
import { templateHonoursChapter } from "@/utils/psychometricReportTemplate";

export default function PsychometricExportToolbar({
  view,
  provenance,
  artefact,
  basename,
  disabled = false,
}) {
  const { auth } = useAuth() || {};
  const canExport = Boolean(provenance && artefact) && !disabled;
  const snapshot = artefact?.payload?.reportTemplate;
  const hasReport = Boolean(artefact?.hasReport || artefact?.payload?.reportHtml);
  const hasScores =
    Boolean(artefact?.hasScores) && templateHonoursChapter(snapshot, "scores");

  const onExport = () => {
    exportViewToFiles(view, {
      provenance,
      artefact,
      basename: basename || `psychometrics-${view}-${artefact?.id || "export"}`,
    });
  };

  const onOpenReport = async () => {
    if (!artefact?.id) return;
    const body = await apiFetch(`/api/analysisArtefacts/${artefact.id}/report`, {}, auth);
    const html = body?.html;
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onDownloadScores = async () => {
    if (!artefact?.id) return;
    const csv = await fetchAnalysisArtefactScores(artefact.id, auth, { format: "csv" });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artefact.id}-scores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`export-toolbar-${view}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canExport}
        onClick={onExport}
        aria-label={`Export ${view} as CSV and PDF with provenance`}
      >
        Export CSV + PDF
      </Button>
      {hasReport ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenReport}
          data-testid={`open-html-report-${view}`}
          aria-label={`Open HTML technical report for ${view}`}
        >
          Open HTML report
        </Button>
      ) : null}
      {hasScores ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDownloadScores}
          data-testid={`download-scores-${view}`}
          aria-label={`Download scores CSV for ${view}`}
        >
          Download scores CSV
        </Button>
      ) : null}
      <span className="text-caption text-muted-foreground">
        CSV keeps the provenance stamp. The HTML report is the R-generated
        technical report when this artefact has one.
      </span>
    </div>
  );
}
