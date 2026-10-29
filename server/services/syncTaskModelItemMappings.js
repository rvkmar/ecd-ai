// D154. itemMappings is derived from the items that instantiate this
// Task Model version. The Item Wizard never authors the parent map;
// confirming, archiving, or deleting an item recomputes it, including
// when the Task Model is locked. The composite library walks the same
// item set (INSTANTIABLE_TASK_MODEL_STATUSES + version), so the two
// agree by construction. Client PUT payloads are not trusted.

import { INSTANTIABLE_TASK_MODEL_STATUSES } from "../../src/utils/schema.js";

function projectTaskModelItemMappings(db, taskModel) {
  if (!taskModel?.id) {
    return { itemMappings: [], selectedItemIds: [] };
  }

  const version = taskModel.versionNumber;
  const expectedByObs = new Map(
    (taskModel.expectedObservations || [])
      .filter((eo) => eo && eo.observationId)
      .map((eo) => [eo.observationId, eo])
  );

  const items = (db?.items || []).filter(
    (item) =>
      item &&
      item.taskModelId === taskModel.id &&
      item.taskModelVersion === version &&
      INSTANTIABLE_TASK_MODEL_STATUSES.includes(item.status)
  );

  const itemMappings = items
    .filter((item) => item.observationId)
    .map((item) => {
      const declared = expectedByObs.get(item.observationId);
      return {
        itemId: item.id,
        observationId: item.observationId,
        evidenceModelId: declared?.evidenceModelId ?? item.evidenceModelId ?? null,
      };
    })
    .sort(
      (a, b) =>
        String(a.itemId).localeCompare(String(b.itemId)) ||
        String(a.observationId).localeCompare(String(b.observationId))
    );

  const selectedItemIds = items
    .map((item) => item.id)
    .sort((a, b) => String(a).localeCompare(String(b)));

  return { itemMappings, selectedItemIds };
}

export function syncTaskModelItemMappings(db, taskModelId) {
  if (!db || !taskModelId) return null;
  const tm = (db.taskModels || []).find((row) => row && row.id === taskModelId);
  if (!tm) return null;
  const projected = projectTaskModelItemMappings(db, tm);
  tm.itemMappings = projected.itemMappings;
  tm.selectedItemIds = projected.selectedItemIds;
  return tm;
}

export function applyDerivedItemMappings(db, taskModel) {
  if (!taskModel) return taskModel;
  const projected = projectTaskModelItemMappings(db, taskModel);
  taskModel.itemMappings = projected.itemMappings;
  taskModel.selectedItemIds = projected.selectedItemIds;
  return taskModel;
}
