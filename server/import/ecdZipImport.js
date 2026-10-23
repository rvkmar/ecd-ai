// One-zip ECD import.
//
// Entities are created with the same record builders the per-entity POST
// and POST /bulk routes use, so referential checks are not reimplemented
// here. This module only: reads the zip, walks collections in dependency
// order, rewrites foreign keys from the ids assigned earlier in the same
// import, and (optionally) keeps an original id and lifecycle when that
// id is not already taken.
//
// Collision policy when keepOriginalIds is on:
//   - An original id is kept only when no row already in the database and
//     no earlier row in this import owns it.
//   - A repeated id inside the zip (fixture packs reuse ids with different
//     bodies) keeps the id on the first free row and assigns a new id,
//     with draft status, to each later copy. The result row says
//     idCollision. Cross-references still follow _sources when that picks
//     one copy; otherwise the referencing row fails as ambiguous.
//   - A status/lock/version is applied only on a row whose id was kept.
//     If that lifecycle fails the existing validator, the same id is
//     retried as a draft and the row records a warning.
// When keepOriginalIds is off (the default), every row gets a new id and
// the builders' usual draft status. Links are still rewritten.

import { randomBytes } from "crypto";
import { unzipSafe, zipFiles, ZipError } from "../utils/safeZip.js";
import { createIdCatalog, sourceKeysFromRow } from "./idCatalog.js";
import { createCurricularPolicyRecord } from "../routes/curricularPoliciesRoutes.js";
import { createPolicyRecord } from "../routes/policiesRoutes.js";
import { createDomainAnalysisRecord } from "../routes/domainAnalysesRoutes.js";
import { createTaskModelVariableRecord } from "../routes/taskModelVariablesRoutes.js";
import { importCompetencyModelRow } from "../routes/competencyModels.js";
import { createCompetencyRecord } from "../routes/competencyModels.js";
import { createDesignPatternRecord } from "../routes/designPatternsRoutes.js";
import {
  bindQMatrixReferences,
  createEvidenceModelRecord,
} from "../routes/evidenceModels.js";
import { createTaskModelRecord } from "../routes/taskModelsRoutes.js";
import { createItemRecord } from "../routes/itemsRoutes.js";
import { createQMatrixRecord } from "../routes/qMatrixModelsRoutes.js";
import { createAssemblyModelRecord } from "../routes/assemblyModelsRoutes.js";
import { createPresentationModelRecord } from "../routes/presentationModelsRoutes.js";
import { createTemplateRecord } from "../routes/templatesRoutes.js";

export const IMPORT_ORDER = [
  "curricularPolicies",
  "policies",
  "domainAnalyses",
  "taskModelVariables",
  "competencyModels",
  "competencies",
  "designPatterns",
  "evidenceModels",
  "taskModels",
  "items",
  "qMatrixModels",
  "assemblyModels",
  "presentationModels",
  "templates",
];

export const EXPORT_FILES = IMPORT_ORDER.map((collection) => ({
  collection,
  fileName: `${collection}.json`,
}));

const FILE_KEY_TO_COLLECTION = Object.fromEntries(
  IMPORT_ORDER.map((collection) => [collection.toLowerCase(), collection])
);

const MAX_ROWS_PER_FILE = 5000;
const MAX_ROWS_TOTAL = 20000;
const ID_PREFIX = {
  curricularPolicies: "cp",
  policies: "p",
  domainAnalyses: "da",
  taskModelVariables: "tmv",
  competencyModels: "cm",
  competencies: "c",
  designPatterns: "dp",
  evidenceModels: "em",
  taskModels: "tm",
  items: "it",
  qMatrixModels: "qm",
  assemblyModels: "am",
  presentationModels: "pm",
  templates: "tpl",
};

// Foreign keys rewritten before the collection's own builder runs.
// `self` means "the collection currently being imported".
// Attribute / SMV ids are not collection ids; builders resolve those by
// name or by the id still stored on the Student Model.
const REF_PATHS = {
  competencyModels: [
    ["domainAnalysisId", "domainAnalyses"],
    ["parentModelId", "competencyModels"],
  ],
  competencies: [["modelId", "competencyModels"]],
  designPatterns: [
    ["domainAnalysisId", "domainAnalyses"],
    ["relationships[].targetPatternId", "designPatterns"],
    ["potentialWorkProducts[].workProductId", "workProducts"],
    ["potentialRubrics[].rubricId", "rubrics"],
    ["variableFeatures[].taskModelVariableId", "taskModelVariables"],
  ],
  evidenceModels: [
    ["competencyId", "competencies"],
    ["warrants[].competencyId", "competencies"],
    ["seededFrom.designPatternId", "designPatterns"],
    ["statisticalModels[].structureConfig.qMatrixId", "qMatrixModels"],
  ],
  taskModels: [
    ["evidenceModelIds[]", "evidenceModels"],
    ["primaryEvidenceModelId", "evidenceModels"],
    ["expectedObservations[].evidenceModelId", "evidenceModels"],
    ["taskModelVariableIds[]", "taskModelVariables"],
    ["taskModelVariableSettings[].taskModelVariableId", "taskModelVariables"],
    ["subTaskIds[]", "taskModels"],
    ["seededFrom.designPatternId", "designPatterns"],
    ["parentModelId", "taskModels"],
  ],
  items: [["taskModelId", "taskModels"]],
  qMatrixModels: [
    ["competencyModelId", "competencyModels"],
    ["domainAnalysisId", "domainAnalyses"],
    ["parentModelId", "qMatrixModels"],
    ["entries[].itemId", "items"],
  ],
  assemblyModels: [
    ["competencyModelId", "competencyModels"],
    ["parentModelId", "assemblyModels"],
    ["selectionAlgorithm.policyId", "policies"],
  ],
  presentationModels: [
    ["taskModelId", "taskModels"],
    ["parentModelId", "presentationModels"],
  ],
  templates: [
    ["competencyModelId", "competencyModels"],
    ["evidenceModelId", "evidenceModels"],
    ["taskModelId", "taskModels"],
    ["presentationModelId", "presentationModels"],
    ["designPatternId", "designPatterns"],
  ],
};

const SELF_REF_PATHS = {
  competencyModels: ["parentModelId"],
  designPatterns: ["relationships[].targetPatternId"],
  taskModels: ["subTaskIds[]", "parentModelId"],
  qMatrixModels: ["parentModelId"],
  assemblyModels: ["parentModelId"],
  presentationModels: ["parentModelId"],
};

function freshId(collection, used) {
  const prefix = ID_PREFIX[collection] || "z";
  let id;
  do {
    id = `${prefix}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

function allocateId(db, collection, desired, keepOriginalIds, used) {
  const rows = db[collection] || [];
  const taken = (id) => used.has(id) || rows.some((row) => row && row.id === id);
  if (keepOriginalIds && desired && !taken(String(desired))) {
    used.add(String(desired));
    return { id: String(desired), kept: true, collision: false };
  }
  return {
    id: freshId(collection, used),
    kept: false,
    collision: Boolean(keepOriginalIds && desired),
  };
}

export function collectionFromZipName(name) {
  const base = String(name).replace(/\\/g, "/").split("/").pop() || "";
  if (!base.toLowerCase().endsWith(".json")) return null;
  const stem = base.slice(0, -5).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return FILE_KEY_TO_COLLECTION[stem] || null;
}

function skipReason(name) {
  const base = String(name).replace(/\\/g, "/");
  if (base.includes("__MACOSX/") || base.endsWith(".DS_Store")) {
    return "Archive metadata, not an entity file.";
  }
  if (!base.toLowerCase().endsWith(".json")) {
    return "Not a JSON entity file.";
  }
  return `Unrecognised entity file '${base.split("/").pop()}'.`;
}

function stripHelpers(value) {
  if (Array.isArray(value)) return value.map(stripHelpers);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("_")) continue;
      out[key] = stripHelpers(child);
    }
    return out;
  }
  return value;
}

function unwrapRows(text, collection) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { fileError: "File is not valid JSON." };
  }
  if (Array.isArray(parsed)) return { rows: parsed };
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed[collection])) return { rows: parsed[collection] };
    const arrays = Object.entries(parsed).filter(([, value]) => Array.isArray(value));
    if (arrays.length === 1) return { rows: arrays[0][1] };
  }
  return { fileError: "Expected a JSON array or a one-key object wrapping an array." };
}

function visitPath(root, path, onLeaf) {
  const segments = path.split(".");
  function walk(node, index) {
    if (node == null || typeof node !== "object") return;
    const segment = segments[index];
    const array = segment.endsWith("[]");
    const key = array ? segment.slice(0, -2) : segment;
    const last = index === segments.length - 1;
    if (array && last) {
      const list = node[key];
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        if (typeof list[i] === "string") list[i] = onLeaf(list[i]);
      }
      return;
    }
    if (array) {
      const list = node[key];
      if (Array.isArray(list)) list.forEach((item) => walk(item, index + 1));
      return;
    }
    if (last) {
      if (typeof node[key] === "string") node[key] = onLeaf(node[key]);
      return;
    }
    walk(node[key], index + 1);
  }
  walk(root, 0);
}

function collectPathIds(root, path) {
  const found = [];
  visitPath(root, path, (value) => {
    if (value) found.push(value);
    return value;
  });
  return found;
}

function remapRecord(record, collection, sources, catalog) {
  const copy = stripHelpers(record);
  const ambiguous = [];
  const paths = REF_PATHS[collection] || [];
  for (const [path, target] of paths) {
    visitPath(copy, path, (value) => {
      if (!value) return value;
      const resolved = catalog.resolve(target, value, sources);
      if (resolved.status === "remapped") return resolved.id;
      if (resolved.status === "ambiguous") {
        ambiguous.push(
          `Ambiguous ${path} '${value}': ${resolved.count} imported ${target} rows share that id and none shares this row's source file.`
        );
      }
      return value;
    });
  }
  return { copy, ambiguous };
}

function sharesSource(a = [], b = []) {
  const set = new Set(a);
  return b.some((key) => set.has(key));
}

function sortBySelfRefs(plans, collection) {
  const paths = SELF_REF_PATHS[collection];
  if (!paths?.length) return plans;
  const indexesByOld = new Map();
  plans.forEach((plan, index) => {
    if (!plan.sourceId) return;
    const list = indexesByOld.get(plan.sourceId) || [];
    list.push(index);
    indexesByOld.set(plan.sourceId, list);
  });
  const deps = plans.map(() => new Set());
  plans.forEach((plan, index) => {
    for (const path of paths) {
      for (const oldId of collectPathIds(plan.clean, path)) {
        const candidates = indexesByOld.get(oldId) || [];
        const shared = candidates.filter((candidate) =>
          sharesSource(plans[candidate].sources, plan.sources)
        );
        const chosen =
          shared.length === 1
            ? shared[0]
            : candidates.length === 1
              ? candidates[0]
              : -1;
        if (chosen >= 0 && chosen !== index) deps[index].add(chosen);
      }
    }
  });
  const remaining = deps.map((set) => set.size);
  const queue = [];
  remaining.forEach((count, index) => {
    if (count === 0) queue.push(index);
  });
  const ordered = [];
  while (queue.length) {
    const index = queue.shift();
    ordered.push(plans[index]);
    deps.forEach((set, dependent) => {
      if (!set.has(index)) return;
      set.delete(index);
      remaining[dependent] -= 1;
      if (remaining[dependent] === 0) queue.push(dependent);
    });
  }
  if (ordered.length < plans.length) {
    const seen = new Set(ordered);
    for (const plan of plans) if (!seen.has(plan)) ordered.push(plan);
  }
  return ordered;
}

function flattenError(result) {
  const details = Array.isArray(result?.details)
    ? result.details.flatMap((item) =>
        typeof item === "string" ? [item] : item?.error ? [item.error] : []
      )
    : [];
  return {
    error: result?.error || "Row failed validation.",
    details,
  };
}

function emptyDbCollections(db) {
  for (const collection of IMPORT_ORDER) {
    if (!Array.isArray(db[collection])) db[collection] = [];
  }
  if (!Array.isArray(db.workProducts)) db.workProducts = [];
  if (!Array.isArray(db.rubrics)) db.rubrics = [];
}

function planRows(rows, collection, db, keepOriginalIds, catalog) {
  const used = new Set((db[collection] || []).map((row) => row?.id).filter(Boolean));
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { index, invalid: true };
    }
    const sources = sourceKeysFromRow(row);
    const sourceId = row.id != null && row.id !== "" ? String(row.id) : "";
    const allocation = allocateId(db, collection, sourceId, keepOriginalIds, used);
    if (sourceId) catalog.add(collection, sourceId, allocation.id, sources);
    return {
      index,
      row,
      clean: stripHelpers(row),
      sources,
      sourceId,
      allocation,
    };
  });
}

function finishRow(plan, result, extraWarnings = []) {
  if (!result?.ok) {
    const flat = flattenError(result);
    return {
      index: plan.index,
      ok: false,
      name: plan.row?.name || plan.clean?.name || "",
      sourceId: plan.sourceId || null,
      error: flat.error,
      details: flat.details,
    };
  }
  const warnings = [...extraWarnings];
  if (plan.allocation?.collision) {
    warnings.push(
      `Id '${plan.sourceId}' is already used; assigned ${result.record.id} and left the row as a draft.`
    );
  }
  return {
    index: plan.index,
    ok: true,
    name: result.record?.name || plan.clean?.name || "",
    sourceId: plan.sourceId || null,
    id: result.record.id,
    idKept: Boolean(plan.allocation?.kept),
    warnings,
  };
}

function withDraftFallback(preserve, run) {
  if (!preserve) return { result: run(false), warnings: [] };
  const first = run(true);
  if (first?.ok) return { result: first, warnings: [] };
  const second = run(false);
  if (second?.ok) {
    return {
      result: second,
      warnings: ["Original status could not be kept; imported as draft."],
    };
  }
  return { result: first, warnings: [] };
}

function importSimple(plans, collection, ctx, invoke) {
  const ordered = sortBySelfRefs(plans.filter((plan) => !plan.invalid), collection);
  const results = plans.filter((plan) => plan.invalid).map((plan) => ({
    index: plan.index,
    ok: false,
    error: "Row must be a JSON object.",
    details: [],
  }));

  for (const plan of ordered) {
    const { copy, ambiguous } = remapRecord(plan.clean, collection, plan.sources, ctx.catalog);
    if (ambiguous.length) {
      ctx.catalog.remove(collection, plan.sourceId, plan.allocation.id);
      results.push({
        index: plan.index,
        ok: false,
        name: copy.name || "",
        sourceId: plan.sourceId || null,
        error: "Ambiguous cross-reference.",
        details: ambiguous,
      });
      continue;
    }
    const preserve = Boolean(plan.allocation.kept);
    let outcome;
    try {
      outcome = withDraftFallback(preserve, (keepLifecycle) =>
        invoke(copy, {
          assignedId: plan.allocation.id,
          preserveLifecycle: keepLifecycle,
          forceDraft: !keepLifecycle,
          allowDraftParents: true,
          includeLinks: true,
          keepParentLink: true,
        })
      );
    } catch (err) {
      ctx.catalog.remove(collection, plan.sourceId, plan.allocation.id);
      results.push({
        index: plan.index,
        ok: false,
        name: copy.name || "",
        sourceId: plan.sourceId || null,
        error: err?.message || "Row failed.",
        details: [],
      });
      continue;
    }
    if (!outcome.result?.ok) {
      ctx.catalog.remove(collection, plan.sourceId, plan.allocation.id);
    } else if (outcome.result.record?.id) {
      ctx.provenance.set(`${collection}:${outcome.result.record.id}`, plan.sources);
    }
    results.push(finishRow(plan, outcome.result, outcome.warnings));
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

function importCompetencyModels(plans, ctx) {
  const valid = plans.filter((plan) => !plan.invalid);
  const ordered = sortBySelfRefs(valid, "competencyModels");
  const results = plans.filter((plan) => plan.invalid).map((plan) => ({
    index: plan.index,
    ok: false,
    error: "Row must be a JSON object.",
    details: [],
  }));

  for (const plan of ordered) {
    const { copy, ambiguous } = remapRecord(
      plan.clean,
      "competencyModels",
      plan.sources,
      ctx.catalog
    );
    if (ambiguous.length) {
      ctx.catalog.remove("competencyModels", plan.sourceId, plan.allocation.id);
      results.push({
        index: plan.index,
        ok: false,
        name: copy.name || "",
        sourceId: plan.sourceId || null,
        error: "Ambiguous cross-reference.",
        details: ambiguous,
      });
      continue;
    }

    const nested = Array.isArray(copy.competencies) ? copy.competencies : [];
    const nestedUsed = new Set(
      (ctx.db.competencies || []).map((row) => row?.id).filter(Boolean)
    );
    for (const entry of ctx.catalog.entries) {
      if (entry.collection === "competencies") nestedUsed.add(entry.newId);
    }
    const nestedIds = nested.map((comp) =>
      allocateId(
        ctx.db,
        "competencies",
        comp?.id,
        ctx.keepOriginalIds,
        nestedUsed
      )
    );

    const preserve = Boolean(plan.allocation.kept);
    const run = (keepLifecycle) =>
      importCompetencyModelRow(copy, ctx.db, plan.index, {
        assignedId: plan.allocation.id,
        preserveLifecycle: keepLifecycle,
        keepParentLink: true,
        restoreBareSmVariables: true,
        competencyIdFor: (_comp, index) => nestedIds[index]?.id,
      });

    let outcome;
    try {
      outcome = withDraftFallback(preserve, run);
    } catch (err) {
      ctx.catalog.remove("competencyModels", plan.sourceId, plan.allocation.id);
      results.push({
        index: plan.index,
        ok: false,
        name: copy.name || "",
        sourceId: plan.sourceId || null,
        error: err?.message || "Row failed.",
        details: [],
      });
      continue;
    }

    if (!outcome.result?.ok) {
      ctx.catalog.remove("competencyModels", plan.sourceId, plan.allocation.id);
    } else {
      ctx.provenance.set(`competencyModels:${outcome.result.id}`, plan.sources);
      for (const created of outcome.result.competencyResults || []) {
        if (created.ok && created.sourceId) {
          ctx.catalog.add("competencies", created.sourceId, created.id, plan.sources);
        }
      }
    }
    const rowResult = finishRow(
      plan,
      outcome.result?.ok
        ? { ok: true, record: { id: outcome.result.id, name: outcome.result.name } }
        : outcome.result,
      [
        ...outcome.warnings,
        ...(outcome.result?.warnings || []),
      ]
    );
    if (outcome.result?.ok) {
      rowResult.competenciesCreated = outcome.result.competenciesCreated || 0;
    }
    results.push(rowResult);
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

function rebindEvidenceQMatrices(db, provenance, catalog) {
  let bound = 0;
  for (const model of db.evidenceModels || []) {
    const sources = provenance.get(`evidenceModels:${model.id}`);
    if (!sources) continue;
    let changed = false;
    const statisticalModels = (model.statisticalModels || []).map((sm) => {
      if (!sm?.structureConfig || typeof sm.structureConfig !== "object") return sm;
      const cfg = { ...sm.structureConfig };
      if (cfg.qMatrixId) {
        const resolved = catalog.resolve("qMatrixModels", cfg.qMatrixId, sources);
        if (resolved.status === "remapped" && resolved.id !== cfg.qMatrixId) {
          cfg.qMatrixId = resolved.id;
          changed = true;
        }
      }
      return { ...sm, structureConfig: cfg };
    });
    const boundModels = bindQMatrixReferences(statisticalModels, db);
    const before = JSON.stringify(model.statisticalModels || []);
    if (JSON.stringify(boundModels) !== before) {
      model.statisticalModels = boundModels;
      changed = true;
    } else if (changed) {
      model.statisticalModels = boundModels;
    }
    if (changed) bound += 1;
  }
  return bound;
}

function summarize(results) {
  const created = results.filter((row) => row.ok).length;
  return { created, failed: results.length - created, results };
}

/**
 * @param {object} db mutated in place. Caller skips saveDB on a dry run.
 * @param {Buffer} buffer
 * @param {{ user?: object, keepOriginalIds?: boolean }} [options]
 */
export function importZipIntoDb(db, buffer, options = {}) {
  const files = unzipSafe(buffer);
  const skipped = [];
  const byCollection = new Map();

  for (const file of files) {
    const collection = collectionFromZipName(file.name);
    if (!collection) {
      skipped.push({ file: file.name, reason: skipReason(file.name) });
      continue;
    }
    if (byCollection.has(collection)) {
      throw new ZipError(
        `More than one file maps to ${collection} (${byCollection.get(collection).file} and ${file.name}).`
      );
    }
    byCollection.set(collection, { file: file.name, data: file.data });
  }

  const parsed = new Map();
  let totalRows = 0;
  for (const [collection, file] of byCollection) {
    const text = file.data.toString("utf8");
    const unwrapped = unwrapRows(text, collection);
    if (unwrapped.fileError) {
      parsed.set(collection, { file: file.file, fileError: unwrapped.fileError, rows: [] });
      continue;
    }
    if (unwrapped.rows.length > MAX_ROWS_PER_FILE) {
      throw new ZipError(
        `${file.file} has ${unwrapped.rows.length} rows; the limit is ${MAX_ROWS_PER_FILE}.`
      );
    }
    totalRows += unwrapped.rows.length;
    parsed.set(collection, { file: file.file, rows: unwrapped.rows });
  }
  if (totalRows > MAX_ROWS_TOTAL) {
    throw new ZipError(`Zip has ${totalRows} rows; the limit is ${MAX_ROWS_TOTAL}.`);
  }

  emptyDbCollections(db);
  const catalog = createIdCatalog();
  const provenance = new Map();
  const ctx = {
    db,
    catalog,
    provenance,
    keepOriginalIds: options.keepOriginalIds === true,
    user: options.user || {},
  };
  const req = { user: ctx.user };
  const entities = {};

  for (const collection of IMPORT_ORDER) {
    const parsedFile = parsed.get(collection);
    if (!parsedFile) continue;
    if (parsedFile.fileError) {
      entities[collection] = {
        file: parsedFile.file,
        created: 0,
        failed: 0,
        fileError: parsedFile.fileError,
        results: [],
      };
      continue;
    }

    const plans = planRows(
      parsedFile.rows,
      collection,
      db,
      ctx.keepOriginalIds,
      catalog
    );

    let results;
    if (collection === "competencyModels") {
      results = importCompetencyModels(plans, ctx);
    } else if (collection === "competencies") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createCompetencyRecord(row, db, row.modelId, "", {
          assignedId: opts.assignedId,
        })
      );
    } else if (collection === "curricularPolicies") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createCurricularPolicyRecord(row, db, "", { assignedId: opts.assignedId })
      );
    } else if (collection === "policies") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createPolicyRecord(row, db, "", { assignedId: opts.assignedId })
      );
    } else if (collection === "domainAnalyses") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createDomainAnalysisRecord(row, db, req, {
          forceDraft: opts.forceDraft,
          assignedId: opts.assignedId,
        })
      );
    } else if (collection === "taskModelVariables") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createTaskModelVariableRecord(row, db, req, { assignedId: opts.assignedId })
      );
    } else if (collection === "designPatterns") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createDesignPatternRecord(row, db, req, {
          forceDraft: opts.forceDraft,
          assignedId: opts.assignedId,
        })
      );
    } else if (collection === "evidenceModels") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createEvidenceModelRecord(row, db, "", {
          assignedId: opts.assignedId,
          preserveLifecycle: opts.preserveLifecycle,
        })
      );
    } else if (collection === "taskModels") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createTaskModelRecord(row, db, "", {
          allowDraftParents: true,
          assignedId: opts.assignedId,
          preserveLifecycle: opts.preserveLifecycle,
        })
      );
    } else if (collection === "items") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createItemRecord(row, db, req.user?.id || "system", {
          allowDraftParents: true,
          assignedId: opts.assignedId,
          preserveLifecycle: opts.preserveLifecycle,
        })
      );
    } else if (collection === "qMatrixModels") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createQMatrixRecord(row, db, "", {
          assignedId: opts.assignedId,
          preserveLifecycle: opts.preserveLifecycle,
          includeLinks: opts.includeLinks,
        })
      );
    } else if (collection === "assemblyModels") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createAssemblyModelRecord(row, db, "", {
          assignedId: opts.assignedId,
          preserveLifecycle: opts.preserveLifecycle,
        })
      );
    } else if (collection === "presentationModels") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createPresentationModelRecord(row, db, {
          assignedId: opts.assignedId,
          preserveLifecycle: opts.preserveLifecycle,
        })
      );
    } else if (collection === "templates") {
      results = importSimple(plans, collection, ctx, (row, opts) =>
        createTemplateRecord(row, db, req, {
          assignedId: opts.assignedId,
          forceDraft: opts.forceDraft,
        })
      );
    } else {
      results = [];
    }

    const summary = summarize(results);
    entities[collection] = { file: parsedFile.file, ...summary };
  }

  const qMatrixLinksBound = rebindEvidenceQMatrices(db, provenance, catalog);

  const totals = { created: 0, failed: 0, fileErrors: 0 };
  for (const summary of Object.values(entities)) {
    totals.created += summary.created || 0;
    totals.failed += summary.failed || 0;
    if (summary.fileError) totals.fileErrors += 1;
  }

  return {
    keepOriginalIds: ctx.keepOriginalIds,
    skipped,
    order: IMPORT_ORDER.filter((collection) => entities[collection]),
    entities,
    qMatrixLinksBound,
    totals,
  };
}

export function exportDbAsZip(db) {
  const files = {};
  for (const { collection, fileName } of EXPORT_FILES) {
    const rows = Array.isArray(db?.[collection]) ? db[collection] : [];
    files[fileName] = JSON.stringify(rows, null, 2);
  }
  return zipFiles(files);
}

export { ZipError };
