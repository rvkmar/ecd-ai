import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionList from "../SessionList.jsx";

describe("Staff session list Play / Pause / Review / View", () => {
  it("shows Play without Pause on a ready session", () => {
    render(
      <SessionList
        sessions={[{ id: "s1", status: "ready", studentId: "stud1", taskIds: [], responses: [] }]}
      />
    );
    expect(screen.getByText("Play")).toBeInTheDocument();
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.queryByText("Review")).toBeNull();
    expect(screen.queryByText("View")).toBeNull();
  });

  it("shows Pause and Review without Play once in progress", () => {
    render(
      <SessionList
        sessions={[{ id: "s1", status: "in_progress", studentId: "stud1", taskIds: [], responses: [] }]}
      />
    );
    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.queryByText("Play")).toBeNull();
    expect(screen.queryByText("Operate")).toBeNull();
  });

  it("Play and Pause are mutually exclusive and call the persist handlers, not each other", async () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onOperate = vi.fn();
    const { rerender } = render(
      <SessionList
        sessions={[{ id: "s1", status: "ready", studentId: "stud1", taskIds: [], responses: [] }]}
        onPlay={onPlay}
        onPause={onPause}
        onOperate={onOperate}
      />
    );
    await userEvent.click(screen.getByText("Play"));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPause).not.toHaveBeenCalled();
    expect(onOperate).not.toHaveBeenCalled();

    rerender(
      <SessionList
        sessions={[{ id: "s1", status: "in_progress", studentId: "stud1", taskIds: [], responses: [] }]}
        onPlay={onPlay}
        onPause={onPause}
        onOperate={onOperate}
      />
    );
    expect(screen.queryByText("Play")).toBeNull();
    await userEvent.click(screen.getByText("Pause"));
    expect(onPause).toHaveBeenCalledWith("s1");
    expect(onOperate).not.toHaveBeenCalled();
  });

  it("Review is the list action that opens the live player surface", async () => {
    const onOperate = vi.fn();
    render(
      <SessionList
        sessions={[{ id: "s1", status: "in_progress", studentId: "stud1", taskIds: [], responses: [] }]}
        onOperate={onOperate}
      />
    );
    await userEvent.click(screen.getByText("Review"));
    expect(onOperate).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
  });

  it("completed sessions offer View and Report, not Review", async () => {
    const onView = vi.fn();
    const onViewReport = vi.fn();
    render(
      <SessionList
        sessions={[
          {
            id: "s-done",
            status: "completed",
            isCompleted: true,
            studentId: "stud1",
            taskIds: ["t1"],
            responses: [{ taskId: "t1" }],
          },
        ]}
        onView={onView}
        onViewReport={onViewReport}
      />
    );
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
    expect(screen.queryByText("Review")).toBeNull();
    expect(screen.queryByText("Operate")).toBeNull();
    await userEvent.click(screen.getByText("View"));
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: "s-done" }));
    await userEvent.click(screen.getByText("Report"));
    expect(onViewReport).toHaveBeenCalledWith("s-done");
  });
});
