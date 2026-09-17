// D85 — shared CSV/PDF export controls (provenance required).

import { Button } from "@/components/ui/button";
import { exportViewToFiles } from "./exportProvenance";

export default function PsychometricExportToolbar({
  view,
  provenance,
  artefact,
  basename,
  disabled = false,
}) {
  const canExport = Boolean(provenance && artefact) && !disabled;

  const onExport = () => {
    exportViewToFiles(view, {
      provenance,
      artefact,
      basename: basename || `psychometrics-${view}-${artefact?.id || "export"}`,
    });
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
      <span className="text-caption text-muted-foreground">
        Exports include the same provenance stamp as the screen (job, package,
        sample, computed-at, source).
      </span>
    </div>
  );
}
