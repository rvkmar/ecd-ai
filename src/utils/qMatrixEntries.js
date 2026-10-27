// Q-matrix cells. A cell cites an item, an observable, or both.
//
// Item-only cells are the original matrix: one row per item. Observable
// cells cite an id embedded on evidenceModels.observables. That id is
// unique inside one evidence model, not across models, so evidenceModelId
// is required when more than one model uses it. observableId is not a
// collection id. Zip import leaves it as authored and remaps
// evidenceModelId and itemId.

export function textId(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function qMatrixRowKey(entry) {
  const itemId = textId(entry?.itemId);
  const observableId = textId(entry?.observableId);
  const evidenceModelId = textId(entry?.evidenceModelId);
  if (observableId || entry?.kind === "observable") {
    return `observable:${evidenceModelId}:${observableId}:${itemId}`;
  }
  return itemId;
}

export function rowSpecFromEntry(entry) {
  const itemId = textId(entry?.itemId);
  const observableId = textId(entry?.observableId);
  const evidenceModelId = textId(entry?.evidenceModelId);
  if (observableId) {
    const spec = {
      kind: "observable",
      itemId,
      observableId,
      evidenceModelId,
    };
    spec.key = qMatrixRowKey(spec);
    return spec;
  }
  if (!itemId) return null;
  return {
    kind: "item",
    itemId,
    observableId: "",
    evidenceModelId: "",
    key: itemId,
  };
}

export function rowsFromEntries(entries) {
  const seen = new Set();
  const rows = [];
  for (const entry of entries || []) {
    const spec = rowSpecFromEntry(entry);
    if (!spec || seen.has(spec.key)) continue;
    seen.add(spec.key);
    rows.push(spec);
  }
  return rows;
}

export function entryForRow(row, attributeId) {
  const entry = { attributeId };
  if (row?.kind === "observable") {
    entry.observableId = row.observableId;
    if (row.evidenceModelId) entry.evidenceModelId = row.evidenceModelId;
    if (row.itemId) entry.itemId = row.itemId;
    return entry;
  }
  entry.itemId = textId(row?.itemId) || textId(row?.key);
  return entry;
}

function observablesOn(db) {
  const found = [];
  for (const model of db?.evidenceModels || []) {
    if (!model || typeof model !== "object") continue;
    for (const observable of model.observables || []) {
      const observableId = textId(observable?.id);
      if (!observableId) continue;
      found.push({
        observableId,
        evidenceModelId: textId(model.id),
        statement: typeof observable.statement === "string" ? observable.statement : "",
        evidenceModelName: model.name || model.id || "",
        competencyId: textId(model.competencyId),
      });
    }
  }
  return found;
}

export function observableDisplay(evidenceModels, entry) {
  const observableId = textId(entry?.observableId);
  const evidenceModelId = textId(entry?.evidenceModelId);
  const models = evidenceModels || [];
  const model = evidenceModelId
    ? models.find((row) => row && row.id === evidenceModelId)
    : models.find((row) =>
        (row?.observables || []).some((observable) => textId(observable?.id) === observableId)
      );
  const observable = (model?.observables || []).find(
    (row) => textId(row?.id) === observableId
  );
  return {
    statement: observable?.statement || observableId,
    evidenceModelName: model?.name || evidenceModelId || "",
  };
}

function cellKey(parts) {
  return `item:${parts.itemId}|em:${parts.evidenceModelId}|obs:${parts.observableId}|attr:${parts.attributeId}`;
}

function resolveObservable(entry, db, competencyModelId, tag) {
  const errors = [];
  const observableId = textId(entry?.observableId);
  const evidenceModelId = textId(entry?.evidenceModelId);
  if (evidenceModelId && !observableId) {
    errors.push(`${tag} names evidenceModelId without an observableId.`);
    return { errors, evidenceModelId: "" };
  }
  if (!observableId) return { errors, evidenceModelId: "" };
  if (!db) return { errors, evidenceModelId };

  const matches = observablesOn(db).filter((row) => row.observableId === observableId);
  let chosen = null;

  if (evidenceModelId) {
    const model = (db.evidenceModels || []).find((row) => row && row.id === evidenceModelId);
    if (!model) {
      errors.push(`${tag} cites evidenceModelId '${evidenceModelId}', which was not found.`);
    } else {
      chosen = matches.find((row) => row.evidenceModelId === evidenceModelId) || null;
      if (!chosen) {
        errors.push(
          `${tag} cites observableId '${observableId}', which is not an observable on evidence model '${evidenceModelId}'.`
        );
      }
    }
  } else if (matches.length === 0) {
    errors.push(
      `${tag} cites observableId '${observableId}', which is not an observable on any evidence model.`
    );
  } else if (matches.length > 1) {
    errors.push(
      `${tag} cites observableId '${observableId}' on more than one evidence model. Name evidenceModelId.`
    );
  } else {
    chosen = matches[0];
  }

  if (chosen && competencyModelId && chosen.competencyId) {
    const competency = (db.competencies || []).find((row) => row && row.id === chosen.competencyId);
    if (competency?.modelId && competency.modelId !== competencyModelId) {
      errors.push(
        `${tag} cites observableId '${observableId}' on evidence model '${chosen.evidenceModelId}', which measures competency model '${competency.modelId}', not '${competencyModelId}'.`
      );
    }
  }

  return {
    errors,
    evidenceModelId: chosen?.evidenceModelId || evidenceModelId,
  };
}

export function qMatrixEntryErrors(entries, { db = null, competencyModelId = "", declaredAttributeIds } = {}) {
  const errors = [];
  if (!Array.isArray(entries)) return errors;
  const seen = new Set();
  const declared = declaredAttributeIds || new Set();

  entries.forEach((entry, i) => {
    const tag = `entries[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${tag} requires an itemId or an observableId.`);
      return;
    }

    if (entry.attributeId != null && entry.attributeId !== "" && typeof entry.attributeId !== "string") {
      errors.push(`${tag}.attributeId must be a string.`);
      return;
    }
    const attributeId = textId(entry.attributeId);
    if (!attributeId) {
      errors.push(`${tag} requires an attributeId.`);
      return;
    }

    if (entry.itemId != null && entry.itemId !== "" && typeof entry.itemId !== "string") {
      errors.push(`${tag}.itemId must be a string.`);
    }
    if (entry.observableId != null && entry.observableId !== "" && typeof entry.observableId !== "string") {
      errors.push(`${tag}.observableId must be a string.`);
    }
    if (entry.evidenceModelId != null && entry.evidenceModelId !== "" && typeof entry.evidenceModelId !== "string") {
      errors.push(`${tag}.evidenceModelId must be a string.`);
    }

    const itemId = textId(entry.itemId);
    const observableId = textId(entry.observableId);
    if (!itemId && !observableId) {
      errors.push(`${tag} requires an itemId or an observableId.`);
      return;
    }

    if (!declared.has(attributeId)) {
      errors.push(
        `${tag} references attributeId '${attributeId}', which is not declared in attributeIds.`
      );
    }

    if (db && itemId && !(db.items || []).some((row) => row && row.id === itemId)) {
      errors.push(`${tag} references unknown itemId '${itemId}'.`);
    }

    const resolved = resolveObservable(entry, db, competencyModelId, tag);
    errors.push(...resolved.errors);

    const key = cellKey({
      itemId,
      observableId,
      evidenceModelId: observableId ? resolved.evidenceModelId : "",
      attributeId,
    });
    if (seen.has(key)) {
      if (!observableId) {
        errors.push(
          `${tag} duplicates the (itemId, attributeId) pair for '${itemId}' / '${attributeId}'.`
        );
      } else if (!itemId) {
        errors.push(
          `${tag} duplicates the (observableId, attributeId) cell for '${observableId}' / '${attributeId}'.`
        );
      } else {
        errors.push(
          `${tag} duplicates the Q-matrix cell for item '${itemId}', observable '${observableId}', and attribute '${attributeId}'.`
        );
      }
    }
    seen.add(key);

    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      errors.push(`${tag}.required should be boolean`);
    }
  });

  return errors;
}

function observableEntryMatches(entry, response) {
  const observableId = textId(entry?.observableId);
  if (!observableId) return false;
  if (observableId !== textId(response?.observableId)) return false;
  const entryModel = textId(entry?.evidenceModelId);
  const responseModel = textId(response?.evidenceModelId);
  if (entryModel && responseModel && entryModel !== responseModel) return false;
  if (entryModel && !responseModel) return false;
  const entryItem = textId(entry?.itemId);
  if (entryItem && entryItem !== textId(response?.itemId)) return false;
  return true;
}

// Observable-keyed rows win when any of them match this response.
// Otherwise the item-only rows match, which is the original behaviour.
export function entriesForResponse(entries, response) {
  const list = Array.isArray(entries) ? entries : [];
  const observableHits = list.filter((entry) => observableEntryMatches(entry, response));
  if (observableHits.length > 0) return observableHits;
  const itemId = textId(response?.itemId);
  if (!itemId) return [];
  return list.filter(
    (entry) => textId(entry?.itemId) === itemId && !textId(entry?.observableId)
  );
}

export function attributeIdsForDeliveryItem(entries, target) {
  const ids = [];
  const seen = new Set();
  for (const entry of entriesForResponse(entries, target)) {
    const id = textId(entry?.attributeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function itemIsPlacedInQMatrix(item, entries, evidenceModelId) {
  const itemId = textId(item?.id);
  const list = Array.isArray(entries) ? entries : [];
  if (itemId && list.some((entry) => textId(entry?.itemId) === itemId)) return true;
  const observableId = textId(item?.observationId);
  if (!observableId) return false;
  return entriesForResponse(list, {
    itemId,
    observableId,
    evidenceModelId: textId(evidenceModelId) || textId(item?.evidenceModelId),
  }).some((entry) => textId(entry?.observableId));
}

export function qMatrixEntriesCitingItem(qMatrices, itemId) {
  const id = textId(itemId);
  if (!id) return [];
  const hits = [];
  for (const matrix of qMatrices || []) {
    for (const entry of matrix?.entries || []) {
      if (textId(entry?.itemId) === id) {
        hits.push({ qMatrixId: matrix?.id, entry });
      }
    }
  }
  return hits;
}

export function qMatrixEntriesCitingEvidenceModel(qMatrices, evidenceModel) {
  const modelId = textId(evidenceModel?.id);
  const observableIds = new Set(
    (evidenceModel?.observables || []).map((row) => textId(row?.id)).filter(Boolean)
  );
  const hits = [];
  for (const matrix of qMatrices || []) {
    for (const entry of matrix?.entries || []) {
      const entryModel = textId(entry?.evidenceModelId);
      const entryObservable = textId(entry?.observableId);
      if (entryModel && entryModel === modelId) {
        hits.push({ qMatrixId: matrix?.id, entry });
        continue;
      }
      if (!entryModel && entryObservable && observableIds.has(entryObservable)) {
        hits.push({ qMatrixId: matrix?.id, entry });
      }
    }
  }
  return hits;
}

export function qMatrixCitesObservableOnModel(qMatrices, evidenceModelId, observableId) {
  const modelId = textId(evidenceModelId);
  const observable = textId(observableId);
  if (!observable) return false;
  return (qMatrices || []).some((matrix) =>
    (matrix?.entries || []).some((entry) => {
      if (textId(entry?.observableId) !== observable) return false;
      const entryModel = textId(entry?.evidenceModelId);
      if (entryModel) return entryModel === modelId;
      return true;
    })
  );
}
