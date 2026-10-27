// Optional Assembly Model content constraints.
//
// Absent, null, or an empty object means the assembly model has no content
// constraints and delivery behaves as it did before this field existed.
//
// taskModelCounts: how many delivered tasks may come from one task model.
// contentStandardCounts: how many may cite one curricular code. A task cites
// a code when the item's metadata.contentStandardCodes includes it, when the
// task's contentStandardCodes includes it, or when the competency model
// reached through the task model's evidence models lists that code on
// constructFramework.curricularGoalCodes.
// taskModelVariableCounts: how many may carry one task model variable value.
// A fixed task model variable setting is the base. item.tmvAssignment
// overlays it, and task.tmvAssignment overlays that.
// exposure.maxPerItem: how many times one item id may be delivered in this
// session. It does not read the item's global usageCount.
// enemies: each group allows at most one distinct item id in the session.

export const ASSEMBLY_CONSTRAINT_FIELDS = [
  "taskModelCounts",
  "contentStandardCounts",
  "taskModelVariableCounts",
  "exposure",
  "enemies",
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assemblyConstraintsActive(constraints) {
  if (!isPlainObject(constraints)) return false;
  const listed = (key) => Array.isArray(constraints[key]) && constraints[key].length > 0;
  const exposure =
    isPlainObject(constraints.exposure) && constraints.exposure.maxPerItem != null;
  return (
    listed("taskModelCounts") ||
    listed("contentStandardCounts") ||
    listed("taskModelVariableCounts") ||
    exposure ||
    listed("enemies")
  );
}

function countBoundErrors(tag, row) {
  const errors = [];
  const hasMin = row.min !== undefined;
  const hasMax = row.max !== undefined;
  if (!hasMin && !hasMax) {
    errors.push(`${tag} must set min, max, or both.`);
    return errors;
  }
  if (hasMin && (!Number.isInteger(row.min) || row.min < 1)) {
    errors.push(`${tag}.min must be an integer of at least 1.`);
  }
  if (hasMax && (!Number.isInteger(row.max) || row.max < 1)) {
    errors.push(`${tag}.max must be an integer of at least 1.`);
  }
  if (
    Number.isInteger(row.min) &&
    Number.isInteger(row.max) &&
    row.min > row.max
  ) {
    errors.push(`${tag}.min cannot exceed max.`);
  }
  return errors;
}

function knownContentStandardCodes(db) {
  if (!db) return null;
  const docs = [];
  for (const row of db.curricularPolicies || []) docs.push(row);
  for (const row of db.domainAnalyses || []) {
    if (row?.contentStandards) docs.push(row.contentStandards);
  }
  const codes = new Set();
  for (const doc of docs) {
    for (const goal of doc?.curricularGoals || []) {
      if (goal?.code) codes.add(String(goal.code));
      for (const competency of goal?.competencies || []) {
        if (competency?.code) codes.add(String(competency.code));
      }
    }
  }
  return codes.size > 0 ? codes : null;
}

/**
 * Structural and referential errors for assemblyModels.constraints.
 * `db` may be null for a shape-only check. A missing collection is not
 * treated as "every id is dangling".
 */
export function assemblyConstraintErrors(constraints, db = null) {
  const errors = [];
  if (constraints == null) return errors;
  if (!isPlainObject(constraints)) {
    errors.push("constraints must be an object.");
    return errors;
  }

  for (const key of Object.keys(constraints)) {
    if (!ASSEMBLY_CONSTRAINT_FIELDS.includes(key)) {
      errors.push(
        `constraints has unknown field '${key}'. Known fields: ${ASSEMBLY_CONSTRAINT_FIELDS.join(", ")}.`
      );
    }
  }

  if (constraints.taskModelCounts !== undefined) {
    if (!Array.isArray(constraints.taskModelCounts)) {
      errors.push("constraints.taskModelCounts must be an array.");
    } else {
      const seen = new Set();
      constraints.taskModelCounts.forEach((row, index) => {
        const tag = `constraints.taskModelCounts[${index}]`;
        if (!isPlainObject(row)) {
          errors.push(`${tag} must be an object.`);
          return;
        }
        const id = typeof row.taskModelId === "string" ? row.taskModelId.trim() : "";
        if (!id) {
          errors.push(`${tag}.taskModelId must be a non-empty string.`);
        } else if (seen.has(id)) {
          errors.push(`${tag} duplicates taskModelId '${id}'.`);
        } else {
          seen.add(id);
          if (db && Array.isArray(db.taskModels) && !db.taskModels.some((taskModel) => taskModel?.id === id)) {
            errors.push(`${tag}.taskModelId '${id}' does not match a task model.`);
          }
        }
        errors.push(...countBoundErrors(tag, row));
      });
    }
  }

  if (constraints.contentStandardCounts !== undefined) {
    if (!Array.isArray(constraints.contentStandardCounts)) {
      errors.push("constraints.contentStandardCounts must be an array.");
    } else {
      const known = knownContentStandardCodes(db);
      const seen = new Set();
      constraints.contentStandardCounts.forEach((row, index) => {
        const tag = `constraints.contentStandardCounts[${index}]`;
        if (!isPlainObject(row)) {
          errors.push(`${tag} must be an object.`);
          return;
        }
        const code = typeof row.code === "string" ? row.code.trim() : "";
        if (!code) {
          errors.push(`${tag}.code must be a non-empty string.`);
        } else if (seen.has(code)) {
          errors.push(`${tag} duplicates content standard code '${code}'.`);
        } else {
          seen.add(code);
          if (known && !known.has(code)) {
            errors.push(
              `${tag}.code '${code}' is not a curricular goal or competency code on a curricular policy or domain analysis.`
            );
          }
        }
        errors.push(...countBoundErrors(tag, row));
      });
    }
  }

  if (constraints.taskModelVariableCounts !== undefined) {
    if (!Array.isArray(constraints.taskModelVariableCounts)) {
      errors.push("constraints.taskModelVariableCounts must be an array.");
    } else {
      const seen = new Set();
      constraints.taskModelVariableCounts.forEach((row, index) => {
        const tag = `constraints.taskModelVariableCounts[${index}]`;
        if (!isPlainObject(row)) {
          errors.push(`${tag} must be an object.`);
          return;
        }
        const id = typeof row.taskModelVariableId === "string" ? row.taskModelVariableId.trim() : "";
        if (!id) {
          errors.push(`${tag}.taskModelVariableId must be a non-empty string.`);
        } else if (
          db &&
          Array.isArray(db.taskModelVariables) &&
          !db.taskModelVariables.some((variable) => variable?.id === id)
        ) {
          errors.push(`${tag}.taskModelVariableId '${id}' does not match a task model variable.`);
        }
        if (typeof row.value !== "string" || row.value.trim() === "") {
          errors.push(`${tag}.value must be a non-empty string.`);
        }
        const key = `${id}\0${typeof row.value === "string" ? row.value : ""}`;
        if (id && typeof row.value === "string" && row.value.trim() !== "") {
          if (seen.has(key)) {
            errors.push(`${tag} duplicates task model variable '${id}' value '${row.value}'.`);
          }
          seen.add(key);
        }
        errors.push(...countBoundErrors(tag, row));
      });
    }
  }

  if (constraints.exposure !== undefined) {
    const exposure = constraints.exposure;
    if (!isPlainObject(exposure)) {
      errors.push("constraints.exposure must be an object.");
    } else {
      for (const key of Object.keys(exposure)) {
        if (key !== "maxPerItem") {
          errors.push(
            `constraints.exposure has unknown field '${key}'. The only field is maxPerItem.`
          );
        }
      }
      if (!Number.isInteger(exposure.maxPerItem) || exposure.maxPerItem < 1) {
        errors.push("constraints.exposure.maxPerItem must be an integer of at least 1.");
      }
    }
  }

  if (constraints.enemies !== undefined) {
    if (!Array.isArray(constraints.enemies)) {
      errors.push("constraints.enemies must be an array.");
    } else {
      constraints.enemies.forEach((row, index) => {
        const tag = `constraints.enemies[${index}]`;
        if (!isPlainObject(row)) {
          errors.push(`${tag} must be an object with itemIds.`);
          return;
        }
        for (const key of Object.keys(row)) {
          if (key !== "itemIds") {
            errors.push(`${tag} has unknown field '${key}'. The only field is itemIds.`);
          }
        }
        if (!Array.isArray(row.itemIds)) {
          errors.push(`${tag}.itemIds must be an array of item ids.`);
          return;
        }
        const ids = row.itemIds.filter((id) => typeof id === "string" && id.trim() !== "");
        if (ids.length !== row.itemIds.length) {
          errors.push(`${tag}.itemIds must contain only non-empty strings.`);
        }
        if (new Set(ids).size !== ids.length) {
          errors.push(`${tag}.itemIds must not repeat an item.`);
        }
        if (new Set(ids).size < 2) {
          errors.push(`${tag}.itemIds must name at least two distinct items.`);
        }
        if (db && Array.isArray(db.items)) {
          for (const id of ids) {
            if (!db.items.some((item) => item?.id === id)) {
              errors.push(`${tag}.itemIds includes '${id}', which does not match an item.`);
            }
          }
        }
      });
    }
  }

  return errors;
}

export function constraintBoundLabel(row) {
  const parts = [];
  if (row?.min != null) parts.push(`min ${row.min}`);
  if (row?.max != null) parts.push(`max ${row.max}`);
  return parts.join(", ");
}

export function assemblyProgressLine(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  const parts = [];
  if (Number.isInteger(snapshot.delivered)) parts.push(`${snapshot.delivered} delivered`);
  const targets = snapshot.targets;
  if (targets && Number.isInteger(targets.declared)) {
    parts.push(`${targets.met ?? 0} of ${targets.declared} targets met`);
  }
  const constraints = snapshot.constraints;
  if (constraints && typeof constraints === "object") {
    const bits = [];
    for (const row of constraints.taskModelCounts || []) {
      bits.push(`${row.taskModelId} ${row.delivered} (${constraintBoundLabel(row)})`);
    }
    for (const row of constraints.contentStandardCounts || []) {
      bits.push(`${row.code} ${row.delivered} (${constraintBoundLabel(row)})`);
    }
    for (const row of constraints.taskModelVariableCounts || []) {
      bits.push(`${row.taskModelVariableId}=${row.value} ${row.delivered} (${constraintBoundLabel(row)})`);
    }
    if (constraints.exposure?.maxPerItem != null) {
      bits.push(`max ${constraints.exposure.maxPerItem} per item`);
    }
    if (bits.length) parts.push(bits.join("; "));
  }
  return parts.join(". ");
}
