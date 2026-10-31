// TU8 (T7). Optional learner-facing feedback on an item.
//
// items.feedback is absent by default. Response processing then stores
// nothing, and the player keeps the messages it already shows.
//
// When the object is present:
//   byOption  text keyed by option id
//   byScore   text keyed by a score ("1") or an inclusive range
//             ("0..1", or "0-1" when both ends are non-negative)
//   general   fallback when no option and no score rule matches
//
// Precedence is byOption, then byScore, then general. Inside byScore an
// exact score wins over a range. Overlapping ranges are refused so two
// rules cannot both claim the same score.

const NUMBER = "-?\\d+(?:\\.\\d+)?";
const EXACT_RE = new RegExp(`^${NUMBER}$`);
const DOTS_RE = new RegExp(`^(${NUMBER})\\s*\\.\\.\\s*(${NUMBER})$`);
const HYPHEN_RE = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*-\\s*(\\d+(?:\\.\\d+)?)$`);
const SCORE_EPSILON = 1e-9;

const FEEDBACK_FIELDS = new Set(["byOption", "byScore", "general"]);

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= SCORE_EPSILON;
}

function inRange(score, low, high) {
  return score >= low - SCORE_EPSILON && score <= high + SCORE_EPSILON;
}

export function parseScoreKey(rawKey) {
  const key = String(rawKey ?? "").trim();
  if (!key) return { ok: false, key, reason: "score" };
  if (EXACT_RE.test(key)) {
    const value = Number(key);
    if (!Number.isFinite(value)) return { ok: false, key, reason: "score" };
    return { ok: true, kind: "exact", key, value };
  }
  const match = key.match(DOTS_RE) || key.match(HYPHEN_RE);
  if (!match) return { ok: false, key, reason: "score" };
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return { ok: false, key, reason: "score" };
  }
  if (low > high + SCORE_EPSILON) return { ok: false, key, reason: "order" };
  return { ok: true, kind: "range", key, low, high };
}

export function optionIdsOnItem(item) {
  const components = item?.interaction?.responseComponents;
  if (!Array.isArray(components)) return [];
  const ids = [];
  for (const row of components) {
    if (!row || typeof row.id !== "string") continue;
    const id = row.id.trim();
    if (id) ids.push(id);
  }
  return ids;
}

function copyTextMap(source) {
  if (source == null) return undefined;
  if (typeof source !== "object" || Array.isArray(source)) return source;
  const next = {};
  for (const [rawKey, value] of Object.entries(source)) {
    const key = String(rawKey).trim();
    if (!key) continue;
    if (typeof value === "string") {
      const text = value.trim();
      if (text) next[key] = text;
    } else if (value != null) {
      next[key] = value;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

/**
 * Trim text and drop blank entries. Invalid values are kept so validation
 * can still name them. Null when nothing authored remains.
 */
export function normalizeItemFeedback(feedback) {
  if (feedback == null) return null;
  if (typeof feedback !== "object" || Array.isArray(feedback)) return feedback;

  const next = {};
  const byOption = copyTextMap(feedback.byOption);
  const byScore = copyTextMap(feedback.byScore);
  if (byOption !== undefined) next.byOption = byOption;
  if (byScore !== undefined) next.byScore = byScore;

  if (typeof feedback.general === "string") {
    const text = feedback.general.trim();
    if (text) next.general = text;
  } else if (feedback.general != null && feedback.general !== "") {
    next.general = feedback.general;
  }

  for (const key of Object.keys(feedback)) {
    if (FEEDBACK_FIELDS.has(key)) continue;
    next[key] = feedback[key];
  }

  return Object.keys(next).length ? next : null;
}

export function itemFeedbackSummary(feedback) {
  const normalized = normalizeItemFeedback(feedback);
  if (normalized == null) return "None";
  if (typeof normalized !== "object" || Array.isArray(normalized)) return "Invalid";
  const parts = [];
  if (normalized.byOption && typeof normalized.byOption === "object" && !Array.isArray(normalized.byOption)) {
    const count = Object.keys(normalized.byOption).length;
    if (count) parts.push(`${count} by option`);
  }
  if (normalized.byScore && typeof normalized.byScore === "object" && !Array.isArray(normalized.byScore)) {
    const count = Object.keys(normalized.byScore).length;
    if (count) parts.push(`${count} by score`);
  }
  if (typeof normalized.general === "string" && normalized.general.trim()) parts.push("general");
  return parts.length ? parts.join(", ") : "None";
}

function textError(where, value) {
  if (typeof value !== "string") return `${where} must be text.`;
  if (!value.trim()) return `${where} must be non-empty text.`;
  return null;
}

/**
 * Value errors for items.feedback. Absent, null, or an empty object is valid.
 */
export function itemFeedbackErrors(item = {}) {
  const feedback = item?.feedback;
  if (feedback == null) return [];
  if (typeof feedback !== "object" || Array.isArray(feedback)) {
    return ["items.feedback must be an object with byOption, byScore, and general when present."];
  }

  const errors = [];
  for (const key of Object.keys(feedback)) {
    if (!FEEDBACK_FIELDS.has(key)) {
      errors.push(
        `items.feedback.${key} is not a feedback field. Use byOption, byScore, or general.`
      );
    }
  }

  if (feedback.byOption != null) {
    if (typeof feedback.byOption !== "object" || Array.isArray(feedback.byOption)) {
      errors.push("items.feedback.byOption must be an object keyed by option id.");
    } else {
      const ids = optionIdsOnItem(item);
      const entries = Object.entries(feedback.byOption);
      if (entries.length > 0 && ids.length === 0) {
        errors.push("items.feedback.byOption needs option ids on the interaction.");
      }
      for (const [key, value] of entries) {
        const where = `items.feedback.byOption['${key}']`;
        const problem = textError(where, value);
        if (problem) errors.push(problem);
        if (ids.length > 0 && !ids.includes(key)) {
          errors.push(`${where} does not match an option id on this item.`);
        }
      }
    }
  }

  if (feedback.byScore != null) {
    if (typeof feedback.byScore !== "object" || Array.isArray(feedback.byScore)) {
      errors.push("items.feedback.byScore must be an object keyed by a score or a range.");
    } else {
      const parsed = [];
      for (const [key, value] of Object.entries(feedback.byScore)) {
        const where = `items.feedback.byScore['${key}']`;
        const problem = textError(where, value);
        if (problem) errors.push(problem);
        const spec = parseScoreKey(key);
        if (!spec.ok) {
          errors.push(
            spec.reason === "order"
              ? `${where} must run from a lower score to a higher score.`
              : `${where} must be a score such as 1, or an inclusive range such as 0..1 or 0-1.`
          );
          continue;
        }
        parsed.push(spec);
      }

      for (let i = 0; i < parsed.length; i += 1) {
        for (let j = i + 1; j < parsed.length; j += 1) {
          const left = parsed[i];
          const right = parsed[j];
          if (left.kind === "exact" && right.kind === "exact" && nearlyEqual(left.value, right.value)) {
            errors.push(
              `items.feedback.byScore['${left.key}'] and items.feedback.byScore['${right.key}'] are the same score.`
            );
          }
          if (left.kind === "range" && right.kind === "range") {
            const overlap = left.low <= right.high + SCORE_EPSILON && right.low <= left.high + SCORE_EPSILON;
            if (overlap) {
              errors.push(
                `items.feedback.byScore['${left.key}'] and items.feedback.byScore['${right.key}'] overlap.`
              );
            }
          }
        }
      }
    }
  }

  if (feedback.general != null && feedback.general !== "") {
    const problem = textError("items.feedback.general", feedback.general);
    if (problem) errors.push(problem);
  }

  return errors;
}

function optionIdsFromAnswer(rawAnswer) {
  const selected =
    rawAnswer && typeof rawAnswer === "object" && !Array.isArray(rawAnswer)
      ? rawAnswer.selected
      : rawAnswer;
  if (typeof selected === "string" && selected.trim()) return [selected.trim()];
  if (!Array.isArray(selected)) return [];
  const ids = [];
  for (const entry of selected) {
    if (typeof entry === "string" && entry.trim()) ids.push(entry.trim());
  }
  return ids;
}

function scoreFromResponse(response) {
  if (!response || typeof response !== "object") return null;
  for (const field of ["scoredValue", "value", "category"]) {
    const value = response[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function textAt(map, key) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return "";
  const value = map[key];
  return typeof value === "string" ? value.trim() : "";
}

function matchByScore(byScore, score) {
  if (score == null || !byScore || typeof byScore !== "object" || Array.isArray(byScore)) return null;
  const rows = [];
  for (const [key, value] of Object.entries(byScore)) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) continue;
    const spec = parseScoreKey(key);
    if (!spec.ok) continue;
    rows.push({ ...spec, text });
  }
  const exact = rows.find((row) => row.kind === "exact" && nearlyEqual(row.value, score));
  if (exact) return { text: exact.text, key: exact.key };
  const range = rows.find((row) => row.kind === "range" && inRange(score, row.low, row.high));
  if (range) return { text: range.text, key: range.key };
  return null;
}

/**
 * Resolve authored feedback for one response.
 * Returns { text, rule, key } or null when the item has nothing to say.
 * Timing is not applied here. Delivery hides the stored object until the
 * session's feedback mode allows a learner to see it.
 */
export function resolveItemFeedback(item, response) {
  const feedback = item?.feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return null;

  for (const optionId of optionIdsFromAnswer(response?.rawAnswer)) {
    const text = textAt(feedback.byOption, optionId);
    if (text) return { text, rule: "byOption", key: optionId };
  }

  const scoreMatch = matchByScore(feedback.byScore, scoreFromResponse(response));
  if (scoreMatch) return { text: scoreMatch.text, rule: "byScore", key: scoreMatch.key };

  if (typeof feedback.general === "string" && feedback.general.trim()) {
    return { text: feedback.general.trim(), rule: "general", key: null };
  }
  return null;
}
