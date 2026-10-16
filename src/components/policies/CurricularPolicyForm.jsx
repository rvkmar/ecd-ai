import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useCreateCurricularPolicy,
  useUpdateCurricularPolicy,
} from "@/api/queries/curricularPolicies";
import toast from "react-hot-toast";
import {
  draftFromPolicy,
  emptyCompetency,
  emptyGoal,
  payloadFromDraft,
} from "./curricularPolicyDraft";

function Field({ id, label, children }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export default function CurricularPolicyForm({ policy, onCancel, onSaved }) {
  const [draft, setDraft] = useState(() => draftFromPolicy(policy));
  const createPolicy = useCreateCurricularPolicy();
  const updatePolicy = useUpdateCurricularPolicy();
  const saving = createPolicy.isPending || updatePolicy.isPending;

  function patch(partial) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function patchGoal(index, partial) {
    setDraft((current) => ({
      ...current,
      curricularGoals: current.curricularGoals.map((goal, i) =>
        i === index ? { ...goal, ...partial } : goal
      ),
    }));
  }

  function patchCompetency(goalIndex, compIndex, partial) {
    setDraft((current) => ({
      ...current,
      curricularGoals: current.curricularGoals.map((goal, i) => {
        if (i !== goalIndex) return goal;
        return {
          ...goal,
          competencies: goal.competencies.map((comp, j) =>
            j === compIndex ? { ...comp, ...partial } : comp
          ),
        };
      }),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = payloadFromDraft(draft);
    try {
      if (policy?.id) {
        await updatePolicy.mutateAsync({ id: policy.id, payload });
        toast.success("Curricular policy updated.");
      } else {
        await createPolicy.mutateAsync(payload);
        toast.success("Curricular policy saved.");
      }
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save curricular policy."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">
          {policy ? "Edit curricular policy" : "New curricular policy"}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Write the curriculum document here. A policy needs a name and at least one goal with a
          code and a statement.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="cp-name" label="Name">
          <Input
            id="cp-name"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            required
          />
        </Field>
        <Field id="cp-version" label="Version">
          <Input
            id="cp-version"
            value={draft.version}
            onChange={(e) => patch({ version: e.target.value })}
          />
        </Field>
        <Field id="cp-body" label="Issuing body">
          <Input
            id="cp-body"
            value={draft.issuingBody}
            onChange={(e) => patch({ issuingBody: e.target.value })}
          />
        </Field>
        <Field id="cp-subject" label="Subject">
          <Input
            id="cp-subject"
            value={draft.subject}
            onChange={(e) => patch({ subject: e.target.value })}
          />
        </Field>
        <Field id="cp-stage" label="Stage">
          <Input
            id="cp-stage"
            value={draft.stage}
            onChange={(e) => patch({ stage: e.target.value })}
          />
        </Field>
      </div>

      <Field id="cp-description" label="Description">
        <Textarea
          id="cp-description"
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={2}
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Curricular goals</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              patch({ curricularGoals: [...draft.curricularGoals, emptyGoal()] })
            }
          >
            Add goal
          </Button>
        </div>

        {draft.curricularGoals.map((goal, gi) => (
          <div key={gi} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Goal {gi + 1}</p>
              {draft.curricularGoals.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patch({
                      curricularGoals: draft.curricularGoals.filter((_, i) => i !== gi),
                    })
                  }
                >
                  Remove goal
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <Field id={`goal-code-${gi}`} label="Code">
                <Input
                  id={`goal-code-${gi}`}
                  value={goal.code}
                  onChange={(e) => patchGoal(gi, { code: e.target.value })}
                  placeholder="CG-1"
                />
              </Field>
              <Field id={`goal-statement-${gi}`} label="Statement">
                <Input
                  id={`goal-statement-${gi}`}
                  value={goal.statement}
                  onChange={(e) => patchGoal(gi, { statement: e.target.value })}
                />
              </Field>
            </div>

            <div className="space-y-2 pl-3 border-l border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Competencies</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patchGoal(gi, {
                      competencies: [...goal.competencies, emptyCompetency()],
                    })
                  }
                >
                  Add competency
                </Button>
              </div>
              {goal.competencies.length === 0 && (
                <p className="text-xs text-muted-foreground">No competencies on this goal yet.</p>
              )}
              {goal.competencies.map((comp, ci) => (
                <div key={ci} className="space-y-2 rounded-md border border-border bg-background p-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        patchGoal(gi, {
                          competencies: goal.competencies.filter((_, j) => j !== ci),
                        })
                      }
                    >
                      Remove competency
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                    <Field id={`comp-code-${gi}-${ci}`} label="Code">
                      <Input
                        id={`comp-code-${gi}-${ci}`}
                        value={comp.code}
                        onChange={(e) => patchCompetency(gi, ci, { code: e.target.value })}
                        placeholder="C-1.1"
                      />
                    </Field>
                    <Field id={`comp-statement-${gi}-${ci}`} label="Statement">
                      <Input
                        id={`comp-statement-${gi}-${ci}`}
                        value={comp.statement}
                        onChange={(e) => patchCompetency(gi, ci, { statement: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field id={`comp-outcomes-${gi}-${ci}`} label="Learning outcomes (one per line)">
                    <Textarea
                      id={`comp-outcomes-${gi}-${ci}`}
                      value={comp.learningOutcomesText}
                      onChange={(e) =>
                        patchCompetency(gi, ci, { learningOutcomesText: e.target.value })
                      }
                      rows={3}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save policy"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
