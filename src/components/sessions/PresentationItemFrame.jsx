// Shared-stimulus pane for the student item card.
// single_item and section keep each item on its own screen.
// shared_stimulus, and a missing grouping, keep today's stimulus block.

import React from "react";

export function showSharedStimulus(grouping) {
  return grouping == null || grouping === "shared_stimulus";
}

export default function PresentationItemFrame({
  grouping = null,
  sharedText = "",
  children,
}) {
  const text = typeof sharedText === "string" ? sharedText.trim() : "";
  const visible = showSharedStimulus(grouping) && text.length > 0;

  return (
    <div data-presentation-grouping={grouping || "legacy"} className="space-y-4">
      {visible ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800 whitespace-pre-line"
          data-testid="presentation-shared-stimulus"
        >
          {text}
        </div>
      ) : null}
      {children}
    </div>
  );
}
