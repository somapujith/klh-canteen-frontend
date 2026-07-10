import { NavLink } from "react-router-dom";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";

const tabs = [
  { to: "/admin", label: "Menu" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/scan", label: "Scan" },
];

export function AdminNav() {
  const { logout } = useAuth();

  return (
    <nav className="bg-white rounded-b-2xl shadow-sm">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <Logo className="h-9" />
          <span className="font-semibold text-brand-900">KLH Admin</span>
        </div>
        <button onClick={logout} className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Log out
        </button>
      </div>
      <div className="flex gap-2 px-6 pb-3">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/admin"}
            className={({ isActive }) =>
              `rounded-full px-4 py-1.5 text-sm font-medium transition ${
                isActive ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
