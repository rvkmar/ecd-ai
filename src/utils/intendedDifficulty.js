// Intended difficulty is a number on the task model's scale, plus commentary.
// A qualitative band (easy / moderate / hard) is a second scale and is not
// a placement inside blueprintConstraints.difficultyRange.

export function intendedDifficultyPlacement(value, range) {
  const min = range?.min;
  const max = range?.max;
  const applicable =
    typeof min === "number" &&
    typeof max === "number" &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min < max;

  if (!applicable) {
    return { applicable: false, ok: true, message: null };
  }

  const text = value == null ? "" : String(value).trim();
  const span = `${min} to ${max}`;

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return {
      applicable: true,
      ok: false,
      message: `Intended difficulty must be a number inside the task range (${span}).`,
    };
  }

  const n = Number(text);
  if (n < min || n > max) {
    return {
      applicable: true,
      ok: false,
      message: `Intended difficulty ${n} sits outside the task range (${span}).`,
    };
  }

  return { applicable: true, ok: true, message: null, value: n };
}
