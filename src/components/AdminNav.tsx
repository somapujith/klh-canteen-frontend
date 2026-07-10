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
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Logo className="h-8 sm:h-9 shrink-0" />
          <span className="font-semibold text-brand-900 truncate">KLH Admin</span>
        </div>
        <button onClick={logout} className="shrink-0 rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Log out
        </button>
      </div>
      <div className="flex gap-2 px-4 sm:px-6 pb-3 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
