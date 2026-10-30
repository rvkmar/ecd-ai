// Per-student ECD performance report.
//
// Built in Node from the governed chain (Item → Task Model → Evidence
// Model → Competency) plus the session's scored responses. This stays
// off the live scoring path (ADR 0001): it reads stored scores and
// posteriors; it does not call R and it does not remount /score.
//
// The payload is student-visible. It never includes answer keys,
// isCorrect flags, or keyedOptionId.

import { levelForScore } from "../../src/utils/performanceLevels.js";
import { findCompetency, resolveReportLevel } from "./reportLevels.js";

export const BANDS = [
  { id: "secure", min: 0.85, label: "Secure" },
  { id: "mostly-secure", min: 0.7, label: "Mostly secure" },
  { id: "developing", min: 0.5, label: "Developing" },
  { id: "emerging", min: 0, label: "Emerging" },
];

export function responseScore(response) {
  if (!response || typeof response !== "object") return null;
  if (typeof response.scoredValue === "number" && Number.isFinite(response.scoredValue)) {
    return response.scoredValue;
  }
  if (response.scoredValue != null && response.scoredValue !== "") {
    const parsed = parseFloat(response.scoredValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (response.activated === true) return 1;
  if (response.activated === false) return 0;
  return null;
}

export function roundStat(n, digits = 3) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function bandFor(p) {
  if (!Number.isFinite(p)) return null;
  return BANDS.find((b) => p >= b.min) || BANDS[BANDS.length - 1];
}

export function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sampleSd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function proportionSe(p, n) {
  if (!Number.isFinite(p) || n < 1) return null;
  return Math.sqrt((p * (1 - p)) / n);
}

function indexById(rows) {
  const map = Object.create(null);
  for (const row of rows || []) {
    if (row && row.id) map[row.id] = row;
  }
  return map;
}

export function ecdIndexes(db) {
  return {
    items: indexById(db.items),
    tasks: indexById(db.tasks),
    taskModels: indexById(db.taskModels),
    evidenceModels: indexById(db.evidenceModels),
  };
}

function optionLabel(item, response) {
  const raw = response?.rawAnswer;
  const selected =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw.selected : raw;
  const key = Array.isArray(selected)
    ? selected.join(", ")
    : selected == null
      ? ""
      : String(selected);
  const match = (item?.interaction?.responseComponents || []).find(
    (opt) => opt.id === key || opt.value === key
  );
  return match?.label || key || null;
}

function stimulusExcerpt(item) {
  const blocks = item?.stimulus?.blocks;
  if (!Array.isArray(blocks)) return null;
  const text = blocks
    .map((b) => (typeof b === "string" ? b : b?.content || b?.text || ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function observationName(taskModel, evidenceModel, observationId) {
  if (!observationId) return null;
  const fromTm = (taskModel?.expectedObservations || []).find(
    (o) => o && (o.observationId === observationId || o.id === observationId)
  );
  if (fromTm?.name || fromTm?.label) return fromTm.name || fromTm.label;
  const fromEm = (evidenceModel?.observables || evidenceModel?.observations || []).find(
    (o) => o && (o.id === observationId || o.observationId === observationId)
  );
  return fromEm?.name || fromEm?.label || observationId;
}

export function resolveCompetency(db, competencyId) {
  if (!competencyId) return null;
  const flat = (db.competencies || []).find((c) => c && c.id === competencyId);
  if (flat) {
    const model = (db.competencyModels || []).find((m) => m && m.id === flat.modelId);
    return {
      id: flat.id,
      name: flat.name || competencyId,
      description: flat.description || null,
      domain: flat.domain || null,
      strand: flat.strand || null,
      facet: flat.facet || null,
      interpretationGuide: flat.scale?.interpretationGuide || null,
      modelId: flat.modelId || model?.id || null,
      modelName: model?.name || null,
    };
  }
  for (const model of db.competencyModels || []) {
    const hit = (model.competencies || []).find((c) => c && c.id === competencyId);
    if (hit) {
      return {
        id: hit.id,
        name: hit.name || competencyId,
        description: hit.description || null,
        domain: hit.domain || model.domain || null,
        strand: hit.strand || null,
        facet: hit.facet || null,
        interpretationGuide: hit.scale?.interpretationGuide || null,
        modelId: model.id,
        modelName: model.name || null,
      };
    }
  }
  return { id: competencyId, name: competencyId, description: null, domain: null, strand: null, facet: null, interpretationGuide: null, modelId: null, modelName: null };
}

function evidenceModelIdFor(item, task, taskModel) {
  if (item?.evidenceModelId) return item.evidenceModelId;
  const observationId = item?.observationId;
  if (observationId && taskModel?.expectedObservations) {
    const obs = taskModel.expectedObservations.find(
      (o) => o && (o.observationId === observationId || o.id === observationId)
    );
    if (obs?.evidenceModelId) return obs.evidenceModelId;
  }
  if (taskModel?.primaryEvidenceModelId) return taskModel.primaryEvidenceModelId;
  if (Array.isArray(taskModel?.evidenceModelIds) && taskModel.evidenceModelIds[0]) {
    return taskModel.evidenceModelIds[0];
  }
  return task?.evidenceModelId || null;
}

export function interpretRow(name, p, n, kind) {
  const label = name || `this ${kind}`;
  if (!Number.isFinite(p) || n < 1) {
    return `Not enough scored responses to interpret ${label}.`;
  }
  const band = bandFor(p);
  if (band.id === "secure") {
    return `${label}: consistent success (${Math.round(p * 100)}% on ${n} ${n === 1 ? "item" : "items"}). Ready for more demanding work on this target.`;
  }
  if (band.id === "mostly-secure") {
    return `${label}: mostly secure (${Math.round(p * 100)}% on ${n} ${n === 1 ? "item" : "items"}). A short review of the misses should raise consistency.`;
  }
  if (band.id === "developing") {
    return `${label}: partial command (${Math.round(p * 100)}% on ${n} ${n === 1 ? "item" : "items"}). Targeted practice on this evidence should raise consistency before new difficulty is added.`;
  }
  return `${label}: emerging (${Math.round(p * 100)}% on ${n} ${n === 1 ? "item" : "items"}). This target needs instruction and supported practice.`;
}

function interpretOverall({ nScored, percent, theta, se, bands }) {
  if (nScored < 1) {
    return {
      headline: "No scored responses yet.",
      body: "This session has no scored item responses, so competency, evidence, and task summaries cannot be computed. Complete and score tasks to populate the tables below.",
    };
  }
  const pct = Math.round(percent * 100);
  const band = bandFor(percent);
  let headline = `${band.label} overall performance (${pct}% of ${nScored} scored ${nScored === 1 ? "response" : "responses"}).`;
  let body = `The mean score is ${pct}% on the 0–1 scale. The standard error of that mean is ${se == null ? "not estimated (n < 1)" : se.toFixed(3)} — sampling uncertainty of this session, not a claim about true score on an unadministered form.`;
  if (Number.isFinite(theta)) {
    const thetaBand = theta > 1 ? "well above the scale midpoint" : theta > 0 ? "near or above the scale midpoint" : "below the scale midpoint";
    body += ` The IRT proficiency estimate is ${theta.toFixed(2)} (${thetaBand}).`;
  }
  const secure = (bands.secure || 0) + (bands["mostly-secure"] || 0);
  const weak = (bands.emerging || 0) + (bands.developing || 0);
  if (secure && !weak) {
    body += " Every competency with scored items is at least mostly secure; the next step is richer or more demanding tasks on the same constructs.";
  } else if (weak && !secure) {
    body += " No competency with scored items is yet mostly secure. Instruction should stay on the current targets rather than adding new difficulty.";
  } else if (secure && weak) {
    body += " Performance is uneven across competencies: keep the stronger targets moving, and schedule supported practice on the weaker ones.";
  }
  return { headline, body };
}

function aggregate(rows, key, nameOf) {
  const buckets = new Map();
  for (const row of rows) {
    const id = row[key] || "unlinked";
    if (!buckets.has(id)) {
      buckets.set(id, {
        id,
        name: nameOf(row, id),
        scores: [],
        nItems: 0,
        extra: row,
      });
    }
    const bucket = buckets.get(id);
    bucket.nItems += 1;
    if (Number.isFinite(row.score)) bucket.scores.push(row.score);
  }
  return [...buckets.values()].map((bucket) => {
    const n = bucket.scores.length;
    const m = mean(bucket.scores);
    const p = n ? mean(bucket.scores.map((s) => (s >= 0.5 ? 1 : 0))) : null;
    const percent = n ? m : null;
    const band = bandFor(percent);
    return {
      id: bucket.id,
      name: bucket.name,
      n: bucket.nItems,
      nScored: n,
      nCorrect: bucket.scores.filter((s) => s >= 0.5).length,
      mean: roundStat(m),
      percent: roundStat(percent),
      percentDisplay: percent == null ? null : roundStat(percent * 100, 1),
      sd: roundStat(sampleSd(bucket.scores)),
      se: roundStat(proportionSe(p, n)),
      band: band?.id || null,
      bandLabel: band?.label || null,
      interpretation: interpretRow(bucket.name, percent, n, "target"),
    };
  }).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name));
}

export function occasionPoints(records) {
  const points = [];
  for (const record of records || []) {
    const history = Array.isArray(record.history) ? record.history : [];
    for (const entry of history) {
      const snap = entry?.posteriorSnapshot || {};
      const first = Object.values(snap)[0];
      const estimate =
        typeof first?.estimate === "number"
          ? first.estimate
          : typeof first?.posterior === "number"
            ? first.posterior
            : typeof first === "number"
              ? first
              : null;
      points.push({
        sessionId: entry.sessionId || record.lastSessionId || null,
        timestamp: entry.timestamp || null,
        competencyModelName: record.competencyModelName || null,
        estimate: roundStat(estimate, 3),
      });
    }
  }
  points.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  return points;
}

export function collectSessionItemRows(db, session, indexes) {
  const { items, tasks, taskModels, evidenceModels } = indexes || ecdIndexes(db);
  const responses = Array.isArray(session?.responses) ? session.responses : [];
  return responses.map((response, index) => {
    const item = items[response.itemId] || null;
    const task = tasks[response.taskId] || null;
    const taskModelId = item?.taskModelId || task?.taskModelId || null;
    const taskModel = taskModelId ? taskModels[taskModelId] : null;
    const evidenceModelId = evidenceModelIdFor(item, task, taskModel);
    const evidenceModel = evidenceModelId ? evidenceModels[evidenceModelId] : null;
    const competencyId = evidenceModel?.competencyId || evidenceModel?.constructs?.[0]?.competencyId || null;
    const competency = resolveCompetency(db, competencyId);
    const score = responseScore(response);
    const observationId = response.observationId || item?.observationId || null;
    return {
      index: index + 1,
      sessionId: session?.id || null,
      studentId: session?.studentId || null,
      finishedAt: session?.finishedAt || session?.updatedAt || session?.startedAt || null,
      itemId: response.itemId || null,
      itemName: item?.name || response.itemId || `Item ${index + 1}`,
      excerpt: stimulusExcerpt(item),
      taskId: response.taskId || null,
      taskName: task?.name || task?.title || response.taskId || null,
      taskModelId,
      taskModelName: taskModel?.name || taskModelId,
      observationId,
      observationName: observationName(taskModel, evidenceModel, observationId),
      evidenceModelId,
      evidenceModelName: evidenceModel?.name || evidenceModelId,
      evidenceClaim: evidenceModel?.claimStatement || null,
      competencyId,
      competencyName: competency?.name || competencyId,
      competencyDomain: competency?.domain || null,
      score: roundStat(score, 3),
      selected: optionLabel(item, response),
      difficulty: item?.metadata?.difficulty || null,
      bloomLevel: item?.cognitiveDemand?.bloomLevel || null,
      topic: item?.metadata?.topic || null,
    };
  });
}

function authoredProbabilityLevel(db, row) {
  if (!row || !Number.isFinite(row.percent)) return row;
  const level = levelForScore(findCompetency(db, row.id), row.percent, "probability");
  if (!level) return row;
  const descriptor = typeof level.descriptor === "string" ? level.descriptor.trim() : "";
  return {
    ...row,
    level: level.label,
    levelText: descriptor || level.label,
    levelSource: "authored",
    ...(descriptor ? { descriptor } : {}),
  };
}

function attachEvidenceClaims(itemRows, evidenceRows, competencyRows) {
  const evidenceClaims = new Map();
  const competencyClaims = new Map();
  for (const row of itemRows) {
    if (row.evidenceModelId && row.evidenceClaim && !evidenceClaims.has(row.evidenceModelId)) {
      evidenceClaims.set(row.evidenceModelId, row.evidenceClaim);
    }
    if (row.competencyId && row.evidenceClaim) {
      if (!competencyClaims.has(row.competencyId)) competencyClaims.set(row.competencyId, new Map());
      competencyClaims.get(row.competencyId).set(row.evidenceModelId || row.evidenceClaim, {
        evidenceModelId: row.evidenceModelId || null,
        claimStatement: row.evidenceClaim,
      });
    }
  }
  const evidence = evidenceRows.map((row) => {
    const claimStatement = evidenceClaims.get(row.id) || null;
    return claimStatement ? { ...row, claimStatement } : row;
  });
  const competencies = competencyRows.map((row) => {
    const map = competencyClaims.get(row.id);
    if (!map || map.size === 0) return row;
    const claims = [...map.values()];
    const next = { ...row, claims };
    if (claims.length === 1) next.claimStatement = claims[0].claimStatement;
    return next;
  });
  return { evidence, competencies };
}

export function buildStudentEcdReport(db, session, options = {}) {
  const student = options.student || null;
  const measurement = options.measurement || { stopped: null, attributeProfile: [] };
  const studentModelRecords = options.studentModelRecords || [];
  const itemRows = collectSessionItemRows(db, session, options.indexes);

  const scored = itemRows.filter((r) => Number.isFinite(r.score));
  const n = itemRows.length;
  const nScored = scored.length;
  const scores = scored.map((r) => r.score);
  const meanScore = mean(scores);
  const nCorrect = scores.filter((s) => s >= 0.5).length;
  const percentCorrect = nScored ? nCorrect / nScored : null;
  // Mean of 0–1 scores is the session percent when items are dichotomous;
  // partial credit stays visible in the mean and is not forced through a 0.5 cut.
  const percent = nScored ? meanScore : null;
  const se = nScored >= 2 ? sampleSd(scores) / Math.sqrt(nScored) : proportionSe(percentCorrect, nScored);
  const theta = session?.studentModel?.irtTheta;
  const thetaSe =
    session?.studentModel?.irtSe ??
    (nScored > 0 ? 1 / Math.sqrt(nScored) : null);

  const claimed = attachEvidenceClaims(
    itemRows,
    aggregate(itemRows, "evidenceModelId", (row, id) => row.evidenceModelName || id),
    aggregate(itemRows, "competencyId", (row, id) => row.competencyName || id)
  );
  const competencies = claimed.competencies.map((row) => authoredProbabilityLevel(db, row));
  const evidence = claimed.evidence;
  const thetaCompetency = competencies.length === 1 ? findCompetency(db, competencies[0].id) : null;
  const thetaLevel = Number.isFinite(theta)
    ? resolveReportLevel({ value: theta, scale: "theta", competency: thetaCompetency })
    : null;
  const taskSummaries = aggregate(itemRows, "taskId", (row, id) => row.taskName || id);
  const taskModelsSummary = aggregate(itemRows, "taskModelId", (row, id) => row.taskModelName || id);

  const bandCounts = { secure: 0, "mostly-secure": 0, developing: 0, emerging: 0 };
  for (const row of competencies) {
    if (row.band) bandCounts[row.band] += 1;
  }

  const strengths = competencies.filter((c) => c.percent != null && c.percent >= 0.7).map((c) => c.name);
  const focus = competencies.filter((c) => c.percent != null && c.percent < 0.7).map((c) => c.name);

  const overall = interpretOverall({
    nScored,
    percent,
    theta: Number.isFinite(theta) ? theta : null,
    se,
    bands: bandCounts,
  });

  const nextSteps = [];
  if (focus.length) {
    nextSteps.push(`Revisit ${focus.join(", ")} with items that elicit the same evidence before increasing difficulty.`);
  }
  if (strengths.length) {
    nextSteps.push(`Keep ${strengths.join(", ")} moving with richer tasks on the same evidence models.`);
  }
  if (!nScored) {
    nextSteps.push("Finish and score the remaining tasks so this report can classify the constructs.");
  }

  const guideNotes = competencies
    .map((c) => {
      const resolved = resolveCompetency(db, c.id);
      return resolved?.interpretationGuide
        ? { competencyId: c.id, name: c.name, guide: resolved.interpretationGuide }
        : null;
    })
    .filter(Boolean);

  return {
    sessionId: session?.id || null,
    student: student ? { id: student.id, name: student.name } : null,
    generatedAt: new Date().toISOString(),
    overview: {
      nItems: n,
      nScored,
      nCorrect,
      mean: roundStat(meanScore),
      percent: roundStat(percent),
      percentCorrect: roundStat(percentCorrect),
      percentDisplay: percent == null ? null : roundStat(percent * 100, 1),
      sd: roundStat(sampleSd(scores)),
      se: roundStat(se),
      theta: Number.isFinite(theta) ? roundStat(theta, 3) : null,
      thetaSe: Number.isFinite(thetaSe) ? roundStat(thetaSe, 3) : null,
      level: thetaLevel?.level ?? null,
      levelText: thetaLevel?.levelText ?? null,
      levelSource: thetaLevel?.levelSource ?? null,
      levelNote: thetaLevel?.levelNote ?? null,
      selectionStrategy: session?.selectionStrategy || null,
      band: bandFor(percent)?.id || null,
      bandLabel: bandFor(percent)?.label || null,
    },
    interpretation: overall,
    competencies,
    evidence,
    tasks: taskSummaries,
    taskModels: taskModelsSummary,
    items: itemRows,
    strengths,
    focus,
    nextSteps,
    guideNotes,
    occasions: occasionPoints(studentModelRecords),
    attributeProfile: measurement.attributeProfile || [],
    stopped: measurement.stopped || null,
  };
}
