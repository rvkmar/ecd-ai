import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ZipBundlePanel, { ZipExportButton } from "../ZipBundlePanel";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ auth: { token: "token-1", role: "admin", username: "admin1" } }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const previewBody = {
  dryRun: true,
  keepOriginalIds: false,
  skipped: [{ file: "by-entity-final/README-by-entity.txt", reason: "Not a JSON entity file." }],
  order: ["policies"],
  entities: {
    policies: {
      file: "policies.json",
      created: 1,
      failed: 1,
      results: [
        { index: 0, ok: true, name: "Fixed form", sourceId: "p-fixed", id: "p-new", idKept: false, warnings: [] },
        { index: 1, ok: false, name: "Broken", error: "name and type are required", details: [] },
      ],
    },
  },
  totals: { created: 1, failed: 1, fileErrors: 0 },
};

describe("ZipBundlePanel", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews a zip, then imports it, and leaves single-entity copy in place", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url, options = {}) => {
      const dryRun = String(url).includes("dryRun=1");
      return {
        ok: true,
        json: async () => ({ ...previewBody, dryRun }),
        text: async () => "",
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <div>
        <ZipBundlePanel />
        <p>Or upload one entity type at a time</p>
      </div>
    );

    expect(screen.getByText(/All entities in one zip/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    const file = new File([new Uint8Array([1, 2, 3])], "entities.zip", {
      type: "application/zip",
    });
    await user.upload(screen.getByLabelText("ECD entity zip"), file);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByTestId("zip-report")).toHaveTextContent("1 created, 1 failed");
    expect(screen.getByText(/README-by-entity.txt/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been written yet/)).toBeInTheDocument();
    expect(screen.getByText(/name and type are required/)).toBeInTheDocument();

    const previewCall = fetchMock.mock.calls[0];
    expect(previewCall[0]).toContain("dryRun=1");
    expect(previewCall[0]).toContain("keepOriginalIds=0");
    expect(previewCall[1].method).toBe("POST");
    expect(previewCall[1].headers["Content-Type"]).toBe("application/zip");
    expect(previewCall[1].headers.Authorization).toBe("Bearer token-1");

    await user.click(screen.getByRole("checkbox"));
    expect(screen.queryByTestId("zip-report")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTestId("zip-report");
    expect(fetchMock.mock.calls.at(-1)[0]).toContain("keepOriginalIds=1");

    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Import finished.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)[0]).toContain("dryRun=0");
    expect(screen.getByText("Or upload one entity type at a time")).toBeInTheDocument();
  });

  it("requests the export zip", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["zip"]),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<ZipExportButton />);
    await user.click(screen.getByRole("button", { name: "Export all as zip" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/data/zip", {
      headers: { Authorization: "Bearer token-1" },
    });
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
