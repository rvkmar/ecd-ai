// Persistent student scoring record.
//
// Textbook ECD keeps the student model as the student's scoring record
// across tasks and occasions. A session only holds the estimates for one
// occasion (session.studentModel.smvPosteriors). This module stores the
// current estimates, and a history of occasion snapshots, in
// studentModelRecords.
//
// One row per student and competency model. Each posterior already names
// its parameter set and statistical model, and the row summarises those
// ids. A later occasion replaces the current estimate for an SMV. The
// previous snapshot stays in history. Splitting a row per parameter set
// would hide the current student model behind several records.
//
// studentId on a session is not one collection. It may be a students-row
// id (stu...), a users id, or a typed username (stud1). Aliases follow
// the same links as sessionPlay.studentIdentityKeys, plus the reverse
// link from a students row back to the user whose username is that
// row's id, username, userId, or name.

import { studentIdentityKeys } from "./sessionPlay.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function uniqueSorted(values) {
  const list = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
  return [...new Set(list.filter(Boolean).map((value) => String(value)))].sort();
}

/**
 * Every id that refers to the same examinee as rawId.
 * Includes students-collection ids and user ids / usernames.
 */
export function resolveStudentIdentity(rawId, db = {}) {
  const key = asText(rawId);
  const students = db.students || [];
  const users = (db.users || []).filter((user) => !user?.role || user.role === "student");
  const keys = new Set();
  if (key) keys.add(key);

  const expandOnce = () => {
    for (const alias of [...keys]) {
      for (const extra of studentIdentityKeys({ username: alias, id: alias }, students, users)) {
        keys.add(extra);
      }
    }
    for (const student of students) {
      if (!student) continue;
      const studentIds = [student.id, student.username, student.userId]
        .map(asText)
        .filter(Boolean);
      const linked = studentIds.some((id) => keys.has(id)) || (student.name && keys.has(String(student.name)));
      if (!linked) continue;
      for (const id of studentIds) keys.add(id);
      for (const user of users) {
        if (!user) continue;
        const userIds = [user.id, user.username].map(asText).filter(Boolean);
        const userLinked = userIds.some((id) => studentIds.includes(id) || id === asText(student.name));
        if (!userLinked) continue;
        for (const id of userIds) keys.add(id);
      }
    }
  };

  expandOnce();
  expandOnce();

  const student = students.find((row) => row?.id && keys.has(String(row.id)));
  const user = users.find((row) => {
    const username = asText(row?.username);
    const id = asText(row?.id);
    return (username && keys.has(username)) || (id && keys.has(id));
  });

  const canonicalStudentId = student?.id
    ? String(student.id)
    : user?.username
      ? String(user.username)
      : key;

  const districtId =
    student?.districtId || user?.profile?.districtId || user?.districtId || null;
  const schoolId = student?.schoolId || user?.profile?.schoolId || user?.schoolId || null;
  const displayName = student?.name || user?.profile?.name || user?.username || key;

  return {
    canonicalStudentId,
    identityAliases: uniqueSorted(keys),
    districtId: districtId ? String(districtId) : null,
    schoolId: schoolId ? String(schoolId) : null,
    displayName: displayName ? String(displayName) : key,
  };
}

export function identityOverlaps(identity, record) {
  if (!identity || !record) return false;
  const aliases = new Set(identity.identityAliases || []);
  if (record.studentId && aliases.has(String(record.studentId))) return true;
  return (record.identityAliases || []).some((alias) => aliases.has(String(alias)));
}

export function recordVisibleToUser(record, user, db = {}) {
  if (!user || !record) return false;
  if (user.role === "admin") return true;
  if (user.role === "student") {
    const self = resolveStudentIdentity(user.username || user.id, db);
    return identityOverlaps(self, record);
  }
  if (user.role !== "teacher" && user.role !== "district") return false;
  const districtId = user.districtId || user.profile?.districtId || null;
  if (!districtId || !record.districtId) return false;
  if (String(record.districtId) !== String(districtId)) return false;
  const schoolId = user.schoolId || user.profile?.schoolId || null;
  if (user.role === "teacher" && schoolId && record.schoolId && String(record.schoolId) !== String(schoolId)) {
    return false;
  }
  return true;
}

export function competencyModelIdForPosterior(posterior, db = {}) {
  if (!posterior || typeof posterior !== "object") return null;
  const declared = asText(posterior.competencyModelId);
  if (declared) return declared;
  const evidenceModel = (db.evidenceModels || []).find((row) => row && row.id === posterior.evidenceModelId);
  if (!evidenceModel?.competencyId) return null;
  const competency = (db.competencies || []).find((row) => row && row.id === evidenceModel.competencyId);
  return asText(competency?.modelId) || null;
}

export function statisticalModelIdForPosterior(posterior, db = {}) {
  if (!posterior || typeof posterior !== "object") return null;
  const evidenceModel = (db.evidenceModels || []).find((row) => row && row.id === posterior.evidenceModelId);
  const models = evidenceModel?.statisticalModels || [];
  if (posterior.parameterSetId) {
    const hit = models.find((model) =>
      (model.parameterSets || []).some(
        (set) => set && (set.parameterSetId === posterior.parameterSetId || set.id === posterior.parameterSetId)
      )
    );
    if (hit?.id) return String(hit.id);
  }
  const declared = asText(posterior.statisticalModelId);
  if (declared && models.some((model) => model.id === declared)) return declared;
  const active = models.find((model) => model && model.active && model.id);
  return active?.id ? String(active.id) : declared || null;
}

function parameterSetIdsOf(posteriors) {
  return uniqueSorted(
    Object.values(posteriors || {})
      .map((posterior) => posterior?.parameterSetId)
      .filter((id) => typeof id === "string" && id)
  );
}

function statisticalModelIdsOf(posteriors) {
  return uniqueSorted(Object.values(posteriors || {}).map((posterior) => posterior?.statisticalModelId));
}

function evidenceModelIdsOf(posteriors) {
  return uniqueSorted(Object.values(posteriors || {}).map((posterior) => posterior?.evidenceModelId));
}

export function findStudentModelRecord(db, identity, competencyModelId) {
  return (db?.studentModelRecords || []).find(
    (row) => row && row.competencyModelId === competencyModelId && identityOverlaps(identity, row)
  );
}

function competencyModelIdsFromTasks(session, db) {
  const ids = new Set();
  for (const taskId of session?.taskIds || []) {
    const task = (db.tasks || []).find((row) => row && row.id === taskId);
    const taskModel = (db.taskModels || []).find((row) => row && row.id === task?.taskModelId);
    const evidenceModelIds = [
      ...(taskModel?.evidenceModelIds || []),
      ...(taskModel?.primaryEvidenceModelId ? [taskModel.primaryEvidenceModelId] : []),
    ];
    for (const evidenceModelId of evidenceModelIds) {
      const evidenceModel = (db.evidenceModels || []).find((row) => row && row.id === evidenceModelId);
      const competency = (db.competencies || []).find((row) => row && row.id === evidenceModel?.competencyId);
      if (competency?.modelId) ids.add(String(competency.modelId));
    }
  }
  return [...ids];
}

/**
 * Delivery model administration.carryForward, or an explicit session
 * option, turns seeding on. Either one is enough. Absent means off, so
 * a legacy session is not seeded.
 */
export function carryForwardRequested(deliveryModel, sessionOption) {
  return deliveryModel?.administration?.carryForward === true || sessionOption === true;
}

export function competencyModelIdsForSeed(session, db) {
  const deliveryModel = session?.deliveryModelId
    ? (db.deliveryModels || []).find((row) => row && row.id === session.deliveryModelId)
    : null;
  if (deliveryModel?.competencyModelId) return [String(deliveryModel.competencyModelId)];
  return competencyModelIdsFromTasks(session, db);
}

/**
 * Copy the current scoring record onto a new session when carry-forward
 * is requested. Does nothing when the option is off, or when this student
 * has no record yet.
 */
export function seedSessionStudentModel(session, db, options = {}) {
  if (!session) return session;
  const deliveryModel = session.deliveryModelId
    ? (db?.deliveryModels || []).find((row) => row && row.id === session.deliveryModelId)
    : null;
  if (!carryForwardRequested(deliveryModel, options.carryForward === true)) return session;

  session.carryForward = true;
  const competencyModelIds = competencyModelIdsForSeed(session, db);
  const identity = resolveStudentIdentity(session.studentId, db);
  const records = (db?.studentModelRecords || []).filter(
    (row) => row && competencyModelIds.includes(row.competencyModelId) && identityOverlaps(identity, row)
  );
  if (records.length === 0) return session;

  if (!session.studentModel || typeof session.studentModel !== "object" || Array.isArray(session.studentModel)) {
    session.studentModel = {};
  }
  const smvPosteriors = { ...(session.studentModel.smvPosteriors || {}) };
  for (const record of records) {
    for (const [smvId, posterior] of Object.entries(record.smvPosteriors || {})) {
      if (smvPosteriors[smvId]) continue;
      smvPosteriors[smvId] = clone(posterior);
    }
  }
  session.studentModel.smvPosteriors = smvPosteriors;
  session.studentModel.carriedForward = {
    at: options.now || new Date().toISOString(),
    recordIds: records.map((row) => row.id),
    competencyModelIds: uniqueSorted(records.map((row) => row.competencyModelId)),
  };
  return session;
}

function enrichPosterior(smvId, posterior, db) {
  const competencyModelId = competencyModelIdForPosterior(posterior, db);
  const statisticalModelId = statisticalModelIdForPosterior(posterior, db);
  return {
    ...clone(posterior),
    smvId,
    ...(competencyModelId ? { competencyModelId } : {}),
    ...(statisticalModelId ? { statisticalModelId } : {}),
  };
}

/**
 * Write the finished occasion onto the persistent record. An empty
 * student model does not create a row and does not erase an earlier one.
 * Finishing the same session again replaces that history entry.
 */
export function commitFinishedSession(db, session, options = {}) {
  const updated = [];
  if (!db || !session) return updated;
  const source = session.studentModel?.smvPosteriors;
  if (!source || typeof source !== "object" || Array.isArray(source)) return updated;

  const groups = new Map();
  for (const [smvId, posterior] of Object.entries(source)) {
    if (!posterior || typeof posterior !== "object") continue;
    const enriched = enrichPosterior(smvId, posterior, db);
    if (!enriched.competencyModelId) continue;
    if (!groups.has(enriched.competencyModelId)) groups.set(enriched.competencyModelId, {});
    groups.get(enriched.competencyModelId)[smvId] = enriched;
  }
  if (groups.size === 0) return updated;

  if (!Array.isArray(db.studentModelRecords)) db.studentModelRecords = [];
  const now = options.now || session.finishedAt || new Date().toISOString();
  const identity = resolveStudentIdentity(session.studentId, db);

  for (const [competencyModelId, posteriors] of groups) {
    const parameterSetIds = parameterSetIdsOf(posteriors);
    const statisticalModelIds = statisticalModelIdsOf(posteriors);
    const evidenceModelIds = evidenceModelIdsOf(posteriors);
    const competency = (db.competencyModels || []).find((row) => row && row.id === competencyModelId);
    const entry = {
      sessionId: session.id,
      timestamp: now,
      posteriorSnapshot: clone(posteriors),
      parameterSetIds,
      statisticalModelIds,
    };
    const provenance = {
      source: "session-finish",
      sessionId: session.id,
      updatedAt: now,
      parameterSetIds,
      statisticalModelIds,
      evidenceModelIds,
    };

    let record = findStudentModelRecord(db, identity, competencyModelId);
    if (!record) {
      record = {
        id: `smr${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
        createdAt: now,
        history: [],
      };
      db.studentModelRecords.push(record);
    }

    const history = Array.isArray(record.history) ? record.history.filter((row) => row && row.sessionId !== session.id) : [];
    history.push(entry);
    const latest = history.reduce((best, row) => {
      if (!best) return row;
      return String(row.timestamp) >= String(best.timestamp) ? row : best;
    }, null);

    record.studentId = identity.canonicalStudentId || asText(session.studentId);
    record.displayName = identity.displayName || record.studentId;
    record.identityAliases = uniqueSorted([...(identity.identityAliases || []), record.studentId]);
    record.competencyModelId = competencyModelId;
    record.competencyModelName = competency?.name || record.competencyModelName || "";
    record.parameterSetId = parameterSetIds.length === 1 ? parameterSetIds[0] : null;
    record.statisticalModelIds = statisticalModelIds;
    record.smvPosteriors = clone(latest?.posteriorSnapshot || posteriors);
    record.history = history;
    record.provenance = provenance;
    record.districtId = identity.districtId;
    record.schoolId = identity.schoolId;
    record.updatedAt = now;
    updated.push(record);
  }

  return updated;
}

function posteriorErrors(smvId, posterior, prefix) {
  const errors = [];
  if (!posterior || typeof posterior !== "object" || Array.isArray(posterior)) {
    errors.push(`${prefix} must be an object.`);
    return errors;
  }
  if (posterior.smvId !== smvId) {
    errors.push(`${prefix}.smvId ('${posterior.smvId}') must match its own key ('${smvId}').`);
  }
  if (!Number.isFinite(posterior.estimate)) {
    errors.push(`${prefix}.estimate must be a finite number.`);
  }
  if (typeof posterior.updatedAt !== "string" || Number.isNaN(Date.parse(posterior.updatedAt))) {
    errors.push(`${prefix}.updatedAt must be an ISO date string.`);
  }
  return errors;
}

export function studentModelRecordErrors(obj, db = null) {
  const errors = [];
  const row = obj || {};
  if (!asText(row.id)) errors.push("id is required.");
  if (!asText(row.studentId)) errors.push("studentId is required.");
  if (!asText(row.competencyModelId)) errors.push("competencyModelId is required.");
  if (row.identityAliases != null && !Array.isArray(row.identityAliases)) {
    errors.push("identityAliases should be array");
  }
  if (row.history != null && !Array.isArray(row.history)) {
    errors.push("history should be array");
  } else {
    for (const [index, entry] of (row.history || []).entries()) {
      const prefix = `history[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${prefix} must be an object.`);
        continue;
      }
      if (!asText(entry.sessionId)) errors.push(`${prefix}.sessionId is required.`);
      if (typeof entry.timestamp !== "string" || Number.isNaN(Date.parse(entry.timestamp))) {
        errors.push(`${prefix}.timestamp must be an ISO date string.`);
      }
      if (!entry.posteriorSnapshot || typeof entry.posteriorSnapshot !== "object" || Array.isArray(entry.posteriorSnapshot)) {
        errors.push(`${prefix}.posteriorSnapshot must be an object.`);
      }
    }
  }
  if (row.provenance != null && (typeof row.provenance !== "object" || Array.isArray(row.provenance))) {
    errors.push("provenance must be an object.");
  }
  const posteriors = row.smvPosteriors;
  if (posteriors == null) {
    errors.push("smvPosteriors is required.");
  } else if (typeof posteriors !== "object" || Array.isArray(posteriors)) {
    errors.push("smvPosteriors must be an object keyed by Student Model Variable id.");
  } else {
    for (const [smvId, posterior] of Object.entries(posteriors)) {
      errors.push(...posteriorErrors(smvId, posterior, `smvPosteriors['${smvId}']`));
    }
  }

  if (db && asText(row.studentId) && asText(row.competencyModelId)) {
    const identity = {
      identityAliases: uniqueSorted([...(row.identityAliases || []), row.studentId]),
    };
    const clash = (db.studentModelRecords || []).find(
      (other) =>
        other &&
        other.id !== row.id &&
        other.competencyModelId === row.competencyModelId &&
        identityOverlaps(identity, other)
    );
    if (clash) {
      errors.push(
        `A student model record for competency model '${row.competencyModelId}' already exists ('${clash.id}').`
      );
    }
  }

  return errors;
}
