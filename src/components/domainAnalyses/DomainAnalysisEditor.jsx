// src/components/domainAnalyses/DomainAnalysisEditor.jsx
//
// Off-calendar workspace for a Domain Analysis (not D146). The stored
// payload is the D142 correction form. Confirm still authorises no
// student delivery. contentStandards stays read-only (ADR 0011).
//
// The default export is the three-tab shell (Dashboard / Domain Analysis
// Structure / Manage Domain Analysis). Manage still renders
// DomainAnalysisWorkspace, including Guided setup. A focus id in the URL
// opens Manage with that analysis loaded.

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useDomainAnalyses,
  useCreateDomainAnalysis,
  useUpdateDomainAnalysis,
  useConfirmDomainAnalysis,
} from "@/api/queries/domainAnalyses";
import { domainAnalysisReadiness } from "@/utils/domainAnalysisReadiness";
import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";
import { PSYCHOLOGICAL_PERSPECTIVES } from "@/utils/ecdVocabulary";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import DomainAnalysisGuidedSetup from "./DomainAnalysisGuidedSetup";
import ModelTabShell from "@/components/shared/ModelTabShell";
import DomainAnalysisDashboard from "./DomainAnalysisDashboard";
import DomainAnalysisTable from "./DomainAnalysisTable";
import {
  SECTION_HINT,
  WORKSPACE_TABS,
  emptyForm,
  formFromRow,
  inputClass,
  payloadFromForm,
  confirmRequirementItems,
} from "./domainAnalysisForm";

/** focus, id, or the domainAnalysisId the Q-matrix handoff leaves on the URL. */
export function domainAnalysisFocusId(searchParams) {
  return (
    searchParams.get("focus") ||
    searchParams.get("id") ||
    searchParams.get("domainAnalysisId") ||
    ""
  );
}

function ContentStandardsView({ standards }) {
  if (!standards) return null;
  const goals = Array.isArray(standards.curricularGoals) ? standards.curricularGoals : [];
  return (
    <section aria-label="Copied curricular policy" className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-medium text-slate-900">Curricular policy</h3>
      <p className="mt-1 text-sm text-slate-600">
        Copied from the curricular policy. These lines are not edited here.
      </p>
      {standards.name ? (
        <p className="mt-2 text-sm font-medium text-slate-900">{standards.name}</p>
      ) : null}
      {goals.length > 0 ? (
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-800">
          {goals.map((goal, goalIndex) => (
            <li key={goal.code || goalIndex}>
              <span className="font-mono text-xs text-slate-600">{goal.code}</span> {goal.statement}
              {Array.isArray(goal.competencies) && goal.competencies.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {goal.competencies.map((comp, compIndex) => (
                    <li key={comp.code || compIndex}>
                      <span className="font-mono text-xs text-slate-600">{comp.code}</span> {comp.statement}
                      {Array.isArray(comp.learningOutcomes) && comp.learningOutcomes.length > 0 ? (
                        <ul className="mt-1 list-disc pl-4 text-slate-700">
                          {comp.learningOutcomes.map((outcome, outcomeIndex) => (
                            <li key={`${comp.code || compIndex}-${outcomeIndex}`}>{outcome}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ConfirmChecklist({ items, activeTab, onJump }) {
  const recorded = items.filter((item) => item.done).length;
  return (
    <nav aria-label="Confirm requirements" className="xl:border-l xl:border-slate-200 xl:pl-6">
      <h3 className="text-sm font-semibold text-slate-900">Confirm requirements</h3>
      <p className="mt-1 text-sm text-slate-700">
        {recorded} of {items.length} recorded
      </p>
      <ol className="mt-3 space-y-1">
        {items.map((item) => {
          const selected = activeTab === item.tab;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onJump(item.tab)}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                  selected ? "bg-slate-100 text-slate-900" : "text-slate-800 hover:bg-slate-50"
                }`}
              >
                {item.done ? (
                  <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-slate-900" aria-hidden="true" />
                ) : (
                  <Circle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-slate-700" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">{item.label}</span>
                <span className="shrink-0 text-xs font-medium text-slate-700">
                  {item.done ? "Recorded" : "Needed"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function DomainAnalysisWorkspace() {
  const { data: rows = [], isLoading } = useDomainAnalyses();
  const { data: qMatrices = [] } = useQMatrixModels();
  const [searchParams, setSearchParams] = useSearchParams();
  const createAnalysis = useCreateDomainAnalysis();
  const updateAnalysis = useUpdateDomainAnalysis();
  const confirmAnalysis = useConfirmDomainAnalysis();
  const [editingId, setEditingId] = useState(null);
  const [standards, setStandards] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState("overview");
  const [mode, setMode] = useState("workspace");
  const [guidedStep, setGuidedStep] = useState(1);
  const [snapshot, setSnapshot] = useState(null);
  const appliedFocus = useRef(null);
  const focusId = domainAnalysisFocusId(searchParams);

  useEffect(() => {
    if (!focusId || appliedFocus.current === focusId) return;
    const row = rows.find((item) => item.id === focusId);
    if (!row) return;
    appliedFocus.current = focusId;
    setMode("workspace");
    setEditingId(row.id);
    setStandards(row.contentStandards || null);
    setForm(formFromRow(row));
    setTab("overview");
  }, [focusId, rows]);

  const payload = payloadFromForm(form);
  const confirmCheck = domainAnalysisReadiness(
    { ...payload, status: "confirmed" },
    { strict: true }
  );
  const checklist = confirmRequirementItems(confirmCheck.errors);
  const saving = createAnalysis.isPending || updateAnalysis.isPending;

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setMode("workspace");
    setEditingId(null);
    setStandards(null);
    setForm(emptyForm());
    setTab("overview");
  }

  function startEdit(row) {
    setMode("workspace");
    setEditingId(row.id);
    setStandards(row.contentStandards || null);
    setForm(formFromRow(row));
    setTab("overview");
  }

  function startGuided() {
    setSnapshot({ editingId, standards, form, tab });
    setEditingId(null);
    setStandards(null);
    setForm(emptyForm());
    setGuidedStep(1);
    setMode("guided");
  }

  function cancelGuided() {
    if (snapshot) {
      setEditingId(snapshot.editingId);
      setStandards(snapshot.standards);
      setForm(snapshot.form);
      setTab(snapshot.tab);
    }
    setSnapshot(null);
    setMode("workspace");
  }

  async function save() {
    try {
      if (editingId) {
        await updateAnalysis.mutateAsync({ id: editingId, payload });
        toast.success("Domain Analysis saved.");
      } else {
        const created = await createAnalysis.mutateAsync(payload);
        setEditingId(created.id);
        toast.success("Domain Analysis draft saved.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save the Domain Analysis."));
    }
  }

  async function saveGuidedDraft() {
    try {
      const created = await createAnalysis.mutateAsync(payload);
      setEditingId(created.id);
      setStandards(null);
      setSnapshot(null);
      toast.success("Domain Analysis draft saved.");
      return created;
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save the Domain Analysis."));
      return false;
    }
  }

  function landInWorkspace() {
    setTab("overview");
    setMode("workspace");
  }

  async function confirm() {
    if (!editingId) return;
    try {
      await updateAnalysis.mutateAsync({ id: editingId, payload });
      await confirmAnalysis.mutateAsync(editingId);
      toast.success("Domain Analysis confirmed. It authorises no student delivery.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not confirm the Domain Analysis."));
    }
  }

  if (mode === "guided") {
    return (
      <DomainAnalysisGuidedSetup
        form={form}
        setField={setField}
        step={guidedStep}
        setStep={setGuidedStep}
        onCancel={cancelGuided}
        onSaveDraft={saveGuidedDraft}
        onSaved={landInWorkspace}
      />
    );
  }

  const activeSection = DOMAIN_ANALYSIS_ENTITIES.find((section) => section.field === tab);

  return (
    <div className="grid gap-8 selection:bg-slate-900 selection:text-white lg:grid-cols-[16rem_minmax(0,1fr)]">
      <section aria-label="Domain analyses">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Domain Analysis</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={startGuided}>
              Guided setup
            </Button>
            <Button type="button" variant="outline" onClick={startNew}>
              New
            </Button>
          </div>
        </div>
        {isLoading ? <p className="text-sm text-slate-600">Loading…</p> : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No domain analyses yet. Upload a JSON file under Settings → Data, or start one here.
          </p>
        ) : null}
        <ul className="space-y-2">
          {rows.map((row) => {
            const selected = editingId === row.id;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                    selected
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-300 bg-white hover:border-slate-500"
                  }`}
                  onClick={() => startEdit(row)}
                >
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span className="mt-1 block text-xs text-slate-600">{row.status}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <form
          className="min-w-0 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-slate-100 p-1 text-slate-700">
              {WORKSPACE_TABS.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="text-slate-700 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-4 max-w-prose space-y-4">
              <label className="block text-sm font-medium text-slate-900">
                Name
                <input
                  className={`${inputClass} mt-1`}
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-900">
                Psychological perspective
                <select
                  className={`${inputClass} mt-1`}
                  value={form.psychologicalPerspective}
                  onChange={(event) => setField("psychologicalPerspective", event.target.value)}
                >
                  <option value="">Not declared yet</option>
                  {PSYCHOLOGICAL_PERSPECTIVES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm leading-6 text-slate-700">
                A draft can be saved before a perspective is declared. Confirm requires one.
              </p>
            </TabsContent>

            {activeSection ? (
              <TabsContent value={activeSection.field} className="mt-4 max-w-prose space-y-3">
                <p className="text-sm leading-6 text-slate-700">
                  One statement per line. Valued knowledge is not a curricular policy. Knowledge–task lines are not Q-matrix cells.
                </p>
                <label className="block text-sm font-medium text-slate-900">
                  {activeSection.padi}
                  <span className="mt-0.5 block text-xs font-normal text-slate-600">
                    {SECTION_HINT[activeSection.field]}
                  </span>
                  <textarea
                    className={`${inputClass} mt-1 min-h-36`}
                    aria-label={activeSection.padi}
                    value={form[activeSection.field]}
                    onChange={(event) => setField(activeSection.field, event.target.value)}
                  />
                </label>
              </TabsContent>
            ) : null}

            <TabsContent value="curriculum" className="mt-4 max-w-prose">
              {standards ? (
                <ContentStandardsView standards={standards} />
              ) : (
                <section aria-label="Copied curricular policy" className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-medium text-slate-900">Curricular policy</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Copied from the curricular policy. These lines are not edited here.
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    No curricular policy has been copied onto this analysis.
                  </p>
                </section>
              )}
            </TabsContent>

            <TabsContent value="qmatrices" className="mt-4 max-w-prose">
              <section aria-label="Q-matrices for this analysis" className="rounded-md border border-slate-200 p-3">
                <h3 className="text-sm font-medium text-slate-900">Q-matrices</h3>
                <p className="mt-1 text-sm text-slate-600">
                  A Q-matrix keeps its own id and its competency model. It can name this analysis. It is not copied into the statements above.
                </p>
                {editingId ? (
                  <>
                    <ul className="mt-2 space-y-1 text-sm text-slate-800">
                      {qMatrices.filter((row) => row.domainAnalysisId === editingId).map((row) => (
                        <li key={row.id}>{row.name}</li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set("tab", "qmatrix");
                        next.set("domainAnalysisId", editingId);
                        setSearchParams(next);
                      }}
                    >
                      Author a Q-matrix for this analysis
                    </Button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">
                    Save the analysis before a Q-matrix can name it.
                  </p>
                )}
              </section>
            </TabsContent>
          </Tabs>

          {!confirmCheck.ready ? (
            <ul className="list-disc pl-5 text-sm text-slate-700">
              {confirmCheck.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !form.name.trim()}>
              Save draft
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editingId || !confirmCheck.ready || confirmAnalysis.isPending}
              onClick={confirm}
            >
              Confirm
            </Button>
          </div>
        </form>

        <ConfirmChecklist items={checklist} activeTab={tab} onJump={setTab} />
      </div>
    </div>
  );
}

export default function DomainAnalysisEditor() {
  const [searchParams] = useSearchParams();
  const focusId = domainAnalysisFocusId(searchParams);
  const [mode, setMode] = useState(focusId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId) setMode("manage");
  }, [focusId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <DomainAnalysisDashboard /> },
        {
          id: "structure",
          label: "Domain Analysis Structure",
          panel: <DomainAnalysisTable />,
        },
        {
          id: "manage",
          label: "Manage Domain Analysis",
          panel: <DomainAnalysisWorkspace />,
        },
      ]}
    />
  );
}
