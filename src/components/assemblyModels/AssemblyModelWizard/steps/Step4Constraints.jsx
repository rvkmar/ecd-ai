// Optional content constraints. An empty step is valid: delivery then
// matches an assembly model that has no constraints field.

import React from "react";
import { Input } from "@/components/ui/input";
import { useTaskModels } from "@/api/queries/taskModels";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useItems } from "@/api/queries/items";
import { assemblyConstraintErrors } from "@/utils/assemblyConstraints";
import { useAssemblyModelWizard } from "../AssemblyModelWizardContext";

function blankCount() {
  return { min: "", max: "" };
}

function numberOrBlank(value) {
  return value == null || value === "" ? "" : String(value);
}

export default function Step4Constraints() {
  const { draft, replaceConstraints } = useAssemblyModelWizard();
  const locked = Boolean(draft.locked);
  const taskModels = useTaskModels().data || [];
  const variables = useTaskModelVariables().data || [];
  const items = useItems().data || [];
  const constraints = draft.constraints || {};
  const errors = assemblyConstraintErrors(draft.constraints, null);

  function commit(next) {
    const payload = {};
    if (next.taskModelCounts.length) payload.taskModelCounts = next.taskModelCounts;
    if (next.contentStandardCounts.length) payload.contentStandardCounts = next.contentStandardCounts;
    if (next.taskModelVariableCounts.length) payload.taskModelVariableCounts = next.taskModelVariableCounts;
    if (next.exposure) payload.exposure = next.exposure;
    if (next.enemies.length) payload.enemies = next.enemies;
    replaceConstraints(Object.keys(payload).length ? payload : undefined);
  }

  function read() {
    return {
      taskModelCounts: Array.isArray(constraints.taskModelCounts) ? constraints.taskModelCounts.map((row) => ({ ...row })) : [],
      contentStandardCounts: Array.isArray(constraints.contentStandardCounts)
        ? constraints.contentStandardCounts.map((row) => ({ ...row }))
        : [],
      taskModelVariableCounts: Array.isArray(constraints.taskModelVariableCounts)
        ? constraints.taskModelVariableCounts.map((row) => ({ ...row }))
        : [],
      exposure: constraints.exposure ? { ...constraints.exposure } : null,
      enemies: Array.isArray(constraints.enemies) ? constraints.enemies.map((row) => ({ ...row, itemIds: [...(row.itemIds || [])] })) : [],
    };
  }

  function setBound(listName, index, field, raw) {
    const next = read();
    const row = { ...next[listName][index] };
    if (raw === "") delete row[field];
    else row[field] = Number(raw);
    next[listName][index] = row;
    commit(next);
  }

  return (
    <div className="space-y-8" data-testid="assembly-constraints-step">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Content constraints</h2>
        <p className="mt-1 text-sm text-slate-500">
          Optional limits on how many and which tasks a session may deliver.
          Leave this step empty and the assembly model behaves as before.
          Minimums are filled before other tasks. A task that would pass a
          maximum, repeat an item past the cap, or break an enemy group is
          not selected.
        </p>
      </div>

      <CountSection
        title="Task models"
        hint="Minimum and maximum delivered tasks from one task model."
        locked={locked}
        rows={constraints.taskModelCounts || []}
        onAdd={() => {
          const next = read();
          next.taskModelCounts.push({ taskModelId: taskModels[0]?.id || "", ...blankCount() });
          commit(next);
        }}
        onRemove={(index) => {
          const next = read();
          next.taskModelCounts.splice(index, 1);
          commit(next);
        }}
        renderRow={(row, index) => (
          <select
            aria-label={`Task model ${index + 1}`}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            disabled={locked}
            value={row.taskModelId || ""}
            onChange={(event) => {
              const next = read();
              next.taskModelCounts[index] = { ...next.taskModelCounts[index], taskModelId: event.target.value };
              commit(next);
            }}
          >
            <option value="">Select a task model</option>
            {taskModels.map((taskModel) => (
              <option key={taskModel.id} value={taskModel.id}>
                {taskModel.name || taskModel.id}
              </option>
            ))}
          </select>
        )}
        setBound={(index, field, raw) => setBound("taskModelCounts", index, field, raw)}
      />

      <CountSection
        title="Content standards"
        hint="Code of a curricular goal or competency, such as CG-S1."
        locked={locked}
        rows={constraints.contentStandardCounts || []}
        onAdd={() => {
          const next = read();
          next.contentStandardCounts.push({ code: "", ...blankCount() });
          commit(next);
        }}
        onRemove={(index) => {
          const next = read();
          next.contentStandardCounts.splice(index, 1);
          commit(next);
        }}
        renderRow={(row, index) => (
          <Input
            aria-label={`Content standard ${index + 1}`}
            disabled={locked}
            value={row.code || ""}
            placeholder="CG-S1"
            onChange={(event) => {
              const next = read();
              next.contentStandardCounts[index] = { ...next.contentStandardCounts[index], code: event.target.value };
              commit(next);
            }}
          />
        )}
        setBound={(index, field, raw) => setBound("contentStandardCounts", index, field, raw)}
      />

      <CountSection
        title="Task model variable values"
        hint="How many tasks may carry one value. Fixed settings and task or item assignments both count."
        locked={locked}
        rows={constraints.taskModelVariableCounts || []}
        onAdd={() => {
          const next = read();
          next.taskModelVariableCounts.push({
            taskModelVariableId: variables[0]?.id || "",
            value: "",
            ...blankCount(),
          });
          commit(next);
        }}
        onRemove={(index) => {
          const next = read();
          next.taskModelVariableCounts.splice(index, 1);
          commit(next);
        }}
        renderRow={(row, index) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              aria-label={`Task model variable ${index + 1}`}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
              disabled={locked}
              value={row.taskModelVariableId || ""}
              onChange={(event) => {
                const next = read();
                next.taskModelVariableCounts[index] = {
                  ...next.taskModelVariableCounts[index],
                  taskModelVariableId: event.target.value,
                };
                commit(next);
              }}
            >
              <option value="">Select a variable</option>
              {variables.map((variable) => (
                <option key={variable.id} value={variable.id}>
                  {variable.name || variable.id}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Variable value ${index + 1}`}
              disabled={locked}
              value={row.value || ""}
              placeholder="remember"
              onChange={(event) => {
                const next = read();
                next.taskModelVariableCounts[index] = {
                  ...next.taskModelVariableCounts[index],
                  value: event.target.value,
                };
                commit(next);
              }}
            />
          </div>
        )}
        setBound={(index, field, raw) => setBound("taskModelVariableCounts", index, field, raw)}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Exposure in this session</h3>
        <p className="text-sm text-slate-500">
          How many times one item may be delivered in a single session. This is not the item's global usage ceiling.
        </p>
        <label className="block text-sm text-slate-600">
          Maximum uses of each item
          <Input
            className="mt-1 max-w-xs"
            type="number"
            min="1"
            aria-label="Maximum uses of each item"
            disabled={locked}
            value={constraints.exposure?.maxPerItem ?? ""}
            onChange={(event) => {
              const next = read();
              if (event.target.value === "") next.exposure = null;
              else next.exposure = { maxPerItem: Number(event.target.value) };
              commit(next);
            }}
          />
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Enemy items</h3>
            <p className="text-sm text-slate-500">At most one item from each group may be delivered.</p>
          </div>
          {!locked && (
            <button
              type="button"
              className="text-sm font-medium text-slate-700 underline"
              onClick={() => {
                const next = read();
                next.enemies.push({ itemIds: [] });
                commit(next);
              }}
            >
              Add enemy group
            </button>
          )}
        </div>
        {(constraints.enemies || []).map((group, index) => (
          <div key={`enemy-${index}`} className="flex items-start gap-2">
            <Input
              aria-label={`Enemy group ${index + 1}`}
              disabled={locked}
              value={(group.itemIds || []).join(", ")}
              placeholder={items.slice(0, 2).map((item) => item.id).join(", ") || "item id, item id"}
              onChange={(event) => {
                const next = read();
                next.enemies[index] = {
                  itemIds: event.target.value
                    .split(",")
                    .map((part) => part.trim())
                    .filter(Boolean),
                };
                commit(next);
              }}
            />
            {!locked && (
              <button
                type="button"
                className="text-sm text-red-600"
                onClick={() => {
                  const next = read();
                  next.enemies.splice(index, 1);
                  commit(next);
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </section>

      {errors.length > 0 && (
        <ul className="space-y-1 text-sm text-red-600">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CountSection({ title, hint, locked, rows, onAdd, onRemove, renderRow, setBound }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-sm text-slate-500">{hint}</p>
        </div>
        {!locked && (
          <button type="button" className="text-sm font-medium text-slate-700 underline" onClick={onAdd}>
            Add
          </button>
        )}
      </div>
      {rows.map((row, index) => (
        <div key={`${title}-${index}`} className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1.4fr)_8rem_8rem_auto]">
          {renderRow(row, index)}
          <Input
            type="number"
            min="1"
            aria-label={`${title} ${index + 1} minimum`}
            disabled={locked}
            placeholder="Min"
            value={numberOrBlank(row.min)}
            onChange={(event) => setBound(index, "min", event.target.value)}
          />
          <Input
            type="number"
            min="1"
            aria-label={`${title} ${index + 1} maximum`}
            disabled={locked}
            placeholder="Max"
            value={numberOrBlank(row.max)}
            onChange={(event) => setBound(index, "max", event.target.value)}
          />
          {!locked && (
            <button type="button" className="text-sm text-red-600" onClick={() => onRemove(index)}>
              Remove
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
