import { useState } from "react";
import toast from "react-hot-toast";

import { apiErrorMessage } from "@/api/apiClient";
import {
  useCreatePsychometricReportTemplate,
  usePsychometricReportTemplates,
  useTransitionPsychometricReportTemplate,
} from "@/api/queries/psychometricReportTemplates";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  REPORT_TEMPLATE_AUDIENCE_VALUES,
  REPORT_TEMPLATE_CHAPTER_VALUES,
  REPORT_TEMPLATE_KIND_VALUES,
  REPORT_TEMPLATE_SKIN_VALUES,
} from "@/utils/psychometricReportTemplate";

const NEXT_STATUS = {
  draft: "reviewed",
  reviewed: "confirmed",
  confirmed: "operational",
  operational: "suspended",
  suspended: "operational",
};

export default function ReportTemplatesPanel() {
  const { data: templates = [], isLoading } = usePsychometricReportTemplates();
  const create = useCreatePsychometricReportTemplate();
  const transition = useTransitionPsychometricReportTemplate();
  const [name, setName] = useState("Iteman classic");
  const [kind, setKind] = useState("iteman-ctt");
  const [audience, setAudience] = useState("psychometrician");
  const [skinId, setSkinId] = useState("iteman-classic");
  const [chapters, setChapters] = useState([...REPORT_TEMPLATE_CHAPTER_VALUES]);

  function toggleChapter(ch) {
    if (ch === "credits") return;
    setChapters((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  async function handleCreate(event) {
    event.preventDefault();
    try {
      await create.mutateAsync({
        name,
        kind,
        audience,
        skinId,
        chapters: Array.from(new Set([...chapters, "credits"])),
      });
      toast.success("Report template saved as a draft.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save the report template."));
    }
  }

  async function handleAdvance(row) {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    try {
      await transition.mutateAsync({ id: row.id, status: next });
      toast.success(`Template is now ${next}.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not change template status."));
    }
  }

  return (
    <div className="space-y-6" data-testid="report-templates-panel">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Report templates</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Governed Iteman/Xcalibre-class report layouts. Adopting a template on a
          new calibration job freezes a snapshot — later edits never rewrite old
          artefacts. Software credits for R and the packages that produced the
          report are always included. This is not an ECD task template.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-border p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="prt-name">Name</Label>
            <input
              id="prt-name"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prt-kind">Kind</Label>
            <select
              id="prt-kind"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {REPORT_TEMPLATE_KIND_VALUES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prt-audience">Audience</Label>
            <select
              id="prt-audience"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {REPORT_TEMPLATE_AUDIENCE_VALUES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prt-skin">R HTML skin</Label>
            <select
              id="prt-skin"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={skinId}
              onChange={(e) => setSkinId(e.target.value)}
            >
              {REPORT_TEMPLATE_SKIN_VALUES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Chapters</legend>
          <div className="flex flex-wrap gap-3">
            {REPORT_TEMPLATE_CHAPTER_VALUES.map((ch) => (
              <label key={ch} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ch === "credits" || chapters.includes(ch)}
                  disabled={ch === "credits"}
                  onChange={() => toggleChapter(ch)}
                />
                {ch}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={create.isPending}>
          Save draft
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading templates…</p>
      ) : (
        <ul className="space-y-2">
          {(templates || []).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-caption text-muted-foreground">
                  {row.kind} · {row.audience} · {row.skinId} · {row.status}
                </p>
              </div>
              {NEXT_STATUS[row.status] ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAdvance(row)}
                >
                  Mark {NEXT_STATUS[row.status]}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
