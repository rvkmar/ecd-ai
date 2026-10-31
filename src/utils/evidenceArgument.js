// TU16 (T4). Toulmin backing and alternative explanations on an Evidence Model.
// Drafts stay permissive. From reviewed onward a model needs backing on every
// warrant, and each alternative explanation needs text and addressedBy.
// additionalKsaRef is optional, and when it is set it must name a real
// additional KSA. A model that is already reviewed (or later) and was stored
// without these fields is warned, not rejected, so a read or an unchanged
// save still succeeds.

const REVIEW_STATUSES = ["reviewed", "confirmed", "operational", "suspended", "archived"];

function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function warrantBackingText(warrant) {
  const backing = textOf(warrant?.backing);
  if (backing) return backing;
  return textOf(warrant?.backingEvidence);
}

/** Copy the UI field onto the schema field, and the reverse, when one side is blank. */
export function persistWarrantBacking(warrant) {
  if (!warrant || typeof warrant !== "object" || Array.isArray(warrant)) return warrant;
  const text = warrantBackingText(warrant);
  if (!text) return warrant;
  const next = { ...warrant };
  if (!textOf(next.backing)) next.backing = text;
  if (!textOf(next.backingEvidence)) next.backingEvidence = text;
  return next;
}

function ksaEntryMatches(entry, patternId, index, ref) {
  if (!entry || typeof entry !== "object") return false;
  if (textOf(entry.id) === ref) return true;
  const label = textOf(entry.label);
  if (label && label === ref) return true;
  if (textOf(entry.competencyId) === ref) return true;
  if (textOf(entry.valuedKnowledgeId) === ref) return true;
  if (patternId && label && ref === `${patternId}:${label}`) return true;
  if (patternId && ref === `${patternId}:${index}`) return true;
  return false;
}

export function additionalKsaRefResolves(ref, db) {
  const needle = textOf(ref);
  if (!needle) return false;
  for (const pattern of db?.designPatterns || []) {
    const rows = Array.isArray(pattern?.additionalKsas) ? pattern.additionalKsas : [];
    for (let index = 0; index < rows.length; index += 1) {
      if (ksaEntryMatches(rows[index], pattern?.id, index, needle)) return true;
    }
  }
  return false;
}

export function addressedByResolves(ref, evidenceModel, db) {
  const needle = textOf(ref);
  if (!needle) return false;
  const observables = evidenceModel?.observables || [];
  if (observables.some((row) => row && row.id === needle)) return true;
  const variables = db?.taskModelVariables || [];
  return variables.some((row) => row && row.id === needle);
}

export function listAdditionalKsaOptions(patterns = []) {
  const options = [];
  for (const pattern of patterns || []) {
    const rows = Array.isArray(pattern?.additionalKsas) ? pattern.additionalKsas : [];
    rows.forEach((entry, index) => {
      const label = textOf(entry?.label);
      if (!label && !textOf(entry?.id)) return;
      const ref = textOf(entry?.id) || (pattern?.id ? `${pattern.id}:${label || index}` : label);
      if (!ref) return;
      const patternName = textOf(pattern?.name);
      options.push({
        ref,
        label: patternName ? `${label || ref} (${patternName})` : label || ref,
      });
    });
  }
  return options;
}

export function listAddressedByOptions(evidenceModel, taskModelVariables = []) {
  const options = [];
  for (const observable of evidenceModel?.observables || []) {
    if (!observable?.id) continue;
    const statement = textOf(observable.statement);
    options.push({
      id: observable.id,
      label: statement ? `Observable: ${statement}` : `Observable: ${observable.id}`,
    });
  }
  for (const variable of taskModelVariables || []) {
    if (!variable?.id) continue;
    const name = textOf(variable.name) || textOf(variable.label) || variable.id;
    options.push({ id: variable.id, label: `Task model variable: ${name}` });
  }
  return options;
}

function storedModel(obj, db) {
  if (!db || !obj?.id) return null;
  return (db.evidenceModels || []).find((row) => row && row.id === obj.id) || null;
}

function argumentWasAuthored(model) {
  if (!model) return false;
  if ((model.warrants || []).some((warrant) => warrantBackingText(warrant))) return true;
  return Array.isArray(model.alternativeExplanations) && model.alternativeExplanations.length > 0;
}

/**
 * Already past draft, and the stored row never recorded backing or an
 * alternative explanation. Same idea as an already-active parameter set:
 * the new rule does not fail a record that was reviewed before the field
 * existed. A draft being promoted is not in this set, because that call
 * passes the database and the stored status is still draft.
 * A validation with no database (the wizard audit, a plain read) cannot
 * see a newer stored copy, so an already-reviewed shape that never
 * recorded the fields warns instead of failing the read.
 */
export function isGrandfatheredArgument(obj, db) {
  if (!REVIEW_STATUSES.includes(obj?.status)) return false;
  if (!argumentWasAuthored(obj) && (db == null)) return true;
  const stored = storedModel(obj, db);
  if (!stored || !REVIEW_STATUSES.includes(stored.status)) return false;
  return !argumentWasAuthored(stored);
}

function pushIssue(errors, warnings, message, legacy) {
  if (legacy) warnings.push(message);
  else errors.push(message);
}

export function evidenceArgumentIssues(obj = {}, db = null) {
  const errors = [];
  const warnings = [];
  const reviewed = REVIEW_STATUSES.includes(obj.status);
  const grandfather = reviewed && isGrandfatheredArgument(obj, db);
  const stored = storedModel(obj, db);

  if (obj.alternativeExplanations != null && !Array.isArray(obj.alternativeExplanations)) {
    errors.push("alternativeExplanations should be an array.");
  }

  const warrants = Array.isArray(obj.warrants) ? obj.warrants : [];
  for (const warrant of warrants) {
    if (warrant?.backing != null && typeof warrant.backing !== "string") {
      errors.push(`Warrant ${warrant?.id || "(missing id)"} backing should be a string.`);
    }
    if (warrant?.backingEvidence != null && typeof warrant.backingEvidence !== "string") {
      errors.push(`Warrant ${warrant?.id || "(missing id)"} backingEvidence should be a string.`);
    }
  }

  const alternatives = Array.isArray(obj.alternativeExplanations) ? obj.alternativeExplanations : [];
  alternatives.forEach((row, index) => {
    const where = `alternativeExplanations[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    for (const field of ["text", "additionalKsaRef", "addressedBy"]) {
      if (row[field] != null && typeof row[field] !== "string") {
        errors.push(`${where}.${field} should be a string.`);
      }
    }
  });

  if (!reviewed) return { errors, warnings };

  // An empty warrant list stays the existing strict confirm rule. Review
  // does not add a second one. Each warrant that is present needs backing.
  for (const warrant of warrants) {
    if (warrantBackingText(warrant)) continue;
    const storedWarrant = (stored?.warrants || []).find((row) => row && row.id && row.id === warrant.id);
    const legacy = Boolean(
      grandfather && (!stored || (storedWarrant && !warrantBackingText(storedWarrant)))
    );
    const id = warrant?.id || "(missing id)";
    pushIssue(
      errors,
      warnings,
      legacy
        ? `Already-reviewed model is missing backing on warrant ${id}. Reads stay valid.`
        : `Warrant ${id} missing backing.`,
      legacy
    );
  }

  alternatives.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const where = `alternativeExplanations[${index}]`;
    if (!textOf(row.text)) errors.push(`${where} needs text.`);
    const addressedBy = textOf(row.addressedBy);
    if (!addressedBy) {
      errors.push(`${where} needs addressedBy.`);
    } else if (db && !addressedByResolves(addressedBy, obj, db)) {
      errors.push(
        `${where}.addressedBy '${addressedBy}' does not match an observable or a task model variable.`
      );
    }
    const ksaRef = textOf(row.additionalKsaRef);
    if (ksaRef && db && !additionalKsaRefResolves(ksaRef, db)) {
      errors.push(`${where}.additionalKsaRef '${ksaRef}' does not match an additional KSA.`);
    }
  });

  return { errors, warnings };
}
