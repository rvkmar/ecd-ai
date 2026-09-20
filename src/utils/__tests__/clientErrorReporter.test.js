// src/utils/__tests__/clientErrorReporter.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/apiClient", () => ({
  apiFetch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/config/release", () => ({
  appRelease: () => "1.0.0-test",
}));

import { apiFetch } from "@/api/apiClient";
import { reportClientError } from "../clientErrorReporter.js";

describe("clientErrorReporter", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
  });

  it("posts release-tagged error details through apiFetch", async () => {
    await reportClientError(new TypeError("boom"), {
      label: "EvidenceWizard",
      componentStack: "\n    in Step",
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({
        method: "POST",
      })
    );
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1].body);
    expect(body.release).toBe("1.0.0-test");
    expect(body.errorName).toBe("TypeError");
    expect(body.message).toBe("boom");
    expect(body.label).toBe("EvidenceWizard");
    expect(body.stack).toContain("in Step");
  });
});
