// src/pages/settings/AuditLogViewer.jsx
// D105: query auditLog by entity, actor, action, date range.
// W21 gate: one query answers who promoted a Task Model to operational.

import { useMemo, useState } from "react";
import { useAuditLog } from "@/api/queries/auditLog";
import Spinner from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  "",
  "lifecycle.transition",
  "lifecycle.reconstructed",
  "entity.create",
  "auth.failure",
  "user.change",
  "calibration.ingest",
  "parameterSet.replace",
];

const COLLECTIONS = [
  "",
  "taskModels",
  "evidenceModels",
  "competencyModels",
  "items",
  "users",
  "calibrationJobs",
];

function formatDetail(detail) {
  if (!detail || typeof detail !== "object") return "—";
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export default function AuditLogViewer() {
  const [draft, setDraft] = useState({
    entityCollection: "taskModels",
    entityId: "",
    action: "lifecycle.transition",
    toStatus: "operational",
    actor: "",
    from: "",
    to: "",
  });
  const [filters, setFilters] = useState(draft);

  const query = useAuditLog(
    Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v != null && String(v).trim() !== "")
    )
  );

  const rows = useMemo(() => query.data || [], [query.data]);

  const promotionAnswer = useMemo(() => {
    if (
      filters.entityCollection !== "taskModels" ||
      !filters.entityId ||
      filters.action !== "lifecycle.transition" ||
      filters.toStatus !== "operational"
    ) {
      return null;
    }
    const hit = rows.find((r) => r.detail?.to === "operational");
    if (!hit) return { found: false };
    return {
      found: true,
      who: hit.actor?.userId || "(unknown)",
      role: hit.actor?.role || null,
      when: hit.at,
      evidence: hit.detail,
      requestId: hit.requestId,
    };
  }, [filters, rows]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Audit log</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Append-only accountability trail. Admin-only and deliberately
          cross-tenant — who promoted a model is not scoped to one district.
          Pre-filled filters answer the W21 gate: who promoted this Task Model
          to operational, when, and on what evidence — in one query.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft });
        }}
      >
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Collection</span>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.entityCollection}
            onChange={(e) =>
              setDraft((d) => ({ ...d, entityCollection: e.target.value }))
            }
          >
            {COLLECTIONS.map((c) => (
              <option key={c || "any"} value={c}>
                {c || "(any)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Entity id</span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.entityId}
            onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
            placeholder="tm_…"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Action</span>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          >
            {ACTIONS.map((a) => (
              <option key={a || "any"} value={a}>
                {a || "(any)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">To status</span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.toStatus}
            onChange={(e) => setDraft((d) => ({ ...d, toStatus: e.target.value }))}
            placeholder="operational"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Actor user id</span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.actor}
            onChange={(e) => setDraft((d) => ({ ...d, actor: e.target.value }))}
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">From (ISO)</span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">To (ISO)</span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit">Run query</Button>
        </div>
      </form>

      {promotionAnswer && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            promotionAnswer.found
              ? "border-border bg-muted/30"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {promotionAnswer.found ? (
            <>
              <div className="font-medium">Promotion answer (this query)</div>
              <p className="mt-1">
                <span className="font-medium">{promotionAnswer.who}</span>
                {promotionAnswer.role ? ` (${promotionAnswer.role})` : ""} promoted
                this Task Model to operational at{" "}
                <span className="font-mono text-xs">{promotionAnswer.when}</span>.
              </p>
              <p className="mt-1 font-mono text-xs break-all">
                evidence: {formatDetail(promotionAnswer.evidence)}
              </p>
            </>
          ) : (
            <p>No operational promotion found for that Task Model id in this query.</p>
          )}
        </div>
      )}

      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <p className="text-sm text-destructive">Could not load audit log.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">At</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                    No rows match.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {r.at}
                    </td>
                    <td className="px-3 py-2">
                      {r.actor?.userId || "—"}
                      {r.actor?.role ? (
                        <span className="text-muted-foreground"> · {r.actor.role}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.entity?.collection}/{r.entity?.id}
                      {r.entity?.version != null ? ` v${r.entity.version}` : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs break-all max-w-md">
                      {formatDetail(r.detail)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
