// Per-examinee accommodations (TU7, gap T6).
//
// Optional on students.accommodations. Absent, empty, or invalid fields
// leave delivery unchanged. Session minutes and task seconds share
// applyAccommodationTiming so a later task-limit enforcer (TU10) does
// not invent a second formula.
//
// duration = base * presentationMultiplier * studentTimeMultiplier
//   + extraTimeMinutes
// Task limits pass timeLimitSeconds and leave presentationMultiplier at 1.
// The presentation factor is already on the session deadline. Counting it
// again on the task would stack it twice.

const ACCOMMODATION_KEYS = Object.freeze([
  "extraTimeMinutes",
  "timeMultiplier",
  "fontScale",
  "highContrast",
  "readAloud",
]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function acceptedExtra(value) {
  if (!finite(value) || value < 0) return 0;
  return value;
}

function acceptedMultiplier(value) {
  if (!finite(value) || value < 1 || value > 3) return 1;
  return value;
}

function acceptedFont(value) {
  if (!finite(value) || value < 1 || value > 2) return 1;
  return value;
}

/**
 * The object that holds the five fields. A student record contributes
 * its accommodations property. A plain profile is used as itself.
 * A missing property is absent, not a profile of defaults.
 */
function profileSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (Object.prototype.hasOwnProperty.call(source, "accommodations")) {
    const nested = source.accommodations;
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return null;
    return nested;
  }
  return source;
}

/**
 * @param {object|null|undefined} source student record or accommodations object
 * @returns {{
 *   active: boolean,
 *   timingActive: boolean,
 *   extraTimeMinutes: number,
 *   timeMultiplier: number,
 *   fontScale: number,
 *   highContrast: boolean,
 *   readAloud: boolean,
 *   profile: object|null,
 * }}
 */
export function resolveAccommodations(source) {
  const raw = profileSource(source);
  const profile = {};
  if (raw) {
    const extra = acceptedExtra(raw.extraTimeMinutes);
    const multiplier = acceptedMultiplier(raw.timeMultiplier);
    const font = acceptedFont(raw.fontScale);
    if (extra > 0) profile.extraTimeMinutes = extra;
    if (multiplier !== 1) profile.timeMultiplier = multiplier;
    if (font !== 1) profile.fontScale = font;
    if (raw.highContrast === true) profile.highContrast = true;
    if (raw.readAloud === true) profile.readAloud = true;
  }
  const active = Object.keys(profile).length > 0;
  const extraTimeMinutes = profile.extraTimeMinutes || 0;
  const timeMultiplier = profile.timeMultiplier || 1;
  return {
    active,
    timingActive: extraTimeMinutes > 0 || timeMultiplier !== 1,
    extraTimeMinutes,
    timeMultiplier,
    fontScale: profile.fontScale || 1,
    highContrast: profile.highContrast === true,
    readAloud: profile.readAloud === true,
    profile: active ? profile : null,
  };
}

/**
 * Schema and write-path errors. Null and undefined are absent and valid.
 * Unknown keys are refused so a typo does not look saved.
 */
export function accommodationFieldErrors(accommodations) {
  if (accommodations == null) return [];
  if (typeof accommodations !== "object" || Array.isArray(accommodations)) {
    return ["accommodations must be an object."];
  }
  const errors = [];
  for (const key of Object.keys(accommodations)) {
    if (!ACCOMMODATION_KEYS.includes(key)) {
      errors.push(`accommodations.${key} is not a student accommodation.`);
    }
  }
  const extra = accommodations.extraTimeMinutes;
  if (extra !== undefined && (!finite(extra) || extra < 0)) {
    errors.push("accommodations.extraTimeMinutes must be a non-negative number.");
  }
  const multiplier = accommodations.timeMultiplier;
  if (multiplier !== undefined && (!finite(multiplier) || multiplier < 1 || multiplier > 3)) {
    errors.push("accommodations.timeMultiplier must be a number in [1, 3].");
  }
  const font = accommodations.fontScale;
  if (font !== undefined && (!finite(font) || font < 1 || font > 2)) {
    errors.push("accommodations.fontScale must be a number in [1, 2].");
  }
  if (accommodations.highContrast !== undefined && typeof accommodations.highContrast !== "boolean") {
    errors.push("accommodations.highContrast must be a boolean.");
  }
  if (accommodations.readAloud !== undefined && typeof accommodations.readAloud !== "boolean") {
    errors.push("accommodations.readAloud must be a boolean.");
  }
  return errors;
}

/**
 * Drop default values so a stored profile is absent when nothing changes
 * delivery. Invalid input returns the field errors and no value.
 */
export function accommodationsForStorage(input) {
  if (input == null) return { ok: true, value: null };
  const errors = accommodationFieldErrors(input);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: resolveAccommodations(input).profile };
}

/**
 * One timing formula for a session limit (minutes) or a task limit (seconds).
 * Pass one base. The other result stays null.
 * adjusted is true when the returned duration differs from the base alone,
 * including a presentation multiplier other than 1.
 */
export function applyAccommodationTiming({
  timeLimitMinutes = null,
  timeLimitSeconds = null,
  presentationMultiplier = 1,
  accommodations = null,
} = {}) {
  const resolved = resolveAccommodations(accommodations);
  const presentation = acceptedMultiplier(presentationMultiplier);
  const factor = presentation * resolved.timeMultiplier;
  const extra = resolved.extraTimeMinutes;

  let minutes = null;
  let seconds = null;
  let durationMs = null;
  let baseMs = null;

  if (finite(timeLimitMinutes) && timeLimitMinutes > 0) {
    durationMs = Math.round((timeLimitMinutes * factor + extra) * 60000);
    minutes = durationMs / 60000;
    baseMs = Math.round(timeLimitMinutes * 60000);
  } else if (finite(timeLimitSeconds) && timeLimitSeconds > 0) {
    durationMs = Math.round((timeLimitSeconds * factor + extra * 60) * 1000);
    seconds = durationMs / 1000;
    baseMs = Math.round(timeLimitSeconds * 1000);
  }

  return {
    minutes,
    seconds,
    durationMs,
    adjusted: durationMs != null && durationMs !== baseMs,
    extraTimeMinutes: extra,
    timeMultiplier: resolved.timeMultiplier,
    presentationMultiplier: presentation,
  };
}

export function findStudentRecord(db, studentId) {
  if (studentId == null || studentId === "") return null;
  const want = String(studentId);
  return (
    (db?.students || []).find(
      (row) => row && (String(row.id) === want || String(row.username || "") === want)
    ) || null
  );
}

/**
 * Raw task-model limits for the tasks on a session. TU10 enforces them.
 * This only reads timingConstraint.timeLimitSeconds.
 */
export function taskTimeLimitInputs(db, taskIds) {
  const rows = [];
  const tasks = db?.tasks || [];
  const models = db?.taskModels || [];
  for (const taskId of taskIds || []) {
    const task = tasks.find((row) => row && row.id === taskId);
    if (!task?.taskModelId) continue;
    const model = models.find((row) => row && row.id === task.taskModelId);
    const seconds = model?.taskStructure?.timingConstraint?.timeLimitSeconds;
    if (!finite(seconds) || seconds <= 0) continue;
    rows.push({ taskId, timeLimitSeconds: seconds });
  }
  return rows;
}

/**
 * Attach a student profile to a presentation overlay. Absent profile
 * returns the overlay unchanged (null stays null).
 */
export function withStudentAccommodations(presentation, source) {
  const resolved = resolveAccommodations(source);
  if (!resolved.active) return presentation || null;
  if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) {
    return { accommodations: resolved.profile };
  }
  return { ...presentation, accommodations: resolved.profile };
}
