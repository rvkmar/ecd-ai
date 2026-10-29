// Cumulative ECD reports across closed sessions.
//
// Student / teacher / district-admin views of the same Item → Task Model →
// Evidence Model → Competency join used by the per-session report. Built in
// Node from stored scores (ADR 0001): no R, no remount of /score.
//
// Student payload never includes answer keys, isCorrect, or keyedOptionId.
// District/admin curriculum payload never includes named students. Teacher
// classroom payload names the teacher's roster so instruction can target
// people; it still omits keys.

import { normalizeSessionStatus } from "../../src/utils/sessionStatus.js";
import { resolveStudentIdentity } from "../../src/utils/studentModelRecord.js";
import { MIN_CELL_SIZE } from "../utils/aggregatePrivacy.js";
import {
  BANDS,
  bandFor,
  collectSessionItemRows,
  ecdIndexes,
  interpretRow,
  mean,
  occasionPoints,
  proportionSe,
  resolveCompetency,
  roundStat,
  sampleSd,
} from "./studentEcdReport.js";

function isArchived(session) {
  return normalizeSessionStatus(session?.status) === "archived";
}

export function isClosedForCumulative(session) {
  if (!session || isArchived(session)) return false;
  if (session.autoFinished || session.isCompleted) return true;
  const status = normalizeSessionStatus(session.status);
  return status === "completed" || status === "submitted" || status === "reviewed";
}

function aliasesOf(identity, fallbackId) {
  const aliases = new Set((identity?.identityAliases || []).map(String));
  if (identity?.canonicalStudentId) aliases.add(String(identity.canonicalStudentId));
  if (fallbackId) aliases.add(String(fallbackId));
  return aliases;
}

export function sessionMatchesAliases(session, aliases) {
  if (!session || !aliases || aliases.size === 0) return false;
  if (session.studentId && aliases.has(String(session.studentId))) return true;
  return (session.studentIds || []).some((id) => id != null && aliases.has(String(id)));
}

function isUnstampedStudent(student) {
  return !student?.districtId && !student?.schoolId;
}

export function scopedStudentsFor(user, db) {
  const students = db.students || [];
  const role = user?.role;
  if (role === "admin") return [...students];
  if (role === "district") {
    const did = user.districtId;
    return students.filter((s) => {
      if (!s) return false;
      if (did && s.districtId) return s.districtId === did;
      return isUnstampedStudent(s);
    });
  }
  if (role === "teacher") {
    const sid = user.schoolId;
    const did = user.districtId;
    const username = user.username || user.id;
    return students.filter((s) => {
      if (!s) return false;
      if (sid && s.schoolId) return s.schoolId === sid;
      if (s.teacherId && username && String(s.teacherId) === String(username)) return true;
      if (did && s.districtId) return s.districtId === did;
      return isUnstampedStudent(s);
    });
  }
  if (role === "student") {
    const self = resolveStudentIdentity(user.username || user.id, db);
    const aliases = aliasesOf(self, user.username || user.id);
    return students.filter(
      (s) =>
        s &&
        (aliases.has(String(s.id)) ||
          aliases.has(String(s.username)) ||
          aliases.has(String(s.userId)))
    );
  }
  return [];
}

function identityForStudentRow(db, student, fallbackId) {
  const raw = student?.id || student?.username || fallbackId;
  return resolveStudentIdentity(raw, db);
}

export function sessionsForStudent(sessions, db, student, fallbackId) {
  const identity = identityForStudentRow(db, student, fallbackId);
  const aliases = aliasesOf(identity, fallbackId || student?.id);
  return (sessions || []).filter((s) => isClosedForCumulative(s) && sessionMatchesAliases(s, aliases));
}

function dateSpan(sessions) {
  const times = (sessions || [])
    .map((s) => s.finishedAt || s.updatedAt || s.startedAt)
    .filter(Boolean)
    .map((t) => String(t))
    .sort();
  return {
    from: times[0] ? times[0].slice(0, 10) : null,
    to: times.length ? times[times.length - 1].slice(0, 10) : null,
  };
}

function scoreStats(scores) {
  const n = scores.length;
  const m = mean(scores);
  const nCorrect = scores.filter((s) => s >= 0.5).length;
  const percentCorrect = n ? nCorrect / n : null;
  const se = n >= 2 ? sampleSd(scores) / Math.sqrt(n) : proportionSe(percentCorrect, n);
  const band = bandFor(m);
  return {
    nScored: n,
    nCorrect,
    mean: roundStat(m),
    percent: roundStat(m),
    percentCorrect: roundStat(percentCorrect),
    percentDisplay: m == null ? null : roundStat(m * 100, 1),
    sd: roundStat(sampleSd(scores)),
    se: roundStat(se),
    band: band?.id || null,
    bandLabel: band?.label || null,
  };
}

function emptyBandCounts() {
  return { secure: 0, "mostly-secure": 0, developing: 0, emerging: 0 };
}

function stripKeys(row) {
  const { selected, excerpt, ...rest } = row;
  return rest;
}

function nameOf(row, key, id) {
  if (key === "competencyId") return row.competencyName || id;
  if (key === "evidenceModelId") return row.evidenceModelName || id;
  if (key === "taskId") return row.taskName || id;
  if (key === "taskModelId") return row.taskModelName || id;
  return id;
}

function extraOf(row, key) {
  if (key === "competencyId") {
    return { domain: row.competencyDomain || null };
  }
  if (key === "evidenceModelId") {
    return { claim: row.evidenceClaim || null, competencyId: row.competencyId || null, competencyName: row.competencyName || null };
  }
  if (key === "taskId") {
    return {
      taskModelId: row.taskModelId || null,
      taskModelName: row.taskModelName || null,
      competencyId: row.competencyId || null,
      competencyName: row.competencyName || null,
    };
  }
  if (key === "taskModelId") {
    return { competencyId: row.competencyId || null, competencyName: row.competencyName || null };
  }
  return {};
}

function personMeanRows(itemRows, key) {
  const people = new Map();
  for (const row of itemRows) {
    const person = row.canonicalStudentId || row.studentId || "unknown";
    const id = row[key] || "unlinked";
    if (!people.has(person)) people.set(person, new Map());
    const buckets = people.get(person);
    if (!buckets.has(id)) {
      buckets.set(id, {
        id,
        name: nameOf(row, key, id),
        scores: [],
        sessionIds: new Set(),
        extra: extraOf(row, key),
      });
    }
    const bucket = buckets.get(id);
    bucket.nItems = (bucket.nItems || 0) + 1;
    if (Number.isFinite(row.score)) bucket.scores.push(row.score);
    if (row.sessionId) bucket.sessionIds.add(row.sessionId);
  }

  const byTarget = new Map();
  for (const [personId, buckets] of people) {
    for (const [id, bucket] of buckets) {
      const n = bucket.scores.length;
      const m = n ? mean(bucket.scores) : null;
      if (!byTarget.has(id)) {
        byTarget.set(id, {
          id,
          name: bucket.name,
          extra: bucket.extra,
          personMeans: [],
          nItems: 0,
          nScored: 0,
          nCorrect: 0,
          scores: [],
          sessionIds: new Set(),
          studentIds: new Set(),
          bands: emptyBandCounts(),
        });
      }
      const target = byTarget.get(id);
      target.nItems += bucket.nItems || 0;
      target.nScored += n;
      target.nCorrect += bucket.scores.filter((s) => s >= 0.5).length;
      target.scores.push(...bucket.scores);
      for (const sid of bucket.sessionIds) target.sessionIds.add(sid);
      target.studentIds.add(personId);
      if (Number.isFinite(m)) {
        target.personMeans.push(m);
        const band = bandFor(m);
        if (band) target.bands[band.id] += 1;
      }
    }
  }

  return [...byTarget.values()]
    .map((target) => {
      const personMean = mean(target.personMeans);
      const itemMean = mean(target.scores);
      const nStudents = target.studentIds.size;
      const nSessions = target.sessionIds.size;
      const n = target.nScored;
      const p = n ? mean(target.scores.map((s) => (s >= 0.5 ? 1 : 0))) : null;
      const band = bandFor(personMean ?? itemMean);
      const nFocus = (target.bands.emerging || 0) + (target.bands.developing || 0);
      const nSecureish = (target.bands.secure || 0) + (target.bands["mostly-secure"] || 0);
      return {
        id: target.id,
        name: target.name,
        ...target.extra,
        n: target.nItems,
        nScored: n,
        nCorrect: target.nCorrect,
        nStudents,
        nSessions,
        nSecure: target.bands.secure,
        nMostlySecure: target.bands["mostly-secure"],
        nDeveloping: target.bands.developing,
        nEmerging: target.bands.emerging,
        nFocus,
        nSecureish,
        mean: roundStat(personMean ?? itemMean),
        percent: roundStat(personMean ?? itemMean),
        percentDisplay: (personMean ?? itemMean) == null ? null : roundStat((personMean ?? itemMean) * 100, 1),
        itemMean: roundStat(itemMean),
        sd: roundStat(sampleSd(target.personMeans.length > 1 ? target.personMeans : target.scores)),
        se: roundStat(nStudents >= 2
          ? sampleSd(target.personMeans) / Math.sqrt(nStudents)
          : proportionSe(p, n)),
        band: band?.id || null,
        bandLabel: band?.label || null,
      };
    })
    .sort((a, b) => (a.percent ?? 99) - (b.percent ?? 99) || a.name.localeCompare(b.name));
}

function studentAggregate(itemRows, key) {
  const buckets = new Map();
  for (const row of itemRows) {
    const id = row[key] || "unlinked";
    if (!buckets.has(id)) {
      buckets.set(id, {
        id,
        name: nameOf(row, key, id),
        extra: extraOf(row, key),
        scores: [],
        sessionIds: new Set(),
        nItems: 0,
        first: null,
        last: null,
      });
    }
    const bucket = buckets.get(id);
    bucket.nItems += 1;
    if (Number.isFinite(row.score)) bucket.scores.push(row.score);
    if (row.sessionId) bucket.sessionIds.add(row.sessionId);
    const stamp = row.finishedAt || "";
    if (Number.isFinite(row.score)) {
      if (!bucket.first || stamp < (bucket.first.finishedAt || "")) {
        bucket.first = { score: row.score, finishedAt: stamp, sessionId: row.sessionId };
      }
      if (!bucket.last || stamp > (bucket.last.finishedAt || "")) {
        bucket.last = { score: row.score, finishedAt: stamp, sessionId: row.sessionId };
      }
    }
  }
  return [...buckets.values()]
    .map((bucket) => {
      const n = bucket.scores.length;
      const m = mean(bucket.scores);
      const p = n ? mean(bucket.scores.map((s) => (s >= 0.5 ? 1 : 0))) : null;
      const band = bandFor(m);
      const firstMean = sessionMeanFor(itemRows, bucket.id, key, bucket.first?.sessionId);
      const lastMean = sessionMeanFor(itemRows, bucket.id, key, bucket.last?.sessionId);
      const delta = Number.isFinite(firstMean) && Number.isFinite(lastMean) && bucket.sessionIds.size > 1
        ? lastMean - firstMean
        : null;
      return {
        id: bucket.id,
        name: bucket.name,
        ...bucket.extra,
        n: bucket.nItems,
        nScored: n,
        nCorrect: bucket.scores.filter((s) => s >= 0.5).length,
        nSessions: bucket.sessionIds.size,
        mean: roundStat(m),
        percent: roundStat(m),
        percentDisplay: m == null ? null : roundStat(m * 100, 1),
        sd: roundStat(sampleSd(bucket.scores)),
        se: roundStat(n >= 2 ? sampleSd(bucket.scores) / Math.sqrt(n) : proportionSe(p, n)),
        band: band?.id || null,
        bandLabel: band?.label || null,
        firstMean: roundStat(firstMean),
        lastMean: roundStat(lastMean),
        delta: roundStat(delta),
        interpretation: interpretCumulativeStudent(bucket.name, m, n, bucket.sessionIds.size, delta),
      };
    })
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.name.localeCompare(b.name));
}

function sessionMeanFor(itemRows, id, key, sessionId) {
  if (!sessionId) return null;
  const scores = itemRows
    .filter((r) => (r[key] || "unlinked") === id && r.sessionId === sessionId && Number.isFinite(r.score))
    .map((r) => r.score);
  return mean(scores);
}

function interpretCumulativeStudent(name, p, n, nSessions, delta) {
  const base = interpretRow(name, p, n, "target");
  if (!Number.isFinite(delta) || nSessions < 2) return base;
  const pts = Math.round(Math.abs(delta) * 100);
  if (delta >= 0.1) return `${base} Across ${nSessions} sessions this target rose by ${pts} percentage points.`;
  if (delta <= -0.1) return `${base} Across ${nSessions} sessions this target fell by ${pts} percentage points — instruction should return to the same evidence.`;
  return `${base} Across ${nSessions} sessions the mean has been stable.`;
}

function interpretGroupRow(row, audience) {
  if (row.suppressed) {
    return `${row.name}: too few students to report (n < ${MIN_CELL_SIZE}).`;
  }
  const n = row.nStudents;
  const pct = row.percentDisplay;
  const focus = row.nFocus;
  const label = row.name || "this target";
  if (!Number.isFinite(pct) || !n) {
    return `${label}: not enough scored responses to interpret.`;
  }
  if (audience === "teacher") {
    if (row.band === "emerging" || (focus / n) >= 0.5) {
      return `${label}: ${focus} of ${n} students are emerging or developing (class mean ${pct}%). This is a classroom-wide focus — reteach the evidence before adding difficulty.`;
    }
    if (row.band === "developing") {
      return `${label}: class mean ${pct}% with ${focus} of ${n} still below mostly-secure. Use small-group practice on the linked evidence models.`;
    }
    if (row.band === "mostly-secure") {
      return `${label}: mostly secure (mean ${pct}%). ${focus} of ${n} still need a short review; do not reteach the whole class.`;
    }
    return `${label}: secure for the class (mean ${pct}%). Keep this target moving with richer tasks; ${focus} of ${n} remain below mostly-secure.`;
  }
  if ((focus / n) >= 0.5) {
    return `${label}: ${focus} of ${n} students are emerging or developing (mean ${pct}%). Curriculum time and operational tasks that elicit this evidence should increase before new competencies are added.`;
  }
  if (row.band === "developing") {
    return `${label}: district mean ${pct}% on ${n} students. Coverage exists but mastery is not yet typical — keep this construct in the current unit rather than accelerating.`;
  }
  if (row.band === "mostly-secure") {
    return `${label}: mostly secure (mean ${pct}% on ${n} students). Maintain practice; ${focus} students still need support.`;
  }
  return `${label}: secure (mean ${pct}% on ${n} students). The curriculum can move this construct into richer or applied tasks.`;
}

function suppressGroupRow(row, { apply, minCell }) {
  if (!apply) return { ...row, suppressed: false, interpretation: interpretGroupRow({ ...row, suppressed: false }, apply ? "district" : "teacher") };
  if (row.nStudents > 0 && row.nStudents < minCell) {
    const suppressed = {
      id: row.id,
      name: row.name,
      domain: row.domain || null,
      claim: row.claim || null,
      competencyId: row.competencyId || null,
      competencyName: row.competencyName || null,
      taskModelId: row.taskModelId || null,
      taskModelName: row.taskModelName || null,
      n: null,
      nScored: null,
      nCorrect: null,
      nStudents: null,
      nSessions: null,
      nSecure: null,
      nMostlySecure: null,
      nDeveloping: null,
      nEmerging: null,
      nFocus: null,
      nSecureish: null,
      mean: null,
      percent: null,
      percentDisplay: null,
      itemMean: null,
      sd: null,
      se: null,
      band: null,
      bandLabel: null,
      suppressed: true,
    };
    suppressed.interpretation = interpretGroupRow(suppressed, "district");
    return suppressed;
  }
  const next = { ...row, suppressed: false };
  next.interpretation = interpretGroupRow(next, "district");
  return next;
}

function attachTeacherInterpretations(rows) {
  return rows.map((row) => ({ ...row, suppressed: false, interpretation: interpretGroupRow(row, "teacher") }));
}

function overallFromRows(itemRows) {
  const scores = itemRows.map((r) => r.score).filter((s) => Number.isFinite(s));
  return {
    nItems: itemRows.length,
    ...scoreStats(scores),
  };
}

function sessionSummaries(sessions, itemRows) {
  const bySession = new Map();
  for (const row of itemRows) {
    if (!row.sessionId) continue;
    if (!bySession.has(row.sessionId)) bySession.set(row.sessionId, []);
    bySession.get(row.sessionId).push(row);
  }
  return (sessions || []).map((session) => {
    const rows = bySession.get(session.id) || [];
    const stats = overallFromRows(rows);
    return {
      sessionId: session.id,
      finishedAt: session.finishedAt || session.updatedAt || session.startedAt || null,
      selectionStrategy: session.selectionStrategy || null,
      ...stats,
    };
  }).sort((a, b) => String(a.finishedAt || "").localeCompare(String(b.finishedAt || "")));
}

function collectForSessions(db, sessions) {
  const indexes = ecdIndexes(db);
  const itemRows = [];
  for (const session of sessions) {
    itemRows.push(...collectSessionItemRows(db, session, indexes));
  }
  return itemRows;
}

function annotatePerson(itemRows, canonicalStudentId, aliases) {
  const set = aliases instanceof Set ? aliases : new Set(aliases || []);
  return itemRows.map((row) => ({
    ...row,
    canonicalStudentId:
      (row.studentId && set.has(String(row.studentId))) || set.has(String(row.studentId))
        ? canonicalStudentId
        : row.canonicalStudentId || row.studentId,
  }));
}

function studentPersonRows(db, student, itemRows) {
  const identity = identityForStudentRow(db, student, student?.id);
  const aliases = aliasesOf(identity, student?.id);
  return annotatePerson(itemRows, identity.canonicalStudentId, aliases);
}

function interpretStudentOverall({ nScored, percent, nSessions, span, competencies }) {
  if (nScored < 1) {
    return {
      headline: "No scored responses yet across closed sessions.",
      body: "Complete and score tasks so competencies, evidence models, and tasks can be summarised across occasions.",
    };
  }
  const pct = Math.round(percent * 100);
  const band = bandFor(percent);
  const range = span.from && span.to ? (span.from === span.to ? `on ${span.from}` : `from ${span.from} to ${span.to}`) : "across closed sessions";
  const headline = `${band.label} cumulative performance (${pct}% on ${nScored} scored ${nScored === 1 ? "response" : "responses"} in ${nSessions} ${nSessions === 1 ? "session" : "sessions"}).`;
  const strengths = competencies.filter((c) => c.percent != null && c.percent >= 0.7).map((c) => c.name);
  const focus = competencies.filter((c) => c.percent != null && c.percent < 0.7).map((c) => c.name);
  let body = `Mean score across closed sessions ${range} is ${pct}% on the 0–1 scale. Bands describe this examinee's own history, not a class rank.`;
  if (strengths.length && focus.length) {
    body += ` Strengths: ${strengths.join(", ")}. Focus: ${focus.join(", ")}.`;
  } else if (strengths.length) {
    body += ` Every competency with scored items is at least mostly secure (${strengths.join(", ")}).`;
  } else if (focus.length) {
    body += ` No competency is yet mostly secure. Instruction should stay on ${focus.join(", ")}.`;
  }
  return { headline, body };
}

function studentNextSteps(competencies) {
  const strengths = competencies.filter((c) => c.percent != null && c.percent >= 0.7);
  const focus = competencies.filter((c) => c.percent != null && c.percent < 0.7);
  const steps = [];
  if (focus.length) {
    steps.push(`Revisit ${focus.map((c) => c.name).join(", ")} with items that elicit the same evidence before increasing difficulty.`);
  }
  if (strengths.length) {
    steps.push(`Keep ${strengths.map((c) => c.name).join(", ")} moving with richer tasks on the same evidence models.`);
  }
  const falling = competencies.filter((c) => Number.isFinite(c.delta) && c.delta <= -0.1);
  if (falling.length) {
    steps.push(`${falling.map((c) => c.name).join(", ")} declined across sessions — return to supported practice on those observations.`);
  }
  if (!competencies.length) {
    steps.push("Finish and score remaining tasks so this cumulative report can classify the constructs.");
  }
  return steps;
}

export function buildStudentCumulativeReport(db, { student, sessions, studentModelRecords = [] } = {}) {
  const closed = (sessions || []).filter(isClosedForCumulative);
  const rawRows = collectForSessions(db, closed);
  const itemRows = student ? studentPersonRows(db, student, rawRows) : rawRows;
  const overviewBase = overallFromRows(itemRows);
  const span = dateSpan(closed);
  const competencies = studentAggregate(itemRows, "competencyId");
  const evidence = studentAggregate(itemRows, "evidenceModelId");
  const tasks = studentAggregate(itemRows, "taskId");
  const taskModels = studentAggregate(itemRows, "taskModelId");
  const strengths = competencies.filter((c) => c.percent != null && c.percent >= 0.7).map((c) => c.name);
  const focus = competencies.filter((c) => c.percent != null && c.percent < 0.7).map((c) => c.name);
  const guideNotes = competencies
    .map((c) => {
      const resolved = resolveCompetency(db, c.id);
      return resolved?.interpretationGuide
        ? { competencyId: c.id, name: c.name, guide: resolved.interpretationGuide }
        : null;
    })
    .filter(Boolean);

  return {
    kind: "student",
    generatedAt: new Date().toISOString(),
    student: student
      ? { id: student.id || student.username, name: student.name || student.username || student.id }
      : null,
    span,
    overview: {
      ...overviewBase,
      nSessions: closed.length,
      nStudents: 1,
      from: span.from,
      to: span.to,
    },
    interpretation: interpretStudentOverall({
      nScored: overviewBase.nScored,
      percent: overviewBase.percent,
      nSessions: closed.length,
      span,
      competencies,
    }),
    competencies,
    evidence,
    tasks,
    taskModels,
    sessions: sessionSummaries(closed, itemRows),
    strengths,
    focus,
    nextSteps: studentNextSteps(competencies),
    guideNotes,
    occasions: occasionPoints(studentModelRecords),
  };
}

function studentRoster(db, students, sessions, itemRows) {
  return (students || []).map((student) => {
    const identity = identityForStudentRow(db, student, student.id);
    const aliases = aliasesOf(identity, student.id);
    const personRows = itemRows.filter(
      (row) => aliases.has(String(row.studentId)) || aliases.has(String(row.canonicalStudentId))
    );
    const stats = overallFromRows(personRows);
    const nSessions = sessionsForStudent(sessions, db, student, student.id).length;
    const competencies = studentAggregate(personRows, "competencyId");
    const weakest = [...competencies].filter((c) => c.percent != null).sort((a, b) => a.percent - b.percent)[0] || null;
    const strongest = [...competencies].filter((c) => c.percent != null).sort((a, b) => b.percent - a.percent)[0] || null;
    return {
      id: identity.canonicalStudentId || student.id,
      name: student.name || identity.displayName || student.id,
      classId: student.classId || null,
      nSessions,
      ...stats,
      weakestCompetency: weakest ? { id: weakest.id, name: weakest.name, percentDisplay: weakest.percentDisplay, band: weakest.band } : null,
      strongestCompetency: strongest ? { id: strongest.id, name: strongest.name, percentDisplay: strongest.percentDisplay, band: strongest.band } : null,
    };
  }).sort((a, b) => (a.percent ?? 99) - (b.percent ?? 99) || String(a.name).localeCompare(String(b.name)));
}

function classroomFocus(competencies, evidence, tasks, nStudents) {
  const ranked = [...competencies].sort((a, b) => (b.nFocus || 0) - (a.nFocus || 0) || (a.percent ?? 1) - (b.percent ?? 1));
  const primary = ranked.filter((c) => (c.nFocus || 0) > 0 || (c.percent != null && c.percent < 0.7));
  const steps = [];
  if (!nStudents) {
    steps.push("No students in scope yet. Assign and close sessions so classroom focus can be computed.");
    return { primary: primary.slice(0, 5), nextSteps: steps };
  }
  if (!primary.length) {
    steps.push("No competency is below mostly-secure. Extend the same evidence with richer tasks rather than reteaching.");
  } else {
    for (const row of primary.slice(0, 4)) {
      const linkedEvidence = evidence.filter((e) => e.competencyId === row.id || e.competencyName === row.name);
      const linkedTasks = tasks.filter((t) => t.competencyId === row.id || t.competencyName === row.name);
      const evidenceNames = linkedEvidence.slice(0, 3).map((e) => e.name).filter(Boolean);
      const taskNames = linkedTasks.slice(0, 3).map((t) => t.name).filter(Boolean);
      let step = `Focus class time on ${row.name} (${row.nFocus} of ${row.nStudents} students below mostly-secure, mean ${row.percentDisplay}%).`;
      if (evidenceNames.length) step += ` The weak evidence is ${evidenceNames.join(", ")}.`;
      if (taskNames.length) step += ` Reuse or reteach tasks such as ${taskNames.join(", ")}.`;
      steps.push(step);
    }
  }
  const strong = competencies.filter((c) => c.percent != null && c.percent >= 0.7);
  if (strong.length) {
    steps.push(`Do not reteach ${strong.map((c) => c.name).join(", ")} to the whole class — those targets are at least mostly secure.`);
  }
  return { primary: primary.slice(0, 5), nextSteps: steps };
}

function interpretTeacherOverall({ nStudents, nSessions, percent, competencies }) {
  if (!nStudents) {
    return {
      headline: "No students in this classroom scope.",
      body: "When students in this school or district complete sessions, this report names who is secure and which competencies need class time.",
    };
  }
  if (!nSessions) {
    return {
      headline: `${nStudents} ${nStudents === 1 ? "student" : "students"} in scope, no closed sessions yet.`,
      body: "Close sessions so item responses can be joined to competencies, evidence models, and tasks.",
    };
  }
  const pct = percent == null ? null : Math.round(percent * 100);
  const band = bandFor(percent);
  const focus = competencies.filter((c) => (c.nFocus || 0) > 0 || (c.percent != null && c.percent < 0.7));
  const headline = `${band?.label || "Unscored"} classroom performance (${pct == null ? "—" : `${pct}%`} mean across ${nStudents} ${nStudents === 1 ? "student" : "students"} in ${nSessions} closed ${nSessions === 1 ? "session" : "sessions"}).`;
  let body = "Each competency row is the mean of per-student means, so one heavily tested student does not dominate the class picture. Named students are this teacher's roster, not a public aggregate.";
  if (focus.length) {
    body += ` Classroom focus: ${focus.map((c) => c.name).join(", ")}.`;
  } else {
    body += " No competency is a class-wide weakness; differentiate with richer tasks on the current evidence.";
  }
  return { headline, body };
}

export function buildTeacherCumulativeReport(db, { teacher = null, students = [], sessions = [] } = {}) {
  const closed = (sessions || []).filter(isClosedForCumulative);
  const itemRows = [];
  const indexes = ecdIndexes(db);
  for (const student of students) {
    const personSessions = sessionsForStudent(closed, db, student, student.id);
    const identity = identityForStudentRow(db, student, student.id);
    const aliases = aliasesOf(identity, student.id);
    for (const session of personSessions) {
      itemRows.push(
        ...collectSessionItemRows(db, session, indexes).map((row) => ({
          ...stripKeys(row),
          canonicalStudentId: identity.canonicalStudentId,
          studentId: student.id,
        }))
      );
    }
  }
  const competencies = attachTeacherInterpretations(personMeanRows(itemRows, "competencyId"));
  const evidence = attachTeacherInterpretations(personMeanRows(itemRows, "evidenceModelId"));
  const tasks = attachTeacherInterpretations(personMeanRows(itemRows, "taskId"));
  const taskModels = attachTeacherInterpretations(personMeanRows(itemRows, "taskModelId"));
  const overviewBase = overallFromRows(itemRows);
  const span = dateSpan(closed);
  const studentsTable = studentRoster(db, students, closed, itemRows);
  const focus = classroomFocus(competencies, evidence, tasks, students.length);

  return {
    kind: "teacher",
    generatedAt: new Date().toISOString(),
    teacher: teacher
      ? { id: teacher.username || teacher.id, name: teacher.name || teacher.username || teacher.id, schoolId: teacher.schoolId || null, districtId: teacher.districtId || null }
      : null,
    span,
    minCellSize: MIN_CELL_SIZE,
    overview: {
      ...overviewBase,
      nSessions: closed.length,
      nStudents: students.length,
      from: span.from,
      to: span.to,
    },
    interpretation: interpretTeacherOverall({
      nStudents: students.length,
      nSessions: closed.length,
      percent: overviewBase.percent,
      competencies,
    }),
    competencies,
    evidence,
    tasks,
    taskModels,
    students: studentsTable,
    classroomFocus: focus.primary,
    nextSteps: focus.nextSteps,
  };
}

function groupCells(students, itemRows, sessions, key) {
  const groups = new Map();
  for (const student of students) {
    const id = student[key] || "(ungrouped)";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(student);
  }
  return [...groups.entries()].map(([id, members]) => {
    const nStudents = members.length;
    const ids = new Set(members.map((s) => s.id));
    const rows = itemRows.filter((r) => ids.has(r.studentId) || ids.has(r.canonicalStudentId));
    const nSessions = (sessions || []).filter((s) => ids.has(s.studentId)).length;
    const stats = overallFromRows(rows);
    const suppressed = nStudents > 0 && nStudents < MIN_CELL_SIZE;
    if (suppressed) {
      return {
        id,
        nStudents: null,
        nSessions: null,
        nScored: null,
        percent: null,
        percentDisplay: null,
        band: null,
        bandLabel: null,
        suppressed: true,
      };
    }
    return {
      id,
      nStudents,
      nSessions,
      nScored: stats.nScored,
      percent: stats.percent,
      percentDisplay: stats.percentDisplay,
      band: stats.band,
      bandLabel: stats.bandLabel,
      suppressed: false,
    };
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function curriculumFocus(competencies, evidence, tasks, nStudents) {
  const ranked = [...competencies].filter((c) => !c.suppressed).sort((a, b) => (b.nFocus || 0) - (a.nFocus || 0) || (a.percent ?? 1) - (b.percent ?? 1));
  const weak = ranked.filter((c) => (c.nFocus || 0) / Math.max(c.nStudents || 1, 1) >= 0.4 || (c.percent != null && c.percent < 0.7));
  const steps = [];
  if (!nStudents) {
    steps.push("No students in this district scope. Curriculum planning needs closed sessions.");
    return { primary: weak.slice(0, 6), nextSteps: steps };
  }
  if (!weak.length) {
    steps.push("No competency is a district-wide weakness. Plan enrichment and applied tasks on the current evidence rather than adding untaught constructs.");
  }
  for (const row of weak.slice(0, 5)) {
    const linkedEvidence = evidence.filter((e) => !e.suppressed && (e.competencyId === row.id || e.competencyName === row.name));
    const thinTasks = tasks.filter((t) => !t.suppressed && t.nStudents != null && t.nStudents < (row.nStudents || 0) * 0.5);
    let step = `Curriculum focus: ${row.name} (mean ${row.percentDisplay}% on ${row.nStudents} students; ${row.nFocus} below mostly-secure).`;
    if (linkedEvidence.length) {
      step += ` Increase instructional time on ${linkedEvidence.slice(0, 3).map((e) => e.name).join(", ")}.`;
    }
    if (thinTasks.length) {
      step += ` Task coverage is thin for ${thinTasks.slice(0, 3).map((t) => t.name).join(", ")} — add operational items on those task models.`;
    }
    steps.push(step);
  }
  const strong = competencies.filter((c) => !c.suppressed && c.percent != null && c.percent >= 0.7);
  if (strong.length) {
    steps.push(`Secure enough to enrich, not reteach: ${strong.map((c) => c.name).join(", ")}.`);
  }
  const suppressed = competencies.filter((c) => c.suppressed);
  if (suppressed.length) {
    steps.push(`Cells below n = ${MIN_CELL_SIZE} are suppressed and must not drive curriculum decisions: ${suppressed.map((c) => c.name).join(", ")}.`);
  }
  return { primary: weak.slice(0, 6), nextSteps: steps };
}

function interpretDistrictOverall({ nStudents, nSessions, percent, competencies, districtId }) {
  const where = districtId ? `District ${districtId}` : "All districts";
  if (!nStudents) {
    return {
      headline: `${where}: no students in scope.`,
      body: "Curriculum planning needs rostered students with closed sessions.",
    };
  }
  const pct = percent == null ? null : Math.round(percent * 100);
  const band = bandFor(percent);
  const headline = `${where}: ${band?.label || "unscored"} cumulative performance (${pct == null ? "—" : `${pct}%`} mean; ${nStudents} students; ${nSessions} closed sessions).`;
  const focus = competencies.filter((c) => !c.suppressed && ((c.nFocus || 0) > 0 || (c.percent != null && c.percent < 0.7)));
  let body = `Rows are means of per-student means. Named students are omitted. Counts below n = ${MIN_CELL_SIZE} are suppressed so a small cell cannot identify a child.`;
  if (focus.length) {
    body += ` Curriculum should concentrate on ${focus.map((c) => c.name).join(", ")}.`;
  } else {
    body += " No competency is a system-wide weakness; plan enrichment rather than recovery units.";
  }
  return { headline, body };
}

export function buildDistrictCumulativeReport(db, {
  districtId = null,
  students = [],
  sessions = [],
} = {}) {
  const closed = (sessions || []).filter(isClosedForCumulative);
  const itemRows = [];
  const indexes = ecdIndexes(db);
  for (const student of students) {
    const personSessions = sessionsForStudent(closed, db, student, student.id);
    const identity = identityForStudentRow(db, student, student.id);
    for (const session of personSessions) {
      itemRows.push(
        ...collectSessionItemRows(db, session, indexes).map((row) => ({
          ...stripKeys(row),
          canonicalStudentId: identity.canonicalStudentId,
          studentId: student.id,
        }))
      );
    }
  }
  const applySuppress = true;
  const competencies = personMeanRows(itemRows, "competencyId").map((row) => suppressGroupRow(row, { apply: applySuppress, minCell: MIN_CELL_SIZE }));
  const evidence = personMeanRows(itemRows, "evidenceModelId").map((row) => suppressGroupRow(row, { apply: applySuppress, minCell: MIN_CELL_SIZE }));
  const tasks = personMeanRows(itemRows, "taskId").map((row) => suppressGroupRow(row, { apply: applySuppress, minCell: MIN_CELL_SIZE }));
  const taskModels = personMeanRows(itemRows, "taskModelId").map((row) => suppressGroupRow(row, { apply: applySuppress, minCell: MIN_CELL_SIZE }));
  const overviewBase = overallFromRows(itemRows);
  const nStudents = students.length;
  const overviewSuppressed = nStudents > 0 && nStudents < MIN_CELL_SIZE;
  const span = dateSpan(closed);
  const focus = curriculumFocus(competencies, evidence, tasks, overviewSuppressed ? null : nStudents);

  return {
    kind: "district",
    generatedAt: new Date().toISOString(),
    districtId: districtId || null,
    span,
    minCellSize: MIN_CELL_SIZE,
    overview: {
      nItems: overviewSuppressed ? null : overviewBase.nItems,
      nScored: overviewSuppressed ? null : overviewBase.nScored,
      nCorrect: overviewSuppressed ? null : overviewBase.nCorrect,
      mean: overviewSuppressed ? null : overviewBase.mean,
      percent: overviewSuppressed ? null : overviewBase.percent,
      percentDisplay: overviewSuppressed ? null : overviewBase.percentDisplay,
      sd: overviewSuppressed ? null : overviewBase.sd,
      se: overviewSuppressed ? null : overviewBase.se,
      band: overviewSuppressed ? null : overviewBase.band,
      bandLabel: overviewSuppressed ? null : overviewBase.bandLabel,
      nSessions: overviewSuppressed ? null : closed.length,
      nStudents: overviewSuppressed ? null : nStudents,
      from: span.from,
      to: span.to,
      suppressed: overviewSuppressed,
    },
    interpretation: interpretDistrictOverall({
      nStudents: overviewSuppressed ? 0 : nStudents,
      nSessions: overviewSuppressed ? 0 : closed.length,
      percent: overviewSuppressed ? null : overviewBase.percent,
      competencies,
      districtId,
    }),
    competencies,
    evidence,
    tasks,
    taskModels,
    classes: groupCells(students, itemRows, closed, "classId"),
    schools: groupCells(students, itemRows, closed, "schoolId"),
    districts: districtId ? [] : groupCells(students, itemRows, closed, "districtId"),
    curriculumFocus: focus.primary,
    nextSteps: focus.nextSteps,
  };
}

export { BANDS };
