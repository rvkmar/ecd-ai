// Who may view or edit students.accommodations.
//
// Admin may. District staff may when the district matches. A teacher may
// when school matches, or when the student has no school and the district
// matches. A class claim (profile.classId or classIds, or the same fields
// on the token) narrows that to the student's class. A student is not staff.
// Claims that both sides carry must agree. A student with no district,
// school, or class is visible to admin only.

function textId(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return text;
}

function idList(value) {
  if (value == null || value === "") return [];
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  for (const item of raw) {
    const text = textId(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/**
 * Token claims win when present. Class is read from the token or from the
 * stored user profile, because login does not put classId on the JWT.
 */
export function staffActorForAccess(tokenUser, db) {
  const token = tokenUser || {};
  const stored = (db?.users || []).find(
    (row) =>
      row &&
      (row.username === token.username || String(row.id) === String(token.username || ""))
  );
  const profile = stored?.profile && typeof stored.profile === "object" ? stored.profile : {};
  const classIds = idList(
    token.classIds ?? token.classId ?? profile.classIds ?? profile.classId ?? stored?.classIds ?? stored?.classId
  );
  return {
    role: token.role || stored?.role || "",
    username: token.username || stored?.username || "",
    districtId: textId(token.districtId || profile.districtId || stored?.districtId) || null,
    schoolId: textId(token.schoolId || profile.schoolId || stored?.schoolId) || null,
    classIds,
  };
}

/**
 * @param {{ role?: string, districtId?: string|null, schoolId?: string|null, classIds?: string[] }} actor
 * @param {object|null|undefined} student
 */
export function staffMayAccessStudent(actor, student) {
  if (!actor || !student) return false;
  if (actor.role === "admin") return true;
  if (actor.role !== "district" && actor.role !== "teacher") return false;

  const district = textId(student.districtId);
  const school = textId(student.schoolId);
  const klass = textId(student.classId);
  const actorDistrict = textId(actor.districtId);
  const actorSchool = textId(actor.schoolId);
  const actorClasses = idList(actor.classIds);

  if (actorDistrict && district && actorDistrict !== district) return false;
  if (actorSchool && school && actorSchool !== school) return false;
  if (actorClasses.length && klass && !actorClasses.includes(klass)) return false;

  if (actorClasses.length) {
    if (!klass || !actorClasses.includes(klass)) return false;
    if (district && !actorDistrict) return false;
    return true;
  }

  if (actor.role === "district") {
    return Boolean(actorDistrict && district && actorDistrict === district);
  }

  if (actorSchool && school && actorSchool === school) {
    if (district && !actorDistrict) return false;
    return true;
  }
  if (actorSchool && school && actorSchool !== school) return false;

  if (!school && actorDistrict && district && actorDistrict === district) return true;
  if (!actorSchool && actorDistrict && district && actorDistrict === district) return true;
  return false;
}

export function studentMayViewOwnAccommodations(actor, student) {
  if (!actor || actor.role !== "student" || !student) return false;
  const name = textId(actor.username);
  if (!name) return false;
  return textId(student.id) === name || textId(student.username) === name;
}
