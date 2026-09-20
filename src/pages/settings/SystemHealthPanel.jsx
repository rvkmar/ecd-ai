// src/pages/settings/SystemHealthPanel.jsx
// D105: reads D104 metrics via /api/ops/health-summary and shows the four alerts.

import { useOpsHealthSummary } from "@/api/queries/ops";
import Spinner from "@/components/ui/Spinner";
import { apiErrorMessage } from "@/api/apiClient";

function Stat({ label, children }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{children}</div>
    </div>
  );
}

function formatAge(ms) {
  if (ms == null) return "—";
  const h = ms / (60 * 60 * 1000);
  if (h < 1) return `${Math.round(ms / 60000)} min`;
  return `${h.toFixed(1)} h`;
}

export default function SystemHealthPanel() {
  const q = useOpsHealthSummary();

  if (q.isLoading) return <Spinner />;
  if (q.isError) {
    return (
      <p className="text-sm text-destructive">
        {apiErrorMessage(q.error, "Could not load system health")}
      </p>
    );
  }

  const d = q.data;
  const alerts = d?.alerts?.alerts || [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">System health</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Process and database health stay green when R is down; calibration
          readiness does not. Alerts fire on four signals only.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Health">
          {d.health?.ok ? "ok" : "degraded"}
          {d.health?.servingSessions ? " · sessions serving" : ""}
        </Stat>
        <Stat label="Calibration readiness">
          {d.readiness?.ok ? "ready" : `not ready (${d.readiness?.reason || "—"})`}
        </Stat>
        <Stat label="R backend">
          {d.r?.reachable ? "reachable" : "unreachable"} · {d.r?.url || "—"}
        </Stat>
        <Stat label="Queue">
          queued {d.queue?.queued ?? "—"} / running {d.queue?.running ?? "—"}
          {d.queue?.depthAlarm ? " · DEPTH ALARM" : ""}
        </Stat>
        <Stat label="Last migration">
          {d.migrations?.latestId || "(none)"}
          <div className="text-xs font-normal text-muted-foreground">
            {d.migrations?.latestAppliedAt || ""}
          </div>
        </Stat>
        <Stat label="Last backup age">{formatAge(d.backup?.ageMs)}</Stat>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          The four alerts
        </h3>
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-lg border px-3 py-2 text-sm flex flex-wrap gap-2 justify-between ${
                a.firing
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-border bg-card"
              }`}
            >
              <span className="font-medium">
                {a.firing ? "FIRING · " : "ok · "}
                {a.label}
              </span>
              <span className="font-mono text-xs">
                value={String(a.value)} threshold={String(a.threshold)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Firing count: {d.alerts?.firingCount ?? 0} / {alerts.length}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Audit tenancy
        </h3>
        <p className="text-sm text-muted-foreground max-w-3xl">
          {d.auditLogTenancy?.access ||
            "Admin-only; auditLog is not tenant-scoped."}
          {d.auditLogTenancy?.tenantScoped === false
            ? " (tenantScoped=false — confirmed)"
            : null}
        </p>
      </section>
    </div>
  );
}
