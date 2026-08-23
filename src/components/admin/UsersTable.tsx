import type { AdminUser, Role } from "../../types/admin";

const ROLE_BADGE: Record<Role, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-700",
  ADMIN: "bg-blue-100 text-blue-700",
  STUDENT: "bg-gray-100 text-gray-600",
};

interface Props {
  users: AdminUser[];
  selectedIds: Set<string>;
  /** The signed-in superadmin — cannot deactivate or delete themselves. */
  currentUserId: string | null;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (user: AdminUser) => void;
  onDeactivate: (user: AdminUser) => void;
  onReactivate: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

export function UsersTable({
  users,
  selectedIds,
  currentUserId,
  onToggleOne,
  onToggleAll,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}: Props) {
  const selectedCount = users.reduce((n, u) => (selectedIds.has(u.id) ? n + 1 : n), 0);
  const allSelected = users.length > 0 && selectedCount === users.length;

  return (
    <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="pl-4 pr-2 py-3 w-10">
              <input
                type="checkbox"
                aria-label="Select all loaded users"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                }}
                onChange={onToggleAll}
                className="rounded border-gray-300 accent-brand-600"
              />
            </th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email / Roll No.</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Kitchen</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <tr
                key={u.id}
                className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${u.isActive ? "" : "bg-gray-50/40"}`}
              >
                <td className="pl-4 pr-2 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${u.name}`}
                    checked={selectedIds.has(u.id)}
                    onChange={() => onToggleOne(u.id)}
                    className="rounded border-gray-300 accent-brand-600"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <span className={u.isActive ? "" : "text-gray-500"}>{u.name}</span>
                  {isSelf && (
                    <span className="ml-2 text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-md">YOU</span>
                  )}
                  {u.mustChangePassword && (
                    <span
                      title="Must change password at next login"
                      className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md"
                    >
                      PW RESET
                    </span>
                  )}
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
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${
                      u.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.kitchen ?? "—"}</td>
                <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => onEdit(u)} className="text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors">
                    Edit
                  </button>
                  {u.isActive ? (
                    <button
                      onClick={() => onDeactivate(u)}
                      disabled={isSelf}
                      title={isSelf ? "You cannot deactivate your own account" : undefined}
                      className="text-xs font-medium text-gray-500 hover:text-red-700 transition-colors disabled:opacity-30 disabled:hover:text-gray-500"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => onReactivate(u)}
                      className="text-xs font-medium text-green-700 hover:text-green-800 transition-colors"
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(u)}
                    disabled={isSelf}
                    className="text-xs font-medium text-gray-500 hover:text-red-700 transition-colors disabled:opacity-30 disabled:hover:text-gray-500"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
