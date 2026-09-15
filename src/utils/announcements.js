// Announcement visibility: public → every authenticated role;
// roles → only audienceRoles. District-authored posts always target
// district + teacher + student.

export const ALL_ROLES = Object.freeze([
  "admin",
  "district",
  "teacher",
  "student",
]);

export const DISTRICT_AUDIENCE = Object.freeze([
  "district",
  "teacher",
  "student",
]);

export function announcementVisibleToRole(announcement, role) {
  if (!announcement || !role) return false;
  if (announcement.visibility === "public") return true;
  const audience = Array.isArray(announcement.audienceRoles)
    ? announcement.audienceRoles
    : [];
  return audience.includes(role);
}

export function announcementsForRole(list, role) {
  return (list || [])
    .filter((a) => announcementVisibleToRole(a, role))
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function canCreateAnnouncement(role) {
  return role === "admin" || role === "district";
}

export function canDeleteAnnouncement(announcement, user) {
  if (!user?.role) return false;
  if (user.role === "admin") return true;
  if (user.role !== "district") return false;
  return (
    announcement?.authorRole === "district" &&
    announcement?.createdBy === user.username
  );
}

/** Normalize create payload for admin / district. */
export function buildAnnouncementRecord({
  title,
  body,
  authorRole,
  createdBy,
  visibility,
  audienceRoles,
  now = new Date().toISOString(),
  id = `ann${Date.now()}`,
}) {
  const trimmedTitle = String(title || "").trim();
  const trimmedBody = String(body || "").trim();
  if (!trimmedTitle) throw new Error("Title is required");
  if (!trimmedBody) throw new Error("Body is required");

  let vis = visibility === "public" ? "public" : "roles";
  let audience = Array.isArray(audienceRoles)
    ? audienceRoles.filter((r) => ALL_ROLES.includes(r))
    : [];

  if (authorRole === "district") {
    vis = "roles";
    audience = [...DISTRICT_AUDIENCE];
  } else if (authorRole === "admin") {
    if (vis === "public") {
      audience = [...ALL_ROLES];
    } else if (!audience.length) {
      throw new Error("Select at least one role, or mark the announcement public");
    }
  } else {
    throw new Error("Only admin or district can create announcements");
  }

  return {
    id,
    title: trimmedTitle,
    body: trimmedBody,
    authorRole,
    createdBy: createdBy || null,
    visibility: vis,
    audienceRoles: audience,
    createdAt: now,
    updatedAt: now,
  };
}
