// Attach and reveal TU8 item feedback.
//
// resolveItemFeedback decides the text. This module writes that object
// onto the response and, for a learner report, drops it when the existing
// feedback mode says the learner must not see it yet.

import { presentSession } from "./deliveryAdministration.js";
import { resolveItemFeedback } from "../../src/utils/itemFeedback.js";

export { resolveItemFeedback };

/**
 * Write response.feedback, or remove it when this item has no matching rule.
 * A missing item leaves the response alone.
 */
export function stampItemFeedback(item, response) {
  if (!response || typeof response !== "object") return response;
  if (!item) return response;
  const resolved = resolveItemFeedback(item, response);
  if (resolved) response.feedback = resolved;
  else delete response.feedback;
  return response;
}

/**
 * Item feedback a viewer may see. Students follow feedbackMode
 * (none, immediate, delayed_end). Staff keep the stored text.
 * An empty list means there is nothing to add to the report.
 */
export function visibleItemFeedback(session, user) {
  const view = presentSession(session, user);
  const responses = Array.isArray(view?.responses) ? view.responses : [];
  const rows = [];
  for (const response of responses) {
    const feedback = response?.feedback;
    if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) continue;
    const text = typeof feedback.text === "string" ? feedback.text.trim() : "";
    if (!text) continue;
    rows.push({
      taskId: response.taskId ?? null,
      itemId: response.itemId ?? null,
      text,
      rule: typeof feedback.rule === "string" ? feedback.rule : null,
      key: feedback.key == null ? null : String(feedback.key),
    });
  }
  return rows;
}
