import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  accommodationsForStorage,
  applyAccommodationTiming,
  resolveAccommodations,
  taskTimeLimitInputs,
  withStudentAccommodations,
} from "../resolveAccommodations.js";

describe("resolveAccommodations", () => {
  it("treats a missing profile as no change", () => {
    const resolved = resolveAccommodations({ id: "stu1", name: "Pat" });
    expect(resolved.active).toBe(false);
    expect(resolved.timingActive).toBe(false);
    expect(resolved.profile).toBeNull();
    expect(resolved.extraTimeMinutes).toBe(0);
    expect(resolved.timeMultiplier).toBe(1);
    expect(resolved.fontScale).toBe(1);
    expect(resolved.highContrast).toBe(false);
    expect(resolved.readAloud).toBe(false);
    expect(resolveAccommodations(null).active).toBe(false);
    expect(resolveAccommodations({}).active).toBe(false);
  });

  it("keeps only the fields that change delivery", () => {
    const resolved = resolveAccommodations({
      accommodations: {
        extraTimeMinutes: 0,
        timeMultiplier: 1,
        fontScale: 1.25,
        highContrast: false,
        readAloud: true,
      },
    });
    expect(resolved.profile).toEqual({ fontScale: 1.25, readAloud: true });
    expect(resolved.timingActive).toBe(false);
    expect(resolved.fontScale).toBe(1.25);
    expect(resolved.readAloud).toBe(true);
  });

  it("ignores out-of-range numbers on read", () => {
    const resolved = resolveAccommodations({
      extraTimeMinutes: -4,
      timeMultiplier: 9,
      fontScale: 4,
      highContrast: "yes",
      readAloud: 1,
    });
    expect(resolved.active).toBe(false);
  });
});

describe("accommodationsForStorage", () => {
  it("rejects an unknown key and a font scale above 2", () => {
    expect(accommodationsForStorage({ fontScale: 3 }).ok).toBe(false);
    expect(accommodationsForStorage({ caption: true }).errors[0]).toMatch(/caption/);
    expect(accommodationsForStorage({ timeMultiplier: 0.5 }).ok).toBe(false);
    expect(accommodationsForStorage({ extraTimeMinutes: -1 }).ok).toBe(false);
    expect(accommodationsForStorage(null)).toEqual({ ok: true, value: null });
    expect(accommodationsForStorage({}).value).toBeNull();
  });

  it("stores a partial profile", () => {
    const stored = accommodationsForStorage({
      extraTimeMinutes: 10,
      timeMultiplier: 1.5,
      highContrast: true,
    });
    expect(stored.ok).toBe(true);
    expect(stored.value).toEqual({
      extraTimeMinutes: 10,
      timeMultiplier: 1.5,
      highContrast: true,
    });
  });
});

describe("applyAccommodationTiming", () => {
  it("leaves a session limit unchanged when accommodations are absent", () => {
    const applied = applyAccommodationTiming({
      timeLimitMinutes: 20,
      presentationMultiplier: 2,
    });
    expect(applied.minutes).toBe(40);
    expect(applied.adjusted).toBe(true);
    expect(applyAccommodationTiming({ timeLimitMinutes: 20 }).adjusted).toBe(false);
    expect(applyAccommodationTiming({ timeLimitSeconds: 90 }).seconds).toBe(90);
    expect(applyAccommodationTiming({ timeLimitSeconds: 90 }).adjusted).toBe(false);
  });

  it("scales session minutes and task seconds with the student factor and extra minutes", () => {
    const session = applyAccommodationTiming({
      timeLimitMinutes: 20,
      presentationMultiplier: 2,
      accommodations: { extraTimeMinutes: 5, timeMultiplier: 1.5 },
    });
    expect(session.minutes).toBe(65);
    expect(session.durationMs).toBe(65 * 60 * 1000);

    const task = applyAccommodationTiming({
      timeLimitSeconds: 60,
      accommodations: { extraTimeMinutes: 5, timeMultiplier: 1.5 },
    });
    expect(task.seconds).toBe(390);
    expect(task.adjusted).toBe(true);
  });

  it("ignores a presentation multiplier outside [1, 3]", () => {
    const applied = applyAccommodationTiming({
      timeLimitMinutes: 10,
      presentationMultiplier: 9,
    });
    expect(applied.minutes).toBe(10);
  });
});

describe("taskTimeLimitInputs", () => {
  it("reads a positive task-model limit and skips the rest", () => {
    const rows = taskTimeLimitInputs({
      tasks: [
        { id: "t1", taskModelId: "tm1" },
        { id: "t2", taskModelId: "tm2" },
        { id: "t3" },
      ],
      taskModels: [
        { id: "tm1", taskStructure: { timingConstraint: { timeLimitSeconds: 60 } } },
        { id: "tm2", taskStructure: { timingConstraint: { timeLimitSeconds: 0 } } },
      ],
    }, ["t1", "t2", "t3"]);
    expect(rows).toEqual([{ taskId: "t1", timeLimitSeconds: 60 }]);
  });
});

describe("withStudentAccommodations", () => {
  it("leaves the overlay alone when the student has no profile", () => {
    const overlay = { presentationModelId: "pm1", timeMultiplier: 2 };
    expect(withStudentAccommodations(overlay, { id: "stu1" })).toEqual(overlay);
    expect(withStudentAccommodations(null, null)).toBeNull();
  });

  it("attaches the profile without replacing the presentation factor", () => {
    const overlay = withStudentAccommodations(
      { presentationModelId: "pm1", timeMultiplier: 2 },
      { accommodations: { readAloud: true, fontScale: 1.4 } }
    );
    expect(overlay.timeMultiplier).toBe(2);
    expect(overlay.accommodations).toEqual({ readAloud: true, fontScale: 1.4 });
    expect(withStudentAccommodations(null, { readAloud: true })).toEqual({
      accommodations: { readAloud: true },
    });
  });
});

describe("students schema", () => {
  it("accepts a partial profile and refuses an illegal font scale", () => {
    const ok = validateEntity("students", {
      id: "stu1",
      name: "Pat",
      accommodations: { readAloud: true, extraTimeMinutes: 5 },
    });
    expect(ok.valid).toBe(true);

    const absent = validateEntity("students", { id: "stu1", name: "Pat" });
    expect(absent.valid).toBe(true);

    const bad = validateEntity("students", {
      id: "stu1",
      name: "Pat",
      accommodations: { fontScale: 3 },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/fontScale/);
  });
});
