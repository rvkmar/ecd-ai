// src/components/rating/AdjudicationPanel.jsx
//
// D124: shown only for pending_adjudication (after require_agreement held).
// Both sides may be visible here — the blind human rating already happened.

import React from "react";
import { Button } from "@/components/ui/button";

export default function AdjudicationPanel({
  detail,
  notes,
  onNotesChange,
  submitting,
  onResolve,
  onCancel,
}) {
  const adj = detail?.adjudication || {};
  return (
    <div className="border rounded-md p-4 space-y-4 border-amber-300/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Adjudication required</h3>
          <p className="text-sm text-muted-foreground">
            Automated and human phases disagreed under{" "}
            <span className="font-mono">{adj.adjudicationRule || "require_agreement"}</span>.
            Choose the final Observable activation.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Close
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Automated</dt>
          <dd className="font-mono">{String(adj.automatedActivated)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Human</dt>
          <dd className="font-mono">{String(adj.humanActivated)}</dd>
        </div>
      </dl>

      <div>
        <label className="text-sm font-medium" htmlFor="adj-notes">
          Adjudicator notes
        </label>
        <textarea
          id="adj-notes"
          className="mt-1 w-full border rounded-md p-2 text-sm min-h-[72px]"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" disabled={submitting} onClick={() => onResolve(true)}>
          Final: activated
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={submitting}
          onClick={() => onResolve(false)}
        >
          Final: not activated
        </Button>
      </div>
    </div>
  );
}
