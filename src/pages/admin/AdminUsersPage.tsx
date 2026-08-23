import { useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { BulkAddStudents } from "../../components/BulkAddStudents";
import type { AdminUser, Kitchen, Role } from "../../types/admin";

interface FormState {
  role: Role;
  name: string;
  email: string;
  password: string;
  rollNumber: string;
  kitchen: Kitchen | "";
}

const EMPTY_FORM: FormState = { role: "ADMIN", name: "", email: "", password: "", rollNumber: "", kitchen: "" };

const ROLE_BADGE: Record<Role, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-700",
  ADMIN: "bg-blue-100 text-blue-700",
  STUDENT: "bg-gray-100 text-gray-600",
};

export function AdminUsersPage() {
  const { token, userId } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadUsers() {
    setLoading(true);
    apiClient
      .get<AdminUser[]>("/superadmin/users", token ?? undefined)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }

  useEffect(loadUsers, [token]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm({
      role: user.role,
      name: user.name,
      email: user.email,
      password: "",
      rollNumber: user.rollNumber ?? "",
      kitchen: user.kitchen ?? "",
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiClient.patch(
          `/superadmin/users/${editing.id}`,
          {
            name: form.name,
            role: form.role,
            kitchen: form.role === "ADMIN" ? form.kitchen || null : null,
            ...(form.password ? { password: form.password } : {}),
          },
          token ?? undefined
        );
      } else {
        await apiClient.post(
          "/superadmin/users",
          {
            role: form.role,
            name: form.name,
            email: form.email,
            password: form.password,
            rollNumber: form.rollNumber || undefined,
            kitchen: form.role === "ADMIN" ? form.kitchen || undefined : undefined,
          },
          token ?? undefined
        );
      }
      setShowModal(false);
      loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: AdminUser) {
    if (user.id === userId) {
      alert("You cannot delete your own account.");
      return;
    }
    if (!confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return;
    setDeletingId(user.id);
    try {
      await apiClient.delete(`/superadmin/users/${user.id}`, token ?? undefined);
      loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = users.filter((u) => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.rollNumber ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-gray-500 mt-1">Manage admin, superadmin, and student accounts.</p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            + Add User
          </button>
        </div>

        <BulkAddStudents token={token} onImported={loadUsers} />

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or roll number"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "ALL")}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="ALL">All roles</option>
            <option value="SUPERADMIN">Superadmin</option>
            <option value="ADMIN">Admin</option>
            <option value="STUDENT">Student</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={loadUsers} className="underline font-medium">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface rounded-2xl p-12 text-center flat-shadow border border-gray-100">
            <p className="text-gray-500">No users found.</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email / Roll No.</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Kitchen</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.name}
                      {u.id === userId && <span className="ml-2 text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-md">YOU</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{u.email}</div>
                      {u.rollNumber && <div className="text-xs text-gray-400">{u.rollNumber}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide ${ROLE_BADGE[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.kitchen ?? "—"}</td>
                    <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => openEdit(u)} className="text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={deletingId === u.id || u.id === userId}
                        className="text-xs font-medium text-gray-500 hover:text-red-600 transition-colors disabled:opacity-30 disabled:hover:text-gray-500"
                      >
                        {deletingId === u.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900">{editing ? "Edit User" : "Add User"}</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="SUPERADMIN">Superadmin</option>
                  <option value="STUDENT">Student</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {!editing && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {!editing && form.role === "STUDENT" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Roll Number</label>
                  <input
                    value={form.rollNumber}
                    onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {form.role === "ADMIN" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Kitchen</label>
                  <select
                    value={form.kitchen}
                    onChange={(e) => setForm({ ...form, kitchen: e.target.value as Kitchen | "" })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    <option value="SNACKS">Snacks</option>
                    <option value="MEALS">Meals</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {editing ? "New Password (leave blank to keep current)" : "Password"}
                </label>
                <input
                  required={!editing}
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white py-2.5 text-sm font-semibold transition-colors"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create User"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
