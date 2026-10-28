// Focal and additional KSAs may cite what the student model measures.
// The label stays. A missing citation is valid. A present id must exist.
// Confirm warns when a focal KSA is unlinked. It does not block:
// existing confirm rules require the label, the summary, the rationale,
// and an additional-KSA relationship. They do not require a student-model
// id, and a pattern can be confirmed before that model exists.

const LINK_FIELDS = ["competencyId", "competencyModelId", "smvId", "valuedKnowledgeId"];

function readId(entry, field, where, errors) {
  if (!entry || typeof entry !== "object") return "";
  if (!Object.prototype.hasOwnProperty.call(entry, field)) return "";
  const value = entry[field];
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    errors.push(`${where}.${field} must be a string.`);
    return "";
  }
  return value.trim();
}

export function ksaIsLinked(entry = {}) {
  const competencyId = typeof entry.competencyId === "string" ? entry.competencyId.trim() : "";
  const competencyModelId =
    typeof entry.competencyModelId === "string" ? entry.competencyModelId.trim() : "";
  const smvId = typeof entry.smvId === "string" ? entry.smvId.trim() : "";
  return Boolean(competencyId || (competencyModelId && smvId));
}

/** Optional link fields, omitted when blank so a label-only row stays label-only. */
export function copyKsaLinks(entry = {}) {
  const row = {};
  for (const field of LINK_FIELDS) {
    const value = entry?.[field];
    if (typeof value === "string" && value.trim()) row[field] = value.trim();
  }
  return row;
}

export function ksaStudentModelLinkErrors(entry, where, db = null) {
  const errors = [];
  const competencyId = readId(entry, "competencyId", where, errors);
  const competencyModelId = readId(entry, "competencyModelId", where, errors);
  const smvId = readId(entry, "smvId", where, errors);

  if ((competencyModelId && !smvId) || (!competencyModelId && smvId)) {
    errors.push(`${where} must cite competencyModelId and smvId together.`);
  }

  if (!db) return errors;

  if (competencyId) {
    const competency = (db.competencies || []).find((row) => row && row.id === competencyId);
    if (!competency) {
      errors.push(`${where}.competencyId '${competencyId}' was not found.`);
    } else if (competencyModelId && competency.modelId && competency.modelId !== competencyModelId) {
      errors.push(
        `${where}.competencyId '${competencyId}' does not belong to competency model '${competencyModelId}'.`
      );
    }
  }

  if (competencyModelId && smvId) {
    const model = (db.competencyModels || []).find((row) => row && row.id === competencyModelId);
    if (!model) {
      errors.push(`${where}.competencyModelId '${competencyModelId}' was not found.`);
    } else if (!(model.smVariables || []).some((row) => row && row.id === smvId)) {
      errors.push(
        `${where}.smvId '${smvId}' is not on competency model '${competencyModelId}'.`
      );
    }
  }

  return errors;
}

export function focalKsaUnlinkedWarnings(record = {}) {
  const rows = Array.isArray(record.focalKsas) ? record.focalKsas : [];
  const warnings = [];
  rows.forEach((entry) => {
    const label = String(entry?.label || "").trim();
    if (!label || ksaIsLinked(entry)) return;
    warnings.push(
      `Focal KSA "${label}" is not linked to a competency or a student model variable. Confirm still records the pattern.`
    );
  });
  return warnings;
}

export function focalKsaLinkNote(record = {}) {
  const rows = (Array.isArray(record.focalKsas) ? record.focalKsas : []).filter((entry) =>
    String(entry?.label || "").trim()
  );
  if (rows.length === 0) return "";
  return rows.every((entry) => ksaIsLinked(entry)) ? "Focal KSA linked" : "Focal KSA not linked";
}

function unique(values) {
  const seen = [];
  for (const value of values) {
    if (value && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

export function suggestSeedFromFocalKsas(pattern = {}) {
  const rows = Array.isArray(pattern.focalKsas) ? pattern.focalKsas : [];
  const competencyIds = [];
  const smvs = [];
  for (const row of rows) {
    const competencyId = typeof row?.competencyId === "string" ? row.competencyId.trim() : "";
    const competencyModelId =
      typeof row?.competencyModelId === "string" ? row.competencyModelId.trim() : "";
    const smvId = typeof row?.smvId === "string" ? row.smvId.trim() : "";
    if (competencyId && !competencyIds.includes(competencyId)) competencyIds.push(competencyId);
    if (competencyModelId && smvId) {
      const key = `${competencyModelId}::${smvId}`;
      if (!smvs.some((item) => item.key === key)) {
        smvs.push({ key, competencyId, competencyModelId, smvId });
      }
    }
  }
  return { competencyIds: unique(competencyIds), smvs };
}

function bodyHas(body, field) {
  return Object.prototype.hasOwnProperty.call(body || {}, field);
}

/**
 * competencyId comes from the request when it is non-empty, otherwise from
 * the single focal competency. An explicit smvId (including "") is an
 * override. When the request omits the SMV fields, the focal SMV that
 * belongs to the chosen competency is used.
 */
export function resolveSeedStudentModel(pattern, body = {}, db = null) {
  const suggestion = suggestSeedFromFocalKsas(pattern);
  const requestedCompetency =
    typeof body.competencyId === "string" ? body.competencyId.trim() : "";

  let competencyId = requestedCompetency;
  if (!competencyId) {
    if (suggestion.competencyIds.length === 1) {
      competencyId = suggestion.competencyIds[0];
    } else if (suggestion.competencyIds.length > 1) {
      return {
        ok: false,
        status: 400,
        error: "Focal KSAs cite more than one competency. Choose which competency to seed.",
      };
    }
  }
  if (!competencyId) {
    return { ok: false, status: 400, error: "competencyId is required." };
  }

  const smvExplicit = bodyHas(body, "smvId") || bodyHas(body, "competencyModelId");
  let competencyModelId = "";
  let smvId = "";

  if (smvExplicit) {
    competencyModelId =
      typeof body.competencyModelId === "string" ? body.competencyModelId.trim() : "";
    smvId = typeof body.smvId === "string" ? body.smvId.trim() : "";
    if ((competencyModelId && !smvId) || (!competencyModelId && smvId)) {
      return {
        ok: false,
        status: 400,
        error: "A student model variable citation needs both competencyModelId and smvId.",
      };
    }
  } else {
    const matched = suggestion.smvs.filter(
      (item) => !item.competencyId || item.competencyId === competencyId
    );
    if (matched.length === 1) {
      competencyModelId = matched[0].competencyModelId;
      smvId = matched[0].smvId;
    }
  }

  if (db && smvId) {
    const model = (db.competencyModels || []).find((row) => row && row.id === competencyModelId);
    if (!model) {
      return {
        ok: false,
        status: 400,
        error: `Student model '${competencyModelId}' was not found.`,
      };
    }
    if (!(model.smVariables || []).some((row) => row && row.id === smvId)) {
      return {
        ok: false,
        status: 400,
        error: `Student model variable '${smvId}' is not on '${competencyModelId}'.`,
      };
    }
  }

  return {
    ok: true,
    competencyId,
    competencyModelId: competencyModelId || null,
    smvId: smvId || null,
  };
}

export function patternsCitingCompetency(patterns, competencyId) {
  if (!competencyId) return [];
  return (patterns || []).filter((pattern) =>
    ksaRows(pattern).some((row) => String(row?.competencyId || "").trim() === competencyId)
  );
}

export function patternsCitingSmv(patterns, competencyModelId, smvId) {
  if (!competencyModelId || !smvId) return [];
  return (patterns || []).filter((pattern) =>
    ksaRows(pattern).some((row) => {
      return (
        String(row?.competencyModelId || "").trim() === competencyModelId &&
        String(row?.smvId || "").trim() === smvId
      );
    })
  );
}

function ksaRows(pattern) {
  return [...(pattern?.focalKsas || []), ...(pattern?.additionalKsas || [])];
}

export function ksaLinkText(entry = {}, context = {}) {
  const parts = [];
  const competencyId = typeof entry.competencyId === "string" ? entry.competencyId.trim() : "";
  const competencyModelId =
    typeof entry.competencyModelId === "string" ? entry.competencyModelId.trim() : "";
  const smvId = typeof entry.smvId === "string" ? entry.smvId.trim() : "";
  if (competencyId) {
    const competency = (context.competencies || []).find((row) => row && row.id === competencyId);
    parts.push(competency?.name || competencyId);
  }
  if (competencyModelId && smvId) {
    const model = (context.competencyModels || []).find((row) => row && row.id === competencyModelId);
    const smv = (model?.smVariables || []).find((row) => row && row.id === smvId);
    const modelName = model?.name || competencyModelId;
    parts.push(smv?.label ? `${modelName}: ${smv.label}` : `${modelName}: ${smvId}`);
  }
  const valuedKnowledgeId =
    typeof entry.valuedKnowledgeId === "string" ? entry.valuedKnowledgeId.trim() : "";
  if (valuedKnowledgeId) {
    const analyses = [
      ...(context.domainAnalyses || []),
      ...Object.values(context.analysesById || {}),
    ];
    let label = valuedKnowledgeId;
    for (const analysis of analyses) {
      const row = (analysis?.valuedKnowledge || []).find((item) => item && item.id === valuedKnowledgeId);
      if (row) {
        label = row.label || valuedKnowledgeId;
        break;
      }
    }
    parts.push(label);
  }
  if (parts.length === 0) return "Not linked";
  return parts.join("; ");
}
