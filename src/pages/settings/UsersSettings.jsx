// src/pages/settings/UsersSettings.jsx
// ------------------------------------------------------------
// Unified user/credential management for Settings > Users.
// Replaces the old TeachersManager.jsx + StudentsManager.jsx split (two
// near-identical components, each hardcoded to one role, with no edit and
// no password-reset capability at all) with a single table covering every
// role, backed by src/api/queries/users.js.
// ------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { Plus, Pencil, KeyRound, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useDeleteUser,
} from "@/api/queries/users";
import { apiErrorMessage } from "@/api/apiClient";
import { generateTempPassword } from "@/utils/generatePassword";

const ROLES = ["admin", "district", "teacher", "student"];

const ROLE_BADGE = {
  admin: "bg-purple-100 text-purple-800",
  district: "bg-blue-100 text-blue-800",
  teacher: "bg-green-100 text-green-800",
  student: "bg-amber-100 text-amber-800",
};

// Profile fields shown per role -- mirrors what TeachersManager/
// StudentsManager each captured for their one role, now unified.
const PROFILE_FIELDS_BY_ROLE = {
  teacher: [
    { key: "designation", label: "Designation" },
    { key: "subject", label: "Subject" },
    { key: "emisId", label: "EMIS ID" },
    { key: "udiseId", label: "UDISE ID" },
    { key: "districtId", label: "District ID" },
    { key: "schoolId", label: "School ID" },
    { key: "state", label: "State" },
  ],
  student: [
    { key: "emisId", label: "EMIS ID" },
    { key: "apaarId", label: "APAAR ID" },
    { key: "grade", label: "Class / Grade" },
    { key: "districtId", label: "District ID" },
    { key: "schoolId", label: "School ID" },
    { key: "state", label: "State" },
  ],
  district: [
    { key: "designation", label: "Designation" },
    { key: "districtId", label: "District ID" },
    { key: "state", label: "State" },
  ],
  admin: [{ key: "designation", label: "Designation" }],
};

function emptyProfile(role) {
  const fields = PROFILE_FIELDS_BY_ROLE[role] || [];
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

function profileSummary(user) {
  const fields = PROFILE_FIELDS_BY_ROLE[user.role] || [];
  const primary = fields[0];
  if (!primary) return "-";
  return user.profile?.[primary.key] || "-";
}

/* =====================================================
   User Form Modal (Create / Edit)
===================================================== */
function UserFormModal({ user, onClose, onCreated }) {
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username || "");
  const [role, setRole] = useState(user?.role || "teacher");
  const [email, setEmail] = useState(user?.email || "");
  const [profile, setProfile] = useState(user?.profile || emptyProfile(user?.role || "teacher"));

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const saving = createUser.isPending || updateUser.isPending;

  const fields = PROFILE_FIELDS_BY_ROLE[role] || [];

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    if (!isEdit) setProfile(emptyProfile(nextRole));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return toast.error("Username is required.");

    try {
      if (isEdit) {
        await updateUser.mutateAsync({ username, payload: { role, email, profile } });
        toast.success("✅ User updated");
        onClose();
      } else {
        const tempPassword = generateTempPassword();
        const created = await createUser.mutateAsync({
          username: username.trim(),
          password: tempPassword,
          role,
          email,
          profile,
        });
        toast.success("✅ User created");
        onCreated({ username: created.username || username, password: tempPassword });
      }
    } catch (err) {
      toast.error(
        `❌ Failed to ${isEdit ? "update" : "create"} user: ${apiErrorMessage(err, err.message)}`
      );
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
      <div className="bg-card text-card-foreground rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit User" : "New User"}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isEdit}
                className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm mt-1 disabled:opacity-60"
                placeholder="jdoe"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm mt-1 capitalize"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm mt-1"
              placeholder="jdoe@school.edu"
            />
          </div>

          {fields.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="text-sm font-medium mb-2">Profile</div>
              <div className="grid grid-cols-2 gap-3">
                {fields.map((f) => (
                  <input
                    key={f.key}
                    value={profile[f.key] || ""}
                    onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                    placeholder={f.label}
                    className="border border-input bg-transparent rounded-md px-3 py-2 text-sm"
                  />
                ))}
              </div>
            </div>
          )}

          {!isEdit && (
            <p className="text-xs text-muted-foreground">
              A random temporary password will be generated and shown once after creation.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-input rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =====================================================
   Reset Password Modal
===================================================== */
function ResetPasswordModal({ user, onClose }) {
  const [mode, setMode] = useState("generate"); // "generate" | "manual"
  const [manualPassword, setManualPassword] = useState("");
  const [result, setResult] = useState(null); // { password } once submitted
  const resetPassword = useResetUserPassword();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === "manual" && manualPassword.length < 8) {
      return toast.error("Password must be at least 8 characters.");
    }
    try {
      const res = await resetPassword.mutateAsync({
        username: user.username,
        newPassword: mode === "manual" ? manualPassword : undefined,
      });
      toast.success("✅ Password reset");
      setResult({ password: res.temporaryPassword || manualPassword });
    } catch (err) {
      toast.error(`❌ Reset failed: ${apiErrorMessage(err, err.message)}`);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
      <div className="bg-card text-card-foreground rounded-xl shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Reset Password — {user.username}</h3>

        {result ? (
          <>
            <p className="text-sm text-muted-foreground">
              Share this new password with the user securely — it will not be shown again.
            </p>
            <div className="font-mono bg-muted p-3 rounded-md text-sm break-all">
              {result.password}
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "generate"}
                  onChange={() => setMode("generate")}
                />
                Generate random password
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "manual"}
                  onChange={() => setMode("manual")}
                />
                Set specific password
              </label>
            </div>

            {mode === "manual" && (
              <input
                type="text"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
                className="w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm"
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border border-input rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetPassword.isPending}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              >
                {resetPassword.isPending ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* =====================================================
   Created-user credential reveal (create flow)
===================================================== */
function NewCredentialModal({ credential, onClose }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
      <div className="bg-card text-card-foreground rounded-xl shadow-lg w-full max-w-sm p-6 space-y-3">
        <h3 className="text-lg font-semibold">User account created</h3>
        <p className="text-sm text-muted-foreground">
          Share this temporary password with the user securely (in person, or via a channel other
          than this app) — it will not be shown again. They should change it after first login.
        </p>
        <div className="font-mono bg-muted p-3 rounded-md text-sm break-all space-y-1">
          <div>
            <b>Username:</b> {credential.username}
          </div>
          <div>
            <b>Temporary password:</b> {credential.password}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   Main
===================================================== */
export default function UsersSettings() {
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data: users = [], isLoading, error } = useUsers(roleFilter || undefined);
  const deleteUser = useDeleteUser();

  const [formUser, setFormUser] = useState(undefined); // undefined=closed, null=create, object=edit
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newCredential, setNewCredential] = useState(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.username);
      toast.success(`🗑️ ${deleteTarget.username} deleted`);
    } catch (err) {
      toast.error(`❌ Failed to delete user: ${apiErrorMessage(err, err.message)}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage accounts, roles, and credentials for every user in the system.
          </p>
        </div>
        <button
          onClick={() => setFormUser(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          <Plus size={16} />
          New User
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or email..."
          className="border border-input bg-transparent rounded-md px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-input bg-transparent rounded-md px-3 py-2 text-sm capitalize"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading users...</div>}
      {error && (
        <div className="text-sm text-destructive">{apiErrorMessage(error, error.message)}</div>
      )}

      {!isLoading && !error && (
        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">Username</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Profile</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.username} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        ROLE_BADGE[u.role] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">{u.email || "-"}</td>
                  <td className="px-3 py-2">{profileSummary(u)}</td>
                  <td className="px-3 py-2">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setFormUser(u)}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-muted"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setResetTarget(u)}
                        title="Reset password"
                        className="p-1.5 rounded hover:bg-muted"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-muted text-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-3 py-6 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {formUser !== undefined && (
        <UserFormModal
          user={formUser}
          onClose={() => setFormUser(undefined)}
          onCreated={(credential) => {
            setFormUser(undefined);
            setNewCredential(credential);
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}

      {newCredential && (
        <NewCredentialModal credential={newCredential} onClose={() => setNewCredential(null)} />
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        message={`Are you sure you want to delete ${deleteTarget?.username}? This action cannot be undone.`}
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
}
