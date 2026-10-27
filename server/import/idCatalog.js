// Source-aware old-id → new-id map for one zip import.
//
// The same id can appear more than once inside one collection when a zip
// concatenates fixtures that were never meant to be merged (the attached
// by-entity pack reuses tm-plant, cm-plant, and similar ids with different
// bodies). A reference is remapped to the record that shares a _sources
// file path when that match is unique. A single imported record with that
// id is used otherwise. Several candidates and no shared source is
// ambiguous: the row fails instead of binding to an arbitrary copy.

export function sourceKeysFromRow(row) {
  const list = Array.isArray(row?._sources) ? row._sources : [];
  return [
    ...new Set(
      list
        .map((entry) => String(entry).split("#")[0].trim())
        .filter(Boolean)
    ),
  ];
}

function sharesSource(a, b) {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((key) => set.has(key));
}

// Design-pattern KSA links that are collection ids. smvId is the id
// stored on the student model (competencyModels.smVariables). Import
// does not allocate a new SMV id, so that field is not rewritten.
export const DESIGN_PATTERN_KSA_REF_PATHS = Object.freeze([
  ["focalKsas[].competencyId", "competencies"],
  ["focalKsas[].competencyModelId", "competencyModels"],
  ["additionalKsas[].competencyId", "competencies"],
  ["additionalKsas[].competencyModelId", "competencyModels"],
]);

export function createIdCatalog() {
  const entries = [];

  function add(collection, oldId, newId, sources) {
    if (oldId == null || oldId === "") return;
    entries.push({
      collection,
      oldId: String(oldId),
      newId,
      sources: sources || [],
    });
  }

  function remove(collection, oldId, newId) {
    const id = String(oldId);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (
        entry.collection === collection &&
        entry.oldId === id &&
        entry.newId === newId
      ) {
        entries.splice(i, 1);
        return;
      }
    }
  }

  function resolve(collection, oldId, fromSources) {
    if (oldId == null || oldId === "") return { status: "empty" };
    const hits = entries.filter(
      (entry) => entry.collection === collection && entry.oldId === String(oldId)
    );
    if (hits.length === 0) return { status: "unchanged" };
    const shared = hits.filter((entry) => sharesSource(entry.sources, fromSources));
    const pool = shared.length ? shared : hits.length === 1 ? hits : null;
    if (!pool) {
      return { status: "ambiguous", count: hits.length, ids: hits.map((h) => h.newId) };
    }
    const ids = new Set(pool.map((entry) => entry.newId));
    if (ids.size === 1) return { status: "remapped", id: [...ids][0] };
    return { status: "ambiguous", count: pool.length, ids: [...ids] };
  }

  return { add, remove, resolve, entries };
}
