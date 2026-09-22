// src/components/rating/HumanRatingQueue.jsx
//
// D124: staff queue of work products awaiting human evaluation.
// Blinded — never shows automated provisional results or examinee identity.

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import AdjudicationPanel from "./AdjudicationPanel";

function WorkProductView({ workProduct }) {
  if (!workProduct || typeof workProduct !== "object") {
    return <p className="text-sm text-muted-foreground">No work product recorded.</p>;
  }
  return (
    <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto max-h-48">
      {JSON.stringify(workProduct, null, 2)}
    </pre>
  );
}

function RubricView({ rubric }) {
  if (!rubric) {
    return (
      <p className="text-sm text-muted-foreground">
        No library rubric on this phase — rate activated true/false from the work product.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{rubric.name || rubric.id}</h4>
      {(rubric.dimensions || []).map((d) => (
        <div key={d.id} className="border rounded p-2 space-y-1">
          <div className="text-sm font-medium">{d.name}</div>
          <ul className="text-xs space-y-1">
            {(d.levels || []).map((l) => (
              <li key={String(l.value)}>
                <span className="font-mono">{l.value}</span> — {l.label}
                {l.exemplar ? (
                  <div className="text-muted-foreground pl-4">Exemplar: {l.exemplar}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function HumanRatingQueue() {
  const { auth } = useAuth() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    return apiFetch("/api/sessions/rating-queue", {}, auth)
      .then((body) => {
        setItems(body?.items || []);
        setError(null);
      })
      .catch((err) => {
        setError(apiErrorMessage(err, "Failed to load rating queue"));
      })
      .finally(() => setLoading(false));
  }, [auth]);

  useEffect(() => {
    let cancelled = false;
    reload().finally(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function openItem(row) {
    setActive(row);
    setNotes("");
    setDetail(null);
    try {
      const card = await apiFetch(
        `/api/sessions/${row.sessionId}/rating/${row.responseIndex}`,
        {},
        auth
      );
      // Defence in depth: never trust a leaky payload.
      if (
        card.provisionalActivated != null ||
        card.automatedPhaseResult != null ||
        card.studentId != null ||
        card.studentName != null
      ) {
        toast.error("Rating card leaked automated or identity fields — refused.");
        setActive(null);
        return;
      }
      setDetail(card);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to open rating"));
      setActive(null);
    }
  }

  async function submitRating(activated) {
    if (!active) return;
    setSubmitting(true);
    try {
      await apiFetch(
        `/api/sessions/${active.sessionId}/human-rating`,
        {
          method: "POST",
          body: JSON.stringify({
            responseIndex: active.responseIndex,
            activated,
            rationale: notes.trim() || undefined,
          }),
        },
        auth
      );
      toast.success(activated ? "Rated: activated" : "Rated: not activated");
      setActive(null);
      setDetail(null);
      await reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Rating failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Human rating queue</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Rate pending work products. Automated results and examinee identity are
          withheld until after you rate (measurement blinding).
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading queue…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No work products awaiting rating.</p>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Phase</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={`${row.sessionId}-${row.responseIndex}`}
                  className="border-t"
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.sessionId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.itemId || "—"}</td>
                  <td className="px-3 py-2">{row.evaluationStatus}</td>
                  <td className="px-3 py-2">{row.pendingPhase?.kind || "—"}</td>
                  <td className="px-3 py-2">
                    <Button type="button" size="sm" onClick={() => openItem(row)}>
                      Rate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && active && detail.evaluationStatus === "pending_adjudication" && (
        <AdjudicationPanel
          detail={detail}
          notes={notes}
          onNotesChange={setNotes}
          submitting={submitting}
          onResolve={(activated) => submitRating(activated)}
          onCancel={() => {
            setActive(null);
            setDetail(null);
          }}
        />
      )}

      {detail && active && detail.evaluationStatus === "pending_human" && (
        <div className="border rounded-md p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-medium">Rate work product</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {active.sessionId} · response {active.responseIndex}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setActive(null);
                setDetail(null);
              }}
            >
              Close
            </Button>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1">Work product</h4>
            <WorkProductView workProduct={detail.workProduct} />
          </div>

          <div>
            <h4 className="text-sm font-medium mb-1">Rubric</h4>
            <RubricView rubric={detail.rubric} />
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="rater-notes">
              Rater notes
            </label>
            <textarea
              id="rater-notes"
              className="mt-1 w-full border rounded-md p-2 text-sm min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={submitting}
              onClick={() => submitRating(true)}
            >
              Activated
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => submitRating(false)}
            >
              Not activated
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
