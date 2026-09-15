import { describe, it, expect } from "vitest";
import {
  announcementVisibleToRole,
  announcementsForRole,
  buildAnnouncementRecord,
  canDeleteAnnouncement,
  DISTRICT_AUDIENCE,
} from "../announcements.js";

describe("announcement visibility", () => {
  it("public announcements are visible to every role", () => {
    const ann = buildAnnouncementRecord({
      title: "System notice",
      body: "Hello",
      authorRole: "admin",
      createdBy: "admin1",
      visibility: "public",
    });
    expect(ann.visibility).toBe("public");
    for (const role of ["admin", "district", "teacher", "student"]) {
      expect(announcementVisibleToRole(ann, role)).toBe(true);
    }
  });

  it("admin can target a subset of roles", () => {
    const ann = buildAnnouncementRecord({
      title: "Teachers only",
      body: "PD day",
      authorRole: "admin",
      createdBy: "admin1",
      visibility: "roles",
      audienceRoles: ["teacher"],
    });
    expect(announcementVisibleToRole(ann, "teacher")).toBe(true);
    expect(announcementVisibleToRole(ann, "student")).toBe(false);
    expect(announcementVisibleToRole(ann, "admin")).toBe(false);
  });

  it("district posts always target district, teacher, and student", () => {
    const ann = buildAnnouncementRecord({
      title: "District note",
      body: "Buses delayed",
      authorRole: "district",
      createdBy: "dist1",
      visibility: "public",
    });
    expect(ann.visibility).toBe("roles");
    expect(ann.audienceRoles).toEqual([...DISTRICT_AUDIENCE]);
    expect(announcementVisibleToRole(ann, "admin")).toBe(false);
    expect(announcementVisibleToRole(ann, "teacher")).toBe(true);
  });

  it("filters and sorts the feed for a role", () => {
    const list = [
      buildAnnouncementRecord({
        id: "a1",
        title: "Old",
        body: "x",
        authorRole: "admin",
        createdBy: "a",
        visibility: "public",
        now: "2026-01-01T00:00:00.000Z",
      }),
      buildAnnouncementRecord({
        id: "a2",
        title: "Teachers",
        body: "y",
        authorRole: "admin",
        createdBy: "a",
        visibility: "roles",
        audienceRoles: ["teacher"],
        now: "2026-02-01T00:00:00.000Z",
      }),
    ];
    const forStudent = announcementsForRole(list, "student");
    expect(forStudent.map((a) => a.id)).toEqual(["a1"]);
    const forTeacher = announcementsForRole(list, "teacher");
    expect(forTeacher.map((a) => a.id)).toEqual(["a2", "a1"]);
  });

  it("lets admin delete any post and district delete only their own", () => {
    const ann = buildAnnouncementRecord({
      title: "Mine",
      body: "x",
      authorRole: "district",
      createdBy: "dist1",
    });
    expect(canDeleteAnnouncement(ann, { role: "admin", username: "admin1" })).toBe(
      true
    );
    expect(canDeleteAnnouncement(ann, { role: "district", username: "dist1" })).toBe(
      true
    );
    expect(canDeleteAnnouncement(ann, { role: "district", username: "other" })).toBe(
      false
    );
    expect(canDeleteAnnouncement(ann, { role: "teacher", username: "t1" })).toBe(
      false
    );
  });
});
