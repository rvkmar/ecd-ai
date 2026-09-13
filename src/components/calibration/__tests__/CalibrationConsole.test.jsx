// D65: administrator start → process → watch → ingest, plus the
// non-converged ingest refusal. District is read-only.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";

import CalibrationConsole from "../CalibrationConsole";

const fx = vi.hoisted(() => {
  let jobs = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  return {
    evidenceModels: [
      {
        id: "em1",
        name: "LSAT evidence",
        statisticalModels: [
          { id: "sm1", type: "irt", subtype: "2PL", active: true, parameterSets: [] },
        ],
      },
    ],
    enqueuePayloads: [],
    processIds: [],
    ingestIds: [],
    ingestRefuse: false,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getJobs: () => jobs,
    setJobs: (next) => {
      jobs = next;
      emit();
    },
    addJob: (job) => {
      jobs = [...jobs, job];
      emit();
      return job;
    },
    updateJob: (id, patch) => {
      jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
      emit();
      return jobs.find((j) => j.id === id);
    },
    reset() {
      jobs = [];
      this.enqueuePayloads = [];
      this.processIds = [];
      this.ingestIds = [];
      this.ingestRefuse = false;
      emit();
    },
  };
});

function queuedJob(overrides = {}) {
  return {
    id: "job-lsat7",
    kind: "irt-parameters",
    status: "queued",
    evidenceModelId: "em1",
    statisticalModelId: "sm1",
    requestedBy: "admin1",
    requestedAt: "2026-09-13T12:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    attempts: 1,
    maxAttempts: 3,
    ingestedParameterSetId: null,
    request: {
      contractVersion: "1.0",
      jobId: "job-lsat7",
      model: { family: "irt", subtype: "2PL", itemIds: ["Item.1", "Item.2", "Item.3", "Item.4", "Item.5"] },
      responseMatrix: { personIds: Array.from({ length: 8 }, (_, i) => `p${i}`), itemIds: ["Item.1"] },
      options: { seed: 20261120 },
    },
    response: null,
    error: null,
    ...overrides,
  };
}

function succeededResponse({ converged = true } = {}) {
  return {
    contractVersion: "1.0",
    jobId: "job-lsat7",
    converged,
    packageVersion: converged ? "contract-stub (not mirt)" : "mirt 1.47",
    sampleSize: 1000,
    calibratedAt: "2026-09-13T12:01:00.000Z",
    parameters: converged
      ? { "Item.1": { a: 1.1, b: -0.4 }, "Item.5": { a: 0.9, b: -1.2 } }
      : undefined,
    standardErrors: converged ? { "Item.1": { a: 0.05, b: 0.04 } } : undefined,
    fitStatistics: converged ? { logLik: -12.3 } : undefined,
    error: converged ? null : { message: "did not converge", rClass: "NotConverged", stderr: "EM stall" },
  };
}

vi.mock("@/api/queries/evidenceModels", () => ({
  useEvidenceModels: () => ({ data: fx.evidenceModels, isLoading: false }),
  evidenceModelsKey: ["evidenceModels"],
}));

vi.mock("@/api/queries/calibrationJobs", () => ({
  useCalibrationJobs: () => {
    const jobs = useSyncExternalStore(fx.subscribe, fx.getJobs);
    return { data: jobs, isLoading: false };
  },
  useCalibrationJob: (id) => {
    const jobs = useSyncExternalStore(fx.subscribe, fx.getJobs);
    return { data: jobs.find((j) => j.id === id) || null, isLoading: false };
  },
  useEnqueueCalibrationJob: () => ({
    isPending: false,
    mutateAsync: async (payload) => {
      fx.enqueuePayloads.push(payload);
      return fx.addJob(queuedJob());
    },
  }),
  useCancelCalibrationJob: () => ({
    isPending: false,
    mutateAsync: async (id) => fx.updateJob(id, { status: "cancelled", finishedAt: "2026-09-13T12:00:30.000Z" }),
  }),
  useRetryCalibrationJob: () => ({
    isPending: false,
    mutateAsync: async (id) => fx.updateJob(id, { status: "queued", attempts: 2, error: null }),
  }),
  useProcessCalibrationJob: () => ({
    isPending: false,
    mutateAsync: async (id) => {
      fx.processIds.push(id);
      const current = fx.getJobs().find((j) => j.id === id);
      const converged = current?.response?.converged !== false && !current?._forceNonConverged;
      return fx.updateJob(id, {
        status: "succeeded",
        startedAt: "2026-09-13T12:00:10.000Z",
        finishedAt: "2026-09-13T12:01:00.000Z",
        response: current?.response || succeededResponse({ converged }),
      });
    },
  }),
  useIngestCalibrationJob: () => ({
    isPending: false,
    mutateAsync: async (id) => {
      fx.ingestIds.push(id);
      const job = fx.getJobs().find((j) => j.id === id);
      if (fx.ingestRefuse || job?.response?.converged === false) {
        const err = new Error("409: refused");
        err.status = 409;
        err.body = {
          error:
            "Ingestion refuses converged: false — the job stays inspectable and never becomes a parameter set",
        };
        throw err;
      }
      const updated = fx.updateJob(id, { ingestedParameterSetId: "ps-lsat7" });
      return { job: updated, parameterSet: { parameterSetId: "ps-lsat7" } };
    },
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  fx.reset();
});

describe("admin start → process → watch → ingest", () => {
  it("enqueues LSAT7, processes, shows the response, and ingests a parameter set", async () => {
    const user = userEvent.setup();
    render(<CalibrationConsole />);

    expect(screen.getByText("No calibration jobs yet.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/evidence model/i), "em1");
    await user.selectOptions(screen.getByLabelText(/statistical model/i), "sm1");
    await user.click(screen.getByRole("button", { name: /enqueue lsat7/i }));

    expect(fx.enqueuePayloads).toEqual([
      {
        fixture: "lsat7",
        kind: "irt-parameters",
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
      },
    ]);
    expect(screen.getAllByText("queued").length).toBeGreaterThan(0);
    expect(screen.getByText(/watching queued and running jobs/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /inspect job-lsat7/i })).toBeInTheDocument();
    expect(screen.getByText(/5 × 8/)).toBeInTheDocument();
    expect(screen.getByText("20261120")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^process$/i }));

    expect(fx.processIds).toEqual(["job-lsat7"]);
    expect(screen.getAllByText("succeeded").length).toBeGreaterThan(0);
    expect(screen.queryByText(/watching queued and running jobs/i)).not.toBeInTheDocument();
    expect(screen.getByText("contract-stub (not mirt)")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText(/"Item\.1"/)).toBeInTheDocument();
    expect(screen.getByText(/"logLik"/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^ingest$/i }));

    expect(fx.ingestIds).toEqual(["job-lsat7"]);
    expect(screen.getByRole("status")).toHaveTextContent("Wrote parameter set ps-lsat7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("non-converged ingest refusal", () => {
  it("surfaces the 409 and does not claim a parameter set was written", async () => {
    const user = userEvent.setup();
    fx.setJobs([
      queuedJob({
        status: "succeeded",
        startedAt: "2026-09-13T12:00:10.000Z",
        finishedAt: "2026-09-13T12:01:00.000Z",
        response: succeededResponse({ converged: false }),
      }),
    ]);

    render(<CalibrationConsole />);
    await user.click(screen.getByRole("button", { name: /^inspect$/i }));
    await user.click(screen.getByRole("button", { name: /^ingest$/i }));

    expect(fx.ingestIds).toEqual(["job-lsat7"]);
    expect(screen.getByRole("alert")).toHaveTextContent(/ingestion refuses converged: false/i);
    expect(screen.queryByText(/wrote parameter set/i)).not.toBeInTheDocument();
    expect(fx.getJobs()[0].ingestedParameterSetId).toBeNull();
  });
});

describe("failed job inspect", () => {
  it("shows stderr and offers Retry, not Ingest", async () => {
    const user = userEvent.setup();
    fx.setJobs([
      queuedJob({
        status: "failed",
        finishedAt: "2026-09-13T12:01:00.000Z",
        error: {
          message: "R returned HTTP 500",
          rClass: "HttpError",
          stderr: "object 'TOL' not found",
        },
      }),
    ]);

    render(<CalibrationConsole />);
    await user.click(screen.getByRole("button", { name: /^inspect$/i }));

    expect(screen.getByText(/R returned HTTP 500/)).toBeInTheDocument();
    expect(screen.getByText("object 'TOL' not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ingest$/i })).not.toBeInTheDocument();
  });
});

describe("district read-only", () => {
  it("offers no enqueue or lifecycle writes, but still lists and inspects", async () => {
    const user = userEvent.setup();
    fx.setJobs([queuedJob({ status: "queued" })]);

    render(<CalibrationConsole readOnly />);

    expect(screen.queryByRole("form", { name: /enqueue calibration job/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enqueue lsat7/i })).not.toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^inspect$/i }));
    expect(screen.getByRole("heading", { name: /inspect job-lsat7/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^process$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^retry$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ingest$/i })).not.toBeInTheDocument();
  });
});

describe("admin still has write affordances", () => {
  it("shows enqueue and process on a queued job", () => {
    fx.setJobs([queuedJob()]);
    render(<CalibrationConsole />);
    expect(screen.getByRole("button", { name: /enqueue lsat7/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^process$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });
});
