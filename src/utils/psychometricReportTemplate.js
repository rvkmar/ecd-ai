// Psychometric report templates (Iteman/Xcalibre-class). Distinct from
// ECD task `templates` (D126). A job cites templateId; ingest stores a
// frozen snapshot so later edits never rewrite old artefacts.

export const REPORT_TEMPLATE_KIND_VALUES = Object.freeze([
  "iteman-ctt",
  "xcalibre-irt",
  "combined",
]);

export const REPORT_TEMPLATE_AUDIENCE_VALUES = Object.freeze([
  "psychometrician",
  "item-reviewer",
  "district",
  "student",
]);

export const REPORT_TEMPLATE_CHAPTER_VALUES = Object.freeze([
  "cover",
  "test-summary",
  "reliability",
  "distribution",
  "csem",
  "flags",
  "item-pages",
  "irt-plots",
  "scores",
  "credits",
]);

export const REPORT_TEMPLATE_SKIN_VALUES = Object.freeze([
  "iteman-classic",
  "xcalibre-classic",
  "district-aggregate",
]);

export const DEFAULT_REPORT_FLAGS = Object.freeze({
  tooHard: 0.2,
  tooEasy: 0.9,
  lowDiscrimination: 0.2,
  unusedProportion: 0.02,
  attractiveRpb: 0.05,
});

export const DEFAULT_CHAPTERS_BY_KIND = Object.freeze({
  "iteman-ctt": Object.freeze([
    "cover",
    "test-summary",
    "reliability",
    "distribution",
    "csem",
    "flags",
    "item-pages",
    "scores",
    "credits",
  ]),
  "xcalibre-irt": Object.freeze([
    "cover",
    "test-summary",
    "irt-plots",
    "scores",
    "credits",
  ]),
  combined: Object.freeze([...REPORT_TEMPLATE_CHAPTER_VALUES]),
});

export const DEFAULT_SKIN_BY_KIND = Object.freeze({
  "iteman-ctt": "iteman-classic",
  "xcalibre-irt": "xcalibre-classic",
  combined: "iteman-classic",
});

const CTT_JOB_KINDS = new Set(["item-analysis", "ctt-statistics"]);
const IRT_JOB_KINDS = new Set(["irt-parameters", "test-information"]);

export function defaultChaptersForKind(kind) {
  return [...(DEFAULT_CHAPTERS_BY_KIND[kind] || DEFAULT_CHAPTERS_BY_KIND.combined)];
}

export function templatesCompatibleWithJobKind(jobKind) {
  if (CTT_JOB_KINDS.has(jobKind)) return ["iteman-ctt", "combined"];
  if (IRT_JOB_KINDS.has(jobKind)) return ["xcalibre-irt", "combined"];
  return [...REPORT_TEMPLATE_KIND_VALUES];
}

export function freezeReportTemplateSnapshot(record, frozenAt = new Date().toISOString()) {
  if (!record || typeof record !== "object") return null;
  const kind = REPORT_TEMPLATE_KIND_VALUES.includes(record.kind)
    ? record.kind
    : "combined";
  const chapters = Array.isArray(record.chapters) && record.chapters.length
    ? record.chapters.filter((c) => REPORT_TEMPLATE_CHAPTER_VALUES.includes(c))
    : defaultChaptersForKind(kind);
  const flags = { ...DEFAULT_REPORT_FLAGS, ...(record.flags || {}) };
  return {
    templateId: record.id || null,
    name: record.name || "",
    kind,
    audience: REPORT_TEMPLATE_AUDIENCE_VALUES.includes(record.audience)
      ? record.audience
      : "psychometrician",
    chapters,
    flags,
    nQuantiles: Number.isFinite(record.nQuantiles) ? Number(record.nQuantiles) : 5,
    includePretest: Boolean(record.includePretest),
    includeDif: Boolean(record.includeDif),
    cutScoreLabels: record.cutScoreLabels ?? null,
    skinId: REPORT_TEMPLATE_SKIN_VALUES.includes(record.skinId)
      ? record.skinId
      : DEFAULT_SKIN_BY_KIND[kind] || "iteman-classic",
    frozenAt,
  };
}

export function templateHonoursChapter(snapshot, chapter) {
  if (!snapshot || !Array.isArray(snapshot.chapters) || snapshot.chapters.length === 0) {
    return true;
  }
  return snapshot.chapters.includes(chapter);
}

export function adoptReportTemplate(db, templateId, { role } = {}) {
  if (!templateId) return { ok: true, snapshot: null, record: null };
  const row = (db?.psychometricReportTemplates || []).find((t) => t && t.id === templateId);
  if (!row) {
    return { ok: false, status: 404, error: "Report template not found" };
  }
  if (row.status === "archived") {
    return { ok: false, status: 400, error: "Cannot adopt an archived report template" };
  }
  if (role && role !== "admin" && row.status !== "operational") {
    return {
      ok: false,
      status: 400,
      error: "Only operational report templates may be adopted",
    };
  }
  return { ok: true, snapshot: freezeReportTemplateSnapshot(row), record: row };
}

export function applySnapshotToRequest(request, snapshot) {
  if (!request || !snapshot) return request;
  const options = { ...(request.options || {}) };
  if (Number.isFinite(snapshot.nQuantiles) && snapshot.nQuantiles >= 2) {
    options.nQuantiles = snapshot.nQuantiles;
  }
  options.flags = { ...DEFAULT_REPORT_FLAGS, ...(snapshot.flags || {}), ...(options.flags || {}) };
  return {
    ...request,
    reportTemplate: snapshot,
    options,
  };
}
