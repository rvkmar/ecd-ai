import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import TaskTimeCountdown from "../TaskTimeCountdown.jsx";

const T0 = "2026-10-31T12:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TaskTimeCountdown", () => {
  it("shows the given limit and does not rescale an accommodated 120 seconds", () => {
    render(
      <TaskTimeCountdown
        limitMs={120000}
        openPresentedAt={T0}
        accruedMs={0}
        storedMs={0}
      />
    );
    expect(screen.getByTestId("task-time-remaining")).toHaveTextContent("Question time remaining:");
    expect(screen.getByTestId("task-time-remaining")).toHaveTextContent("2m 0s");
  });

  it("counts down to zero, expires once, and keeps the expiry message", () => {
    const onExpire = vi.fn();
    render(
      <TaskTimeCountdown
        limitMs={10000}
        openPresentedAt={T0}
        onExpire={onExpire}
      />
    );
    expect(screen.getByTestId("task-time-remaining")).toHaveTextContent("10s");
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("task-time-expired")).toHaveTextContent(
      "Time is up for this question. Your current answer is being submitted."
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("subtracts time already stored on the task", () => {
    render(
      <TaskTimeCountdown
        limitMs={10000}
        openPresentedAt={T0}
        storedMs={4000}
      />
    );
    expect(screen.getByTestId("task-time-remaining")).toHaveTextContent("6s");
  });

  it("renders nothing without a limit and does not fire while inactive", () => {
    const onExpire = vi.fn();
    const { rerender } = render(
      <TaskTimeCountdown openPresentedAt={T0} onExpire={onExpire} />
    );
    expect(screen.queryByTestId("task-time-remaining")).toBeNull();
    expect(screen.queryByTestId("task-time-expired")).toBeNull();

    vi.setSystemTime(new Date("2026-10-31T12:00:30.000Z"));
    rerender(
      <TaskTimeCountdown
        limitMs={10000}
        openPresentedAt={T0}
        active={false}
        onExpire={onExpire}
      />
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByTestId("task-time-expired")).toBeNull();
  });
});
