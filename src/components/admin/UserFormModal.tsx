import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../lib/apiClient";
import { adminErrorMessage } from "../../lib/adminUsers";
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

function formFor(user: AdminUser | null): FormState {
  if (!user) return EMPTY_FORM;
  return {
    role: user.role,
    name: user.name,
    email: user.email,
    password: "",
    rollNumber: user.rollNumber ?? "",
    kitchen: user.kitchen ?? "",
  };
}

interface Props {
  /** `null` creates a new account; an AdminUser edits that account. */
  editing: AdminUser | null;
  token: string | null;
  onSaved: () => void;
  onClose: () => void;
}

export function UserFormModal({ editing, token, onSaved, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => formFor(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
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
      onSaved();
    } catch (err) {
      setError(adminErrorMessage(err, "Failed to save user"));
    } finally {
      setSaving(false);
    }
  }

  // Portalled to <body> deliberately: it keeps this overlay out of the admin shell's
  // stacking contexts and `overflow-hidden` ancestors, either of which would clip it
  // or bury it behind the page chrome.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
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

          {error && <p className="text-sm text-red-600">{error}</p>}

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
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
