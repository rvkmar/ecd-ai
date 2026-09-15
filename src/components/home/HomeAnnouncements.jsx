// Home → Announcements: feed for every role; create/delete for admin/district.
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";
import {
  ALL_ROLES,
  canCreateAnnouncement,
  canDeleteAnnouncement,
} from "@/utils/announcements";

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function audienceLabel(ann) {
  if (ann.visibility === "public") return "Public (all roles)";
  const roles = ann.audienceRoles || [];
  if (!roles.length) return "Restricted";
  return roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ");
}

export default function HomeAnnouncements() {
  const { auth } = useAuth() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [audienceRoles, setAudienceRoles] = useState(["district", "teacher", "student"]);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const canCreate = canCreateAnnouncement(auth?.role);
  const isAdmin = auth?.role === "admin";

  const resetForm = () => {
    setTitle("");
    setBody("");
    setVisibility("public");
    setAudienceRoles(["district", "teacher", "student"]);
  };

  const closeForm = () => {
    resetForm();
    setFormOpen(false);
  };

  const load = useCallback(() => {
    if (!auth) return;
    setLoading(true);
    apiFetch("/api/announcements", {}, auth)
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        setError(apiErrorMessage(err, "Failed to load announcements"));
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [auth]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAudience = (role) => {
    setAudienceRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    try {
      const payload =
        auth.role === "admin"
          ? {
              title,
              body,
              visibility,
              audienceRoles: visibility === "public" ? ALL_ROLES : audienceRoles,
            }
          : { title, body };
      await apiFetch(
        "/api/announcements",
        { method: "POST", body: JSON.stringify(payload) },
        auth
      );
      closeForm();
      load();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to post announcement"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/api/announcements/${id}`, { method: "DELETE" }, auth);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to delete announcement"));
    }
  };

  return (
    <div className="space-y-6" data-testid="home-announcements">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Home</h2>
          <p className="mt-1 text-sm text-slate-600">
            Announcements from administrators
            {auth?.role !== "admin" ? " and your district" : ""}.
          </p>
        </div>
        {canCreate && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            New Announcement
          </button>
        )}
      </div>

      {canCreate && formOpen && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">New announcement</h3>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Message"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          {isAdmin ? (
            <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="vis"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                Public — visible to all roles
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="vis"
                  checked={visibility === "roles"}
                  onChange={() => setVisibility("roles")}
                />
                Restricted — select roles
              </label>
              {visibility === "roles" && (
                <div className="ml-6 flex flex-wrap gap-3 pt-1">
                  {ALL_ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-1.5 text-sm capitalize">
                      <input
                        type="checkbox"
                        checked={audienceRoles.includes(role)}
                        onChange={() => toggleAudience(role)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              District announcements are visible to district, teacher, and student
              roles.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Posting…" : "Post announcement"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-600">Loading announcements…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No announcements yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((ann) => (
            <li
              key={ann.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">{ann.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{ann.body}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {ann.createdBy || "Unknown"} · {ann.authorRole} ·{" "}
                    {formatWhen(ann.createdAt)} · {audienceLabel(ann)}
                  </p>
                </div>
                {canDeleteAnnouncement(ann, auth) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(ann.id)}
                    className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
