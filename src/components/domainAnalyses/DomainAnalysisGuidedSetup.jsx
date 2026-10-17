// Optional first setup for a Domain Analysis. Convention A on the shared
// wizard shell: the rail click always reaches the parent, and the parent
// decides whether the step changes. Step 2 links to Curricular policies
// and writes nothing. Review saves a draft and returns to the workspace.

import { Link } from "react-router-dom";
import WizardSidebar from "@/components/wizard/WizardSidebar";
import WizardStepContainer from "@/components/wizard/WizardStepContainer";
import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";
import { PSYCHOLOGICAL_PERSPECTIVES, psychologicalPerspectiveLabel } from "@/utils/ecdVocabulary";
import { SECTION_HINT, inputClass, formIsDirty } from "./domainAnalysisForm";

export const GUIDED_STEPS = [
  { id: "name", label: "Name" },
  { id: "policy", label: "Curricular policy" },
  { id: "statements", label: "Statements" },
  { id: "review", label: "Review" },
];

const STEP_TITLES = [
  "Name and perspective",
  "Curricular policy",
  "Valued knowledge and performance outcomes",
  "Review",
];

function canProceed(step, form) {
  if (step === 1 || step === GUIDED_STEPS.length) return form.name.trim().length > 0;
  return true;
}

function StatementField({ field, padi, value, onChange }) {
  return (
    <label className="block text-sm font-medium text-slate-900">
      {padi}
      <span className="mt-0.5 block text-xs font-normal text-slate-600">{SECTION_HINT[field]}</span>
      <textarea
        className={`${inputClass} mt-1 min-h-28`}
        aria-label={padi}
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  );
}

function reviewLines(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return ["No statement yet"];
  return lines;
}

export default function DomainAnalysisGuidedSetup({
  form,
  setField,
  step,
  setStep,
  onCancel,
  onSaveDraft,
  onSaved,
}) {
  const stepIndex = step - 1;
  const proceed = canProceed(step, form);

  function goNext() {
    if (!proceed) return;
    if (step < GUIDED_STEPS.length) setStep(step + 1);
  }

  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  function renderStep() {
    if (step === 1) {
      return (
        <div className="max-w-prose space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Name and perspective</h2>
          <p className="text-sm leading-6 text-slate-700">
            A draft needs a name. The perspective can wait, and confirm will ask for it later.
          </p>
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
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="max-w-prose space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Curricular policy</h2>
          <p className="text-sm leading-6 text-slate-700">
            Content standards are a curricular policy copied onto the analysis. Valued knowledge is not that policy. This step does not write content standards and does not open a new screen. Author the policy under Curricular policies. The copy stays read-only on the analysis.
          </p>
          <p className="text-sm leading-6 text-slate-700">
            You can skip this step. Leaving to edit a policy does not save this draft. Saving happens on Review.
          </p>
          <Link
            to="/admin?tab=curricular-policies"
            className="inline-flex text-sm font-medium text-slate-900 underline decoration-slate-400 underline-offset-4 hover:decoration-slate-900"
          >
            Open Curricular policies
          </Link>
          <div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Skip
            </button>
          </div>
        </div>
      );
    }

    if (step === 3) {
      const knowledge = DOMAIN_ANALYSIS_ENTITIES.find((section) => section.field === "valuedKnowledge");
      const outcomes = DOMAIN_ANALYSIS_ENTITIES.find((section) => section.field === "performanceOutcomes");
      return (
        <div className="max-w-prose space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Valued knowledge and performance outcomes</h2>
          <p className="text-sm leading-6 text-slate-700">
            One statement per line. Valued knowledge is not a curricular policy. Knowledge–task lines are not Q-matrix cells.
          </p>
          <StatementField
            field={knowledge.field}
            padi={knowledge.padi}
            value={form[knowledge.field]}
            onChange={setField}
          />
          <StatementField
            field={outcomes.field}
            padi={outcomes.padi}
            value={form[outcomes.field]}
            onChange={setField}
          />
        </div>
      );
    }

    const perspective = form.psychologicalPerspective
      ? psychologicalPerspectiveLabel(form.psychologicalPerspective)
      : "Not declared yet";
    const knowledgeLines = reviewLines(form.valuedKnowledge);
    const outcomeLines = reviewLines(form.performanceOutcomes);

    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Review</h2>
        <p className="max-w-prose text-sm leading-6 text-slate-700">
          Saving stores a draft and opens the workspace. The other five sections stay empty until you write them there. Confirm still authorises no student delivery.
        </p>
        <dl className="border-y border-slate-200">
          <div className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-slate-900">Name</dt>
            <dd className="text-sm text-slate-800">{form.name.trim()}</dd>
          </div>
          <div className="grid gap-1 border-t border-slate-200 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-slate-900">Psychological perspective</dt>
            <dd className="text-sm text-slate-800">{perspective}</dd>
          </div>
          <div className="grid gap-1 border-t border-slate-200 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-slate-900">Valued knowledge</dt>
            <dd className="text-sm text-slate-800">
              <ul className="space-y-1">
                {knowledgeLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="grid gap-1 border-t border-slate-200 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-slate-900">Performance outcomes</dt>
            <dd className="text-sm text-slate-800">
              <ul className="space-y-1">
                {outcomeLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="flex min-h-[36rem] rounded-xl border border-slate-200 bg-white">
      <WizardSidebar
        steps={GUIDED_STEPS}
        currentStepIndex={stepIndex}
        onStepClick={(index) => {
          const stepId = index + 1;
          if (stepId <= step || canProceed(step, form)) setStep(stepId);
        }}
        status="draft"
        title="Domain Analysis"
        subtitle="Optional first setup"
        brandInitial="D"
        footerLabel="Domain analysis"
      />
      <WizardStepContainer
        step={step}
        totalSteps={GUIDED_STEPS.length}
        stepTitle={STEP_TITLES[stepIndex]}
        onNext={goNext}
        onBack={goBack}
        onCancel={onCancel}
        canProceed={proceed}
        isLast={step === GUIDED_STEPS.length}
        status="draft"
        isDirty={formIsDirty(form)}
        onSaveDraft={onSaveDraft}
        onSaveAndReview={onSaved}
        saveDraftLabel="Save draft"
        modelLabel="Domain Analysis"
      >
        {renderStep()}
      </WizardStepContainer>
    </div>
  );
}
