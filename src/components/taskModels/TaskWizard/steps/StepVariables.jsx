// StepVariables.jsx
// ------------------------------------------------------------
// Task Model Wizard — bind shared Task Model Variables (D117 / W24).
// D120: per-model variation (fixed | varying) so W26 templates / W31
// generation can express a family. Does NOT re-point
// taskStructure.presentationMode strings (that is D119).
// ------------------------------------------------------------

import { useMemo } from "react";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import {
  tmvTypeLabel,
  taskModelVariableValueIds,
} from "@/utils/ecdVocabulary";
import {
  projectTaskSpecFamilySize,
  resolveSettingVariation,
} from "@/utils/taskModelVariableFamily";

const inputBase =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function settingFor(settings, id) {
  return (
    (settings || []).find((s) => s.taskModelVariableId === id) || {
      taskModelVariableId: id,
      required: false,
      variation: "varying",
    }
  );
}

function syncBindings(ids, settings) {
  return ids.map((id) => settingFor(settings, id));
}

export default function StepVariables({ draft, setDraft, disabled }) {
  const { data: library = [], isLoading } = useTaskModelVariables();
  const boundIds = draft.taskModelVariableIds || [];
  const settings = draft.taskModelVariableSettings || [];

  const byId = useMemo(() => {
    const map = {};
    for (const row of library) map[row.id] = row;
    return map;
  }, [library]);

  const unbound = library.filter((row) => !boundIds.includes(row.id));

  const familySize = useMemo(() => {
    const boundSettings = syncBindings(boundIds, settings);
    const vars = boundIds.map((id) => byId[id]).filter(Boolean);
    return projectTaskSpecFamilySize(boundSettings, vars);
  }, [boundIds, settings, byId]);

  const setBindings = (nextIds, nextSettings) => {
    setDraft((d) => ({
      ...d,
      taskModelVariableIds: nextIds,
      taskModelVariableSettings: syncBindings(nextIds, nextSettings),
    }));
  };

  const addVariable = (id) => {
    if (!id || boundIds.includes(id)) return;
    const nextIds = [...boundIds, id];
    setBindings(nextIds, settings);
  };

  const removeVariable = (id) => {
    setBindings(
      boundIds.filter((x) => x !== id),
      settings.filter((s) => s.taskModelVariableId !== id)
    );
  };

  const patchSetting = (id, patch) => {
    const next = syncBindings(boundIds, settings).map((s) =>
      s.taskModelVariableId === id ? { ...s, ...patch } : s
    );
    setDraft((d) => ({ ...d, taskModelVariableSettings: next }));
  };

  const setVariation = (id, variation) => {
    const current = settingFor(settings, id);
    if (variation === "fixed") {
      const variable = byId[id];
      const levels = variable ? taskModelVariableValueIds(variable) : [];
      const fixedValue =
        current.fixedValue ||
        (Array.isArray(current.allowedValues) && current.allowedValues[0]) ||
        levels[0] ||
        "";
      patchSetting(id, {
        variation: "fixed",
        fixedValue,
        allowedValues: undefined,
      });
    } else {
      patchSetting(id, {
        variation: "varying",
        fixedValue: undefined,
      });
    }
  };

  const toggleAllowed = (id, value, checked) => {
    const current = settingFor(settings, id);
    const prev = Array.isArray(current.allowedValues) ? current.allowedValues : [];
    const nextVals = checked
      ? [...new Set([...prev, value])]
      : prev.filter((v) => v !== value);
    patchSetting(id, {
      variation: "varying",
      allowedValues: nextVals.length ? nextVals : undefined,
      fixedValue: undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Task Model Variables</h2>
        <p className="mt-1 text-sm text-slate-500">
          Attach shared design features. Mark each as fixed (one level for every
          generated spec) or varying (cross-product axis for W31 families).
          Optional — does not block confirmation.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading library…</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-sm">
            <span className="font-medium text-slate-700">Add from library</span>
            <select
              className={`${inputBase} mt-1`}
              defaultValue=""
              disabled={disabled || unbound.length === 0}
              onChange={(e) => {
                addVariable(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">
                {library.length === 0
                  ? "No variables in library yet"
                  : unbound.length === 0
                    ? "All library variables bound"
                    : "Select a variable…"}
              </option>
              {unbound.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({tmvTypeLabel(row.type)})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {boundIds.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No variables bound. Create library records first, then attach them
          here so more than one Task Model can consume the same id.
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {boundIds.map((id) => {
              const variable = byId[id];
              const setting = settingFor(settings, id);
              const levels = variable ? taskModelVariableValueIds(variable) : [];
              const variation = resolveSettingVariation(setting);
              return (
                <li
                  key={id}
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">
                        {variable?.name || id}
                      </div>
                      <div className="text-xs text-slate-400">
                        {id}
                        {variable
                          ? ` · ${tmvTypeLabel(variable.type)}`
                          : " · missing from library"}
                      </div>
                    </div>
                    {!disabled && (
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:text-red-700"
                        onClick={() => removeVariable(id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={setting.required === true}
                      disabled={disabled || !variable}
                      onChange={(e) =>
                        patchSetting(id, { required: e.target.checked })
                      }
                    />
                    Required on this Task Model
                  </label>

                  {variable && variable.type !== "numeric" && levels.length > 0 && (
                    <fieldset className="mt-3">
                      <legend className="text-sm font-medium text-slate-700">
                        Variation (W31 family axis)
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`variation-${id}`}
                            disabled={disabled}
                            checked={variation === "fixed"}
                            onChange={() => setVariation(id, "fixed")}
                          />
                          Fixed
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`variation-${id}`}
                            disabled={disabled}
                            checked={variation === "varying"}
                            onChange={() => setVariation(id, "varying")}
                          />
                          Varying
                        </label>
                      </div>
                    </fieldset>
                  )}

                  {variable?.type === "numeric" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">
                          Min (within {variable.range?.min}–{variable.range?.max})
                        </span>
                        <input
                          type="number"
                          className={`${inputBase} mt-1`}
                          disabled={disabled}
                          value={setting.min ?? ""}
                          onChange={(e) =>
                            patchSetting(id, {
                              min:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Max</span>
                        <input
                          type="number"
                          className={`${inputBase} mt-1`}
                          disabled={disabled}
                          value={setting.max ?? ""}
                          onChange={(e) =>
                            patchSetting(id, {
                              max:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : levels.length > 0 && variation === "fixed" ? (
                    <label className="mt-3 block text-sm">
                      <span className="font-medium text-slate-700">Fixed level</span>
                      <select
                        className={`${inputBase} mt-1`}
                        disabled={disabled}
                        value={setting.fixedValue || ""}
                        onChange={(e) =>
                          patchSetting(id, {
                            variation: "fixed",
                            fixedValue: e.target.value,
                            allowedValues: undefined,
                          })
                        }
                      >
                        {levels.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : levels.length > 0 ? (
                    <fieldset className="mt-3">
                      <legend className="text-sm font-medium text-slate-700">
                        Varying levels (empty = all)
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {levels.map((value) => {
                          const checked = Array.isArray(setting.allowedValues)
                            ? setting.allowedValues.includes(value)
                            : false;
                          return (
                            <label
                              key={value}
                              className="flex items-center gap-1.5 text-sm text-slate-700"
                            >
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={checked}
                                onChange={(e) =>
                                  toggleAllowed(id, value, e.target.checked)
                                }
                              />
                              {value}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            data-testid="tmv-family-size"
          >
            Projected task-spec family size:{" "}
            <span className="font-semibold">{familySize}</span>
            {familySize > 200 ? (
              <span className="text-amber-700">
                {" "}
                — large; W31 generation should require confirmation.
              </span>
            ) : null}
          </p>
        </>
      )}
    </div>
  );
}
