// src/pages/settings/TenancySettings.jsx
// D100: tenant directory + scope inspector ("what can this user see?").

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import { useUsers } from "@/api/queries/users";
import Spinner from "@/components/ui/Spinner";

function useTenantDirectory(auth) {
  return useQuery({
    queryKey: ["tenancy", "directory"],
    queryFn: () => apiFetch("/api/tenancy/directory", {}, auth),
    enabled: !!auth?.token,
  });
}

function useScopeInspect(auth, username) {
  return useQuery({
    queryKey: ["tenancy", "inspect", username],
    queryFn: () =>
      apiFetch(`/api/tenancy/inspect/${encodeURIComponent(username)}`, {}, auth),
    enabled: !!auth?.token && !!username,
  });
}

export default function TenancySettings() {
  const { auth } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const directory = useTenantDirectory(auth);
  const [selected, setSelected] = useState("");
  const inspection = useScopeInspect(auth, selected);

  const nonAdminUsers = useMemo(
    () => (users || []).filter((u) => u.role !== "admin"),
    [users]
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Tenancy</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Assign users to districts and schools under Settings → Users
          (<code className="text-xs">profile.districtId</code> /{" "}
          <code className="text-xs">schoolId</code>). After changing tenancy
          claims, the user must sign in again so the JWT carries the new
          scope. The inspector below answers what a chosen user can read —
          using the same server filters as live API requests.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Observed districts &amp; schools
        </h3>
        {directory.isLoading ? (
          <Spinner />
        ) : directory.isError ? (
          <p className="text-sm text-destructive">
            {apiErrorMessage(directory.error, "Could not load directory")}
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">District</th>
                  <th className="px-3 py-2 font-medium">Schools</th>
                </tr>
              </thead>
              <tbody>
                {(directory.data?.districts || []).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-muted-foreground">
                      No district ids on users or students yet.
                    </td>
                  </tr>
                ) : (
                  directory.data.districts.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{d.id}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {(d.schoolIds || []).join(", ") || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Scope inspector
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">User</span>
            <select
              className="block min-w-[16rem] rounded-md border border-input bg-background px-3 py-2"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={usersLoading}
            >
              <option value="">Select a user…</option>
              {nonAdminUsers.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.username} ({u.role}
                  {u.profile?.districtId
                    ? ` · ${u.profile.districtId}`
                    : ""}
                  )
                </option>
              ))}
            </select>
          </label>
        </div>

        {!selected ? (
          <p className="text-sm text-muted-foreground">
            Pick a user to see readable row counts per tenant-scoped collection.
          </p>
        ) : inspection.isLoading ? (
          <Spinner />
        ) : inspection.isError ? (
          <p className="text-sm text-destructive">
            {apiErrorMessage(inspection.error, "Inspect failed")}
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{inspection.data.subject.role}</dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">viewScope</dt>
                <dd className="font-medium">
                  {inspection.data.subject.viewScope ?? "null (admin)"}
                </dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">districtId</dt>
                <dd className="font-mono text-xs">
                  {inspection.data.subject.districtId || "—"}
                </dd>
              </div>
              <div className="rounded-md border border-border p-3">
                <dt className="text-muted-foreground">schoolId</dt>
                <dd className="font-mono text-xs">
                  {inspection.data.subject.schoolId || "—"}
                </dd>
              </div>
            </dl>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Collection</th>
                    <th className="px-3 py-2 font-medium">Visible</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Sample ids</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(inspection.data.collections || {}).map(
                    ([name, row]) => (
                      <tr key={name} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono text-xs">{name}</td>
                        <td className="px-3 py-2">
                          {row.error ? (
                            <span className="text-destructive text-xs">
                              {row.error}
                            </span>
                          ) : (
                            row.visibleCount
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.totalCount}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs break-all">
                          {(row.visibleIds || []).slice(0, 8).join(", ") || "—"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              {inspection.data.bank?.note} Global exposure metrics visible to
              this role:{" "}
              {inspection.data.bank?.exposureVisibleToRole ? "yes" : "no"}.
              Aggregate small-cell threshold: n ≥ {inspection.data.minCellSize}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
