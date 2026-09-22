// src/utils/taskModelVariableFamily.js
//
// D120 / W24. Per-Task-Model TMV settings that templates (W26) and
// generation (W31) will read: which bound variables are fixed, which
// vary, and across which discrete levels. Family size is the Cartesian
// product of the varying value sets (fixed contribute factor 1).
//
// Numeric variables do not expand a discrete family unless the setting
// names an explicit allowedValues list of numeric strings; continuous
// min/max windows alone are not a generation axis.

import { taskModelVariableValueIds } from "./ecdVocabulary.js";

export const TMV_VARIATION_MODES = Object.freeze(["fixed", "varying"]);

/**
 * D117 settings omit `variation`. Treat them as varying so existing
 * allowedValues constraints keep working.
 */
export function resolveSettingVariation(setting) {
  if (setting?.variation === "fixed" || setting?.variation === "varying") {
    return setting.variation;
  }
  return "varying";
}

function normalizeLevel(raw) {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t === "" ? null : t;
  }
  if (raw && typeof raw === "object" && typeof raw.value === "string") {
    const t = raw.value.trim();
    return t === "" ? null : t;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

/**
 * Discrete levels this setting contributes to a generated family.
 * Empty array means the setting cannot generate (invalid fixed, or
 * numeric without a discrete list).
 */
export function discreteLevelsForSetting(setting, variable) {
  if (!variable) return [];
  const libraryLevels = taskModelVariableValueIds(variable);
  const mode = resolveSettingVariation(setting);

  if (mode === "fixed") {
    const fixed = normalizeLevel(setting?.fixedValue);
    if (!fixed) return [];
    if (libraryLevels.length && !libraryLevels.includes(fixed)) return [];
    return [fixed];
  }

  if (Array.isArray(setting?.allowedValues) && setting.allowedValues.length > 0) {
    const out = [];
    const seen = new Set();
    for (const raw of setting.allowedValues) {
      const v = normalizeLevel(raw);
      if (!v || seen.has(v)) continue;
      if (libraryLevels.length && !libraryLevels.includes(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  // Varying with no subset → full library levels. Numeric with only
  // min/max has no discrete library levels → no generation axis.
  return libraryLevels;
}

/**
 * Projected number of task specs a template would generate from these
 * settings. Returns 0 when any varying/fixed discrete axis is empty
 * (incoherent), or 1 when there are no discrete axes at all.
 */
export function projectTaskSpecFamilySize(settings, variables) {
  const byId = indexVariables(variables);
  const axes = [];
  for (const setting of settings || []) {
    const id = setting?.taskModelVariableId;
    if (!id) continue;
    const levels = discreteLevelsForSetting(setting, byId.get(id));
    if (levels.length === 0) {
      // Fixed/varying discrete variable with no usable levels → cannot generate.
      if (byId.has(id) && byId.get(id).type !== "numeric") return 0;
      if (
        byId.has(id) &&
        byId.get(id).type === "numeric" &&
        resolveSettingVariation(setting) === "fixed" &&
        !normalizeLevel(setting?.fixedValue)
      ) {
        return 0;
      }
      continue;
    }
    axes.push(levels.length);
  }
  if (axes.length === 0) return 1;
  return axes.reduce((acc, n) => acc * n, 1);
}

/**
 * Full family of assignments: [{ taskModelVariableId, value }, ...]
 * Capped so an accidental 4,000-spec design does not allocate forever.
 */
export function projectTaskSpecFamily(settings, variables, options = {}) {
  const max = typeof options.max === "number" ? options.max : 500;
  const byId = indexVariables(variables);
  const axes = [];
  for (const setting of settings || []) {
    const id = setting?.taskModelVariableId;
    if (!id || !byId.has(id)) continue;
    const levels = discreteLevelsForSetting(setting, byId.get(id));
    if (levels.length === 0) continue;
    axes.push({ taskModelVariableId: id, levels });
  }
  if (axes.length === 0) return [[]];

  let family = [[]];
  for (const axis of axes) {
    const next = [];
    for (const partial of family) {
      for (const value of axis.levels) {
        next.push([
          ...partial,
          { taskModelVariableId: axis.taskModelVariableId, value },
        ]);
        if (next.length > max) {
          return next.slice(0, max);
        }
      }
    }
    family = next;
  }
  return family;
}

function indexVariables(variables) {
  const map = new Map();
  for (const v of variables || []) {
    if (v?.id) map.set(v.id, v);
  }
  return map;
}
