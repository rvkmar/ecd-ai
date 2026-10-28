// Examinee-facing feedback for one response. Renders nothing when the
// timing says to hide it, or when the response has no server-provided
// feedback fields.

import React from "react";
import { feedbackVisibleNow, responseFeedbackLines } from "./presentationPlayer.js";

export default function ItemResponseFeedback({
  response,
  timing,
  phase,
  sessionClosed = false,
}) {
  if (!feedbackVisibleNow(timing, phase, sessionClosed)) return null;
  const lines = responseFeedbackLines(response);
  if (lines.length === 0) return null;

  return (
    <div
      className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-slate-800"
      data-testid="item-response-feedback"
      data-feedback-timing={timing}
      role="status"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
        Feedback
      </div>
      {lines.map((line) => (
        <p key={line} className="mt-1 whitespace-pre-line">
          {line}
        </p>
      ))}
    </div>
  );
}
