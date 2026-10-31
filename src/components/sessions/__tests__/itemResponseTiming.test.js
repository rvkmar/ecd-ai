import { describe, expect, it } from "vitest";
import { createItemResponseTimer } from "../itemResponseTiming";

describe("item response timer", () => {
  it("accumulates visible time and drops tab-hidden time", () => {
    let clock = 1_000;
    const timer = createItemResponseTimer(() => clock);
    timer.start("t1", clock);
    clock = 4_000;
    timer.setHidden(true, clock);
    clock = 9_000;
    timer.setHidden(false, clock);
    clock = 11_000;
    const snap = timer.snapshot(clock);
    expect(snap).toMatchObject({
      taskId: "t1",
      visibleMs: 5000,
      hiddenMs: 5000,
    });
    expect(snap.clientPresentedAt).toBe(new Date(1_000).toISOString());
  });

  it("does not reset the clock when the same task is started again", () => {
    let clock = 0;
    const timer = createItemResponseTimer(() => clock);
    const first = timer.start("t1", clock);
    clock = 2500;
    const second = timer.start("t1", clock);
    expect(second.clientPresentedAt).toBe(first.clientPresentedAt);
    expect(second.visibleMs).toBe(2500);
  });

  it("starts a new visit when the task changes, after the caller snapshots the old one", () => {
    let clock = 0;
    const timer = createItemResponseTimer(() => clock);
    timer.start("t1", clock);
    clock = 3000;
    const leaving = timer.snapshot(clock);
    const next = timer.start("t2", clock);
    clock = 4500;
    expect(leaving).toMatchObject({ taskId: "t1", visibleMs: 3000, hiddenMs: 0 });
    expect(timer.snapshot(clock)).toMatchObject({ taskId: "t2", visibleMs: 1500, hiddenMs: 0 });
    expect(next.clientPresentedAt).not.toBe(leaving.clientPresentedAt);
  });
});
