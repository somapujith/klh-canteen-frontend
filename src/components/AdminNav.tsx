import { NavLink } from "react-router-dom";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";

const tabs = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/logs", label: "Logs" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/scan", label: "SCAN" },
];

export function AdminNav() {
  const { logout } = useAuth();

  return (
    <nav className="glass-panel rounded-b-2xl shadow-sm sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Logo className="h-8 sm:h-9 shrink-0 hover-scale" />
          <span className="font-semibold text-gray-800 tracking-tight truncate">KLH Admin</span>
        </div>
        <button onClick={logout} className="shrink-0 rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-surface-muted transition-colors font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
          Log out
        </button>
      </div>
      <div className="flex gap-2 px-4 sm:px-6 pb-3 pt-1 overflow-x-auto whitespace-nowrap items-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {tabs.map((tab) => {
          const isScan = tab.label === "SCAN";
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/admin"}
              className={({ isActive }) =>
                `transition-all hover-scale ${
                  isScan
                    ? `px-6 py-2 rounded-xl font-bold text-white flat-shadow ${
                        isActive ? "bg-brand-700 ring-2 ring-offset-2 ring-brand-500" : "bg-brand-600 hover:bg-brand-500"
                      }`
                    : `rounded-full px-4 py-1.5 text-sm font-medium border border-transparent ${
                        isActive ? "bg-gray-800 text-white shadow-md" : "bg-gray-100/80 text-gray-700 hover:bg-gray-200 hover:border-gray-300"
                      }`
                }`
              }
            >
              {isScan ? (
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  {tab.label}
                </div>
              ) : (
                tab.label
              )}
            </NavLink>
          );
        })}
        {/* Spacer to ensure right padding is respected during horizontal scroll */}
        <div className="w-2 shrink-0 sm:w-4" aria-hidden="true" />
      </div>
    </nav>
  );
}
