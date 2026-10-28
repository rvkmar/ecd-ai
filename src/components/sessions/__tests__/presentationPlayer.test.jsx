// R3: the student player follows the presentation model's layout, review,
// feedback, and extra-time factor. No overlay keeps the previous player.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(() => {}, { success: () => {}, error: () => {} }),
}));

vi.mock("../../../api/queries/policies", () => ({
  usePolicies: () => ({ data: [], isLoading: false }),
}));

import ItemResponseFeedback from "../ItemResponseFeedback.jsx";
import PresentationItemFrame from "../PresentationItemFrame.jsx";
import SessionPlayer from "../SessionPlayer.jsx";
import StudentSessionWizard, { WIZARD_PHASE } from "../StudentSessionWizard.jsx";
import {
  orderTaskIds,
  presentationPlayerPolicy,
} from "../presentationPlayer.js";

function overlay(overrides = {}) {
  return {
    presentationModelId: "pm-r3",
    name: "R3 delivery",
    status: "operational",
    taskModelId: "tm1",
    taskModelVersion: 1,
    layout: {
      itemOrder: "authored",
      grouping: "single_item",
      navigation: "free",
    },
    conditionalDisplay: {
      showFeedback: "none",
      allowSkip: true,
      allowReview: true,
      showProgress: true,
    },
    accessibility: { profile: "default", fontScale: 1, timeMultiplier: 1 },
    ...overrides,
    layout: { ...{ itemOrder: "authored", grouping: "single_item", navigation: "free" }, ...(overrides.layout || {}) },
    conditionalDisplay: {
      showFeedback: "none",
      allowSkip: true,
      allowReview: true,
      showProgress: true,
      ...(overrides.conditionalDisplay || {}),
    },
    accessibility: {
      profile: "default",
      fontScale: 1,
      timeMultiplier: 1,
      ...(overrides.accessibility || {}),
    },
  };
}

function wizardFromPolicy(policy, props = {}) {
  return (
    <StudentSessionWizard
      sessionId="s-r3"
      phase={WIZARD_PHASE.DRAFT}
      taskIds={props.taskIds || ["t1", "t2", "t3"]}
      currentTaskId={props.currentTaskId || "t1"}
      answeredIds={props.answeredIds || new Set()}
      canEnterReview={props.canEnterReview || false}
      navigation={policy.navigation}
      allowItemNavigation={policy.allowItemNavigation}
      showReviewScreen={policy.showReviewScreen}
      grouping={policy.grouping}
      {...props}
    />
  );
}

describe("layout", () => {
  afterEach(() => cleanup());

  it("keeps authored order and shuffles when item order is random", () => {
    const ids = ["t1", "t2", "t3"];
    expect(orderTaskIds(ids, "authored", "s-order")).toEqual(ids);
    const shuffled = orderTaskIds(ids, "random", "s-order");
    expect(shuffled).toHaveLength(3);
    expect([...shuffled].sort()).toEqual([...ids].sort());
    expect(shuffled).not.toEqual(ids);
    expect(orderTaskIds(ids, "random", "s-order")).toEqual(shuffled);

    const policy = presentationPlayerPolicy(
      overlay({ layout: { itemOrder: "random" } }),
      null
    );
    render(
      wizardFromPolicy(policy, {
        taskIds: orderTaskIds(ids, policy.itemOrder, "s-order"),
      })
    );
    const buttons = screen.getAllByTestId(/^question-nav-/);
    expect(buttons.map((button) => button.getAttribute("data-testid"))).toEqual(
      shuffled.map((id) => `question-nav-${id}`)
    );
  });

  it("shows a section heading for section grouping and hides it for one item at a time", () => {
    const section = presentationPlayerPolicy(
      overlay({ layout: { grouping: "section" } }),
      null
    );
    const { rerender } = render(wizardFromPolicy(section));
    expect(screen.getByTestId("presentation-section")).toHaveTextContent("Section");

    rerender(
      wizardFromPolicy(
        presentationPlayerPolicy(overlay({ layout: { grouping: "single_item" } }), null)
      )
    );
    expect(screen.queryByTestId("presentation-section")).toBeNull();
  });

  it("pins a shared stimulus only for shared_stimulus grouping", () => {
    const { rerender } = render(
      <PresentationItemFrame grouping="shared_stimulus" sharedText="Passage stays up">
        <p>Item stem</p>
      </PresentationItemFrame>
    );
    expect(screen.getByTestId("presentation-shared-stimulus")).toHaveTextContent(
      "Passage stays up"
    );
    expect(screen.getByText("Item stem")).toBeInTheDocument();

    rerender(
      <PresentationItemFrame grouping="single_item" sharedText="Passage stays up">
        <p>Item stem</p>
      </PresentationItemFrame>
    );
    expect(screen.queryByTestId("presentation-shared-stimulus")).toBeNull();
    expect(screen.getByText("Item stem")).toBeInTheDocument();

    rerender(
      <PresentationItemFrame grouping="section" sharedText="Passage stays up">
        <p>Item stem</p>
      </PresentationItemFrame>
    );
    expect(screen.queryByTestId("presentation-shared-stimulus")).toBeNull();
  });

  it("blocks every item except the current one when navigation is linear", () => {
    const policy = presentationPlayerPolicy(
      overlay({ layout: { navigation: "linear" }, conditionalDisplay: { allowReview: true } }),
      null
    );
    render(wizardFromPolicy(policy));
    expect(screen.getByTestId("question-nav-t1")).toBeEnabled();
    expect(screen.getByTestId("question-nav-t2")).toBeDisabled();
    expect(screen.getByTestId("question-nav-t3")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Enter review" })).toBeNull();
    expect(screen.getByTestId("session-submit-without-review")).toBeDisabled();
  });
});

describe("review", () => {
  afterEach(() => cleanup());

  it("opens the review screen and locks earlier items until that screen when navigation is reviewable", async () => {
    const user = userEvent.setup();
    const onEnterReview = vi.fn();
    const policy = presentationPlayerPolicy(
      overlay({ layout: { navigation: "reviewable" }, conditionalDisplay: { allowReview: true } }),
      null
    );
    const { rerender } = render(
      wizardFromPolicy(policy, {
        canEnterReview: true,
        answeredIds: new Set(["t1"]),
        onEnterReview,
      })
    );
    expect(screen.getByTestId("question-nav-t2")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Enter review" }));
    expect(onEnterReview).toHaveBeenCalled();

    rerender(
      wizardFromPolicy(policy, {
        phase: WIZARD_PHASE.REVIEW,
        canEnterReview: true,
        answeredIds: new Set(["t1"]),
        currentTaskId: "t1",
      })
    );
    expect(screen.getByTestId("question-nav-t1")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Keep reviewing" })).toBeInTheDocument();
  });

  it("lets the examinee open any item when navigation is free and review is allowed", async () => {
    const user = userEvent.setup();
    const onSelectTask = vi.fn();
    const policy = presentationPlayerPolicy(
      overlay({ layout: { navigation: "free" }, conditionalDisplay: { allowReview: true } }),
      null
    );
    render(wizardFromPolicy(policy, { onSelectTask }));
    expect(screen.getByTestId("question-nav-t2")).toBeEnabled();
    await user.click(screen.getByTestId("question-nav-t2"));
    expect(onSelectTask).toHaveBeenCalledWith("t2");
    expect(screen.getByRole("button", { name: "Enter review" })).toBeInTheDocument();
  });

  it("closes back navigation and the review screen when allowReview is false", () => {
    const policy = presentationPlayerPolicy(
      overlay({
        layout: { navigation: "free" },
        conditionalDisplay: { allowReview: false },
      }),
      null
    );
    render(wizardFromPolicy(policy, { canEnterReview: true, answeredIds: new Set(["t1"]) }));
    expect(screen.getByTestId("question-nav-t2")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Enter review" })).toBeNull();
    expect(screen.getByTestId("session-submit-without-review")).toBeEnabled();
  });

  it("keeps today's review controls when no presentation model is attached", () => {
    const policy = presentationPlayerPolicy(null, null);
    render(
      <StudentSessionWizard
        sessionId="s-r3"
        phase={WIZARD_PHASE.DRAFT}
        taskIds={["t1", "t2"]}
        currentTaskId="t1"
        answeredIds={new Set()}
        navigation={policy.navigation}
        allowItemNavigation={policy.allowItemNavigation}
        showReviewScreen={policy.showReviewScreen}
        grouping={policy.grouping}
      />
    );
    expect(screen.getByTestId("question-nav-t2")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enter review" })).toBeInTheDocument();
    expect(screen.queryByTestId("presentation-section")).toBeNull();
    expect(screen.queryByTestId("session-submit-without-review")).toBeNull();
  });

  it("lets a server review denial close review the presentation model would show", () => {
    const policy = presentationPlayerPolicy(
      overlay({ layout: { navigation: "free" }, conditionalDisplay: { allowReview: true } }),
      { administration: { allowedReview: false } }
    );
    render(wizardFromPolicy(policy));
    expect(policy.serverReviewDenied).toBe(true);
    expect(screen.getByTestId("question-nav-t2")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Enter review" })).toBeNull();
  });
});

describe("feedback", () => {
  afterEach(() => cleanup());

  const response = {
    taskId: "t1",
    rationale: "Check the denominator.",
    rawAnswer: "b",
  };

  it("shows immediate feedback from the server response and hides it for none", () => {
    const { rerender } = render(
      <ItemResponseFeedback response={response} timing="immediate" phase="draft" />
    );
    expect(screen.getByTestId("item-response-feedback")).toHaveTextContent(
      "Check the denominator."
    );
    expect(screen.queryByText("Correct")).toBeNull();

    rerender(<ItemResponseFeedback response={response} timing="none" phase="draft" />);
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();
  });

  it("holds end-of-session feedback until review", () => {
    const { rerender } = render(
      <ItemResponseFeedback response={response} timing="delayed_end" phase="draft" />
    );
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();
    rerender(
      <ItemResponseFeedback response={response} timing="delayed_end" phase="review" />
    );
    expect(screen.getByTestId("item-response-feedback")).toHaveTextContent(
      "Check the denominator."
    );
  });

  it("renders nothing when the response has no server feedback fields", () => {
    render(
      <ItemResponseFeedback
        response={{ taskId: "t1", rawAnswer: "b" }}
        timing="immediate"
        phase="draft"
      />
    );
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();
  });

  it("uses the stricter of presentation feedback and the server feedback mode", () => {
    const hidden = presentationPlayerPolicy(
      overlay({ conditionalDisplay: { showFeedback: "immediate" } }),
      { administration: { feedbackMode: "none" } }
    );
    const { rerender } = render(
      <ItemResponseFeedback response={response} timing={hidden.feedbackTiming} phase="draft" />
    );
    expect(hidden.feedbackTiming).toBe("none");
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();

    const presentationHides = presentationPlayerPolicy(
      overlay({ conditionalDisplay: { showFeedback: "none" } }),
      { administration: { feedbackMode: "immediate" } }
    );
    rerender(
      <ItemResponseFeedback
        response={response}
        timing={presentationHides.feedbackTiming}
        phase="draft"
      />
    );
    expect(presentationHides.feedbackTiming).toBe("none");
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();
  });
});

function installPlayerFetch({ session, next, task, taskModel }) {
  global.fetch = vi.fn((url) => {
    const href = String(url);
    let body = [];
    if (href.includes("/wizard-timing")) body = session;
    else if (href.includes("/next-task")) body = next;
    else if (href.includes("/api/taskModels/")) body = taskModel || { id: "tm1" };
    else if (href.includes("/api/tasks/")) body = task || { id: "t1" };
    else if (href.includes("/api/sessions/")) body = session;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

function renderPlayer(sessionId = "s-play") {
  return render(
    <MemoryRouter>
      <SessionPlayer sessionId={sessionId} />
    </MemoryRouter>
  );
}

describe("SessionPlayer presentation settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it("shows the server deadline and the extra-time factor without scaling the clock", async () => {
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    installPlayerFetch({
      session: {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [],
        studentId: "stud1",
        endTime: end,
      },
      next: {
        taskId: "t1",
        presentation: overlay({
          accessibility: { timeMultiplier: 2 },
          timeMultiplier: 2,
        }),
      },
      task: { id: "t1" },
    });
    renderPlayer();
    await waitFor(() => {
      expect(screen.getByTestId("session-time-remaining")).toHaveAttribute(
        "data-presentation-time-multiplier",
        "2"
      );
    });
    const banner = screen.getByTestId("session-time-remaining");
    expect(banner).toHaveTextContent(/2h|1h 59m/);
    expect(banner).not.toHaveTextContent(/4h/);
    expect(banner).not.toHaveTextContent(/3h/);
    expect(screen.getByTestId("session-extra-time")).toHaveTextContent("Extra time: 2×");
  });

  it("leaves the clock unlabeled when the multiplier is 1", async () => {
    installPlayerFetch({
      session: {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [],
        studentId: "stud1",
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      next: { taskId: "t1", presentation: overlay() },
      task: { id: "t1" },
    });
    renderPlayer();
    const banner = await screen.findByTestId("session-time-remaining");
    expect(banner).toHaveTextContent(/2h|1h 59m/);
    expect(screen.queryByTestId("session-extra-time")).toBeNull();
  });

  it("renders section order from the live overlay and keeps a linear rail", async () => {
    const ids = ["t1", "t2", "t3"];
    const shuffled = orderTaskIds(ids, "random", "s-order");
    expect(shuffled).not.toEqual(ids);
    installPlayerFetch({
      session: {
        id: "s-order",
        status: "in_progress",
        taskIds: ids,
        responses: [],
        studentId: "stud1",
      },
      next: {
        taskId: shuffled[0],
        presentation: overlay({
          layout: { itemOrder: "random", grouping: "section", navigation: "linear" },
        }),
      },
      task: { id: shuffled[0] },
    });
    renderPlayer("s-order");
    expect(await screen.findByTestId("presentation-section")).toBeInTheDocument();
    const nav = screen.getAllByTestId(/^question-nav-/);
    expect(nav.map((button) => button.getAttribute("data-testid"))).toEqual(
      shuffled.map((id) => `question-nav-${id}`)
    );
    const current = screen.getByTestId(`question-nav-${shuffled[0]}`);
    expect(current).toBeEnabled();
    const others = shuffled.slice(1).map((id) => screen.getByTestId(`question-nav-${id}`));
    others.forEach((button) => expect(button).toBeDisabled());
    expect(screen.queryByRole("button", { name: "Enter review" })).toBeNull();
    expect(screen.getByTestId("student-session-player")).toHaveAttribute(
      "data-presentation-grouping",
      "section"
    );
  });

  it("shows immediate rationale and withholds it when the server feedback mode is none", async () => {
    installPlayerFetch({
      session: {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [{ taskId: "t1", rationale: "Check the denominator.", rawAnswer: "b" }],
        studentId: "stud1",
      },
      next: {
        taskId: "t1",
        presentation: overlay({ conditionalDisplay: { showFeedback: "immediate" } }),
      },
      task: { id: "t1" },
    });
    renderPlayer();
    expect(await screen.findByTestId("item-response-feedback")).toHaveTextContent(
      "Check the denominator."
    );
    expect(screen.queryByText("Correct")).toBeNull();

    cleanup();
    installPlayerFetch({
      session: {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [{ taskId: "t1", rationale: "Check the denominator.", rawAnswer: "b" }],
        studentId: "stud1",
        administration: { feedbackMode: "none", allowedReview: true },
      },
      next: {
        taskId: "t1",
        presentation: overlay({ conditionalDisplay: { showFeedback: "immediate" } }),
      },
      task: { id: "t1" },
    });
    renderPlayer();
    await screen.findByText("No linked item for this activity.");
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();
  });

  it("shows delayed feedback on the review screen and a shared stimulus when grouping asks for it", async () => {
    const user = userEvent.setup();
    installPlayerFetch({
      session: {
        id: "s-play",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [{ taskId: "t1", rationale: "Shown at the end.", rawAnswer: "a" }],
        studentId: "stud1",
      },
      next: {
        taskId: "t1",
        presentation: overlay({
          layout: { grouping: "shared_stimulus", navigation: "reviewable" },
          conditionalDisplay: { showFeedback: "delayed_end", allowReview: true },
        }),
      },
      task: { id: "t1", taskModelId: "tm1" },
      taskModel: { id: "tm1", description: "Passage stays up", subTaskIds: ["child"] },
    });
    renderPlayer();
    expect(await screen.findByTestId("presentation-shared-stimulus")).toHaveTextContent(
      "Passage stays up"
    );
    expect(screen.queryByTestId("item-response-feedback")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Enter review" }));
    expect(await screen.findByTestId("item-response-feedback")).toHaveTextContent(
      "Shown at the end."
    );
    const player = screen.getByTestId("student-session-player");
    expect(within(player).getByTestId("presentation-shared-stimulus")).toBeInTheDocument();
  });
});
